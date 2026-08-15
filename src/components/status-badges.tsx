import type { AssetStatus, Priority, KanbanColumn } from "@/lib/types";
import { cn } from "@/lib/utils";

const COLUMN_STYLE: Record<string, string> = {
  chegada: "bg-info/15 text-info border-info/40",
  pcm: "bg-destructive/10 text-destructive border-destructive/40",
  triagem: "bg-warning/15 text-warning-foreground border-warning/40",
  mdo: "bg-warning/15 text-warning-foreground border-warning/40",
  atribu_do: "bg-accent/20 text-accent-foreground border-accent/50",
  manutencao: "bg-primary/10 text-primary border-primary/40",
  teste: "bg-accent/20 text-accent-foreground border-accent/50",
  aguardando_pcm: "bg-destructive/10 text-destructive border-destructive/40",
  liberado: "bg-success/15 text-success border-success/40",
};

const COLUMN_LABEL: Record<string, string> = {
  chegada: "Chegada",
  pcm: "PCM",
  triagem: "Triagem",
  mdo: "Aguard. MO",
  atribu_do: "Manutentor Alocado",
  manutencao: "Em Execução",
  teste: "Em Teste",
  aguardando_pcm: "Aguard. Material",
  liberado: "Liberado",
};

export function ColumnBadge({ column }: { column: KanbanColumn }) {
  const style = COLUMN_STYLE[column] ?? "bg-muted text-muted-foreground border-border";
  const label = COLUMN_LABEL[column] ?? column;
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", style)}>
      {label}
    </span>
  );
}

const PRIORITY_STYLE: Record<Priority, string> = {
  baixa: "bg-muted text-muted-foreground",
  media: "bg-info/20 text-info",
  alta: "bg-warning/30 text-warning-foreground",
  critica: "bg-destructive/20 text-destructive",
};

export function PriorityPill({ p }: { p: Priority }) {
  return (
    <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase", PRIORITY_STYLE[p])}>
      {p}
    </span>
  );
}

export function StatusDot({ status }: { status: AssetStatus }) {
  const c: Record<AssetStatus, string> = {
    operando: "bg-success",
    em_inspecao: "bg-info",
    em_manutencao: "bg-primary",
    aguardando_pcm: "bg-destructive",
    liberado: "bg-success",
  };
  return <span className={cn("inline-block h-2 w-2 rounded-full", c[status])} />;
}
