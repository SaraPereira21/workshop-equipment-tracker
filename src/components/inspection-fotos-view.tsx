import { Download, ExternalLink, ImageOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FOTOS_EQUIPAMENTO } from "@/lib/fotos-equipamento";

async function downloadUrl(url: string, filename: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const obj = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = obj;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(obj), 4000);
  } catch (err) {
    console.error(err);
    toast.error("Não foi possível baixar a foto.");
  }
}

function PhotoBox({
  label,
  url,
  filename,
}: {
  label: string;
  url?: string;
  filename: string;
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-2">
      <div className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">{label}</div>
      {url ? (
        <>
          <img src={url} alt={label} className="h-32 w-full rounded object-cover" />
          <div className="mt-1 flex gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 flex-1 gap-1 text-[11px]"
              onClick={() => downloadUrl(url, filename)}
            >
              <Download className="h-3.5 w-3.5" /> Baixar
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 text-[11px]" asChild>
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
        </>
      ) : (
        <div className="flex h-32 items-center justify-center gap-2 rounded bg-background text-[11px] text-muted-foreground">
          <ImageOff className="h-4 w-4" /> Sem foto
        </div>
      )}
    </div>
  );
}

export function InspectionFotosView({
  prefixo,
  fotoChassi,
  fotoHorimetro,
  fotosEquipamento,
  horimetro,
}: {
  prefixo: string;
  fotoChassi?: string;
  fotoHorimetro?: string;
  fotosEquipamento?: Record<string, string>;
  horimetro?: number;
}) {
  const extras = FOTOS_EQUIPAMENTO.filter((f) => !!fotosEquipamento?.[f.key]);
  if (!fotoChassi && !fotoHorimetro && extras.length === 0) return null;
  return (
    <section>
      <div className="mb-1 text-sm font-semibold">
        Fotos da inspeção{typeof horimetro === "number" ? ` — horímetro ${horimetro}h` : ""}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <PhotoBox label="Plaqueta do chassi" url={fotoChassi} filename={`${prefixo}_plaqueta_chassi.jpg`} />
        <PhotoBox label="Horímetro" url={fotoHorimetro} filename={`${prefixo}_horimetro.jpg`} />
      </div>
      {extras.length > 0 && (
        <>
          <div className="mb-1 mt-3 text-sm font-semibold">Fotos do equipamento ({extras.length})</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {extras.map((f) => (
              <PhotoBox
                key={f.key}
                label={f.label}
                url={fotosEquipamento?.[f.key]}
                filename={`${prefixo}_${f.key}.jpg`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

