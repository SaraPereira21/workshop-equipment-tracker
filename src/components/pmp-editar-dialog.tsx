import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getPmpOperations,
  updatePmpPlan,
  type PmpOperation,
  type PmpPlan,
} from "@/lib/pmp-catalog";

interface Props {
  plan: PmpPlan;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}

export function PmpEditarDialog({ plan, open, onOpenChange, onSaved }: Props) {
  const [modeloOriginal, setModeloOriginal] = useState(plan.modeloOriginal);
  const [familia, setFamilia] = useState(plan.familia ?? "");
  const [horas, setHoras] = useState(String(plan.intervaloHoras));
  const [label, setLabel] = useState(plan.intervaloLabel);
  const [codigo, setCodigo] = useState(plan.codigoPlano ?? "");
  const [setor, setSetor] = useState(plan.setorExecutante ?? "");
  const [ops, setOps] = useState<PmpOperation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setModeloOriginal(plan.modeloOriginal);
    setFamilia(plan.familia ?? "");
    setHoras(String(plan.intervaloHoras));
    setLabel(plan.intervaloLabel);
    setCodigo(plan.codigoPlano ?? "");
    setSetor(plan.setorExecutante ?? "");
    setLoading(true);
    getPmpOperations(plan.id)
      .then(setOps)
      .catch((e) => {
        console.error(e);
        toast.error("Falha ao carregar operações.");
      })
      .finally(() => setLoading(false));
  }, [open, plan]);

  const setOp = (i: number, patch: Partial<PmpOperation>) =>
    setOps((prev) => (prev ? prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)) : prev));

  const salvar = async () => {
    const h = Number(horas);
    if (!modeloOriginal.trim()) return toast.error("Informe o modelo.");
    if (!Number.isFinite(h) || h <= 0) return toast.error("Intervalo em horas inválido.");
    setSaving(true);
    try {
      await updatePmpPlan(
        plan.id,
        {
          modeloOriginal,
          familia,
          intervaloHoras: h,
          intervaloLabel: label,
          codigoPlano: codigo,
          setorExecutante: setor,
        },
        ops ?? undefined,
      );
      toast.success("PMP atualizado.");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      console.error(e);
      toast.error("Falha ao salvar o PMP.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar PMP</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="text-xs">Modelo</Label>
            <Input value={modeloOriginal} onChange={(e) => setModeloOriginal(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Família</Label>
            <Input value={familia} onChange={(e) => setFamilia(e.target.value)} placeholder="ex.: E878" />
          </div>
          <div>
            <Label className="text-xs">Intervalo (horas)</Label>
            <Input
              inputMode="numeric"
              value={horas}
              onChange={(e) => setHoras(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div>
            <Label className="text-xs">Rótulo do intervalo</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="250H" />
          </div>
          <div>
            <Label className="text-xs">Código do plano</Label>
            <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Setor executante</Label>
            <Input value={setor} onChange={(e) => setSetor(e.target.value)} />
          </div>
        </div>

        <div className="mt-2">
          <div className="mb-2 flex items-center justify-between">
            <Label className="text-xs">Operações ({ops?.length ?? 0})</Label>
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={() =>
                setOps((prev) => [...(prev ?? []), { ordem: (prev?.length ?? 0) + 1, procedimento: "" }])
              }
            >
              <Plus className="h-3.5 w-3.5" /> Operação
            </Button>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando operações…
            </div>
          ) : (
            <div className="grid max-h-80 gap-2 overflow-y-auto rounded-md border p-2">
              {(ops ?? []).map((o, i) => (
                <div key={i} className="grid gap-1 rounded border bg-muted/30 p-2 sm:grid-cols-[60px_1fr_1fr_36px]">
                  <Input
                    className="h-8 text-xs"
                    placeholder="Item"
                    value={o.item ?? ""}
                    onChange={(e) => setOp(i, { item: e.target.value })}
                  />
                  <Input
                    className="h-8 text-xs"
                    placeholder="Procedimento"
                    value={o.procedimento}
                    onChange={(e) => setOp(i, { procedimento: e.target.value })}
                  />
                  <Input
                    className="h-8 text-xs"
                    placeholder="Material"
                    value={o.material ?? ""}
                    onChange={(e) => setOp(i, { material: e.target.value })}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive"
                    onClick={() => setOps((prev) => (prev ?? []).filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {(ops ?? []).length === 0 && (
                <p className="p-2 text-xs text-muted-foreground">Nenhuma operação neste plano.</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={saving || loading}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
