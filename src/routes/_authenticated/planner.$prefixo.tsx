import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { BackButton } from "@/components/back-button";
import { doAtivo, mesmoPrefixo } from "@/lib/match-ativo";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  Download,
  AlertTriangle,
  Plus,
  CheckSquare,
  Square,
  X,
  Paperclip,
  MessageSquare,
  Send,
  AtSign,
  Loader2,
  Tag as TagIcon,
  Pencil,
  Check,
  Lock,
  Pin,
  FileUp,
} from "lucide-react";
import { NumField } from "@/components/num-field";
import { canEditCards } from "@/lib/can-edit-card";
import { LancarOsCorretivaDialog } from "@/components/lancar-os-corretiva-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useAppStore } from "@/lib/store";
import { useKanbanColumns } from "@/hooks/use-kanban";
import { ColumnBadge, PriorityPill } from "@/components/status-badges";
import { toast } from "sonner";
import { uploadFile, uploadDataUrl } from "@/lib/storage";
import type {
  KanbanColumn,
  PendingTask,
  ChatMessage,
  AssetAnexo,
} from "@/lib/types";
import { tarefasDoCard, normalizarAtividade } from "@/lib/tarefas-inspecao";

import { EnviarLiberacaoDialog } from "@/components/enviar-liberacao-dialog";
import { MaterialsComprasSection } from "@/components/materials-compras-section";
import { CancelarPreventivaDialog } from "@/components/cancelar-preventiva-dialog";
import { OsPdfActions } from "@/components/os-pdf-actions";
import { useAuth } from "@/hooks/use-auth";
import { findFleetExact, findFleetCandidates } from "@/lib/fleet-lookup";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { sendMencaoEmail } from "@/lib/email-mencao.functions";

export const Route = createFileRoute("/_authenticated/planner/$prefixo")({
  head: () => ({
    meta: [
      { title: "Detalhe do Ativo" },
      { name: "description", content: "Detalhe de equipamento e histórico." },
    ],
  }),
  component: AssetDetail,
});

function fmtDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}
function fmtDateTime(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

interface MentionUser {
  id: string;
  nome: string;
  cargo: string | null;
}

function AssetDetail() {
  const { prefixo } = Route.useParams();
  const navigate = useNavigate();
  const asset = useAppStore((s) => s.assets.find((a) => a.prefixo === prefixo));
  const allInspections = useAppStore((s) => s.inspections);
  const allOrders = useAppStore((s) => s.workOrders);
  const inspections = useMemo(
    () => allInspections.filter((i) => (asset ? doAtivo(asset, i) : mesmoPrefixo(i.prefixo, prefixo))),
    [allInspections, prefixo, asset],
  );
  const orders = useMemo(
    () => allOrders.filter((w) => (asset ? doAtivo(asset, w) : mesmoPrefixo(w.prefixo, prefixo))),
    [allOrders, prefixo, asset],
  );
  const updateAsset = useAppStore((s) => s.updateAsset);
  const tagCatalog = useAppStore((s) => s.tagCatalog);
  const addTag = useAppStore((s) => s.addTag);

  const mechanic = useAppStore((s) =>
    s.mechanics.find((m) => m.id === asset?.mecanicoId),
  );
  const { columns: KANBAN_COLUMNS } = useKanbanColumns();
  const { profile, roles } = useAuth();
  // Mecânicos e inspetores só leem o card (chat e anexos continuam liberados).
  const canEdit = canEditCards(roles);

  const [newTask, setNewTask] = useState("");
  const [newTag, setNewTag] = useState("");
  const [editandoPrefixo, setEditandoPrefixo] = useState(false);
  const [prefixoDraft, setPrefixoDraft] = useState("");

  const [chatText, setChatText] = useState("");
  const [fixarMsg, setFixarMsg] = useState(false);
  const [anexoDesc, setAnexoDesc] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<HTMLTextAreaElement>(null);

  const [users, setUsers] = useState<MentionUser[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [uploadingAnexo, setUploadingAnexo] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const notifyMencao = useServerFn(sendMencaoEmail);

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    return users
      .filter((u) => u.nome.toLowerCase().includes(mentionQuery))
      .slice(0, 6);
  }, [mentionQuery, users]);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("id,nome,cargo")
      .eq("ativo", true)
      .order("nome")
      .then(({ data }) => {
        if (data) setUsers(data as MentionUser[]);
      });
  }, []);

  const hydrated = useAppStore((s) => s.hydrated);

  // Backfill: apontamentos (R/AR) das inspeções viram tarefas do card
  // (hooks precisam rodar antes de qualquer early return)
  const tarefasDerivadas = useMemo(
    () => tarefasDoCard(inspections, orders, asset?.pendingTasks ?? []),
    [inspections, orders, asset?.pendingTasks],
  );

  useEffect(() => {
    if (!asset) return;
    if (tarefasDerivadas.length > (asset.pendingTasks?.length ?? 0)) {
      updateAsset(asset.id, { pendingTasks: tarefasDerivadas });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset?.id, tarefasDerivadas.length]);

  if (!asset) {
    if (!hydrated)
      return (
        <div className="p-8 text-center text-sm text-muted-foreground">Carregando…</div>
      );
    throw notFound();
  }

  const tasks: PendingTask[] = asset.pendingTasks ?? [];
  const chat: ChatMessage[] = asset.chatMessages ?? [];
  const anexos: AssetAnexo[] = asset.anexos ?? [];




  // Delay computation
  const entregaPrev = asset.dataEntregaPrevista;
  const entregaOrig = asset.dataEntregaOriginal;
  const isLiberado = asset.column === "liberado";
  const hoje = new Date();
  const atrasadoOriginal =
    !!entregaOrig && !isLiberado && new Date(entregaOrig) < hoje;
  const atrasadoAtual =
    !!entregaPrev && !isLiberado && new Date(entregaPrev) < hoje;
  const foiRemarcada =
    !!entregaOrig && !!entregaPrev && entregaOrig !== entregaPrev;

  const handleEntregaChange = (value: string) => {
    if (!value) return;
    const iso = new Date(value).toISOString();
    updateAsset(asset.id, {
      dataEntregaPrevista: iso,
      dataEntregaOriginal: asset.dataEntregaOriginal ?? iso,
    });
    toast.success("Data de entrega atualizada");
  };

  // Tasks
  const addTask = () => {
    const text = normalizarAtividade(newTask);
    if (!text) return;
    const t: PendingTask = {
      id: `t-${Date.now()}`,
      text,
      done: false,
    };
    updateAsset(asset.id, { pendingTasks: [...tasks, t] });
    setNewTask("");
  };
  const toggleTask = (id: string) => {
    updateAsset(asset.id, {
      pendingTasks: tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    });
  };
  const removeTask = (id: string) => {
    updateAsset(asset.id, {
      pendingTasks: tasks.filter((t) => t.id !== id),
    });
  };

  // Chat
  const sendMessage = () => {
    const texto = chatText.trim();
    if (!texto) return;
    const autor = profile?.nome || "Usuário";
    // Extract mentioned user IDs from @Nome mentions
    const mencionados: string[] = [];
    for (const u of users) {
      const tag = "@" + u.nome.split(/\s+/)[0];
      if (texto.includes(tag)) mencionados.push(u.id);
    }
    const msg: ChatMessage = {
      id: `m-${Date.now()}`,
      autor,
      autorCargo: profile?.cargo ?? undefined,
      texto,
      mencionados: mencionados.length ? mencionados : undefined,
      fixadoNoCard: fixarMsg || undefined,
      createdAt: new Date().toISOString(),
    };
    updateAsset(asset.id, { chatMessages: [...chat, msg] });
    setChatText("");
    setFixarMsg(false);
    setMentionQuery(null);

    // Fire-and-forget: dispara e-mail via Power Automate para os mencionados
    if (mencionados.length) {
      const link = typeof window !== "undefined"
        ? `${window.location.origin}/planner/${encodeURIComponent(asset.prefixo)}`
        : undefined;
      notifyMencao({
        data: {
          prefixo: asset.prefixo,
          autor,
          autorCargo: profile?.cargo ?? undefined,
          texto,
          mencionados,
          link,
        },
      })
        .then((r) => {
          if (r.ok) {
            toast.success(`E-mail de menção enviado para ${r.destinatarios.length} pessoa(s)`);
          } else if (r.status !== "missing_config") {
            toast.error(`Menção não enviada: ${r.message}`);
          }
        })
        .catch(() => {
          // Silencioso — mensagem já foi salva no chat
        });
    }
  };

  const handleChatChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setChatText(value);
    const caret = e.target.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const match = before.match(/@(\S*)$/);
    setMentionQuery(match ? match[1].toLowerCase() : null);
  };

  const insertMention = (u: MentionUser) => {
    const firstName = u.nome.split(/\s+/)[0];
    const el = chatRef.current;
    const caret = el?.selectionStart ?? chatText.length;
    const before = chatText.slice(0, caret).replace(/@\S*$/, `@${firstName} `);
    const after = chatText.slice(caret);
    setChatText(before + after);
    setMentionQuery(null);
    setTimeout(() => {
      el?.focus();
      const pos = before.length;
      el?.setSelectionRange(pos, pos);
    }, 0);
  };

  const renderMessageText = (text: string) => {
    const parts = text.split(/(@\S+)/g);
    return parts.map((part, i) => {
      if (part.startsWith("@")) {
        const nome = part.slice(1);
        const hit = users.some((u) =>
          u.nome.toLowerCase().startsWith(nome.toLowerCase()),
        );
        if (hit) {
          return (
            <span
              key={i}
              className="rounded bg-primary/15 px-1 font-semibold text-primary"
            >
              {part}
            </span>
          );
        }
      }
      return <span key={i}>{part}</span>;
    });
  };



  // Anexos
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploadingAnexo(true);
    try {
      const url = await uploadFile(`anexos/${asset.prefixo}`, f);
      const anexo: AssetAnexo = {
        id: `an-${Date.now()}`,
        nome: f.name,
        tipo: f.type || "application/octet-stream",
        dataUrl: url,
        descricao: anexoDesc.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
      updateAsset(asset.id, { anexos: [...anexos, anexo] });
      setAnexoDesc("");
      if (fileRef.current) fileRef.current.value = "";
      toast.success("Anexo adicionado");
    } catch (err) {
      console.error(err);
      toast.error("Falha ao enviar anexo. Tente novamente.");
    } finally {
      setUploadingAnexo(false);
    }
  };
  const removeAnexo = (id: string) => {
    updateAsset(asset.id, { anexos: anexos.filter((a) => a.id !== id) });
  };

  const sincronizarCadastro = async () => {
    setSincronizando(true);
    try {
      let c = await findFleetExact(asset.prefixo);
      if (!c) {
        const cands = await findFleetCandidates(asset.prefixo);
        if (cands.length === 1) c = cands[0];
        else if (cands.length > 1) {
          toast.error(
            `Encontrei ${cands.length} equipamentos parecidos no cadastro. Ajuste o prefixo (ex.: ${cands[0].numero_inventario || cands[0].codigo_armac}).`,
          );
          return;
        }
      }
      if (!c) {
        // Sem cadastro SAP: limpa dados herdados para preenchimento manual.
        updateAsset(asset.id, { marca: "", modelo: "", numeroSerie: "", codigoArmac: "", inventario: "" });
        toast.error(`Prefixo ${asset.prefixo} sem cadastro SAP — preencha os dados manualmente.`);
        return;
      }
      updateAsset(asset.id, {
        marca: c.marca || asset.marca,
        modelo: c.modelo || asset.modelo,
        tipo: c.tipo_objeto || asset.tipo,
        numeroSerie: c.numero_serie || asset.numeroSerie,
        codigoArmac: c.codigo_armac || asset.codigoArmac,
        inventario: c.numero_inventario || asset.inventario,
      });
      toast.success(`Cadastro carregado: ${c.codigo_armac} — ${c.modelo}`);
    } catch (err) {
      console.error(err);
      toast.error("Falha ao consultar o cadastro SAP.");
    } finally {
      setSincronizando(false);
    }
  };


  const salvarPrefixo = () => {
    const novo = prefixoDraft.trim().toUpperCase();
    if (!novo) {
      toast.error("Informe o nome/prefixo da máquina.");
      return;
    }
    if (novo === asset.prefixo) {
      setEditandoPrefixo(false);
      return;
    }
    const dup = useAppStore
      .getState()
      .assets.some((a) => a.id !== asset.id && !a.deletedAt && a.prefixo.toUpperCase() === novo);
    if (dup) {
      toast.error(`Já existe uma máquina com o prefixo ${novo}.`);
      return;
    }
    const st = useAppStore.getState();
    updateAsset(asset.id, { prefixo: novo });
    st.inspections
      .filter((i) => doAtivo(asset, i))
      .forEach((i) => st.updateInspection(i.id, { prefixo: novo }));
    st.workOrders
      .filter((w) => doAtivo(asset, w))
      .forEach((w) => st.updateWorkOrder(w.id, { prefixo: novo }));
    setEditandoPrefixo(false);
    toast.success("Prefixo atualizado.");
    // Revalida o cadastro SAP do novo prefixo; sem correspondência 100%,
    // limpa os dados técnicos para preenchimento manual.
    void (async () => {
      const c = await findFleetExact(novo).catch(() => null);
      if (c) {
        updateAsset(asset.id, {
          marca: c.marca || "",
          modelo: c.modelo || "",
          tipo: c.tipo_objeto || asset.tipo,
          numeroSerie: c.numero_serie || "",
          codigoArmac: c.codigo_armac || "",
          inventario: c.numero_inventario || "",
        });
      } else {
        updateAsset(asset.id, { marca: "", modelo: "", numeroSerie: "", codigoArmac: "", inventario: "" });
        toast.info(`Sem cadastro SAP para ${novo} — preencha os dados manualmente.`);
      }
    })();
    void navigate({ to: "/planner/$prefixo", params: { prefixo: novo }, replace: true });
  };


  return (
    <div className="mx-auto max-w-4xl px-3 py-4 md:px-6 md:py-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <BackButton fallbackTo="/planner" />
        {asset.column === "liberado" || asset.column === "teste" ? (
          <EnviarLiberacaoDialog asset={asset} />
        ) : (
          <EnviarLiberacaoDialog
            asset={asset}
            trigger={
              <Button size="sm" variant="outline" className="gap-2">
                <FileUp className="h-4 w-4" /> Liberação com checklist antigo (PDF)
              </Button>
            }
          />
        )}

      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center gap-2">
            {editandoPrefixo ? (
              <div className="flex items-center gap-1">
                <Input
                  autoFocus
                  value={prefixoDraft}
                  onChange={(e) => setPrefixoDraft(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") salvarPrefixo();
                    if (e.key === "Escape") setEditandoPrefixo(false);
                  }}
                  className="h-9 w-40 font-display text-lg font-bold uppercase"
                />
                <Button size="sm" className="h-8 gap-1" onClick={salvarPrefixo}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditandoPrefixo(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <CardTitle className="font-display text-2xl">{asset.prefixo}</CardTitle>
                {canEdit && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    title="Editar prefixo da máquina"
                    onClick={() => {
                      setPrefixoDraft(asset.prefixo);
                      setEditandoPrefixo(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
              </>
            )}
            <ColumnBadge column={asset.column} />
            <PriorityPill p={asset.priority} />
            {asset.faltaDocPCM && <Badge variant="destructive">Falta doc PCM</Badge>}
            {atrasadoOriginal && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> Atrasado
              </Badge>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">
            Criado {fmtDate(asset.criadoEm ?? asset.dataEntrada)}
            {asset.criadoPor ? ` por ${asset.criadoPor}` : ""}
            {asset.ultimaAlteracaoEm && (
              <>
                {" · "}Última alteração em {fmtDate(asset.ultimaAlteracaoEm)}
                {asset.ultimaAlteracaoPor ? ` feita por ${asset.ultimaAlteracaoPor}` : ""}
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>
              {asset.marca} {asset.modelo} · {asset.tipo}
              {asset.numeroSerie ? ` · SN ${asset.numeroSerie}` : ""}
              {asset.codigoArmac ? ` · ${asset.codigoArmac}` : ""}
            </span>
            {canEdit && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                disabled={sincronizando}
                onClick={() => void sincronizarCadastro()}
              >
                {sincronizando ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                Buscar no cadastro SAP
              </Button>
            )}
            {!canEdit && (
              <Badge variant="secondary" className="gap-1">
                <Lock className="h-3 w-3" /> Somente leitura
              </Badge>
            )}
          </div>

          {canEdit && (
            <div className="mt-3 rounded-md border bg-muted/30 p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Dados técnicos {(!asset.codigoArmac && !asset.modelo) ? "— sem cadastro SAP, preencha manualmente" : "(edição manual)"}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {([
                  ["Marca", "marca"],
                  ["Modelo", "modelo"],
                  ["Nº de série", "numeroSerie"],
                  ["Cód. ARMAC", "codigoArmac"],
                  ["Inventário", "inventario"],
                ] as const).map(([rotulo, campo]) => (
                  <div key={campo}>
                    <Label className="text-[10px] uppercase text-muted-foreground">{rotulo}</Label>
                    <Input
                      defaultValue={(asset[campo] as string) ?? ""}
                      placeholder="—"
                      className="h-9 text-sm"
                      onBlur={(e) => {
                        const v = e.target.value.trim().toUpperCase();
                        if (v !== ((asset[campo] as string) ?? "")) updateAsset(asset.id, { [campo]: v } as never);
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardHeader>


        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <Label htmlFor="horimetro" className="text-xs uppercase text-muted-foreground">Horímetro</Label>
              <div className="flex items-center gap-1">
                <NumField
                  id="horimetro"
                  value={asset.horimetroAtual}
                  onCommit={(v) => updateAsset(asset.id, { horimetroAtual: v as never })}
                  disabled={!canEdit}
                  className="h-10 font-display text-lg font-bold"
                />
                <span className="text-sm text-muted-foreground">h</span>
              </div>
            </div>
            <div>
              <Label htmlFor="ultpmp" className="text-xs uppercase text-muted-foreground">Últ. PMP</Label>
              <div className="flex items-center gap-1">
                <NumField
                  id="ultpmp"
                  value={asset.horimetroUltimoPMP}
                  onCommit={(v) => updateAsset(asset.id, { horimetroUltimoPMP: v as never })}
                  disabled={!canEdit}
                  className="h-10 font-display text-lg font-bold"
                />
                <span className="text-sm text-muted-foreground">h</span>
              </div>
            </div>
            <div>
              <Label htmlFor="proxalvo" className="text-xs uppercase text-muted-foreground">Próx. alvo</Label>
              <div className="flex items-center gap-1">
                <NumField
                  id="proxalvo"
                  value={asset.proximoAlvoPMP}
                  onCommit={(v) => updateAsset(asset.id, { proximoAlvoPMP: v as never })}
                  disabled={!canEdit}
                  className="h-10 font-display text-lg font-bold"
                />
                <span className="text-sm text-muted-foreground">h</span>
              </div>
            </div>

            <div>
              <div className="text-xs uppercase text-muted-foreground">Mecânico</div>
              <div className="text-sm font-semibold pt-2">{mechanic?.nome ?? "—"}</div>
            </div>
            <div className="col-span-2">
              <Label htmlFor="dataentrada" className="text-xs uppercase text-muted-foreground">Data de entrada</Label>
              <Input
                id="dataentrada"
                type="datetime-local"
                value={asset.dataEntrada ? new Date(asset.dataEntrada).toISOString().slice(0, 16) : ""}
                onChange={(e) => {
                  if (!e.target.value) return;
                  updateAsset(asset.id, { dataEntrada: new Date(e.target.value).toISOString() });
                }}
                disabled={!canEdit}
                className="h-10"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <div>
              <Label htmlFor="entrega">Data de entrega prevista</Label>
              <Input
                id="entrega"
                type="date"
                value={asset.dataEntregaPrevista?.slice(0, 10) ?? ""}
                onChange={(e) => handleEntregaChange(e.target.value)}
                disabled={!canEdit}
                className="h-11 text-base"
              />
              {foiRemarcada && (
                <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
                  <span className="text-muted-foreground">Prevista original:</span>
                  <span className="font-semibold">{fmtDate(entregaOrig)}</span>
                  {atrasadoOriginal && (
                    <Badge variant="destructive" className="ml-1 gap-1">
                      <AlertTriangle className="h-3 w-3" /> Atraso desde a 1ª data
                    </Badge>
                  )}
                </div>
              )}
              {!foiRemarcada && atrasadoAtual && (
                <div className="mt-1 text-[11px] text-destructive font-medium">
                  Entrega em atraso
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="col">Coluna Kanban</Label>
              <select
                id="col"
                value={asset.column}
                onChange={(e) => {
                  updateAsset(asset.id, { column: e.target.value as KanbanColumn });
                  toast.success("Coluna atualizada");
                }}
                disabled={!canEdit}
                className="mt-1 flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60"
              >
                {KANBAN_COLUMNS.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tags */}
      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TagIcon className="h-4 w-4" /> Tags ({(asset.tags ?? []).length})
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap gap-1.5">
            {(canEdit ? tagCatalog : (asset.tags ?? [])).map((t) => {
              const active = (asset.tags ?? []).includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => {
                    if (!canEdit) return;
                    const cur = asset.tags ?? [];
                    updateAsset(asset.id, {
                      tags: active ? cur.filter((x) => x !== t) : [...cur, t],
                    });
                  }}
                  className={`rounded-full border px-2.5 py-1 text-xs transition ${
                    active
                      ? "border-primary bg-primary/15 text-primary font-medium"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {t}
                </button>
              );
            })}
            {canEdit && tagCatalog.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma tag no catálogo ainda.</p>
            )}
            {!canEdit && (asset.tags ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma tag neste equipamento.</p>
            )}
          </div>
          {canEdit && (
          <div className="flex gap-2">
            <Input
              placeholder="Criar nova tag…"
              className="h-9"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const t = newTag.trim();
                  if (!t) return;
                  addTag(t);
                  const cur = asset.tags ?? [];
                  if (!cur.includes(t)) updateAsset(asset.id, { tags: [...cur, t] });
                  setNewTag("");
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => {
                const t = newTag.trim();
                if (!t) return;
                addTag(t);
                const cur = asset.tags ?? [];
                if (!cur.includes(t)) updateAsset(asset.id, { tags: [...cur, t] });
                setNewTag("");
                toast.success("Tag adicionada");
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Tag
            </Button>
          </div>
          )}
        </CardContent>
      </Card>



      {/* Lista de tarefas */}
      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckSquare className="h-4 w-4" /> Lista de tarefas ({tasks.filter(t => t.done).length}/{tasks.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {canEdit && (
          <div className="flex gap-2">
            <Input
              placeholder="Nova tarefa…"
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTask();
                }
              }}
            />
            <Button onClick={addTask} size="sm" className="gap-1">
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>
          )}
          {tasks.length === 0 && (
            <div className="text-sm text-muted-foreground">Nenhuma tarefa registrada.</div>
          )}
          {tasks.length > 0 && (
            <ul className="divide-y rounded-md border">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-2 px-3 py-2">
                  <button
                    onClick={() => canEdit && toggleTask(t.id)}
                    disabled={!canEdit}
                    className="text-primary disabled:opacity-60"
                  >
                    {t.done ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                  </button>
                  <span className={`flex-1 text-sm ${t.done ? "line-through text-muted-foreground" : ""}`}>
                    {t.text}
                  </span>
                  {canEdit && (
                  <button
                    onClick={() => removeTask(t.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Chat */}
      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> Chat ({chat.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border bg-muted/30 p-2">
            {chat.length === 0 && (
              <div className="text-sm text-muted-foreground">
                Nenhuma mensagem ainda. Use <b>@</b> para mencionar colegas.
              </div>
            )}
            {chat.map((m) => (
              <div key={m.id} className="rounded-md bg-background p-2 text-sm shadow-sm">
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="truncate">
                    <span className="font-semibold text-foreground">{m.autor}</span>
                    {m.autorCargo && <span className="ml-1">· {m.autorCargo}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {fmtDateTime(m.createdAt)}
                    <button
                      type="button"
                      title={m.fixadoNoCard ? "Não mostrar na frente do card" : "Mostrar na frente do card"}
                      onClick={() =>
                        updateAsset(asset.id, {
                          chatMessages: chat.map((x) =>
                            x.id === m.id ? { ...x, fixadoNoCard: !x.fixadoNoCard } : x,
                          ),
                        })
                      }
                      className={`rounded p-0.5 hover:bg-muted ${m.fixadoNoCard ? "text-primary" : "text-muted-foreground/60"}`}
                    >
                      <Pin className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>
                <div className="mt-1 whitespace-pre-wrap">
                  {renderMessageText(m.texto)}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
            <AtSign className="h-3.5 w-3.5" />
            Enviando como <b className="text-foreground">{profile?.nome ?? "Usuário"}</b>
            {profile?.cargo && <span>· {profile.cargo}</span>}
          </div>

          <div className="relative grid gap-2 sm:grid-cols-[1fr,auto]">
            <div className="relative">
              <Textarea
                ref={chatRef}
                placeholder="Escreva uma mensagem…  Digite @ para mencionar."
                value={chatText}
                onChange={handleChatChange}
                className="min-h-[52px]"
              />
              {mentionMatches.length > 0 && (
                <div className="absolute bottom-full left-0 z-20 mb-1 w-full max-w-xs overflow-hidden rounded-md border bg-background shadow-lg">
                  {mentionMatches.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => insertMention(u)}
                      className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-muted"
                    >
                      <AtSign className="h-3.5 w-3.5 text-primary" />
                      <span className="flex-1 truncate">
                        <span className="font-medium">{u.nome}</span>
                        {u.cargo && (
                          <span className="ml-1 text-xs text-muted-foreground">· {u.cargo}</span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 self-end">
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={fixarMsg}
                  onChange={(e) => setFixarMsg(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
                />
                <Pin className="h-3.5 w-3.5" /> Mostrar no card
              </label>
              <Button onClick={sendMessage} className="gap-1">
                <Send className="h-4 w-4" /> Enviar
              </Button>
            </div>
          </div>

        </CardContent>
      </Card>

      {/* Anexos */}
      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Paperclip className="h-4 w-4" /> Anexos ({anexos.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <div className="grid gap-2 sm:grid-cols-[1fr,auto]">
            <Input
              placeholder="Descrição do anexo (opcional)"
              value={anexoDesc}
              onChange={(e) => setAnexoDesc(e.target.value)}
            />
            <Input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={handleFile}
              disabled={uploadingAnexo}
              className="cursor-pointer"
            />
          </div>
          {uploadingAnexo && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Enviando anexo...
            </div>
          )}
          {anexos.length === 0 && (
            <div className="text-sm text-muted-foreground">Nenhum anexo enviado.</div>
          )}
          {anexos.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {anexos.map((a) => {
                const isImg = a.tipo.startsWith("image/");
                return (
                  <div key={a.id} className="group relative overflow-hidden rounded-md border">
                    {isImg ? (
                      <a href={a.dataUrl} target="_blank" rel="noreferrer">
                        <img src={a.dataUrl} alt={a.nome} className="h-28 w-full object-cover" />
                      </a>
                    ) : (
                      <a
                        href={a.dataUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex h-28 flex-col items-center justify-center gap-1 bg-muted text-xs"
                      >
                        <FileText className="h-6 w-6 text-muted-foreground" />
                        <span className="truncate px-1">{a.nome}</span>
                      </a>
                    )}
                    <div className="p-1.5 text-[10px]">
                      <div className="truncate font-semibold">{a.nome}</div>
                      {a.descricao && <div className="truncate text-muted-foreground">{a.descricao}</div>}
                      <div className="text-muted-foreground">{fmtDateTime(a.createdAt)}</div>
                    </div>
                    <button
                      onClick={() => removeAnexo(a.id)}
                      className="absolute right-1 top-1 rounded bg-background/90 p-1 opacity-0 shadow group-hover:opacity-100"
                      aria-label="remover"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {(asset.documentos?.length ?? 0) > 0 && (
            <div className="mt-2 grid gap-2 border-t pt-2">
              <div className="text-xs font-semibold uppercase text-muted-foreground">
                Documentos gerados ({asset.documentos?.length ?? 0})
              </div>
              {asset.documentos
                ?.slice()
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((d) => (
                  <div key={d.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{d.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {d.tipo === "checklist_entrada_saida" ? "Checklist de Entrada e Saída" : d.tipo}
                        {" · "}
                        {fmtDateTime(d.createdAt)}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" asChild>
                        <a href={d.dataUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                      <Button size="sm" variant="ghost" asChild>
                        <a href={d.dataUrl} download={d.nome}>
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>





      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Inspeções ({inspections.length})</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {inspections.length === 0 && (
            <div className="text-sm text-muted-foreground">Nenhuma inspeção registrada.</div>
          )}
          {inspections.map((i) => (
            <div
              key={i.id}
              className="flex items-center justify-between rounded-md border p-2 text-sm hover:border-primary/60"
            >
              <Link
                to="/inspetor/$id"
                params={{ id: i.id }}
                className="flex min-w-0 flex-1 items-center gap-2"
              >
                <div className="min-w-0">
                  <div className="font-semibold">
                    {i.tipo === "entrada" ? "Entrada" : "Saída"} · {fmtDate(i.data)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {i.falhas.length} falha(s) · {i.horimetro}h
                  </div>
                </div>
              </Link>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={async () => {
                    const { generateInspectionPdf } = await import("@/lib/inspection-pdf");
                    try {
                      const { filename, dataUrl } = await generateInspectionPdf(asset, i);
                      const publicUrl = await uploadDataUrl(`documentos/${asset.prefixo}`, dataUrl, filename);
                      const existing = asset.documentos ?? [];
                      updateAsset(asset.id, {
                        documentos: [
                          ...existing,
                          {
                            id: `doc-${Date.now()}`,
                            nome: filename,
                            tipo: "checklist_entrada_saida",
                            dataUrl: publicUrl,
                            createdAt: new Date().toISOString(),
                          },
                        ],
                      });
                      toast.success(`PDF gerado: ${filename}`);
                    } catch (err) {
                      console.error(err);
                      toast.error("Falha ao gerar PDF");
                    }
                  }}
                >
                  <Download className="h-4 w-4" /> PDF
                </Button>
                <Link
                  to="/inspetor/$id"
                  params={{ id: i.id }}
                  className="rounded p-1 hover:bg-muted"
                  aria-label="Abrir inspeção"
                >
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </Link>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>


      <Card className="mt-4">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base">Ordens de Serviço ({orders.length})</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <CancelarPreventivaDialog asset={asset} />
            <LancarOsCorretivaDialog asset={asset} />
          </div>
        </CardHeader>
        <CardContent className="grid gap-2">
          {orders.length === 0 && (
            <div className="text-sm text-muted-foreground">
              Nenhuma OS registrada. Use “Lançar OS corretiva” para liberar o trabalho ao mecânico.
            </div>
          )}
          {orders.map((w) => {
            return (
              <div
                key={w.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm hover:border-primary/60"
              >
                <Link
                  to={w.tipo === "corretiva" ? "/os/corretiva/$id" : "/os/preventiva/$id"}
                  params={{ id: w.id }}
                  className="flex min-w-0 flex-1 items-center gap-2"
                >
                  <div className="min-w-0">
                    <div className="font-semibold">
                      {w.numeroSAP} · {w.tipo}
                    </div>
                    <div className="text-xs text-muted-foreground">{w.setorExecutante}</div>
                  </div>
                </Link>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{w.status}</Badge>
                  <OsPdfActions wo={w} asset={asset} />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Materiais solicitados (integração Portal de Compras) — sempre por último */}
      <MaterialsComprasSection
        prefixo={asset.prefixo}
        osNumeros={[asset.sapOsCorretiva, asset.sapOsPreventiva].filter((x): x is string => !!x)}
      />
    </div>
  );
}
