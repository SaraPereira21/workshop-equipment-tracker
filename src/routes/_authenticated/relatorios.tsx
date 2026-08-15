import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Download, Timer, Wrench, Gauge, ClipboardCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/lib/store";
import { downloadCSV } from "@/lib/csv-export";
import { formatMin, dataHora } from "@/lib/tempo";
import {
  APONTAMENTO_HEADERS,
  apontamentoParaLinha,
  apontamentosDeOrdens,
} from "@/lib/apontamentos";
import { listSeminovos, normPrefixo } from "@/lib/seminovos";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios — Planner Matriz" },
      {
        name: "description",
        content:
          "Relatórios de apontamento de horas, produtividade de manutentores, permanência de máquinas e inspeções da oficina.",
      },
      { property: "og:title", content: "Relatórios — Planner Matriz" },
      {
        property: "og:description",
        content:
          "Tempo de execução por atividade, produtividade por manutentor e histórico de inspeções, com exportação em CSV.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RelatoriosPage,
});

type Periodo = "hoje" | "30" | "90" | "mes" | "ano" | "tudo" | "custom";
type FiltroMaquinas = "todas" | "liberadas" | "seminovos" | "contratos";

// Data aplicada em lote durante a correção histórica de registros sem data.
// Não representa uma liberação real e, por isso, não entra nos indicadores.
const DATA_LIBERACAO_MIGRADA = "2026-08-04T13:33:22.971Z";

function periodoStart(p: Periodo): Date | null {
  const now = new Date();
  if (p === "tudo" || p === "custom") return null;
  if (p === "hoje") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (p === "mes") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (p === "ano") return new Date(now.getFullYear(), 0, 1);
  return new Date(now.getTime() - (p === "30" ? 30 : 90) * 86_400_000);
}


/** % de conclusão das atividades das OSs da máquina (checklist PMP, operações e pendências). */
function progresso(
  oss: { pmpChecklist?: { done: boolean }[]; operations?: { corrigido: boolean }[] }[],
  pend?: { done: boolean }[],
) {
  let total = 0;
  let feitos = 0;
  for (const o of oss) {
    for (const it of o.pmpChecklist ?? []) {
      total += 1;
      if (it.done) feitos += 1;
    }
    for (const op of o.operations ?? []) {
      total += 1;
      if (op.corrigido) feitos += 1;
    }
  }
  for (const t of pend ?? []) {
    total += 1;
    if (t.done) feitos += 1;
  }
  if (!total) return null;
  return { total, feitos, pct: Math.round((feitos / total) * 100) };
}

