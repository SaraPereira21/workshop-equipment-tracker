import { Link } from "@tanstack/react-router";
import { Wrench, CalendarCheck } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

interface Props {
  assetId: string;
  current: "corretiva" | "preventiva";
}

/**
 * Aba superior compartilhada entre OS Corretiva e Preventiva de um mesmo
 * equipamento. Só mostra a aba do outro tipo se a OS correspondente existir.
 */
export function OSTabs({ assetId, current }: Props) {
  const workOrders = useAppStore((s) => s.workOrders);
  const asset = useAppStore((s) => s.assets.find((a) => a.id === assetId));
  const corretiva = workOrders.find((w) => w.assetId === assetId && w.tipo === "corretiva");
  // A preventiva só existe para o mecânico depois da liberação do PCM.
  const preventiva =
    asset?.preventivaLiberada === true
      ? workOrders.find((w) => w.assetId === assetId && w.tipo === "preventiva")
      : undefined;

  if (!corretiva && !preventiva) return null;


  return (
    <div className="mb-4 flex gap-1 rounded-lg border bg-muted/40 p-1">
      {corretiva && (
        <Link
          to="/os/corretiva/$id"
          params={{ id: corretiva.id }}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            current === "corretiva"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Wrench className="h-4 w-4" />
          Corretiva
          <span className="text-[10px] text-muted-foreground">{corretiva.numeroSAP}</span>
        </Link>
      )}
      {preventiva && (
        <Link
          to="/os/preventiva/$id"
          params={{ id: preventiva.id }}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            current === "preventiva"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <CalendarCheck className="h-4 w-4" />
          Preventiva
          <span className="text-[10px] text-muted-foreground">{preventiva.numeroSAP}</span>
        </Link>
      )}
    </div>
  );
}
