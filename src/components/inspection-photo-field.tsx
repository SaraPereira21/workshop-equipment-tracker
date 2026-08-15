import { useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { uploadFile } from "@/lib/storage";

interface Props {
  label: string;
  hint?: string;
  prefix: string;
  value?: string;
  onChange: (url: string | undefined) => void;
}

export function InspectionPhotoField({ label, hint, prefix, value, onChange }: Props) {
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadFile(prefix, file);
      onChange(url);
    } catch (err) {
      console.error(err);
      toast.error("Falha ao enviar a foto. Tente novamente.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-sm font-semibold">{label}</div>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}

      {value ? (
        <div className="relative mt-2 inline-block">
          <img src={value} alt={label} className="h-28 w-40 rounded object-cover" />
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-destructive text-destructive-foreground"
            aria-label="Remover foto"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <label
          className={cn(
            "tap-target mt-2 inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted",
            uploading && "pointer-events-none opacity-60",
          )}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          {uploading ? "Enviando..." : "Tirar / anexar foto"}
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </label>
      )}
    </div>
  );
}
