import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Save, Trash2, Mail } from "lucide-react";
import { toast } from "sonner";

interface Recipient {
  id: string;
  nome: string;
  email: string;
  contrato: string | null;
  perfil: string | null;
  ativo: boolean;
}

export function EmailRecipientsEditor() {
  const [rows, setRows] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState<Omit<Recipient, "id" | "ativo">>({ nome: "", email: "", contrato: "", perfil: "" });

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("email_recipients")
      .select("id, nome, email, contrato, perfil, ativo")
      .order("nome");
    if (error) toast.error(error.message);
    setRows((data ?? []) as Recipient[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function addNew() {
    if (!newRow.nome.trim() || !newRow.email.trim()) { toast.error("Nome e e-mail obrigatórios"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newRow.email)) { toast.error("E-mail inválido"); return; }
    const { error } = await supabase.from("email_recipients").insert({
      nome: newRow.nome,
      email: newRow.email,
      contrato: newRow.contrato || null,
      perfil: newRow.perfil || null,
      ativo: true,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Destinatário adicionado");
    setNewRow({ nome: "", email: "", contrato: "", perfil: "" });
    setAdding(false);
    load();
  }

  async function update(id: string, patch: Partial<Recipient>) {
    const { error } = await supabase.from("email_recipients").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Atualizado");
    load();
  }

  async function remove(id: string) {
    if (!confirm("Remover destinatário?")) return;
    const { error } = await supabase.from("email_recipients").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Removido");
    load();
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4" /> Destinatários de e-mail (Liberação)
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Cadastre quem recebe o e-mail de liberação. Se preencher <b>Contrato</b>, será pré-selecionado apenas para máquinas daquele contrato; sem contrato, entra em todas as liberações.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)} className="gap-1">
          <Plus className="h-4 w-4" /> Novo
        </Button>
      </CardHeader>
      <CardContent>
        {adding && (
          <div className="mb-3 grid gap-2 rounded-md border bg-muted/30 p-3 md:grid-cols-[1.2fr_1.4fr_1fr_1fr_auto]">
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Nome</Label>
              <Input value={newRow.nome} onChange={(e) => setNewRow({ ...newRow, nome: e.target.value })} placeholder="João Silva" />
            </div>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">E-mail</Label>
              <Input type="email" value={newRow.email} onChange={(e) => setNewRow({ ...newRow, email: e.target.value })} placeholder="joao@fornecedoraengelog.com.br" />
            </div>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Contrato (opcional)</Label>
              <Input value={newRow.contrato ?? ""} onChange={(e) => setNewRow({ ...newRow, contrato: e.target.value })} placeholder="Ex: CT-2026-001" />
            </div>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Perfil (opcional)</Label>
              <Input value={newRow.perfil ?? ""} onChange={(e) => setNewRow({ ...newRow, perfil: e.target.value })} placeholder="Ex: PCM, Cliente, Frota" />
            </div>
            <div className="flex items-end gap-2">
              <Button size="sm" onClick={addNew}><Save className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
        {loading ? <Loader2 className="animate-spin" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-2">Nome</th>
                  <th className="py-2 pr-2">E-mail</th>
                  <th className="py-2 pr-2">Contrato</th>
                  <th className="py-2 pr-2">Perfil</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2 pr-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-muted/30">
                    <td className="py-2 pr-2">{r.nome}</td>
                    <td className="py-2 pr-2 font-mono text-xs">{r.email}</td>
                    <td className="py-2 pr-2 text-xs">{r.contrato || <span className="text-muted-foreground">todos</span>}</td>
                    <td className="py-2 pr-2 text-xs">{r.perfil || "—"}</td>
                    <td className="py-2 pr-2">
                      <Badge variant={r.ativo ? "default" : "outline"} className="text-[10px]">
                        {r.ativo ? "Ativo" : "Inativo"}
                      </Badge>
                    </td>
                    <td className="py-2 pr-2">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => update(r.id, { ativo: !r.ativo })}>
                          {r.ativo ? "Inativar" : "Ativar"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(r.id)} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="py-6 text-center text-sm text-muted-foreground">Nenhum destinatário cadastrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
