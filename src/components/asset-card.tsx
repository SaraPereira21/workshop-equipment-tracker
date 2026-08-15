import { Link } from "@tanstack/react-router";
import { Camera, AlertTriangle, User, ClipboardCheck, CheckSquare, Briefcase, Trash2, Pencil, Check, X, MessageSquare } from "lucide-react";
import { memo, useMemo, useState } from "react";
import type { Asset } from "@/lib/types";
import { PriorityPill, ColumnBadge } from "./status-badges";
import { useAppStore } from "@/lib/store";
import { toast } from "sonner";
import { findFleetCandidates, findFleetExact } from "@/lib/fleet-lookup";
import { useAuth } from "@/hooks/use-auth";
import { canEditCards } from "@/lib/can-edit-card";
import { tarefasDoCard } from "@/lib/tarefas-inspecao";


function EditablePrefixo({ asset, canEdit }: { asset: Asset; canEdit: boolean }) {
  const updateAsset = useAppStore((s) => s.updateAsset);
  const assets = useAppStore((s) => s.assets);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(asset.prefixo);

  const stop = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const save = (e: React.SyntheticEvent) => {
    stop(e);
    const novo = value.trim().toUpperCase();
    if (!novo) return;
    if (novo === asset.prefixo) { setEditing(false); return; }
    if (assets.some((a) => a.id !== asset.id && a.prefixo.toUpperCase() === novo)) {
      toast.error(`Já existe um equipamento com prefixo ${novo}`);
      return;
    }
    updateAsset(asset.id, { prefixo: novo });
    toast.success("Prefixo atualizado");
    setEditing(false);
    // Busca os dados do cadastro SAP para o novo prefixo
    void (async () => {
      try {
        let c = await findFleetExact(novo);
        if (!c) {
          const cands = await findFleetCandidates(novo);
          if (cands.length === 1) c = cands[0];
        }
        if (!c) {
          // Sem cadastro SAP: limpa os dados herdados do prefixo anterior
          // para que sejam preenchidos manualmente.
          updateAsset(asset.id, {
            marca: "",
            modelo: "",
            numeroSerie: "",
            codigoArmac: "",
            inventario: "",
          });
          toast.info(`Sem cadastro SAP para ${novo} — preencha os dados manualmente.`);
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
        toast.success(`Cadastro SAP carregado: ${c.codigo_armac} — ${c.modelo}`);
      } catch {
        /* silencioso */
      }
    })();
  };


  const cancel = (e: React.SyntheticEvent) => {
    stop(e);
    setValue(asset.prefixo);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1" onClick={stop}>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onClick={stop}
          onKeyDown={(e) => {
            if (e.key === "Enter") save(e);
            if (e.key === "Escape") cancel(e);
          }}
          className="w-24 rounded border bg-background px-1 py-0.5 font-display text-sm font-bold uppercase outline-none focus:border-primary"
        />
        <button type="button" onClick={save} className="rounded p-0.5 text-success hover:bg-success/10" aria-label="Salvar">
          <Check className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={cancel} className="rounded p-0.5 text-muted-foreground hover:bg-muted" aria-label="Cancelar">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <div className="font-display text-sm font-bold truncate">{asset.prefixo}</div>
      {canEdit && (
        <button
          type="button"
          onClick={(e) => { stop(e); setEditing(true); }}
          title="Editar prefixo"
          aria-label="Editar prefixo"
          className="rounded p-0.5 text-muted-foreground opacity-60 hover:bg-muted hover:opacity-100"
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}


function AssetCardBase({ asset, onDragStart }: { asset: Asset; onDragStart?: (e: React.DragEvent) => void }) {
  const equipeIds = asset.mecanicoIds ?? (asset.mecanicoId ? [asset.mecanicoId] : []);
  const mechanics = useAppStore((s) => s.mechanics);
  const { roles } = useAuth();
  const removeAsset = useAppStore((s) => s.removeAsset);
  const equipe = mechanics.filter((m) => equipeIds.includes(m.id));
  const inspections = useAppStore((s) => s.inspections);
  const workOrders = useAppStore((s) => s.workOrders);
  // Máquinas na corretiva podem ainda não ter as tarefas salvas no card:
  // derivamos os apontamentos (R/AR das inspeções + falhas/operações das OS).
  const cardTasks = useMemo(() => {
    const salvas = asset.pendingTasks ?? [];
    if (salvas.length > 0) return salvas;
    const insp = inspections.filter((i) => i.assetId === asset.id || i.prefixo === asset.prefixo);
    const wos = workOrders.filter((w) => w.assetId === asset.id || w.prefixo === asset.prefixo);
    return tarefasDoCard(insp, wos, []);
  }, [asset.id, asset.prefixo, asset.pendingTasks, inspections, workOrders]);
  const mechanic = equipe[0];
  const ultimaMensagem = (asset.chatMessages ?? []).filter((m) => m.fixadoNoCard).at(-1);
  const draggable = !!onDragStart;
  const canDelete = canEditCards(roles);
  const canEditPrefix = canDelete;


  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Excluir a máquina ${asset.prefixo}? Esta ação não pode ser desfeita.`)) return;
    removeAsset(asset.id);
    toast.success(`Máquina ${asset.prefixo} excluída`);
  };

  const DeleteBtn = () =>
    canDelete ? (
      <button
        type="button"
        onClick={handleDelete}
        title="Excluir máquina"
        aria-label="Excluir máquina"
        className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    ) : null;

  // Nova Solicitação: card estilo Planner — tags, urgência, checklist, contrato
  if (asset.column === "chegada") {
    const tasks = cardTasks;
    const doneCount = tasks.filter((t) => t.done).length;
    const tags = asset.tags ?? [];
    const emInspecao = !!asset.inspetorLockId;
    return (
      <Link to="/planner/$prefixo" params={{ prefixo: asset.prefixo }} className="block">
        <div
          draggable={draggable}
          onDragStart={onDragStart}
          className="cursor-grab rounded-lg border bg-card p-3 shadow-sm transition-all hover:border-primary/60 hover:shadow active:cursor-grabbing"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <EditablePrefixo asset={asset} canEdit={canEditPrefix} />

              {asset.tipo && asset.tipo !== "Equipamento" && (
                <div className="truncate text-[11px] text-muted-foreground">{asset.tipo}</div>
              )}
            </div>
            <div className="flex items-center gap-1">
              <PriorityPill p={asset.priority} />
              <DeleteBtn />
            </div>
          </div>

          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {tags.slice(0, 3).map((t) => (
                <span key={t} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  {t}
                </span>
              ))}
              {tags.length > 3 && (
                <span className="text-[10px] text-muted-foreground">+{tags.length - 3}</span>
              )}
            </div>
          )}


          {asset.descricao && (
            <p className="mt-2 line-clamp-2 text-[11px] text-muted-foreground">{asset.descricao}</p>
          )}

          {ultimaMensagem && (
            <div className="mt-2 flex items-start gap-1.5 rounded bg-muted/60 px-2 py-1 text-[10px] text-muted-foreground">
              <MessageSquare className="mt-[1px] h-3 w-3 shrink-0" />
              <span className="line-clamp-2 min-w-0">
                <span className="font-medium text-foreground/80">{ultimaMensagem.autor.split(" ")[0]}: </span>
                {ultimaMensagem.texto}
              </span>
            </div>
          )}



          <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
            {asset.contrato && (
              <span className="flex items-center gap-1 truncate">
                <Briefcase className="h-3 w-3" /> {asset.contrato}
              </span>
            )}
            {tasks.length > 0 && (
              <span className="flex items-center gap-1">
                <CheckSquare className="h-3 w-3" /> {doneCount}/{tasks.length}
              </span>
            )}
          </div>

          <div className="mt-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold ${
                emInspecao ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"
              }`}
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
              {emInspecao
                ? `Em inspeção${asset.inspetorLockNome ? ` · ${asset.inspetorLockNome}` : ""}`
                : "Aguardando inspeção"}
            </span>
          </div>
        
        {asset.ultimaAlteracaoEm && (
          <div className="mt-2 truncate text-[10px] text-muted-foreground">
            Última alteração em {new Date(asset.ultimaAlteracaoEm).toLocaleDateString("pt-BR")}
            {asset.ultimaAlteracaoPor ? ` por ${asset.ultimaAlteracaoPor}` : ""}
          </div>
        )}

        </div>
      </Link>
    );
  }



  return (
    <Link to="/planner/$prefixo" params={{ prefixo: asset.prefixo }} className="block">
      <div
        draggable={draggable}
        onDragStart={onDragStart}
        className="cursor-grab rounded-lg border bg-card p-3 shadow-sm transition-all hover:border-primary/60 hover:shadow active:cursor-grabbing"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <EditablePrefixo asset={asset} canEdit={canEditPrefix} />
            <div className="truncate text-[11px] text-muted-foreground">{asset.marca} {asset.modelo}</div>
          </div>
          <div className="flex items-center gap-1">
            <PriorityPill p={asset.priority} />
            <DeleteBtn />
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="font-medium">{asset.horimetroAtual}h</span>
          <ColumnBadge column={asset.column} />
        </div>

        {(asset.tags ?? []).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {(asset.tags ?? []).slice(0, 3).map((t) => (
              <span key={t} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                {t}
              </span>
            ))}
            {(asset.tags ?? []).length > 3 && (
              <span className="text-[10px] text-muted-foreground">+{(asset.tags ?? []).length - 3}</span>
            )}
          </div>
        )}

        {ultimaMensagem && (
          <div className="mt-2 flex items-start gap-1.5 rounded bg-muted/60 px-2 py-1 text-[10px] text-muted-foreground">
            <MessageSquare className="mt-[1px] h-3 w-3 shrink-0" />
            <span className="line-clamp-2 min-w-0">
              <span className="font-medium text-foreground/80">{ultimaMensagem.autor.split(" ")[0]}: </span>
              {ultimaMensagem.texto}
            </span>
          </div>
        )}


        <div className="mt-2 flex items-center gap-2">
          {mechanic ? (
            <div className="flex items-center gap-1.5 text-[11px]">
              <div className="flex -space-x-1.5">
                {equipe.slice(0, 3).map((m) => (
                  <div
                    key={m.id}
                    title={m.nome}
                    className="grid h-6 w-6 place-items-center rounded-full bg-primary/15 text-primary text-[10px] font-bold ring-2 ring-card"
                  >
                    {m.nome.split(" ").map((s) => s[0]).slice(0, 2).join("")}
                  </div>
                ))}
              </div>
              <span className="truncate">
                {mechanic.nome.split(" ")[0]}
                {equipe.length > 1 && ` +${equipe.length - 1}`}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <User className="h-3 w-3" /> Não atribuído
            </div>
          )}
          <div className="ml-auto flex items-center gap-1">
            {cardTasks.length > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <CheckSquare className="h-3.5 w-3.5" />
                {cardTasks.filter((t) => t.done).length}/{cardTasks.length}
              </span>
            )}
            {asset.hasFotos && <Camera className="h-3.5 w-3.5 text-info" />}
            {asset.faltaDocPCM && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
          </div>
        </div>

        {(() => {
          const ref = asset.dataEntregaOriginal ?? asset.dataEntregaPrevista;
          if (!ref) return null;
          const atrasado = asset.column !== "liberado" && new Date(ref) < new Date();
          return (
            <div
              className={`mt-2 flex items-center justify-between gap-1 rounded px-2 py-1 text-[10px] ${
                atrasado ? "bg-destructive/15 text-destructive font-semibold" : "bg-muted text-muted-foreground"
              }`}
            >
              <span>Entrega: {new Date(asset.dataEntregaPrevista ?? ref).toLocaleDateString("pt-BR")}</span>
              {atrasado && (
                <span className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Atrasado
                </span>
              )}
            </div>
          );
        })()}

        {asset.ultimaAlteracaoEm && (
          <div className="mt-2 truncate text-[10px] text-muted-foreground">
            Última alteração em {new Date(asset.ultimaAlteracaoEm).toLocaleDateString("pt-BR")}
            {asset.ultimaAlteracaoPor ? ` por ${asset.ultimaAlteracaoPor}` : ""}
          </div>
        )}

      </div>
    </Link>
  );
}

// Kanban chega a renderizar 200+ cards: sem memo, cada evento realtime ou
// tecla digitada na busca re-renderizava todos e travava a aba.
export const AssetCard = memo(AssetCardBase);

