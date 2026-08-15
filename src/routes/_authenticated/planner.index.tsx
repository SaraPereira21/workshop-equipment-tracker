import { createFileRoute, Link } from "@tanstack/react-router";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { CalendarDays, KanbanSquare, Tag as TagIcon, X, Filter, Truck, Flame, Search, Download, ListFilter, ChevronDown } from "lucide-react";
import { addDays, addWeeks, endOfWeek, isSameDay, startOfDay } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppStore } from "@/lib/store";
import { useKanbanColumns } from "@/hooks/use-kanban";
import { AssetCard } from "@/components/asset-card";
import { NovaSolicitacaoDialog } from "@/components/nova-solicitacao-dialog";
import { toast } from "sonner";
import type { Asset, KanbanColumn, Priority } from "@/lib/types";
import { downloadCSV } from "@/lib/csv-export";
import { useAuth } from "@/hooks/use-auth";
import { canEditCards } from "@/lib/can-edit-card";
import { SearchableMultiSelect } from "@/components/searchable-multi-select";
import { normalizeTipo } from "@/lib/tipo-equipamento";



/** Agrupamento por data de entrega prevista, no estilo do Microsoft Planner. */
const DATE_BUCKETS = [
  { key: "sem_data", title: "Sem data de conclusão", short: "Sem data" },
  { key: "atrasadas", title: "Atrasadas", short: "Atrasadas" },
  { key: "hoje", title: "Hoje", short: "Hoje" },
  { key: "amanha", title: "Amanhã", short: "Amanhã" },
  { key: "resto_semana", title: "Restante da semana", short: "Esta semana" },
  { key: "prox_semana", title: "Semana que vem", short: "Próx. semana" },
  { key: "futuro", title: "Futuro", short: "Futuro" },
] as const;

function dateBucket(value?: string | null): string {
  if (!value) return "sem_data";
  const d = startOfDay(new Date(value));
  if (Number.isNaN(d.getTime())) return "sem_data";
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  if (d < today) return "atrasadas";
  if (isSameDay(d, today)) return "hoje";
  if (isSameDay(d, tomorrow)) return "amanha";
  if (d <= endOfWeek(today)) return "resto_semana";
  if (d <= endOfWeek(addWeeks(today, 1))) return "prox_semana";
  return "futuro";
}


const PRIORITIES: { value: Priority; label: string; className: string }[] = [
  { value: "critica", label: "Crítica", className: "border-destructive text-destructive bg-destructive/10" },
  { value: "alta", label: "Alta", className: "border-warning text-warning-foreground bg-warning/15" },
  { value: "media", label: "Média", className: "border-info text-info bg-info/10" },
  { value: "baixa", label: "Baixa", className: "border-border text-muted-foreground bg-muted" },
];

/** "Status" no estilo Planner — situação operacional da máquina. */
const SITUACOES = [
  { key: "operando", title: "Operando" },
  { key: "em_inspecao", title: "Em inspeção" },
  { key: "em_manutencao", title: "Em manutenção" },
  { key: "aguardando_pcm", title: "Aguardando PCM" },
  { key: "liberado", title: "Liberado" },
] as const;

function situacaoDe(a: Asset): string {
  return SITUACOES.some((s) => s.key === a.status) ? a.status : "operando";
}

type GroupBy = "atribuida" | "status" | "rotulos" | "entrega" | "prioridade" | "situacao" | "tipo";

const GROUP_OPTIONS: { value: GroupBy; label: string; mobileFirst?: string }[] = [
  { value: "atribuida", label: "Atribuída a" },
  { value: "status", label: "Bucket" },
  { value: "rotulos", label: "Rótulos" },
  { value: "entrega", label: "Data de conclusão", mobileFirst: "atrasadas" },
  { value: "prioridade", label: "Prioridade" },
  { value: "situacao", label: "Status" },
  { value: "tipo", label: "Tipo de equipamento" },
];


export const Route = createFileRoute("/_authenticated/planner/")({
  head: () => ({
    meta: [
      { title: "Planner — Kanban da Oficina" },
      { name: "description", content: "Gestão visual da manutenção da frota em kanban." },
    ],
  }),
  component: PlannerKanban,
});

