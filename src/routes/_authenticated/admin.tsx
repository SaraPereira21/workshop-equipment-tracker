import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, UserPlus, Save, ShieldCheck, ShieldOff, Pencil, Power, Copy, GripVertical, Plus, Trash2, KeyRound, ChevronDown, Search } from "lucide-react";
import { toast } from "sonner";
import { adminCreateUser, adminSetActive, adminResetPassword } from "@/lib/admin-users.functions";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { addKanbanColumn, deleteKanbanColumn, reorderKanbanColumns, updateKanbanColumnTitles } from "@/hooks/use-kanban";
import { EmailRecipientsEditor } from "@/components/email-recipients-editor";
import { maskCpf, isValidCpf, onlyDigits } from "@/lib/cpf";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  beforeLoad: async ({ context: _context }) => {
    // client-side role check happens in component; keep loader open
  },
  component: AdminPage,
});

const ALL_ROLES: AppRole[] = ["admin", "pcm", "supervisor", "frota", "inspetor", "mecanico", "visitante"];
const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin", pcm: "PCM", supervisor: "Supervisor", frota: "Frota", inspetor: "Inspetor", mecanico: "Mecânico", visitante: "Visitante",
};
const TURNOS = [
  { v: "manha", l: "Manhã" },
  { v: "tarde", l: "Tarde" },
  { v: "noite", l: "Noite" },
];

interface Row {
  id: string;
  nome: string;
  email: string | null;
  cpf: string | null;
  cargo: string | null;
  especialidade: string | null;
  turno: string | null;
  telefone: string | null;
  assinatura_url: string | null;
  ativo: boolean;
  must_change_password: boolean | null;
  roles: AppRole[];
}

