import { useEffect, useRef, useState } from "react";
import { Loader2, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  parsePmpWorkbook,
  savePmpPlan,
  normalizeModelo,
  type PmpPlanDraft,
} from "@/lib/pmp-catalog";

interface Props {
  /** Modelo do equipamento (para pré-preencher quando a planilha não trouxer). */
  modeloSugerido?: string;
  criadoPor?: string;
  onSaved?: () => void;
}

/** Upload de planilha PMP + pré-visualização + gravação no catálogo. */
export function PmpUpload({ modeloSugerido, criadoPor, onSaved }: Props) {
  const [drafts, setDrafts] = useState<PmpPlanDraft[]>([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDrafts([]);
  }, [modeloSugerido]);

  const onFile = async (f?: File | null) => {
    if (!f) return;
    setParsing(true);
    try {
      const parsed = await parsePmpWorkbook(f);
      if (!parsed.length) {
        toast.error("Nenhuma operação identificada na planilha. Confira o arquivo.");
        setDrafts([]);
        return;
      }
      const withFallback = parsed.map((p) => ({
        ...p,
        modeloOriginal: p.modeloOriginal || modeloSugerido || "",
        modelo: p.modelo || normalizeModelo(modeloSugerido ?? ""),
      }));
      setDrafts(withFallback);
      toast.success(
        `${withFallback.length} plano(s) lido(s) · ${withFallback.reduce((s, p) => s + p.operations.length, 0)} operações.`,
      );
    } catch (e) {
      console.error(e);
      toast.error("Falha ao ler a planilha.");
    } finally {
      setParsing(false);
    }
  };

  const patch = (i: number, p: Partial<PmpPlanDraft>) =>
    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...p } : d)));

  const salvar = async () => {
    const invalido = drafts.find((d) => !d.modeloOriginal.trim() || !d.intervaloHoras);
    if (invalido) {
      toast.error("Informe modelo e intervalo (h) de todos os planos.");
      return;
    }
    setSaving(true);
    try {
      for (const d of drafts) {
        await savePmpPlan({ ...d, modelo: normalizeModelo(d.modeloOriginal) }, criadoPor);
      }
      toast.success("PMP cadastrado no catálogo.");
      setDrafts([]);
      if (inputRef.current) inputRef.current.value = "";
      onSaved?.();
    } catch (e) {
      console.error(e);
      toast.error("Falha ao salvar o PMP.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => onFile(e.target.files?.[0])}
          className="block w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground"
        />
        {parsing && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Aceita a planilha do SAP (Plano de Manutenção) e o export por pacote (500h / 1000h / 2000h). Quando o
        cabeçalho traz a família (ex.: “FAMILIA E878”), ela é identificada e salva junto com o modelo.
      </p>

      {drafts.map((d, i) => (
        <div key={i} className="grid gap-2 rounded-md border bg-muted/30 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            {d.operations.length} operações
            {d.codigoPlano && (
              <Badge variant="outline" className="text-[10px]">{d.codigoPlano}</Badge>
            )}
            {d.familia && (
              <Badge variant="secondary" className="text-[10px]">Família {d.familia}</Badge>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <Label className="text-[11px]">Modelo</Label>
              <Input
                className="h-9"
                value={d.modeloOriginal}
                onChange={(e) => patch(i, { modeloOriginal: e.target.value })}
                placeholder="Ex.: CASE 721E"
              />
            </div>
            <div>
              <Label className="text-[11px]">Família</Label>
              <Input
                className="h-9"
                value={d.familia ?? ""}
                onChange={(e) => patch(i, { familia: e.target.value.toUpperCase() || undefined })}
                placeholder="Ex.: E878"
              />
            </div>
            <div>
              <Label className="text-[11px]">Intervalo (h)</Label>
              <Input
                className="h-9"
                type="number"
                value={d.intervaloHoras || ""}
                onChange={(e) =>
                  patch(i, {
                    intervaloHoras: Number(e.target.value) || 0,
                    intervaloLabel: `${Number(e.target.value) || 0}H`,
                  })
                }
              />
            </div>
          </div>
          {!d.intervaloHoras && (
            <div className="flex items-center gap-1 text-[11px] text-warning-foreground">
              <AlertTriangle className="h-3.5 w-3.5" /> Intervalo não identificado — informe manualmente.
            </div>
          )}
          <div className="max-h-40 overflow-y-auto rounded border bg-background p-2 text-[11px]">
            <ul className="grid gap-1">
              {d.operations.slice(0, 30).map((o) => (
                <li key={o.ordem} className="leading-snug">
                  <span className="font-mono text-[10px] text-muted-foreground">{o.item ?? o.ordem}</span>{" "}
                  {o.procedimento}
                  {o.servico && <Badge variant="outline" className="ml-1 text-[9px]">{o.servico}</Badge>}
                  {o.material && <Badge variant="secondary" className="ml-1 text-[9px]">{o.material}</Badge>}
                </li>
              ))}
              {d.operations.length > 30 && (
                <li className="italic text-muted-foreground">+ {d.operations.length - 30} outras…</li>
              )}
            </ul>
          </div>
        </div>
      ))}

      {drafts.length > 0 && (
        <Button onClick={salvar} disabled={saving} className="gap-1">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Salvar no catálogo ({drafts.length} plano{drafts.length > 1 ? "s" : ""})
        </Button>
      )}
      {drafts.length === 0 && !parsing && (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5" /> Depois de cadastrado, o PMP é reutilizado automaticamente por modelo.
        </div>
      )}
    </div>
  );
}
