import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Upload,
  Target,
  CheckCircle2,
  AlertTriangle,
  Search,
  RefreshCw,
  Download,
  ChevronDown,
  Star,
  ChevronUp,
  ChevronDown as ChevronDownIcon,
  Flag,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import { useAuth } from "@/hooks/use-auth";
import { ColumnBadge } from "@/components/status-badges";
import { downloadCSV } from "@/lib/csv-export";
import {
  brl,
  getMeta,
  importarSeminovos,
  listSeminovos,
  listPrioridades,
  removePrioridade,
  setPrioridade,
  mesRef,
  normPrefixo,
  parseSeminovosXlsx,
  rotuloMes,
  setMeta,
  type SeminovoItem,
} from "@/lib/seminovos";

export const Route = createFileRoute("/_authenticated/seminovos")({
  head: () => ({
    meta: [
      { title: "Seminovos — Planner Matriz" },
      {
        name: "description",
        content:
          "Acompanhamento das máquinas destinadas ao Seminovos: meta mensal, valor liberado, pendências de manutenção e compras.",
      },
      { property: "og:title", content: "Seminovos — Planner Matriz" },
      {
        property: "og:description",
        content: "Meta mensal de liberação para venda, o que falta em cada máquina e perspectiva de entrega.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SeminovosPage,
});

const LIBERADO_SN = ["DISPONÍVEL PARA VENDA", "DISPONIVEL PARA VENDA", "DISPONÍVEL PRA VENDA", "VENDIDO"];

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  tone = "primary",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ElementType;
  tone?: "primary" | "success" | "warning";
}) {
  const toneCls =
    tone === "success"
      ? "bg-success/10 text-success"
      : tone === "warning"
        ? "bg-warning/20 text-warning-foreground"
        : "bg-primary/10 text-primary";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </div>
            <div className="mt-1 font-display text-lg font-bold leading-tight tabular-nums break-all sm:text-xl lg:text-2xl">
              {value}
            </div>
            {hint && <div className="mt-1 text-[11px] leading-snug text-muted-foreground">{hint}</div>}
          </div>
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${toneCls}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SeminovosPage() {
  const assets = useAppStore((s) => s.assets);
  const workOrders = useAppStore((s) => s.workOrders);
  const { roles } = useAuth();
  const podeImportar = roles.some((r) => ["admin", "pcm", "supervisor", "frota"].includes(r));

  const [itensRaw, setItensRaw] = useState<SeminovoItem[]>([]);
  // Regra fixa: só entram na visão de Seminovos as máquinas em preparação para venda.
  const itens = useMemo(
    () =>
      itensRaw.filter((i) =>
        (i.status_manutencao ?? "").toUpperCase().includes("EM PREPARAÇÃO"),
      ),
    [itensRaw],
  );
  const [loading, setLoading] = useState(true);
  const [mesesSel, setMesesSel] = useState<string[]>([]);
  const [metas, setMetas] = useState<Record<string, number>>({});
  const [metaInput, setMetaInput] = useState("5000000");
  const [busca, setBusca] = useState("");
  const [somentePendentes, setSomentePendentes] = useState(false);
  const [somentePrioridade, setSomentePrioridade] = useState(false);
  const [prioridades, setPrioridades] = useState<Record<string, number>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const podePriorizar = podeImportar;

  const carregar = async () => {
    setLoading(true);
    try {
      const [rows, prio] = await Promise.all([listSeminovos(), listPrioridades().catch(() => ({}))]);
      setItensRaw(rows);
      setPrioridades(prio);
    } catch (e) {
      toast.error("Falha ao carregar seminovos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void carregar();
  }, []);

  const meses = useMemo(() => {
    const set = new Set<string>();
    for (const i of itens) set.add(mesRef(i.data_liberacao_venda));
    return Array.from(set).sort();
  }, [itens]);

  useEffect(() => {
    if (mesesSel.length || meses.length === 0) return;
    setMesesSel(meses.filter((m) => m));
  }, [meses, mesesSel.length]);

  useEffect(() => {
    const alvo = meses.filter((m) => m && metas[m] === undefined);
    if (!alvo.length) return;
    void Promise.all(alvo.map(async (m) => [m, await getMeta(m)] as const)).then((pares) => {
      setMetas((prev) => ({ ...prev, ...Object.fromEntries(pares) }));
    });
  }, [meses, metas]);

  const metaSelecionada = mesesSel.reduce((a, m) => a + (metas[m] ?? 5_000_000), 0);
  const mesUnico = mesesSel.length === 1 ? mesesSel[0] : null;

  useEffect(() => {
    if (mesUnico) setMetaInput(String(metas[mesUnico] ?? 5_000_000));
  }, [mesUnico, metas]);

  const assetByPrefixo = useMemo(() => {
    const map = new Map<string, (typeof assets)[number]>();
    for (const a of assets) {
      if (a.deletedAt) continue;
      map.set(normPrefixo(a.prefixo), a);
    }
    return map;
  }, [assets]);

  const osByAsset = useMemo(() => {
    const map = new Map<string, typeof workOrders>();
    for (const w of workOrders) {
      const arr = map.get(w.assetId) ?? [];
      arr.push(w);
      map.set(w.assetId, arr);
    }
    return map;
  }, [workOrders]);

  const linhas = useMemo(() => {
    const q = busca.trim().toUpperCase();
    return itens
      .filter((i) => mesesSel.length === 0 || mesesSel.includes(mesRef(i.data_liberacao_venda)))
      .filter((i) => !q || i.prefixo.toUpperCase().includes(q) || (i.modelo ?? "").toUpperCase().includes(q))
      .map((i) => {
        const asset = assetByPrefixo.get(i.prefixo_norm);
        const oss = asset ? (osByAsset.get(asset.id) ?? []) : [];
        const abertas = oss.filter((o) => o.status !== "fechada");
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
        for (const t of asset?.pendingTasks ?? []) {
          total += 1;
          if (t.done) feitos += 1;
        }
        const pct = total ? Math.round((feitos / total) * 100) : null;
        const materiaisPendentes = oss.reduce(
          (acc, o) => acc + (o.materiais ?? []).filter((m) => !m.liberado).length,
          0,
        );
        const statusSN = (i.status_sn ?? "").toUpperCase();
        const liberadaComercial = LIBERADO_SN.includes(statusSN);
        const liberadaOficina = asset?.column === "liberado";
        const liberada = liberadaComercial || liberadaOficina;

        const faltas: string[] = [];
        if (!asset) faltas.push("Sem card no Planner");
        if (asset && !liberadaOficina) faltas.push("Manutenção em andamento");
        if (abertas.length) faltas.push(`${abertas.length} OS aberta(s)`);
        if (materiaisPendentes) faltas.push(`${materiaisPendentes} material(is) aguardando compra/almox`);
        if (pct !== null && pct < 100) faltas.push(`Atividades ${pct}%`);
        if (!liberadaComercial && statusSN) faltas.push(`Comercial: ${statusSN}`);

        return {
          item: i,
          asset,
          liberada,
          liberadaOficina,
          pct,
          abertas: abertas.length,
          materiaisPendentes,
          previsao: asset?.dataEntregaPrevista ?? null,
          faltas,
          prioridade: prioridades[i.prefixo_norm] ?? null,
        };
      })
      .filter((l) => !somentePendentes || !l.liberada)
      .filter((l) => !somentePrioridade || l.prioridade !== null)
      .sort((a, b) => {
        const pa = a.prioridade ?? Number.MAX_SAFE_INTEGER;
        const pb = b.prioridade ?? Number.MAX_SAFE_INTEGER;
        if (pa !== pb) return pa - pb;
        return (a.item.data_liberacao_venda ?? "9999").localeCompare(b.item.data_liberacao_venda ?? "9999");
      });
  }, [itens, mesesSel, busca, assetByPrefixo, osByAsset, somentePendentes, somentePrioridade, prioridades]);

  const priorizadas = linhas.filter((l) => l.prioridade !== null);
  const valorPriorizado = priorizadas.reduce((a, l) => a + (l.item.preco_venda ?? 0), 0);
  const valorLiberado = linhas.filter((l) => l.liberada).reduce((a, l) => a + (l.item.preco_venda ?? 0), 0);
  const pendentes = linhas.filter((l) => !l.liberada);
  const valorPendente = pendentes.reduce((a, l) => a + (l.item.preco_venda ?? 0), 0);
  const qtdLiberado = linhas.filter((l) => l.liberada).length;
  const pctMeta = metaSelecionada ? Math.min(100, Math.round((valorLiberado / metaSelecionada) * 100)) : 0;
  const pctMetaPriorizado = metaSelecionada
    ? Math.min(100, Math.round(((valorLiberado + valorPriorizado) / metaSelecionada) * 100))
    : 0;

  const ordenadasPrioridade = useMemo(
    () =>
      Object.entries(prioridades)
        .sort((a, b) => a[1] - b[1])
        .map(([k]) => k),
    [prioridades],
  );

  const salvarOrdem = async (lista: string[]) => {
    const novo = Object.fromEntries(lista.map((p, idx) => [p, idx + 1]));
    setPrioridades(novo);
    try {
      await Promise.all(lista.map((p, idx) => setPrioridade(p, idx + 1)));
    } catch {
      toast.error("Não foi possível salvar a prioridade");
      void carregar();
    }
  };

  const togglePrioridade = async (prefixoNorm: string) => {
    const atual = ordenadasPrioridade;
    if (prioridades[prefixoNorm] !== undefined) {
      const resto = atual.filter((p) => p !== prefixoNorm);
      const novo = Object.fromEntries(resto.map((p, i) => [p, i + 1]));
      setPrioridades(novo);
      try {
        await removePrioridade(prefixoNorm);
        await Promise.all(resto.map((p, i) => setPrioridade(p, i + 1)));
      } catch {
        toast.error("Não foi possível remover a prioridade");
        void carregar();
      }
      return;
    }
    await salvarOrdem([...atual, prefixoNorm]);
  };

  const moverPrioridade = async (prefixoNorm: string, dir: -1 | 1) => {
    const lista = [...ordenadasPrioridade];
    const i = lista.indexOf(prefixoNorm);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    await salvarOrdem(lista);
  };



  const onUpload = async (file: File) => {
    try {
      const parsed = await parseSeminovosXlsx(file);
      await importarSeminovos(parsed, file.name);
      toast.success(`${parsed.length} máquinas importadas do comercial`);
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao importar a planilha");
    }
  };

  const exportar = () => {
    downloadCSV(
      `seminovos-${mesesSel.length ? mesesSel.join("_") : "todos"}`,
      [
        "Prefixo",
        "Modelo",
        "Família",
        "Preço venda",
        "Data liberação p/ venda",
        "Status comercial",
        "Status oficina",
        "OSs abertas",
        "Materiais pendentes",
        "Andamento %",
        "Previsão entrega",
        "O que falta",
      ],
      linhas.map((l) => [
        l.item.prefixo,
        l.item.modelo ?? "",
        l.item.familia ?? "",
        l.item.preco_venda ?? 0,
        l.item.data_liberacao_venda ?? "",
        l.item.status_sn ?? "",
        l.asset ? l.asset.column : "sem card",
        l.abertas,
        l.materiaisPendentes,
        l.pct ?? "",
        l.previsao ?? "",
        l.faltas.join(" | "),
      ]),
    );
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 p-3 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Seminovos</h1>
          <p className="text-sm text-muted-foreground">
            Máquinas destinadas à venda: meta mensal, o que falta para liberar e perspectiva de entrega.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void carregar()} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={exportar} className="gap-2">
            <Download className="h-4 w-4" /> CSV
          </Button>
          {podeImportar && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onUpload(f);
                  e.target.value = "";
                }}
              />
              <Button size="sm" className="gap-2" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4" /> Importar planilha do comercial
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Meta dos meses selecionados"
          value={brl(metaSelecionada)}
          hint={mesesSel.length ? mesesSel.map(rotuloMes).join(" • ") : "nenhum mês"}
          icon={Target}
        />
        <Kpi
          label="Liberado"
          value={brl(valorLiberado)}
          hint={`${qtdLiberado} máquina(s) • ${pctMeta}% da meta`}
          icon={CheckCircle2}
          tone="success"
        />
        <Kpi
          label="Falta liberar"
          value={brl(valorPendente)}
          hint={`${pendentes.length} máquina(s)`}
          icon={AlertTriangle}
          tone="warning"
        />
        <Kpi
          label="Priorizadas p/ entrega"
          value={String(priorizadas.length)}
          hint={`${brl(valorPriorizado)} na fila de prioridade`}
          icon={Flag}
        />
      </div>


      <Card>
        <CardContent className="space-y-2 p-4">
          <div className="flex items-center justify-between text-xs font-medium">
            <span>Atingimento da meta</span>
            <span>{pctMeta}%</span>
          </div>
          <Progress value={pctMeta} />
          {priorizadas.length > 0 && (
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                Com as {priorizadas.length} priorizadas entregues: {brl(valorLiberado + valorPriorizado)}
              </span>
              <span className="font-medium text-foreground">{pctMetaPriorizado}% da meta</span>
            </div>
          )}
        </CardContent>
      </Card>


      <Card>
        <CardContent className="space-y-3 p-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Data de liberação p/ venda</label>
            <div className="mt-1">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between gap-2 sm:w-72">
                    <span className="truncate">
                      {mesesSel.length === 0
                        ? "Selecione os meses"
                        : mesesSel.length === 1
                          ? rotuloMes(mesesSel[0])
                          : `${mesesSel.length} meses selecionados`}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 p-0">
                  <div className="flex items-center justify-between border-b px-3 py-2">
                    <span className="text-xs font-medium text-muted-foreground">Meses de liberação</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-[11px] font-medium text-primary hover:underline"
                        onClick={() => setMesesSel(meses.filter((m) => m))}
                      >
                        Todos
                      </button>
                      <button
                        type="button"
                        className="text-[11px] font-medium text-primary hover:underline"
                        onClick={() => setMesesSel([])}
                      >
                        Limpar
                      </button>
                    </div>
                  </div>
                  <div className="max-h-64 divide-y divide-border overflow-y-auto">
                    {meses.map((m) => {
                      const ativo = mesesSel.includes(m);
                      const doMes = itens.filter((i) => mesRef(i.data_liberacao_venda) === m);
                      return (
                        <label
                          key={m || "sem"}
                          className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-primary"
                            checked={ativo}
                            onChange={() =>
                              setMesesSel((prev) =>
                                prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
                              )
                            }
                          />
                          <span className="font-medium">{rotuloMes(m)}</span>
                          <span className="ml-auto text-xs text-muted-foreground">{doMes.length}</span>
                        </label>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            </div>


          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1">
              <label className="text-xs font-medium text-muted-foreground">Buscar prefixo / modelo</label>
              <div className="relative mt-1">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="EH 120" className="pl-8" />
              </div>
            </div>
            {podeImportar && mesUnico && (
              <div className="min-w-44">
                <label className="text-xs font-medium text-muted-foreground">
                  Meta de {rotuloMes(mesUnico)} (R$)
                </label>
                <div className="mt-1 flex gap-2">
                  <Input value={metaInput} onChange={(e) => setMetaInput(e.target.value)} inputMode="numeric" />
                  <Button
                    variant="outline"
                    onClick={async () => {
                      const v = Number(metaInput.replace(/[^\d]/g, ""));
                      if (!v) return toast.error("Informe um valor válido");
                      await setMeta(mesUnico, v);
                      setMetas((prev) => ({ ...prev, [mesUnico]: v }));
                      toast.success("Meta atualizada");
                    }}
                  >
                    Salvar
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant={somentePendentes ? "default" : "outline"}
              size="sm"
              onClick={() => setSomentePendentes((v) => !v)}
            >
              Somente pendentes
            </Button>
            <Button
              variant={somentePrioridade ? "default" : "outline"}
              size="sm"
              className="gap-2"
              onClick={() => setSomentePrioridade((v) => !v)}
            >
              <Flag className="h-4 w-4" /> Somente priorizadas ({priorizadas.length})
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Máquinas ({linhas.length}) {loading && <span className="text-xs text-muted-foreground">carregando…</span>}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Use a estrela para montar a fila de prioridade de entrega — as priorizadas sobem para o topo, ficam
            numeradas (#1, #2…) e somam no card “Priorizadas p/ entrega”.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {!loading && itensRaw.length === 0 && (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhuma planilha importada ainda. Sempre que o comercial atualizar a planilha, use
              “Importar planilha do comercial” para substituir a lista.
            </div>
          )}
          {!loading && itensRaw.length > 0 && itens.length === 0 && (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhuma máquina com status “EM PREPARAÇÃO PARA VENDA” na planilha atual.
            </div>
          )}
          {linhas.map((l, idx) => {
            const prio = l.prioridade;
            const primeiraSemPrio = prio === null && idx > 0 && linhas[idx - 1].prioridade !== null;
            return (
            <div key={l.item.id}>
              {primeiraSemPrio && (
                <div className="mb-2 mt-4 border-t pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Demais máquinas
                </div>
              )}
              {prio === 1 && (
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-warning-foreground">
                  Fila de prioridade
                </div>
              )}
            <div
              className={`rounded-lg border p-3 ${
                prio !== null ? "border-warning bg-warning/10 shadow-sm" : "border-border"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                {prio !== null && (
                  <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded-md bg-warning px-1.5 text-[11px] font-bold text-warning-foreground">
                    #{prio}
                  </span>
                )}
                <span className="font-display text-base font-bold">{l.item.prefixo}</span>
                {l.asset ? <ColumnBadge column={l.asset.column} /> : (
                  <Badge variant="outline" className="text-[10px]">Sem card no Planner</Badge>
                )}
                {l.liberada ? (
                  <Badge className="bg-success text-success-foreground text-[10px]">Liberada p/ venda</Badge>
                ) : (
                  <Badge variant="destructive" className="text-[10px]">Pendente</Badge>
                )}
                <span className="ml-auto font-semibold">{brl(l.item.preco_venda)}</span>
                {podePriorizar && (
                  <div className="flex items-center gap-0.5">
                    {prio !== null && (
                      <>
                        <button
                          type="button"
                          aria-label="Subir prioridade"
                          className="rounded p-1 text-muted-foreground hover:bg-muted"
                          onClick={() => void moverPrioridade(l.item.prefixo_norm, -1)}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label="Descer prioridade"
                          className="rounded p-1 text-muted-foreground hover:bg-muted"
                          onClick={() => void moverPrioridade(l.item.prefixo_norm, 1)}
                        >
                          <ChevronDownIcon className="h-4 w-4" />
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      title={prio !== null ? "Remover da fila de prioridade" : "Priorizar entrega"}
                      aria-label={prio !== null ? "Remover da fila de prioridade" : "Priorizar entrega"}
                      className={`rounded p-1 hover:bg-muted ${prio !== null ? "text-warning" : "text-muted-foreground"}`}
                      onClick={() => void togglePrioridade(l.item.prefixo_norm)}
                    >
                      <Star className={`h-4 w-4 ${prio !== null ? "fill-current" : ""}`} />
                    </button>
                  </div>
                )}
              </div>


              <div className="mt-1 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                <div>{l.item.modelo || "—"}</div>
                <div>
                  Liberação p/ venda:{" "}
                  <span className="font-medium text-foreground">
                    {l.item.data_liberacao_venda
                      ? new Date(`${l.item.data_liberacao_venda}T00:00:00`).toLocaleDateString("pt-BR")
                      : "—"}
                  </span>
                </div>
                <div>
                  Previsão oficina:{" "}
                  <span className="font-medium text-foreground">
                    {l.previsao ? new Date(l.previsao).toLocaleDateString("pt-BR") : "—"}
                  </span>
                </div>
                <div>{l.item.localizacao || "—"}</div>
              </div>

              {l.pct !== null && (
                <div className="mt-2 flex items-center gap-2">
                  <Progress value={l.pct} className="h-1.5" />
                  <span className="w-10 text-right text-[11px] text-muted-foreground">{l.pct}%</span>
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {l.faltas.length === 0 ? (
                  <Badge variant="secondary" className="text-[10px]">Nada pendente</Badge>
                ) : (
                  l.faltas.map((f) => (
                    <Badge key={f} variant="outline" className="text-[10px]">
                      {f}
                    </Badge>
                  ))
                )}
                {l.item.obs && <span className="text-[11px] italic text-muted-foreground">{l.item.obs}</span>}
                {l.asset && (
                  <Link
                    to="/planner/$prefixo"
                    params={{ prefixo: l.asset.prefixo }}
                    className="ml-auto text-xs font-medium text-primary underline-offset-2 hover:underline"
                  >
                    Abrir card
                  </Link>
                )}
              </div>
            </div>
            </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
