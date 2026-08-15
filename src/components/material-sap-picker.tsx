import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

export interface SapMaterial {
  codigo: string;
  descricao: string;
  estoque: number;
}

/**
 * Busca no catálogo de materiais exportado do SAP (tabela `sap_materials`).
 * Mostra o estoque livre para o PCM saber se precisa requisitar compra.
 */
export function MaterialSapPicker({
  onSelect,
  label = "Buscar material no SAP",
  size = "sm",
}: {
  onSelect: (m: SapMaterial) => void;
  label?: string;
  size?: "sm" | "default";
}) {
  const [open, setOpen] = useState(false);
  const [termo, setTermo] = useState("");
  const [itens, setItens] = useState<SapMaterial[]>([]);
  const [carregando, setCarregando] = useState(false);

  const busca = useMemo(() => termo.trim(), [termo]);

  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    const t = setTimeout(async () => {
      setCarregando(true);
      let q = supabase
        .from("sap_materials" as never)
        .select("codigo, descricao, estoque")
        .order("descricao")
        .limit(60);
      if (busca) {
        q = q.or(`codigo.ilike.%${busca}%,descricao.ilike.%${busca}%`);
      }
      const { data } = await q;
      if (!cancelado) {
        setItens((data as unknown as SapMaterial[]) ?? []);
        setCarregando(false);
      }
    }, 250);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [busca, open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size={size} variant="outline" className="gap-1">
          <Search className="h-4 w-4" /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Materiais do SAP</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Digite o código ou parte da descrição…"
        />
        <div className="max-h-[55vh] overflow-y-auto rounded-md border">
          {carregando && (
            <p className="p-3 text-xs text-muted-foreground">Buscando…</p>
          )}
          {!carregando && itens.length === 0 && (
            <p className="p-3 text-xs text-muted-foreground">
              Nenhum material encontrado no catálogo do SAP.
            </p>
          )}
          {itens.map((m) => (
            <button
              key={m.codigo}
              type="button"
              className="flex w-full items-center justify-between gap-3 border-b p-2 text-left text-xs last:border-b-0 hover:bg-muted/50"
              onClick={() => {
                onSelect(m);
                setOpen(false);
              }}
            >
              <span className="min-w-0">
                <span className="block font-mono text-[11px] text-muted-foreground">
                  {m.codigo}
                </span>
                <span className="block font-medium">{m.descricao}</span>
              </span>
              <span
                className={
                  Number(m.estoque) > 0
                    ? "shrink-0 rounded bg-success/15 px-2 py-0.5 font-semibold text-success"
                    : "shrink-0 rounded bg-warning/15 px-2 py-0.5 font-semibold text-warning"
                }
              >
                {Number(m.estoque)} un
              </span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Estoque livre conforme a última exportação do SAP. Itens sem saldo precisam
          de solicitação de compra.
        </p>
      </DialogContent>
    </Dialog>
  );
}
