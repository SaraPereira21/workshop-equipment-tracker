import { useState } from "react";
import { CalendarX2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/lib/store";
import { useAuth } from "@/hooks/use-auth";
import type { Asset } from "@/lib/types";

/**
 * Cancela a preventiva de um equipamento (ex.: preventiva feita há pouco tempo
 * na base, não sendo necessária agora). Remove a OS preventiva gerada,
 * limpa as marcações do card e registra o motivo no chat da máquina.
 */
export function CancelarPreventivaDialog({
  asset,
  triggerLabel = "Cancelar preventiva",
  triggerVariant = "outline",
}: {
  asset: Asset;
  triggerLabel?: string;
  triggerVariant?: "outline" | "ghost" | "destructive";
}) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [feitaNaBase, setFeitaNaBase] = useState(false);
  const updateAsset = useAppStore((s) => s.updateAsset);
  const removeWorkOrder = useAppStore((s) => s.removeWorkOrder);
  const workOrders = useAppStore((s) => s.workOrders);
  const { profile } = useAuth();

  const woPrev = workOrders.find((w) => w.assetId === asset.id && w.tipo === "preventiva");

  const temPreventiva =
    asset.temPreventiva || !!asset.sapOsPreventiva || asset.preventivaBaseFeita || !!woPrev;
  if (!temPreventiva) return null;

  const cancelar = () => {
    if (!motivo.trim()) {
      toast.error("Descreva o motivo do cancelamento da preventiva.");
      return;
    }
    const now = new Date().toISOString();
    if (woPrev) removeWorkOrder(woPrev.id);

    updateAsset(asset.id, {
      // Quando a preventiva já foi feita na base, o card continua na fila do
      // PCM ("Preventivas a verificar") para que o documento seja anexado.
      temPreventiva: feitaNaBase,
      preventivaLiberada: false,
      sapOsPreventiva: undefined,
      preventivaBaseFeita: undefined,
      preventivaBaseInfo: undefined,
      chatMessages: [
        ...(asset.chatMessages ?? []),
        {
          id: crypto.randomUUID(),
          autor: profile?.nome ?? "Usuário",
          autorCargo: "PCM",
          texto: `🚫 Preventiva cancelada${asset.sapOsPreventiva ? ` (OS ${asset.sapOsPreventiva})` : ""}: ${motivo.trim()}${feitaNaBase ? " — preventiva já feita na base, aguardando anexo do documento." : ""}`,
          createdAt: now,
        },
      ],
    });
    toast.success(
      feitaNaBase
        ? `${asset.prefixo}: preventiva cancelada — anexe o documento em "Preventivas a verificar".`
        : `${asset.prefixo}: preventiva cancelada.`,
    );
    setMotivo("");
    setOpen(false);
  };


  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={triggerVariant} className="gap-1">
          <CalendarX2 className="h-4 w-4" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cancelar preventiva — {asset.prefixo}</DialogTitle>
        </DialogHeader>
        <div>
          <Label className="text-xs">Motivo do cancelamento</Label>
          <Textarea
            rows={4}
            className="mt-1"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: preventiva realizada há pouco tempo na base — não é necessária agora."
          />
          <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-md border bg-muted/30 p-2">
            <Checkbox checked={feitaNaBase} onCheckedChange={(v) => setFeitaNaBase(!!v)} className="mt-0.5" />
            <span className="text-xs">
              A preventiva já foi feita na base — manter o card em <b>Preventivas a verificar</b> (PCM)
              para anexar o documento.
            </span>
          </label>
          <p className="mt-1 text-[11px] text-muted-foreground">
            A OS preventiva gerada é removida e o motivo fica registrado no chat da máquina.
            {feitaNaBase
              ? " O card continua na fila do PCM até o anexo da preventiva da base."
              : " O card sai da fila de preventivas do PCM."}
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Voltar
          </Button>
          <Button variant="destructive" onClick={cancelar} className="gap-1">
            <CalendarX2 className="h-4 w-4" /> Confirmar cancelamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
