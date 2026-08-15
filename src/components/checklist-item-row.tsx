import { useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { uploadFile } from "@/lib/storage";
import type { ChecklistStatus } from "@/lib/types";

interface Props {
  id: number;
  description: string;
  status: ChecklistStatus;
  observation?: string;
  photos?: string[];
  onChange: (patch: { status?: ChecklistStatus; observation?: string; photos?: string[] }) => void;
}

const OPTS: { key: NonNullable<ChecklistStatus>; label: string; className: string }[] = [
  { key: "A", label: "A", className: "bg-success text-success-foreground border-success hover:bg-success/90" },
  { key: "AR", label: "AR", className: "bg-warning text-warning-foreground border-warning hover:bg-warning/90" },
  { key: "R", label: "R", className: "bg-destructive text-destructive-foreground border-destructive hover:bg-destructive/90" },
  { key: "NA", label: "NA", className: "bg-muted text-muted-foreground border-border hover:bg-muted/80" },
];

export function ChecklistItemRow({ id, description, status, observation, photos, onChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files)) {
        const url = await uploadFile(`inspecao/item-${id}`, f);
        urls.push(url);
      }
      onChange({ photos: [...(photos ?? []), ...urls] });
    } catch (err) {
      console.error(err);
      toast.error("Falha ao enviar foto. Tente novamente.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-xs font-bold text-muted-foreground">#{id}</span>
            <span className="text-sm font-medium leading-tight">{description}</span>
          </div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-2">
        {OPTS.map((o) => {
          const active = status === o.key;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => onChange({ status: active ? null : o.key })}
              className={cn(
                "tap-target rounded-md border-2 py-2.5 text-base font-black transition-all",
                active ? o.className + " shadow-md" : "border-border bg-background text-foreground hover:bg-muted",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className={cn(
          "tap-target inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted",
          uploading && "pointer-events-none opacity-60",
        )}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          {uploading ? "Enviando..." : "Foto"}
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={uploading}
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>
        {photos && photos.length > 0 && (
          <span className="text-[11px] text-muted-foreground">{photos.length} foto(s)</span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-8 text-xs"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Fechar" : "Observação"}
        </Button>
      </div>

      {photos && photos.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto">
          {photos.map((src, i) => (
            <div key={i} className="relative shrink-0">
              <img src={src} alt="Anexo" className="h-16 w-16 rounded object-cover" />
              <button
                type="button"
                onClick={() => onChange({ photos: photos.filter((_, idx) => idx !== i) })}
                className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-destructive text-destructive-foreground"
                aria-label="Remover"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {expanded && (
        <Textarea
          value={observation ?? ""}
          onChange={(e) => onChange({ observation: e.target.value })}
          placeholder="Observação do item (opcional)"
          className="mt-2"
          rows={2}
        />
      )}
    </div>
  );
}