function AdminPage() {
  const { roles: myRoles, loading: authLoading } = useAuth();
  const isAdmin = myRoles.includes("admin");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Row | null>(null);
  const [creating, setCreating] = useState(false);
  const [listaAberta, setListaAberta] = useState(false);
  const [busca, setBusca] = useState("");

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return rows;
    const qd = onlyDigits(busca);
    return rows.filter((r) =>
      (r.nome ?? "").toLowerCase().includes(q) ||
      (r.email ?? "").toLowerCase().includes(q) ||
      (r.cargo ?? "").toLowerCase().includes(q) ||
      (r.turno ?? "").toLowerCase().includes(q) ||
      r.roles.some((rr) => ROLE_LABEL[rr].toLowerCase().includes(q) || rr.includes(q)) ||
      (!!qd && (r.cpf ?? "").includes(qd)),
    );
  }, [rows, busca]);

  const setActive = useServerFn(adminSetActive);
  const resetPwd = useServerFn(adminResetPassword);

  async function toggleActive(r: Row) {
    try {
      await setActive({ data: { userId: r.id, ativo: !r.ativo } });
      toast.success(!r.ativo ? "Usuário ativado" : "Usuário inativado");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao atualizar");
    }
  }

  async function load() {
    setLoading(true);
    const [{ data: profiles }, { data: userRoles }] = await Promise.all([
      supabase.from("profiles").select("*").order("nome"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    const rolesByUser = new Map<string, AppRole[]>();
    ((userRoles ?? []) as { user_id: string; role: AppRole }[]).forEach((r) => {
      rolesByUser.set(r.user_id, [...(rolesByUser.get(r.user_id) ?? []), r.role]);
    });
    setRows(
      ((profiles ?? []) as any[]).map((p) => ({
        ...p,
        roles: rolesByUser.get(p.id) ?? [],
      })) as Row[],
    );
    setLoading(false);
  }

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  if (authLoading) return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="animate-spin" /></div>;
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md p-6">
        <Card>
          <CardHeader><CardTitle>Acesso restrito</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Apenas administradores podem acessar esta página.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Administração</h1>
          <p className="text-sm text-muted-foreground">Cadastro de usuários, funções e assinaturas.</p>
        </div>
        <Button onClick={() => setCreating(true)} className="gap-2">
          <UserPlus className="h-4 w-4" /> Novo usuário
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <button
            type="button"
            onClick={() => setListaAberta((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <CardTitle className="text-base">
              Usuários cadastrados <span className="text-xs font-normal text-muted-foreground">({rows.length})</span>
            </CardTitle>
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${listaAberta ? "rotate-180" : ""}`} />
          </button>
          {listaAberta && (
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por nome, CPF, cargo ou função…"
                className="h-9 pl-9"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          )}
        </CardHeader>
        {listaAberta && (
        <CardContent>
          {loading ? (
            <Loader2 className="animate-spin" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">

                  <tr>
                    <th className="py-2">Nome</th>
                    <th>CPF</th>
                    <th>Cargo</th>
                    <th>Turno</th>
                    <th>Funções</th>
                    <th>Status</th>
                    <th>Assinatura</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="py-2 font-medium">{r.nome || "—"}</td>
                      <td className="text-xs font-mono">{r.cpf ? maskCpf(r.cpf) : (r.email ?? "—")}</td>
                      <td className="text-xs">{r.cargo || "—"}</td>
                      <td className="text-xs">{r.turno || "—"}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {r.roles.length === 0 ? (
                            <Badge variant="outline" className="text-[10px]">Sem função</Badge>
                          ) : r.roles.map((rr) => (
                            <Badge key={rr} variant="secondary" className="text-[10px]">{ROLE_LABEL[rr]}</Badge>
                          ))}
                        </div>
                      </td>
                      <td>
                        {r.ativo ? (
                          <Badge className="bg-success text-success-foreground text-[10px]"><ShieldCheck className="mr-1 h-3 w-3" /> Ativo</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]"><ShieldOff className="mr-1 h-3 w-3" /> Inativo</Badge>
                        )}
                      </td>
                      <td className="text-xs">{r.assinatura_url ? "✓" : "—"}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                            <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              if (!confirm(`Gerar nova senha para ${r.nome}?`)) return;
                              try {
                                const { password } = await resetPwd({ data: { userId: r.id } });
                                await navigator.clipboard.writeText(password);
                                toast.success("Nova senha gerada e copiada", {
                                  description: `Senha: ${password}`,
                                  duration: 15000,
                                });
                                load();
                              } catch (e: any) {
                                toast.error(e.message ?? "Falha");
                              }
                            }}
                            title="Redefinir senha"
                          >
                            <KeyRound className="mr-1 h-3.5 w-3.5" /> Senha
                          </Button>
                          <Button
                            size="sm"
                            variant={r.ativo ? "ghost" : "secondary"}
                            onClick={() => toggleActive(r)}
                            title={r.ativo ? "Inativar" : "Ativar"}
                          >
                            <Power className="mr-1 h-3.5 w-3.5" />
                            {r.ativo ? "Inativar" : "Ativar"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtrados.length === 0 && (
                    <tr><td colSpan={8} className="py-6 text-center text-sm text-muted-foreground">
                      {rows.length === 0 ? <>Nenhum usuário ainda. Clique em <b>Novo usuário</b>.</> : "Nenhum usuário encontrado para essa pesquisa."}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
        )}
      </Card>


      <KanbanColumnsEditor />

      <EmailRecipientsEditor />


      {editing && (
        <EditUserDialog row={editing} onClose={() => { setEditing(null); load(); }} />
      )}
      {creating && (
        <CreateUserDialog onClose={(reload) => { setCreating(false); if (reload) load(); }} />
      )}
    </div>
  );
}

function CreateUserDialog({ onClose }: { onClose: (reload: boolean) => void }) {
  const createFn = useServerFn(adminCreateUser);
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [cargo, setCargo] = useState("");
  const [especialidade, setEspecialidade] = useState("");
  const [turno, setTurno] = useState("manha");
  const [telefone, setTelefone] = useState("");
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ cpf: string; email: string; password: string } | null>(null);

  function toggleRole(r: AppRole) {
    setRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }

  async function save() {
    if (!nome.trim()) { toast.error("Nome é obrigatório"); return; }
    const hasCpf = cpf.trim().length > 0;
    const hasEmail = email.trim().includes("@");
    if (!hasCpf && !hasEmail) { toast.error("Informe CPF ou E-mail"); return; }
    if (hasCpf && !isValidCpf(cpf)) { toast.error("CPF inválido"); return; }
    setSaving(true);
    try {
      const res = await createFn({
        data: {
          nome,
          cpf: hasCpf ? onlyDigits(cpf) : "",
          email: hasEmail ? email.trim() : "",
          cargo, especialidade, turno, telefone, roles,
        },
      });
      setCreated({ cpf: res.cpf, email: res.email, password: res.password });
      toast.success("Usuário criado");
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao criar");
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    const login = created.cpf ? maskCpf(created.cpf) : created.email;
    return (
      <Dialog open onOpenChange={() => onClose(true)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Usuário criado</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p>Envie estas credenciais para o novo usuário. Ele será obrigado a trocar a senha no primeiro acesso.</p>
            <div className="rounded-md border bg-muted/40 p-3 font-mono text-xs">
              <div><b>Login:</b> {login}</div>
              <div><b>Senha:</b> {created.password}</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(`Login: ${login}\nSenha: ${created.password}`);
                toast.success("Copiado");
              }}
            >
              <Copy className="mr-2 h-3.5 w-3.5" /> Copiar
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => onClose(true)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Novo usuário</DialogTitle></DialogHeader>
        <p className="text-[11px] text-muted-foreground">Informe <b>CPF ou E-mail</b> (pelo menos um). O login pode ser feito com qualquer um dos dois.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2"><Label>Nome *</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
          <div>
            <Label>CPF</Label>
            <Input
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={cpf}
              onChange={(e) => setCpf(maskCpf(e.target.value))}
              maxLength={14}
            />
          </div>
          <div>
            <Label>E-mail</Label>
            <Input
              type="email"
              placeholder="usuario@fornecedoraengelog.com.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div><Label>Cargo</Label><Input value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Ex: Supervisor de Manutenção" /></div>
          <div><Label>Especialidade</Label><Input value={especialidade} onChange={(e) => setEspecialidade(e.target.value)} /></div>
          <div>
            <Label>Turno</Label>
            <Select value={turno} onValueChange={setTurno}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TURNOS.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Telefone</Label><Input value={telefone} onChange={(e) => setTelefone(e.target.value)} /></div>
        </div>
        <div>
          <Label>Funções</Label>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ALL_ROLES.map((r) => (
              <label key={r} className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm">
                <Checkbox checked={roles.includes(r)} onCheckedChange={() => toggleRole(r)} />
                {ROLE_LABEL[r]}
              </label>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            A senha inicial é gerada automaticamente e mostrada após criar. O usuário troca no primeiro acesso.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
            Criar usuário
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function EditUserDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const [nome, setNome] = useState(row.nome);
  const [cargo, setCargo] = useState(row.cargo ?? "");
  const [especialidade, setEspecialidade] = useState(row.especialidade ?? "");
  const [turno, setTurno] = useState(row.turno ?? "manha");
  const [telefone, setTelefone] = useState(row.telefone ?? "");
  const [ativo, setAtivo] = useState(row.ativo);
  const [roles, setRoles] = useState<AppRole[]>(row.roles);
  const [saving, setSaving] = useState(false);
  const [assinatura, setAssinatura] = useState<string | null>(row.assinatura_url);
  const [rotacao, setRotacao] = useState(0);

  async function rotacionarAssinatura() {
    if (!assinatura) return;
    const novaRot = (rotacao + 90) % 360;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const rad = (novaRot * Math.PI) / 180;
      const swap = novaRot % 180 !== 0;
      canvas.width = swap ? img.height : img.width;
      canvas.height = swap ? img.width : img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(rad);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      setAssinatura(canvas.toDataURL("image/png"));
      setRotacao(0);
    };
    img.src = assinatura;
    setRotacao(novaRot);
  }
  const initialRoles = useMemo(() => new Set(row.roles), [row.roles]);

  function toggleRole(r: AppRole) {
    setRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }

  function handleSignatureFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Envie uma imagem da assinatura (JPG/PNG).");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      toast.error("A imagem precisa ter até 3 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAssinatura(String(reader.result));
      toast.success("Arquivo da assinatura carregado");
    };
    reader.readAsDataURL(file);
  }

  async function save() {
    setSaving(true);
    let assinaturaFinal = assinatura;
    // Se ainda é dataURL base64, sobe pro Storage e guarda a URL pública
    if (assinaturaFinal && assinaturaFinal.startsWith("data:")) {
      try {
        const { uploadDataUrl } = await import("@/lib/storage");
        assinaturaFinal = await uploadDataUrl(`assinaturas/${row.id}`, assinaturaFinal, "assinatura.png");
      } catch (err) {
        console.error(err);
        toast.error("Falha ao enviar a assinatura. Tente novamente.");
        setSaving(false);
        return;
      }
    }
    const { error: pe } = await supabase.from("profiles").update({
      nome, cargo, especialidade, turno, telefone, ativo,
      assinatura_url: assinaturaFinal,
    }).eq("id", row.id);
    if (pe) { toast.error(pe.message); setSaving(false); return; }

    // sync roles
    const toAdd = roles.filter((r) => !initialRoles.has(r));
    const toRemove = [...initialRoles].filter((r) => !roles.includes(r));
    if (toAdd.length) {
      const { error } = await supabase.from("user_roles").insert(toAdd.map((r) => ({ user_id: row.id, role: r })));
      if (error) { toast.error(error.message); setSaving(false); return; }
    }
    if (toRemove.length) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", row.id).in("role", toRemove);
      if (error) { toast.error(error.message); setSaving(false); return; }
    }
    setSaving(false);
    toast.success("Usuário atualizado");
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Editar usuário</DialogTitle></DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
          <div><Label>E-mail</Label><Input value={row.email ?? ""} disabled /></div>
          <div><Label>Cargo (aparece na assinatura)</Label><Input value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Ex: Supervisor de Manutenção" /></div>
          <div><Label>Especialidade</Label><Input value={especialidade} onChange={(e) => setEspecialidade(e.target.value)} placeholder="Motor / Hidráulica / Elétrica..." /></div>
          <div>
            <Label>Turno</Label>
            <Select value={turno} onValueChange={setTurno}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TURNOS.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Telefone</Label><Input value={telefone} onChange={(e) => setTelefone(e.target.value)} /></div>
        </div>

        <div>
          <Label>Funções (roles)</Label>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ALL_ROLES.map((r) => (
              <label key={r} className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm">
                <Checkbox checked={roles.includes(r)} onCheckedChange={() => toggleRole(r)} />
                {ROLE_LABEL[r]}
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-lg border bg-muted/30 p-4">
          <Label htmlFor="assinatura-upload" className="text-sm font-semibold">Assinatura digital</Label>
          <p className="text-xs text-muted-foreground mb-3">Envie uma foto/scan da assinatura em papel (PNG ou JPG).</p>

          <div className="flex flex-wrap items-center gap-3">
            <Input
              id="assinatura-upload"
              type="file"
              accept="image/*"
              className="h-auto flex-1 min-w-[240px] cursor-pointer py-2 file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-primary-foreground file:font-medium hover:file:bg-primary/90"
              onChange={handleSignatureFileChange}
            />
            {assinatura && (
              <>
                <span className="text-xs text-success font-medium">✓ Arquivo carregado</span>
                <Button size="sm" variant="outline" type="button" onClick={rotacionarAssinatura}>
                  ↻ Girar 90°
                </Button>
                <Button size="sm" variant="outline" type="button" onClick={() => setAssinatura(null)}>
                  Remover
                </Button>
              </>
            )}
          </div>

          {assinatura && (
            <div className="mt-4 rounded-md border-2 border-dashed bg-white p-6 flex flex-col items-center justify-center">
              <img src={assinatura} alt="Assinatura" className="max-h-40 max-w-full object-contain" />
              <div className="mt-3 pt-2 border-t w-full max-w-xs text-center">
                <div className="font-semibold text-sm">{nome || "—"}</div>
                <div className="text-xs text-muted-foreground">{cargo || "—"}</div>
              </div>
            </div>
          )}
        </div>


        <div className="flex items-center gap-2">
          <Checkbox checked={ativo} onCheckedChange={(v) => setAtivo(!!v)} id="ativo" />
          <Label htmlFor="ativo">Usuário ativo</Label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ColRow { chave: string; titulo: string; titulo_curto: string; ordem: number; }

function KanbanColumnsEditor() {
  const [rows, setRows] = useState<ColRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTitulo, setNewTitulo] = useState("");
  const [newCurto, setNewCurto] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("kanban_columns")
      .select("chave, titulo, titulo_curto, ordem")
      .order("ordem");
    if (error) toast.error(error.message);
    setRows((data ?? []) as ColRow[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = rows.findIndex((r) => r.chave === active.id);
    const to = rows.findIndex((r) => r.chave === over.id);
    if (from < 0 || to < 0) return;
    setRows((r) => arrayMove(r, from, to));
  }

  async function save() {
    setSaving(true);
    try {
      await updateKanbanColumnTitles(rows.map((r) => ({ chave: r.chave, titulo: r.titulo, titulo_curto: r.titulo_curto })));
      await reorderKanbanColumns(rows.map((r) => r.chave));
      toast.success("Colunas atualizadas");
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function addNew() {
    if (!newTitulo.trim()) { toast.error("Informe o título"); return; }
    try {
      await addKanbanColumn({ chave: newTitulo, titulo: newTitulo, titulo_curto: newCurto || newTitulo });
      toast.success("Coluna criada");
      setNewTitulo(""); setNewCurto(""); setAdding(false);
      await load();
    } catch (e: any) { toast.error(e.message ?? "Falha ao criar"); }
  }

  async function removeCol(chave: string) {
    if (!confirm(`Remover a coluna "${chave}"? Cards nela ficarão sem coluna válida.`)) return;
    try {
      await deleteKanbanColumn(chave);
      toast.success("Coluna removida");
      await load();
    } catch (e: any) { toast.error(e.message ?? "Falha ao remover"); }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Colunas do Planner (Kanban)</CardTitle>
          <p className="text-xs text-muted-foreground">Arraste para reordenar, renomeie, adicione ou remova colunas.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)} className="gap-1">
          <Plus className="h-4 w-4" /> Nova coluna
        </Button>
      </CardHeader>
      <CardContent>
        {adding && (
          <div className="mb-3 grid gap-2 rounded-md border bg-muted/30 p-3 md:grid-cols-[1fr_1fr_auto]">
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Título</Label>
              <Input value={newTitulo} onChange={(e) => setNewTitulo(e.target.value)} placeholder="Ex: Aguardando Peça" />
            </div>
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Título curto (mobile)</Label>
              <Input value={newCurto} onChange={(e) => setNewCurto(e.target.value)} placeholder="Ex: Peça" />
            </div>
            <div className="flex items-end gap-2">
              <Button size="sm" onClick={addNew}>Criar</Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancelar</Button>
            </div>
          </div>
        )}
        {loading ? <Loader2 className="animate-spin" /> : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={rows.map((r) => r.chave)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {rows.map((r, i) => (
                  <SortableColRow
                    key={r.chave}
                    row={r}
                    onChange={(patch) => {
                      const next = [...rows]; next[i] = { ...r, ...patch }; setRows(next);
                    }}
                    onDelete={() => removeCol(r.chave)}
                  />
                ))}
              </div>
            </SortableContext>
            <div className="flex justify-end pt-3">
              <Button onClick={save} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar colunas
              </Button>
            </div>
          </DndContext>
        )}
      </CardContent>
    </Card>
  );
}

function SortableColRow({ row, onChange, onDelete }: { row: ColRow; onChange: (p: Partial<ColRow>) => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.chave });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="grid items-center gap-2 rounded border bg-background p-2 md:grid-cols-[auto_120px_1fr_1fr_auto]">
      <button className="cursor-grab touch-none rounded p-1 hover:bg-muted" {...attributes} {...listeners} title="Arraste para reordenar">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>
      <Badge variant="outline" className="justify-self-start font-mono text-[10px]">{row.chave}</Badge>
      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Título</Label>
        <Input value={row.titulo} onChange={(e) => onChange({ titulo: e.target.value })} />
      </div>
      <div>
        <Label className="text-[10px] uppercase text-muted-foreground">Título curto (mobile)</Label>
        <Input value={row.titulo_curto} onChange={(e) => onChange({ titulo_curto: e.target.value })} />
      </div>
      <Button size="sm" variant="ghost" onClick={onDelete} className="text-destructive hover:text-destructive">
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}