function PlannerKanban() {
  const assets = useAppStore((s) => s.assets);
  const workOrders = useAppStore((s) => s.workOrders);
  const inspections = useAppStore((s) => s.inspections);

  const moveAsset = useAppStore((s) => s.moveAsset);
  const tagCatalog = useAppStore((s) => s.tagCatalog);
  const mechanics = useAppStore((s) => s.mechanics);
  const { columns: KANBAN_COLUMNS } = useKanbanColumns();
  // Estado de busca/filtros persistido: ao abrir um card e voltar, tudo continua na tela.
  const readStored = <T,>(key: string, fallback: T): T => {
    if (typeof window === "undefined") return fallback;
    try {
      const raw = window.sessionStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  };
  const [groupBy, setGroupBy] = useState<GroupBy>(() => readStored<GroupBy>("planner:groupBy", "status"));
  const [mobileCol, setMobileCol] = useState<string>(() => readStored<string>("planner:mobileCol", "chegada"));

  const [tagFilters, setTagFilters] = useState<string[]>(() => readStored<string[]>("planner:tagFilters", []));
  const [tipoFilters, setTipoFilters] = useState<string[]>(() => readStored<string[]>("planner:tipoFilters", []));
  const [priorityFilters, setPriorityFilters] = useState<Priority[]>(() =>
    readStored<Priority[]>("planner:priorityFilters", []),
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.sessionStorage.getItem("planner:search") ?? "";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem("planner:search", search);
    window.sessionStorage.setItem("planner:groupBy", JSON.stringify(groupBy));
    window.sessionStorage.setItem("planner:mobileCol", JSON.stringify(mobileCol));
    window.sessionStorage.setItem("planner:tagFilters", JSON.stringify(tagFilters));
    window.sessionStorage.setItem("planner:tipoFilters", JSON.stringify(tipoFilters));
    window.sessionStorage.setItem("planner:priorityFilters", JSON.stringify(priorityFilters));
  }, [search, groupBy, mobileCol, tagFilters, tipoFilters, priorityFilters]);
  // Mantém a digitação fluida mesmo com centenas de cards.
  const deferredSearch = useDeferredValue(search);



  const activeTags = useMemo(() => {
    const inUse = new Set<string>();
    assets.forEach((a) => (a.tags || []).forEach((t) => inUse.add(t)));
    tagFilters.forEach((t) => inUse.add(t));
    return tagCatalog.filter((t) => inUse.has(t));
  }, [assets, tagCatalog, tagFilters]);

  const activeTipos = useMemo(() => {
    const set = new Set<string>();
    assets.forEach((a) => {
      const t = normalizeTipo(a.tipo);
      if (t) set.add(t);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [assets]);


  const totalFilters = tagFilters.length + tipoFilters.length + priorityFilters.length;

  const visibleAssets = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return assets.filter((a) => {
      // Todas as máquinas aparecem no planner, inclusive as que estão na fila
      // do PCM aguardando lançamento de OS.

      if (tagFilters.length && !tagFilters.every((f) => (a.tags || []).includes(f))) return false;
      if (tipoFilters.length && !tipoFilters.includes(normalizeTipo(a.tipo))) return false;
      if (priorityFilters.length && !priorityFilters.includes(a.priority)) return false;
      if (q) {
        const hay = [
          a.prefixo, a.marca, a.modelo, a.tipo, a.contrato, a.descricao,
          a.sapOsCorretiva, a.sapOsPreventiva,
          ...(a.tags || []),
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [assets, workOrders, tagFilters, tipoFilters, priorityFilters, deferredSearch]);

  const grouped = useMemo(() => {
    type Grp = { key: string; title: string; short: string; items: Asset[] };

    if (groupBy === "entrega") {
      const emAberto = visibleAssets.filter(
        (a) => a.column !== "liberado" && a.status !== "liberado",
      );
      return DATE_BUCKETS.map((b) => ({
        key: b.key as string,
        title: b.title,
        short: b.short,
        items: emAberto.filter((a) => dateBucket(a.dataEntregaPrevista) === b.key),
      }));
    }


    if (groupBy === "atribuida") {
      const nome = (id: string) => mechanics.find((m) => m.id === id)?.nome ?? "Manutentor removido";
      const map = new Map<string, Grp>();
      const push = (key: string, title: string, a: Asset) => {
        if (!map.has(key)) map.set(key, { key, title, short: title, items: [] });
        map.get(key)!.items.push(a);
      };
      visibleAssets.forEach((a) => {
        const ids = a.mecanicoIds?.length ? a.mecanicoIds : a.mecanicoId ? [a.mecanicoId] : [];
        if (!ids.length) push("__sem__", "Não atribuídas", a);
        else ids.forEach((id) => push(id, nome(id), a));
      });
      const sem = map.get("__sem__");
      const resto = Array.from(map.values())
        .filter((g) => g.key !== "__sem__")
        .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
      return sem ? [sem, ...resto] : resto;
    }

    if (groupBy === "rotulos") {
      const map = new Map<string, Grp>();
      const push = (key: string, title: string, a: Asset) => {
        if (!map.has(key)) map.set(key, { key, title, short: title, items: [] });
        map.get(key)!.items.push(a);
      };
      visibleAssets.forEach((a) => {
        const tags = a.tags ?? [];
        if (!tags.length) push("__sem__", "Sem rótulo", a);
        else tags.forEach((t) => push(t, t, a));
      });
      const sem = map.get("__sem__");
      const resto = Array.from(map.values())
        .filter((g) => g.key !== "__sem__")
        .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
      return sem ? [sem, ...resto] : resto;
    }

    if (groupBy === "prioridade") {
      return PRIORITIES.map((p) => ({
        key: p.value as string,
        title: p.label,
        short: p.label,
        items: visibleAssets.filter((a) => a.priority === p.value),
      }));
    }

    if (groupBy === "tipo") {
      const map = new Map<string, Grp>();
      visibleAssets.forEach((a) => {
        const norm = normalizeTipo(a.tipo);
        const key = norm || "__sem__";

        const title = key === "__sem__" ? "Sem tipo" : key;
        if (!map.has(key)) map.set(key, { key, title, short: title, items: [] });
        map.get(key)!.items.push(a);
      });
      return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
    }

    if (groupBy === "situacao") {
      return SITUACOES.map((s) => ({
        key: s.key,
        title: s.title,
        short: s.title,
        items: visibleAssets.filter((a) => situacaoDe(a) === s.key),
      }));
    }

    const known = new Set(KANBAN_COLUMNS.map((c) => c.key as string));
    const liberadoTs = (a: (typeof visibleAssets)[number]) => {
      const d = a.dataLiberacao ?? a.libNovoSupervisorEm ?? a.ultimaAlteracaoEm;
      const t = d ? new Date(d).getTime() : 0;
      return Number.isNaN(t) ? 0 : t;
    };
    const base = KANBAN_COLUMNS.map((c) => ({
      key: c.key as string,
      title: c.title,
      short: c.short,
      items:
        c.key === "liberado"
          ? visibleAssets
              .filter((a) => a.column === c.key)
              .sort((a, b) => liberadoTs(b) - liberadoTs(a))
          : visibleAssets.filter((a) => a.column === c.key),
    }));

    const orfaos = visibleAssets.filter((a) => !known.has(a.column as string));
    if (orfaos.length) {
      // Só fica "Aguardando Lib. Supervisor" quem realmente depende de assinatura
      // do supervisor: OS finalizada aguardando aprovação ou check de saída enviado.
      const comWoSupervisor = new Set(
        workOrders.filter((w) => w.status === "aguardando_supervisor").map((w) => w.assetId),
      );
      const inspecionado = new Set(inspections.map((i) => i.assetId));
      const byKey = new Map(base.map((g) => [g.key, g]));
      const aguardandoSuper: Asset[] = [];

      orfaos.forEach((a) => {
        const esperaSupervisor =
          a.libNovoStatus === "aguardando_supervisor" || comWoSupervisor.has(a.id);
        if (esperaSupervisor) {
          aguardandoSuper.push(a);
          return;
        }
        // Já inspecionada e com serviço a executar → fila do PCM.
        // Ainda não inspecionada → aguardando mão de obra.
        const destino =
          inspecionado.has(a.id) || a.inspectionDraft ? "pcm" : "mdo";
        const grp = byKey.get(destino);
        if (grp) grp.items.push(a);
        else aguardandoSuper.push(a);
      });

      if (aguardandoSuper.length) {
        base.push({
          key: "__sem_coluna__",
          title: "Aguardando Lib. Supervisor",
          short: "Aguard. Lib. Super.",
          items: aguardandoSuper,
        });
      }
    }
    return base;
  }, [KANBAN_COLUMNS, visibleAssets, groupBy, mechanics, workOrders, inspections]);




  const clearAll = () => {
    setTagFilters([]);
    setTipoFilters([]);
    setPriorityFilters([]);
  };

  // Mecânicos e inspetores acessam o Planner em modo leitura.
  const { roles } = useAuth();
  const canEdit = canEditCards(roles);

  const handleDrop = (col: string) => (e: React.DragEvent) => {
    e.preventDefault();
    if (!canEdit || groupBy !== "status" || col === "__sem_coluna__") return;

    const id = e.dataTransfer.getData("text/plain");
    if (id) {
      moveAsset(id, col as KanbanColumn);
      toast.success(`Card movido para "${KANBAN_COLUMNS.find((c) => c.key === col)?.short}"`);
    }
  };


  const exportCSV = () => {
    const colLabel = new Map(KANBAN_COLUMNS.map((c) => [c.key, c.title]));
    const rows = visibleAssets.map((a) => [
      a.prefixo,
      a.marca ?? "",
      a.modelo ?? "",
      a.tipo ?? "",
      a.contrato ?? "",
      colLabel.get(a.column) ?? a.column,
      a.priority,
      a.horimetroAtual ?? "",
      a.sapOsCorretiva ?? "",
      a.sapOsPreventiva ?? "",
      a.dataEntrada ? new Date(a.dataEntrada).toLocaleDateString("pt-BR") : "",
      a.dataEntregaPrevista ? new Date(a.dataEntregaPrevista).toLocaleDateString("pt-BR") : "",
      a.dataLiberacao ? new Date(a.dataLiberacao).toLocaleDateString("pt-BR") : "",
      (a.tags || []).join(", "),
    ]);
    downloadCSV(
      `planner-oficina-${new Date().toISOString().slice(0, 10)}`,
      [
        "Prefixo", "Marca", "Modelo", "Tipo", "Contrato",
        "Coluna", "Prioridade", "Horímetro",
        "OS Corretiva", "OS Preventiva",
        "Entrada", "Prev. Entrega", "Liberação",
        "Tags",
      ],
      rows,
    );
    toast.success(`${rows.length} máquinas exportadas`);
  };

  const currentCol = grouped.find((g) => g.key === mobileCol) ?? grouped[0];

  return (
    <div className="mx-auto max-w-[1600px] px-3 py-4 md:px-6 md:py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold md:text-3xl">Planner da Oficina</h1>
          
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <ListFilter className="h-4 w-4" />
                Agrupar por: {GROUP_OPTIONS.find((o) => o.value === groupBy)?.label}
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {GROUP_OPTIONS.map((o) => (
                <DropdownMenuCheckboxItem
                  key={o.value}
                  checked={groupBy === o.value}
                  onCheckedChange={() => {
                    setGroupBy(o.value);
                    setMobileCol(o.value === "status" ? "chegada" : (o.mobileFirst ?? ""));
                  }}
                >
                  {o.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>


          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar prefixo, marca, modelo, tag..."
              className="h-9 pl-8 pr-8"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted"
                aria-label="Limpar busca"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button
            variant={filtersOpen || totalFilters > 0 ? "default" : "outline"}
            size="sm"
            className="gap-2"
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <Filter className="h-4 w-4" />
            Filtros
            {totalFilters > 0 && (
              <span className="rounded-full bg-background/20 px-1.5 text-[10px] font-bold">
                {totalFilters}
              </span>
            )}
          </Button>
          <NovaSolicitacaoDialog triggerSize="sm" triggerClassName="gap-2" />
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link to="/planner/calendario"><CalendarDays className="h-4 w-4" /> Calendário</Link>
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={exportCSV}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        </div>
      </div>

      {filtersOpen && (
        <div className="mb-4 space-y-3 rounded-lg border bg-muted/30 p-3">
          {/* Criticidade */}
          <FilterGroup icon={<Flame className="h-3 w-3" />} label="Criticidade">
            {PRIORITIES.map((p) => {
              const active = priorityFilters.includes(p.value);
              return (
                <Chip
                  key={p.value}
                  active={active}
                  activeClass={p.className}
                  onClick={() =>
                    setPriorityFilters((prev) =>
                      prev.includes(p.value) ? prev.filter((x) => x !== p.value) : [...prev, p.value],
                    )
                  }
                >
                  {p.label}
                </Chip>
              );
            })}
          </FilterGroup>

          {/* Tipo de máquina e Tags — listas com busca */}
          <div className="flex flex-wrap items-center gap-2">
            {activeTipos.length > 0 && (
              <SearchableMultiSelect
                label="Tipo de máquina"
                icon={<Truck className="h-3.5 w-3.5" />}
                options={activeTipos}
                selected={tipoFilters}
                onChange={setTipoFilters}
                placeholder="Pesquisar tipo..."
              />
            )}
            {activeTags.length > 0 && (
              <SearchableMultiSelect
                label="Tags"
                icon={<TagIcon className="h-3.5 w-3.5" />}
                options={activeTags}
                selected={tagFilters}
                onChange={setTagFilters}
                placeholder="Pesquisar tag..."
              />
            )}
            {[...tipoFilters, ...tagFilters].map((v) => (
              <span
                key={v}
                className="flex items-center gap-1 rounded-full border border-primary bg-primary/15 px-2.5 py-0.5 text-[11px] font-medium text-primary"
              >
                {v}
                <button
                  type="button"
                  aria-label={`Remover ${v}`}
                  onClick={() => {
                    setTipoFilters((p) => p.filter((x) => x !== v));
                    setTagFilters((p) => p.filter((x) => x !== v));
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>


          {totalFilters > 0 && (
            <div className="flex items-center justify-between border-t pt-2 text-[11px] text-muted-foreground">
              <span>
                Exibindo <b className="text-foreground">{visibleAssets.length}</b> de {assets.length} equipamentos
              </span>
              <button
                onClick={clearAll}
                className="flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-background"
              >
                <X className="h-3 w-3" /> Limpar filtros
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mobile: tabs + one column */}
      <div className="md:hidden">
        <Tabs value={currentCol.key} onValueChange={(v) => setMobileCol(v)}>
          <TabsList className="flex w-full overflow-x-auto h-auto p-1">
            {grouped.map((g) => (
              <TabsTrigger key={g.key} value={g.key} className="shrink-0 flex-col gap-0.5 text-[11px]">
                <span>{g.short}</span>
                <span className="rounded bg-background/60 px-1 text-[10px]">{g.items.length}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="mt-3 grid gap-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {currentCol.title} · {currentCol.items.length}
          </div>
          {currentCol.items.length === 0 && (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhum equipamento nesta coluna.
            </div>
          )}
          <ColumnItems items={currentCol.items} />

        </div>
      </div>

      {/* Desktop: horizontal kanban */}
      <div className="hidden md:block">
        <div className="overflow-x-auto">
          <div className="flex min-w-max gap-3 pb-2">
            {grouped.map((g) => (
              <div
                key={g.key}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop(g.key)}
                className="flex w-72 shrink-0 flex-col rounded-xl border bg-muted/30"
              >
                <div className="sticky top-0 flex items-center justify-between rounded-t-xl border-b bg-card px-3 py-2">
                  <div className="flex items-center gap-2">
                    <KanbanSquare className="h-4 w-4 text-primary" />
                    <span className="font-display text-sm font-semibold">{g.title}</span>
                  </div>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{g.items.length}</span>
                </div>
                <div className="flex-1 space-y-2 p-2 min-h-[200px]">
                  <ColumnItems items={g.items} draggable={canEdit && groupBy === "status"} />
                </div>

              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const PAGE_SIZE = 25;

/** Renderiza os cards em lotes — colunas com 100+ máquinas travavam o navegador. */
function ColumnItems({ items, draggable }: { items: Asset[]; draggable?: boolean }) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const shown = items.slice(0, limit);
  return (
    <>
      {shown.map((a) => (
        <AssetCard
          key={a.id}
          asset={a}
          onDragStart={draggable ? (e: React.DragEvent) => e.dataTransfer.setData("text/plain", a.id) : undefined}
        />
      ))}
      {items.length > shown.length && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + PAGE_SIZE)}
          className="w-full rounded-md border border-dashed py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted"
        >
          Ver mais ({items.length - shown.length})
        </button>
      )}
    </>
  );
}


function FilterGroup({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 flex items-center gap-1 text-[11px] font-semibold uppercase text-muted-foreground">
        {icon} {label}
      </span>
      {children}
    </div>
  );
}

function Chip({
  active,
  activeClass,
  onClick,
  children,
}: {
  active: boolean;
  activeClass?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2.5 py-0.5 text-[11px] transition ${
        active
          ? activeClass ?? "border-primary bg-primary/15 text-primary font-medium"
          : "border-border text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}
