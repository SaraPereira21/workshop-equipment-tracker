import { useState } from "react";
import { Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Asset, WorkOrder } from "@/lib/types";

export function OsPdfActions({ wo, asset }: { wo: WorkOrder; asset?: Asset }) {
  const [busy, setBusy] = useState(false);

  const baixar = async () => {
    setBusy(true);
    try {
      const { generateOsPdf } = await import("@/lib/os-pdf");
      const fname = await generateOsPdf(wo, asset);
      toast.success(`PDF gerado: ${fname}`);
    } catch (err) {
      console.error(err);
      toast.error("Falha ao gerar PDF");
    } finally {
      setBusy(false);
    }
  };

  const imprimir = async () => {
    setBusy(true);
    try {
      const { generateOsPdfData } = await import("@/lib/os-pdf");
      const { dataUrl } = await generateOsPdfData(wo, asset);
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (!win) {
        toast.error("Permita pop-ups para imprimir");
      } else {
        win.addEventListener("load", () => {
          try {
            win.focus();
            win.print();
          } catch {
            /* ignore */
          }
        });
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.error(err);
      toast.error("Falha ao preparar impressão");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" className="gap-1" disabled={busy} onClick={baixar}>
        <Download className="h-4 w-4" /> Baixar PDF
      </Button>
      <Button size="sm" variant="outline" className="gap-1" disabled={busy} onClick={imprimir}>
        <Printer className="h-4 w-4" /> Imprimir
      </Button>
    </div>
  );
}