function dias(a?: string, b?: string) {
  if (!a) return null;
  const ta = new Date(a).getTime();
  const tb = b ? new Date(b).getTime() : Date.now();
  if (Number.isNaN(ta) || Number.isNaN(tb) || tb < ta) return null;
  return Math.round((tb - ta) / 86_400_000);
}

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </div>
            <div className="mt-1 font-display text-2xl font-bold">{value}</div>
            {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
          </div>
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RelatoriosPage() {
  const assets = useAppStore((s) => s.assets);
  const workOrders = useAppStore((s) => s.workOrders);
  const inspections = useAppStore((s) => s.inspections);
  const mechanics = useAppStore((s) => s.mechanics);

  const nomeMec = useMemo(() => {
    const map = new Map(mechanics.map((m) => [m.id, m.nome]));
    return (id: string) => map.get(id);
  }, [mechanics]);

  const [periodo, setPeriodo] = useState<Periodo>("30");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [tipoOs, setTipoOs] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [filtroMaquinas, setFiltroMaquinas] = useState<FiltroMaquinas>("todas");
  const [seminovosSet, setSeminovosSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    let vivo = true;
    listSeminovos()
      .then((itens) => {
        if (vivo)
          setSeminovosSet(new Set(itens.map((i) => i.prefixo_norm || normPrefixo(i.prefixo))));
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  const customIni = periodo === "custom" && de ? new Date(`${de}T00:00:00`) : null;
  const customFim = periodo === "custom" && ate ? new Date(`${ate}T23:59:59`) : null;
  const start = customIni ?? periodoStart(periodo);
  const end = customFim;
  const noPeriodo = (iso?: string) => {
    if (!start && !end) return true;
    if (!iso) return false;
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return false;
    if (start && t < start.getTime()) return false;
    if (end && t > end.getTime()) return false;
    return true;
  };
  const q = busca.trim().toUpperCase();

  const ordens = useMemo(
    () =>
      workOrders.filter(
        (w) =>
          noPeriodo(w.createdAt) &&
          (tipoOs === "todos" || w.tipo === tipoOs) &&
          (!q || w.prefixo?.toUpperCase().includes(q) || w.numeroSAP?.includes(q)),
      ),
    [workOrders, periodo, de, ate, tipoOs, q],
  );

  // Apontamentos: o período vale pela data do próprio apontamento, não pela data da OS.
  const ordensApont = useMemo(
    () =>
      workOrders.filter(
        (w) =>
          (tipoOs === "todos" || w.tipo === tipoOs) &&
          (!q || w.prefixo?.toUpperCase().includes(q) || w.numeroSAP?.includes(q)),
      ),
    [workOrders, tipoOs, q],
  );

  const linhas = useMemo(
    () =>
      apontamentosDeOrdens(ordensApont, assets, nomeMec).filter((l) => {
        // início > fim > última mexida na sessão pausada; sem nenhuma data,
        // cai na data da OS para não sumir com apontamentos antigos.
        const ref = l.inicio ?? l.fim ?? l.em ?? (l.minutos ? l.createdAt : undefined);
        return ref ? noPeriodo(ref) : false;
      }),

    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ordensApont, assets, nomeMec, periodo, de, ate],
  );


  // OSs que possuem linhas de atividade — nelas o tempo da OS não é somado (evita duplicidade).
  const osComAtividade = useMemo(
    () => new Set(linhas.filter((l) => l.nivel === "Atividade").map((l) => l.osId)),
    [linhas],
  );
  // Uma linha conta como apontamento quando é atividade OU quando é o único
  // apontamento da OS (serviço completo sem atividades detalhadas).
  const contabiliza = (l: (typeof linhas)[number]) =>
    l.nivel === "Atividade" || !osComAtividade.has(l.osId);

  const contadas = linhas.filter(contabiliza);
  const totalMinutos = contadas.reduce((a, l) => a + (l.minutos ?? 0), 0);
  const atividades = contadas.length;

  // Produtividade por manutentor
  const porMecanico = useMemo(() => {
    const map = new Map<
      string,
      { nome: string; minutos: number; atividades: number; oss: Set<string> }
    >();
    for (const l of linhas) {
      const nomes = (l.mecanico || "—")
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean);
      for (const nome of nomes.length ? nomes : ["—"]) {
        const cur = map.get(nome) ?? { nome, minutos: 0, atividades: 0, oss: new Set<string>() };
        cur.oss.add(l.osId);
        if (l.nivel === "Atividade" || !osComAtividade.has(l.osId)) {
          cur.minutos += l.minutos ?? 0;
          cur.atividades += 1;
        }
        map.set(nome, cur);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.minutos - a.minutos);
  }, [linhas, osComAtividade]);

  // Permanência das máquinas e liberações reais registradas no Planner.
  const maquinasBase = useMemo(() => {
    const byAsset = new Map<string, typeof workOrders>();
    const ultimaLiberacaoPorAsset = new Map<string, string>();
    for (const w of workOrders) {
      const arr = byAsset.get(w.assetId) ?? [];
      arr.push(w);
      byAsset.set(w.assetId, arr);
    }
    for (const i of inspections) {
      if (i.tipo !== "saida" || !i.liberado || !i.data) continue;
      const atual = ultimaLiberacaoPorAsset.get(i.assetId);
      if (!atual || new Date(i.data).getTime() > new Date(atual).getTime()) {
        ultimaLiberacaoPorAsset.set(i.assetId, i.data);
      }
    }
    return (
      assets
        .filter((a) => !a.deletedAt)
        .filter((a) => !q || a.prefixo.toUpperCase().includes(q))
        .map((a) => {
          const oss = byAsset.get(a.id) ?? [];
          const rowsAsset = apontamentosDeOrdens(oss, assets, nomeMec);
          const comAtiv = new Set(
            rowsAsset.filter((l) => l.nivel === "Atividade").map((l) => l.osId),
          );
          const min = rowsAsset
            .filter((l) => l.nivel === "Atividade" || !comAtiv.has(l.osId))
            .reduce((acc, l) => acc + (l.minutos ?? 0), 0);

          const temTagSeminovos = (a.tags ?? []).some(
            (t) => String(t).toUpperCase().includes("SEMINOVO"),
          );
          const isSeminovo = temTagSeminovos || seminovosSet.has(normPrefixo(a.prefixo));
          const dtLib = a.dataLiberacao ?? ultimaLiberacaoPorAsset.get(a.id);
          const dataLiberacaoReal = dtLib !== DATA_LIBERACAO_MIGRADA;
          return {
            prefixo: a.prefixo,
            tipo: a.tipo || "",
            contrato: a.contrato || "",
            entrada: a.dataEntrada,
            liberacao: dtLib,
            permanencia: dias(a.dataEntrada, a.column === "liberado" ? dtLib : undefined),
            liberada: a.column === "liberado",
            seminovo: isSeminovo,
            destino: isSeminovo ? "SEMINOVOS" : "CONTRATO",
            liberadaNoPeriodo:
              a.column === "liberado" && dataLiberacaoReal && noPeriodo(dtLib),

            corretivas: oss.filter((o) => o.tipo === "corretiva").length,
            preventivas: oss.filter((o) => o.tipo === "preventiva").length,
            progresso: progresso(oss, a.pendingTasks),
            minutos: min,
          };
        })
        .sort((a, b) => (b.permanencia ?? 0) - (a.permanencia ?? 0))
    );
  }, [assets, workOrders, inspections, periodo, de, ate, q, seminovosSet]);

  const maquinas = useMemo(
    () =>
      maquinasBase.filter((m) => {
        if (filtroMaquinas === "liberadas") return m.liberadaNoPeriodo;
        if (filtroMaquinas === "seminovos") return m.liberadaNoPeriodo && m.seminovo;
        if (filtroMaquinas === "contratos") return m.liberadaNoPeriodo && !m.seminovo;
        return noPeriodo(m.liberada ? m.liberacao : m.entrada);
      }),
    [maquinasBase, filtroMaquinas, periodo, de, ate],
  );

  // Liberações no período: seminovos x contratos
  const liberadas = useMemo(() => {
    const listaCompleta = maquinasBase.filter((m) => m.liberadaNoPeriodo);
    const lista = listaCompleta.filter((m) => {
      if (filtroMaquinas === "seminovos") return m.seminovo;
      if (filtroMaquinas === "contratos") return !m.seminovo;
      return true;
    });
    return {
      lista,
      total: lista.length,
      seminovos: lista.filter((m) => m.seminovo),
      contratos: lista.filter((m) => !m.seminovo),
    };
  }, [maquinasBase, filtroMaquinas]);

  // Inspeções
  const inspecoes = useMemo(
    () =>
      inspections
        .filter((i) => !(i as { teste?: boolean }).teste)
        .filter((i) => noPeriodo(i.data))
        .filter((i) => !q || i.prefixo?.toUpperCase().includes(q))
        .sort((a, b) => (b.data ?? "").localeCompare(a.data ?? "")),
    [inspections, periodo, de, ate, q],
  );

  const porInspetor = useMemo(() => {
    const map = new Map<string, { nome: string; entrada: number; saida: number; falhas: number }>();
    for (const i of inspecoes) {
      const nome = i.inspetor || "—";
      const cur = map.get(nome) ?? { nome, entrada: 0, saida: 0, falhas: 0 };
      if (i.tipo === "saida") cur.saida += 1;
      else cur.entrada += 1;
      cur.falhas += i.falhas?.length ?? 0;
      map.set(nome, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.entrada + b.saida - (a.entrada + a.saida));
  }, [inspecoes]);

  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-3 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold md:text-3xl">Relatórios</h1>
          <p className="text-sm text-muted-foreground">
            Apontamento de horas, produtividade, permanência de máquinas e inspeções.
          </p>
        </div>
        <Badge variant="secondary" className="gap-1">
          <FileSpreadsheet className="h-3.5 w-3.5" /> Exportação CSV
        </Badge>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3 md:p-4">
          <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
            <SelectTrigger className="w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hoje">Hoje</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>

              <SelectItem value="90">Últimos 90 dias</SelectItem>
              <SelectItem value="mes">Mês atual</SelectItem>
              <SelectItem value="ano">Ano atual</SelectItem>
              <SelectItem value="tudo">Todo o período</SelectItem>
              <SelectItem value="custom">Período personalizado</SelectItem>
            </SelectContent>
          </Select>
          {periodo === "custom" && (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={de}
                onChange={(e) => setDe(e.target.value)}
                className="w-[150px]"
                aria-label="Data inicial"
              />
              <span className="text-sm text-muted-foreground">até</span>
              <Input
                type="date"
                value={ate}
                onChange={(e) => setAte(e.target.value)}
                className="w-[150px]"
                aria-label="Data final"
              />
            </div>
          )}
          <Select value={tipoOs} onValueChange={setTipoOs}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as OSs</SelectItem>
              <SelectItem value="corretiva">Corretivas</SelectItem>
              <SelectItem value="preventiva">Preventivas</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar prefixo ou nº OS SAP"
            className="w-full sm:w-64"
          />
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Horas apontadas"
          value={formatMin(totalMinutos)}
          hint={`${atividades} atividades`}
          icon={Timer}
        />
        <Kpi
          label="Média por atividade"
          value={formatMin(atividades ? Math.round(totalMinutos / atividades) : 0)}
          icon={Gauge}
        />
        <Kpi
          label="OSs no período"
          value={String(ordens.length)}
          hint={`${maquinas.length} máquinas`}
          icon={Wrench}
        />
        <Kpi
          label="Inspeções"
          value={String(inspecoes.length)}
          hint={`${porInspetor.length} inspetores`}
          icon={ClipboardCheck}
        />
      </div>

      <Tabs defaultValue="apontamentos">
        <TabsList className="flex w-full flex-wrap">
          <TabsTrigger value="apontamentos">Apontamentos</TabsTrigger>
          <TabsTrigger value="manutentores">Manutentores</TabsTrigger>
          <TabsTrigger value="maquinas">Máquinas</TabsTrigger>
          <TabsTrigger value="inspecoes">Inspeções</TabsTrigger>
        </TabsList>

        <TabsContent value="apontamentos">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Tempo por atividade ({linhas.length})</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  downloadCSV(
                    `apontamentos-${stamp}`,
                    APONTAMENTO_HEADERS,
                    linhas.map(apontamentoParaLinha),
                  )
                }
              >
                <Download className="mr-2 h-4 w-4" /> CSV
              </Button>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[840px] text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">Prefixo</th>
                    <th className="p-2 text-left">Tipo OS</th>
                    <th className="p-2 text-left">Nº SAP</th>
                    <th className="p-2 text-left">Atividade</th>
                    <th className="p-2 text-left">Mecânico</th>
                    <th className="p-2 text-left">Início</th>
                    <th className="p-2 text-left">Fim</th>
                    <th className="p-2 text-right">Duração</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-muted-foreground">
                        Nenhum apontamento no período.
                      </td>
                    </tr>
                  )}
                  {linhas.map((l, i) => (
                    <tr key={`${l.osId}-${i}`} className="border-t border-border">
                      <td className="p-2 font-medium">{l.prefixo}</td>
                      <td className="p-2 capitalize">{l.tipo}</td>
                      <td className="p-2">{l.numeroSAP}</td>
                      <td className="p-2 max-w-[280px] truncate" title={l.atividade}>
                        {l.atividade}
                      </td>
                      <td className="p-2">{l.mecanico || "—"}</td>
                      <td className="p-2 text-xs">{dataHora(l.inicio)}</td>
                      <td className="p-2 text-xs">{dataHora(l.fim)}</td>
                      <td className="p-2 text-right font-medium">{formatMin(l.minutos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manutentores">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Produtividade por manutentor</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  downloadCSV(
                    `produtividade-manutentores-${stamp}`,
                    ["Manutentor", "OSs", "Atividades", "Minutos", "Tempo"],
                    porMecanico.map((m) => [
                      m.nome,
                      m.oss.size,
                      m.atividades,
                      m.minutos,
                      formatMin(m.minutos),
                    ]),
                  )
                }
              >
                <Download className="mr-2 h-4 w-4" /> CSV
              </Button>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">Manutentor</th>
                    <th className="p-2 text-right">OSs</th>
                    <th className="p-2 text-right">Atividades</th>
                    <th className="p-2 text-right">Tempo total</th>
                    <th className="p-2 text-right">Média/atividade</th>
                  </tr>
                </thead>
                <tbody>
                  {porMecanico.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground">
                        Sem dados no período.
                      </td>
                    </tr>
                  )}
                  {porMecanico.map((m) => (
                    <tr key={m.nome} className="border-t border-border">
                      <td className="p-2 font-medium">{m.nome}</td>
                      <td className="p-2 text-right">{m.oss.size}</td>
                      <td className="p-2 text-right">{m.atividades}</td>
                      <td className="p-2 text-right font-medium">{formatMin(m.minutos)}</td>
                      <td className="p-2 text-right">
                        {formatMin(m.atividades ? Math.round(m.minutos / m.atividades) : 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="maquinas" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">Filtrar máquinas</div>
            <Select
              value={filtroMaquinas}
              onValueChange={(value) => setFiltroMaquinas(value as FiltroMaquinas)}
            >
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as máquinas</SelectItem>
                <SelectItem value="liberadas">Liberadas</SelectItem>
                <SelectItem value="seminovos">Seminovos</SelectItem>
                <SelectItem value="contratos">Contratos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Máquinas liberadas no período</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  downloadCSV(
                    `liberacoes-${stamp}`,
                    ["Prefixo", "Tipo", "Liberação", "Destino", "Contrato"],
                    liberadas.lista.map((m) => [
                      m.prefixo,
                      m.tipo,
                      dataHora(m.liberacao),
                      m.destino,
                      m.contrato,
                    ]),
                  )
                }
              >
                <Download className="mr-2 h-4 w-4" /> CSV
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Total liberadas
                  </div>
                  <div className="font-display text-2xl font-bold">{liberadas.total}</div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Seminovos (venda)
                  </div>
                  <div className="font-display text-2xl font-bold">
                    {liberadas.seminovos.length}
                  </div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Contratos
                  </div>
                  <div className="font-display text-2xl font-bold">
                    {liberadas.contratos.length}
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="p-2 text-left">Prefixo</th>
                      <th className="p-2 text-left">Tipo</th>
                      <th className="p-2 text-left">Data da liberação</th>
                      <th className="p-2 text-left">Destino</th>
                      <th className="p-2 text-left">Contrato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liberadas.lista.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-5 text-center text-muted-foreground">
                          Nenhuma máquina liberada neste período e filtro.
                        </td>
                      </tr>
                    )}
                    {liberadas.lista.map((m) => (
                      <tr key={`liberada-${m.prefixo}`} className="border-t border-border">
                        <td className="p-2 font-medium">{m.prefixo}</td>
                        <td className="p-2">{m.tipo || "—"}</td>
                        <td className="p-2 text-xs">{dataHora(m.liberacao)}</td>
                        <td className="p-2">{m.destino}</td>
                        <td className="p-2">{m.contrato || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Permanência e serviços por máquina</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  downloadCSV(
                    `maquinas-${stamp}`,
                    [
                      "Prefixo",
                      "Tipo",
                      "Contrato",
                      "Entrada",
                      "Liberação",
                      "Destino",
                      "Dias na oficina",
                      "Corretivas",
                      "Preventivas",
                      "% Andamento",
                      "Atividades concluídas",
                      "Atividades totais",
                      "Minutos apontados",
                    ],
                    maquinas.map((m) => [
                      m.prefixo,
                      m.tipo,
                      m.contrato,
                      dataHora(m.entrada),
                      dataHora(m.liberacao),
                      m.destino,
                      m.permanencia ?? "",
                      m.corretivas,
                      m.preventivas,
                      m.progresso ? `${m.progresso.pct}%` : "",
                      m.progresso?.feitos ?? "",
                      m.progresso?.total ?? "",
                      m.minutos,
                    ]),
                  )
                }
              >
                <Download className="mr-2 h-4 w-4" /> CSV
              </Button>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">Prefixo</th>
                    <th className="p-2 text-left">Tipo</th>
                    <th className="p-2 text-left">Entrada</th>
                    <th className="p-2 text-left">Situação</th>
                    <th className="p-2 text-left">Destino</th>
                    <th className="p-2 text-right">Dias</th>
                    <th className="p-2 text-right">Corr.</th>
                    <th className="p-2 text-right">Prev.</th>
                    <th className="p-2 text-left">Andamento</th>
                    <th className="p-2 text-right">Tempo apontado</th>
                  </tr>
                </thead>
                <tbody>
                  {maquinas.length === 0 && (
                    <tr>
                      <td colSpan={10} className="p-6 text-center text-muted-foreground">
                        Sem máquinas no período.
                      </td>
                    </tr>
                  )}
                  {maquinas.map((m) => (
                    <tr key={m.prefixo} className="border-t border-border">
                      <td className="p-2 font-medium">{m.prefixo}</td>
                      <td className="p-2">{m.tipo || "—"}</td>
                      <td className="p-2 text-xs">{dataHora(m.entrada)}</td>
                      <td className="p-2">
                        <Badge variant={m.liberada ? "secondary" : "outline"}>
                          {m.liberada ? "Liberada" : "Na oficina"}
                        </Badge>
                      </td>
                      <td className="p-2 text-xs">
                        {m.destino}
                        {!m.seminovo && m.contrato ? ` — ${m.contrato}` : ""}
                      </td>

                      <td className="p-2 text-right">{m.permanencia ?? "—"}</td>
                      <td className="p-2 text-right">{m.corretivas}</td>
                      <td className="p-2 text-right">{m.preventivas}</td>
                      <td className="p-2">
                        {m.progresso ? (
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${m.progresso.pct}%` }}
                              />
                            </div>
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {m.progresso.pct}% ({m.progresso.feitos}/{m.progresso.total})
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-2 text-right font-medium">{formatMin(m.minutos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inspecoes">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Inspeções ({inspecoes.length})</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  downloadCSV(
                    `inspecoes-${stamp}`,
                    [
                      "Prefixo",
                      "Tipo",
                      "Inspetor",
                      "Data",
                      "Horímetro",
                      "Itens",
                      "Falhas",
                      "Liberado",
                    ],
                    inspecoes.map((i) => [
                      i.prefixo,
                      i.tipo,
                      i.inspetor,
                      dataHora(i.data),
                      i.horimetro,
                      i.items?.length ?? 0,
                      i.falhas?.length ?? 0,
                      i.liberado ? "Sim" : "Não",
                    ]),
                  )
                }
              >
                <Download className="mr-2 h-4 w-4" /> CSV
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[480px] text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="p-2 text-left">Inspetor</th>
                      <th className="p-2 text-right">Entrada</th>
                      <th className="p-2 text-right">Saída</th>
                      <th className="p-2 text-right">Itens reprovados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porInspetor.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-muted-foreground">
                          Sem inspeções no período.
                        </td>
                      </tr>
                    )}
                    {porInspetor.map((i) => (
                      <tr key={i.nome} className="border-t border-border">
                        <td className="p-2 font-medium">{i.nome}</td>
                        <td className="p-2 text-right">{i.entrada}</td>
                        <td className="p-2 text-right">{i.saida}</td>
                        <td className="p-2 text-right">{i.falhas}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
