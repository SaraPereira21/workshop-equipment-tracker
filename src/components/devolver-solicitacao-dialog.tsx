import { useState } from "react";
import { Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/lib/store";
import { useAuth } from "@/hooks/use-auth";
import type { Asset, KanbanColumn } from "@/lib/types";

/**
 * Botão + diálogo padrão de devolução de uma solicitação para a etapa anterior.
 * Registra o motivo no chat da máquina.
 */
export function DevolverSolicitacaoDialog({
  asset,
  destinoLabel,
  destinoColumn,
  patch,
  triggerLabel = "Devolver",
  triggerClassName,
}: {
  asset: Asset;
  /** Ex.: "Inspetor" */
  destinoLabel: string;
  destinoColumn: KanbanColumn;
  /** Campos extras a limpar/ajustar na devolução */
  patch?: Partial<Asset>;
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const updateAsset = useAppStore((s) => s.updateAsset);
  const { profile } = useAuth();

  const devolver = () => {
    if (!motivo.trim()) {
      toast.error("Descreva o motivo da devolução.");
      return;
    }
    const now = new Date().toISOString();
    updateAsset(asset.id, {
      column: destinoColumn,
      ...patch,
      chatMessages: [
        ...(asset.chatMessages ?? []),
        {
          id: crypto.randomUUID(),
          autor: profile?.nome ?? "Usuário",
          autorCargo: "Devolução",
          texto: `↩️ Solicitação devolvida para ${destinoLabel}: ${motivo.trim()}`,
          createdAt: now,
        },
      ],
      descricao: `↩️ ${asset.prefixo}: devolvido para ${destinoLabel} — ${motivo.trim()}`,
    });
    toast.success(`${asset.prefixo} devolvido para ${destinoLabel}.`);
    setMotivo("");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className={triggerClassName ?? "gap-1"}>
          <Undo2 className="h-4 w-4" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Devolver {asset.prefixo} para {destinoLabel}</DialogTitle>
        </DialogHeader>
        <div>
          <Label className="text-xs">Motivo da devolução</Label>
          <Textarea
            rows={4}
            className="mt-1"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: falta a foto do horímetro / horímetro divergente / item sem observação…"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            O motivo fica registrado no chat da máquina.
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="destructive" onClick={devolver} className="gap-1">
            <Undo2 className="h-4 w-4" /> Confirmar devolução
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
