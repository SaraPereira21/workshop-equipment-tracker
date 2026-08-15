import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  BarChart3,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Package,
  TrendingUp,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppStore } from "@/lib/store";
import { useKanbanColumns } from "@/hooks/use-kanban";
import { ColumnBadge } from "@/components/status-badges";
import type { Asset } from "@/lib/types";
import { downloadCSV } from "@/lib/csv-export";
import {
  APONTAMENTO_HEADERS,
  apontamentoParaLinha,
  apontamentosDeOrdens,
} from "@/lib/apontamentos";


export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Indicadores — Planner Matriz" },
      { name: "description", content: "KPIs, funil e ranking da Oficina Central de Fluxo de Máquinas." },
    ],
  }),
  component: DashboardPage,
});

type Periodo = "30" | "90" | "mes" | "ano" | "tudo";

function daysBetween(a: string | undefined, b: Date) {
  if (!a) return null;
  const t = new Date(a).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((b.getTime() - t) / 86_400_000));
}

function periodoStart(p: Periodo): Date | null {
  const now = new Date();
  if (p === "tudo") return null;
  if (p === "mes") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (p === "ano") return new Date(now.getFullYear(), 0, 1);
  const days = p === "30" ? 30 : 90;
  return new Date(now.getTime() - days * 86_400_000);
}

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ElementType;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="mt-1 font-display text-2xl font-bold md:text-3xl">{value}</div>
            {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
          </div>
          <div className={"grid h-10 w-10 shrink-0 place-items-center rounded-lg " + (accent ?? "bg-primary/10 text-primary")}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardPage() {
  const assets = useAppStore((s) => s.assets);
  const workOrders = useAppStore((s) => s.workOrders);
  const mechanics = useAppStore((s) => s.mechanics);
  const { columns: KANBAN_COLUMNS } = useKanbanColumns();

  const [periodo, setPeriodo] = useState<Periodo>("30");
  const [contrato, setContrato] = useState<string>("todos");

  const contratos = useMemo(() => {
    const set = new Set<string>();
    for (const a of assets) if (a.contrato) set.add(a.contrato);
    return Array.from(set).sort();
  }, [assets]);

  const start = periodoStart(periodo);
  const now = new Date();

  const filtered: Asset[] = useMemo(
    () => assets.filter((a) => (contrato === "todos" ? true : a.contrato === contrato)),
    [assets, contrato],
  );

  const inPeriodo = (iso?: string) => {
    if (!iso) return false;
    if (!start) return true;
    const t = new Date(iso).getTime();
    return !Number.isNaN(t) && t >= start.getTime();
  };

  const entradasPeriodo = filtered.filter((a) => inPeriodo(a.dataEntrada)).length;
  const liberadasPeriodo = filtered.filter((a) => a.column === "liberado" && inPeriodo(a.dataLiberacao)).length;
  const emOficina = filtered.filter((a) => a.column !== "liberado").length;

  const atrasadas = filtered.filter((a) => {
    if (a.column === "liberado") return false;
    const ref = a.dataEntregaOriginal ?? a.dataEntregaPrevista;
    return ref ? new Date(ref) < now : false;
  }).length;

  // Tempo médio na oficina (dias) — usa dataEntrada até dataLiberacao (liberadas) ou hoje (em curso)
  const temposDias = filtered
    .map((a) => {
      const end = a.column === "liberado" && a.dataLiberacao ? new Date(a.dataLiberacao) : now;
      return daysBetween(a.dataEntrada, end);
    })
    .filter((n): n is number => n !== null);
  const tempoMedio = temposDias.length
    ? (temposDias.reduce((s, x) => s + x, 0) / temposDias.length).toFixed(1)
    : "—";

  // Funil por bucket
  const funil = KANBAN_COLUMNS.map((c) => ({
    key: c.key,
    title: c.title,
    count: filtered.filter((a) => a.column === c.key).length,
  }));
  const funilMax = Math.max(1, ...funil.map((f) => f.count));

  // Ranking por mecânico (OS fechadas + ativas)
  const rankingMec = useMemo(() => {
    const map = new Map<string, { nome: string; abertas: number; fechadas: number }>();
    for (const m of mechanics) map.set(m.id, { nome: m.nome, abertas: 0, fechadas: 0 });
    for (const w of workOrders) {
      for (const ex of w.executores) {
        const entry = map.get(ex.mecanicoId) ?? { nome: ex.mecanicoNome, abertas: 0, fechadas: 0 };
        if (w.status === "fechada") entry.fechadas += 1;
        else entry.abertas += 1;
        map.set(ex.mecanicoId, entry);
      }
    }
    return Array.from(map.values())
      .filter((r) => r.abertas + r.fechadas > 0)
      .sort((a, b) => b.fechadas + b.abertas - (a.fechadas + a.abertas))
      .slice(0, 8);
  }, [mechanics, workOrders]);

  // Top contratos por volume no período
  const rankingContrato = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of filtered) {
      if (!inPeriodo(a.dataEntrada)) continue;
      const key = a.contrato || "— sem contrato —";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, periodo]);

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 md:px-6 md:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold md:text-3xl flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" /> Indicadores da Oficina
          </h1>
          <p className="text-sm text-muted-foreground">
            Fluxo de máquinas: desmob → nova mob / venda. Dados em tempo real da oficina central.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
              <SelectItem value="mes">Mês atual</SelectItem>
              <SelectItem value="ano">Ano atual</SelectItem>
              <SelectItem value="tudo">Tudo</SelectItem>
            </SelectContent>
          </Select>
          <Select value={contrato} onValueChange={setContrato}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Contrato" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os contratos</SelectItem>
              {contratos.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <Kpi label="Entradas no período" value={String(entradasPeriodo)} hint="Máquinas recebidas" icon={Package} />
        <Kpi label="Liberadas no período" value={String(liberadasPeriodo)} hint="Saíram para mob/venda" icon={CheckCircle2} accent="bg-success/15 text-success" />
        <Kpi label="Em oficina" value={String(emOficina)} hint="Em processo agora" icon={Wrench} accent="bg-info/10 text-info" />
        <Kpi label="Atrasadas" value={String(atrasadas)} hint="Passaram da entrega" icon={AlertTriangle} accent="bg-destructive/10 text-destructive" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <Kpi label="Tempo médio na oficina" value={`${tempoMedio}${tempoMedio === "—" ? "" : " dias"}`} hint="Entrada → liberação" icon={Clock} accent="bg-primary/10 text-primary" />
        <Kpi label="OS abertas" value={String(workOrders.filter((w) => w.status !== "fechada").length)} hint="Corretivas + preventivas" icon={TrendingUp} accent="bg-accent/20 text-accent-foreground" />
        <Kpi label="Mecânicos" value={String(mechanics.length)} hint={`${mechanics.filter((m) => m.status === "ativo").length} ativos`} icon={Users} accent="bg-info/10 text-info" />
        <Kpi label="Contratos ativos" value={String(contratos.length)} hint="Distintos em frota" icon={BarChart3} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Funil por bucket</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {funil.map((f) => (
              <Link key={f.key} to="/planner" className="block">
                <div className="flex items-center justify-between gap-3">
                  <ColumnBadge column={f.key} />
                  <span className="font-display text-sm font-semibold tabular-nums">{f.count}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${(f.count / funilMax) * 100}%` }}
                  />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Volume por contrato</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {rankingContrato.length === 0 && (
              <div className="text-sm text-muted-foreground">Sem entradas no período selecionado.</div>
            )}
            {rankingContrato.map(([nome, count]) => {
              const max = Math.max(1, ...rankingContrato.map((r) => r[1]));
              return (
                <div key={nome}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{nome}</span>
                    <span className="font-display font-semibold tabular-nums">{count}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-accent transition-all" style={{ width: `${(count / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Ranking por mecânico</CardTitle>
        </CardHeader>
        <CardContent>
          {rankingMec.length === 0 ? (
            <div className="text-sm text-muted-foreground">Sem OS registradas por executor ainda.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2">Mecânico</th>
                    <th className="py-2 text-right">Abertas</th>
                    <th className="py-2 text-right">Fechadas</th>
                    <th className="py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rankingMec.map((r, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 truncate">{r.nome}</td>
                      <td className="py-2 text-right tabular-nums">{r.abertas}</td>
                      <td className="py-2 text-right tabular-nums text-success">{r.fechadas}</td>
                      <td className="py-2 text-right font-semibold tabular-nums">{r.abertas + r.fechadas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button asChild variant="outline"><Link to="/planner">Ir para o Planner</Link></Button>
        <Button asChild variant="outline"><Link to="/frota">Frota completa</Link></Button>
        <Button
          variant="outline"
          onClick={() => {
            const rows = apontamentosDeOrdens(workOrders, assets);
            if (!rows.length) return;
            downloadCSV(
              `apontamento-horas-${new Date().toISOString().slice(0, 10)}`,
              APONTAMENTO_HEADERS,
              rows.map(apontamentoParaLinha),
            );
          }}
        >
          Exportar apontamento de horas (CSV)
        </Button>
      </div>

    </div>
  );
}
