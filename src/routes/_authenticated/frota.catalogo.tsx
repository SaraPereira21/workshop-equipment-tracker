import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Plus, Search, Pencil, ArrowLeft, Database } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/frota/catalogo")({
  head: () => ({
    meta: [
      { title: "Catálogo da Frota — Oficina Matriz" },
      { name: "description", content: "Consulta e cadastro de equipamentos do catálogo da frota." },
      { property: "og:title", content: "Catálogo da Frota — Oficina Matriz" },
      { property: "og:description", content: "Consulta e cadastro de equipamentos do catálogo da frota." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  ssr: false,
  component: FrotaCatalogo,
});

interface FleetRow {
  id: string;
  codigo_armac: string;
  modelo: string;
  tipo_objeto: string | null;
  numero_serie: string | null;
  numero_inventario: string | null;
  marca: string | null;
  fonte: string;
  ativo: boolean;
}

const PAGE_SIZE = 50;

function FrotaCatalogo() {
  const { roles } = useAuth();
  const canEdit = roles.some((r) => r === "admin" || r === "pcm" || r === "frota");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<FleetRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<FleetRow | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("fleet_assets")
      .select("*", { count: "exact" })
      .eq("ativo", true)
      .order("codigo_armac")
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    const term = q.trim();
    if (term) {
      query = query.or(
        `codigo_armac.ilike.%${term}%,modelo.ilike.%${term}%,numero_serie.ilike.%${term}%,numero_inventario.ilike.%${term}%,tipo_objeto.ilike.%${term}%`,
      );
    }
    const { data, count, error } = await query;
    if (error) toast.error(error.message);
    setRows((data ?? []) as FleetRow[]);
    setTotal(count ?? 0);
    setLoading(false);
  }, [q, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => { setPage(0); }, [q]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl px-3 py-4 md:px-6 md:py-8">
      <Button variant="ghost" size="sm" asChild className="mb-3 gap-2">
        <Link to="/frota"><ArrowLeft className="h-4 w-4" /> Voltar à Frota</Link>
      </Button>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold md:text-3xl flex items-center gap-2">
            <Database className="h-6 w-6" /> Catálogo Frota (SAP)
          </h1>
          <p className="text-sm text-muted-foreground">{total.toLocaleString("pt-BR")} equipamentos cadastrados</p>
        </div>
        <Button type="button" className="gap-2" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Novo equipamento
        </Button>
      </div>

      <Card className="mb-4">
        <CardContent className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por código ARMAC, modelo, série, inventário ou tipo..."
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">Cód. ARMAC</th>
                    <th className="p-2 text-left">Modelo</th>
                    <th className="p-2 text-left">Tipo</th>
                    <th className="p-2 text-left hidden md:table-cell">Nº Série</th>
                    <th className="p-2 text-left hidden lg:table-cell">Inventário</th>
                    <th className="p-2 text-left">Fonte</th>
                    {canEdit && <th className="p-2"></th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      <td className="p-2 font-mono text-xs font-semibold">{r.codigo_armac}</td>
                      <td className="p-2">{r.modelo}</td>
                      <td className="p-2 text-xs text-muted-foreground">{r.tipo_objeto}</td>
                      <td className="p-2 font-mono text-xs hidden md:table-cell">{r.numero_serie}</td>
                      <td className="p-2 font-mono text-xs hidden lg:table-cell">{r.numero_inventario}</td>
                      <td className="p-2"><Badge variant={r.fonte === "SAP" ? "secondary" : "default"} className="text-[10px]">{r.fonte}</Badge></td>
                      {canEdit && (
                        <td className="p-2">
                          <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={canEdit ? 7 : 6} className="p-6 text-center text-sm text-muted-foreground">Nenhum resultado.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-between border-t p-3 text-xs">
            <span className="text-muted-foreground">Página {page + 1} de {totalPages}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>Anterior</Button>
              <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page + 1 >= totalPages}>Próxima</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {editing && <FleetDialog row={editing} onClose={(reload) => { setEditing(null); if (reload) load(); }} />}
      {creating && <FleetDialog row={null} onClose={(reload) => { setCreating(false); if (reload) load(); }} />}
    </div>
  );
}

function FleetDialog({ row, onClose }: { row: FleetRow | null; onClose: (reload: boolean) => void }) {
  const [codigo, setCodigo] = useState(row?.codigo_armac ?? "");
  const [modelo, setModelo] = useState(row?.modelo ?? "");
  const [tipo, setTipo] = useState(row?.tipo_objeto ?? "");
  const [serie, setSerie] = useState(row?.numero_serie ?? "");
  const [inv, setInv] = useState(row?.numero_inventario ?? "");
  const [marca, setMarca] = useState(row?.marca ?? "");
  const [ativo, setAtivo] = useState(row?.ativo ?? true);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!codigo.trim() || !modelo.trim()) { toast.error("Código ARMAC e Modelo obrigatórios"); return; }
    setSaving(true);
    const payload = {
      codigo_armac: codigo.trim(),
      modelo: modelo.trim(),
      tipo_objeto: tipo.trim(),
      numero_serie: serie.trim(),
      numero_inventario: inv.trim(),
      marca: marca.trim(),
      ativo,
    };
    let error;
    if (row) {
      ({ error } = await supabase.from("fleet_assets").update(payload).eq("id", row.id));
    } else {
      ({ error } = await supabase.from("fleet_assets").insert({ ...payload, fonte: "manual" }));
    }
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(row ? "Equipamento atualizado" : "Equipamento cadastrado");
    onClose(true);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{row ? "Editar equipamento" : "Novo equipamento"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2"><Label>Código ARMAC *</Label><Input value={codigo} onChange={(e) => setCodigo(e.target.value)} disabled={!!row} /></div>
          <div className="md:col-span-2"><Label>Modelo *</Label><Input value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="Ex: 1234-DIE-VOLVO-VM270" /></div>
          <div><Label>Tipo</Label><Input value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="CAMINHAO" /></div>
          <div><Label>Marca</Label><Input value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="VOLVO" /></div>
          <div><Label>Nº Série</Label><Input value={serie} onChange={(e) => setSerie(e.target.value)} /></div>
          <div><Label>Nº Inventário</Label><Input value={inv} onChange={(e) => setInv(e.target.value)} /></div>
          {row && (
            <label className="md:col-span-2 flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm">
              <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
              Equipamento ativo
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
