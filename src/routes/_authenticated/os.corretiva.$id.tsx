import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { BackButton } from "@/components/back-button";
import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Save, Check, Trash2, PackagePlus, ExternalLink, Signature } from "lucide-react";
import { PARTS_APP_URL } from "@/lib/checklist-items";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useAppStore } from "@/lib/store";
import { useAuth } from "@/hooks/use-auth";
import { OTM_CATALOG } from "@/lib/seed";
import { OSTabs } from "@/components/os-tabs";
import { SignaturePad, SignedBlock } from "@/components/signature-pad";
import { OsPdfActions } from "@/components/os-pdf-actions";
import type { Asset, WorkOrder, WorkOrderMaterial, WorkOrderOperation } from "@/lib/types";
import { TimeTracker } from "@/components/time-tracker";
import { normalizarAtividade } from "@/lib/tarefas-inspecao";
import {
  formatMin,
  somaTotais,
  sessoes,
  totalSessoes,
  pausarSessaoDoUsuario,
  fecharSessoesAbertas,
  type Apontamento,
} from "@/lib/tempo";
import { cn } from "@/lib/utils";
import { useAutosave, textoAutosave } from "@/hooks/use-autosave";


export const Route = createFileRoute("/_authenticated/os/corretiva/$id")({
  head: () => ({ meta: [{ title: "OS Corretiva" }, { name: "description", content: "FQ 117_04 — Ordem de serviço corretiva digital." }] }),
  component: OSCorretiva,
});

const TIPOS_MANUT = ["Corretiva", "Preventiva", "Preditiva", "Emergencial", "Motor", "Hidráulico", "Elétrico", "Estrutura", "Transmissão", "Pneus"];

function OSCorretiva() {
  const { id } = Route.useParams();
  const wo = useAppStore((s) => s.workOrders.find((w) => w.id === id));
  const asset = useAppStore((s) => s.assets.find((a) => a.id === wo?.assetId));
  const updateWorkOrder = useAppStore((s) => s.updateWorkOrder);
  const updateAsset = useAppStore((s) => s.updateAsset);
  const hydrated = useAppStore((s) => s.hydrated);
  if (!wo) {
    if (!hydrated)
      return (
        <div className="p-8 text-center text-sm text-muted-foreground">Carregando…</div>
      );
    throw notFound();
  }

  return <OSCorretivaForm wo={wo} asset={asset} updateWorkOrder={updateWorkOrder} updateAsset={updateAsset} />;
}

function OSCorretivaForm({
  wo,
  asset,
  updateWorkOrder,
  updateAsset,
}: {
  wo: WorkOrder;
  asset?: Asset;
  updateWorkOrder: (id: string, patch: Partial<WorkOrder>) => void;
  updateAsset: (assetId: string, patch: Partial<Asset>) => void;
}) {
  const { roles, profile, user } = useAuth();
  const meuId = user?.id;
  const meuNome = (profile?.nome || "").toUpperCase() || undefined;
  // Só o mecânico alocado, logado na própria conta, pode iniciar/pausar/finalizar.
  const equipeIds = asset?.mecanicoIds ?? (asset?.mecanicoId ? [asset.mecanicoId] : []);
  const podeApontar = !!meuId && equipeIds.includes(meuId);

  const podeEditarMateriais = roles.some((r) => r === "admin" || r === "pcm");
  const [local, setLocal] = useState<WorkOrder>(wo);
  const [opDialog, setOpDialog] = useState(false);
  const [newOp, setNewOp] = useState<WorkOrderOperation>({ id: "", problema: "", causa: "", solucao: "", corrigido: false });

  // Execução do mecânico (armazenado no asset)
  const [tasks, setTasks] = useState(asset?.pendingTasks ?? []);
  const [mecObs, setMecObs] = useState(asset?.mecanicoObs ?? "");
  const [novaTask, setNovaTask] = useState("");
  const tasksDone = tasks.filter((t) => t.done).length;

  /**
   * Mescla a lista da tela com a do banco (Realtime/outros usuários):
   * mantém o que está sendo editado aqui e acrescenta o que veio de fora.
   * Evita que uma gravação concorrente apague tarefas recém-adicionadas.
   */
  const mesclarTasks = (
    locais: NonNullable<Asset["pendingTasks"]>,
    remotas: NonNullable<Asset["pendingTasks"]>,
  ) => {
    const vistos = new Set(locais.map((t) => t.id));
    const textos = new Set(locais.map((t) => t.text));
    return [...locais, ...remotas.filter((r) => !vistos.has(r.id) && !textos.has(r.text))];
  };

  // Traz para a tela tarefas criadas em outra sessão/dispositivo sem perder as daqui.
  const remotasKey = JSON.stringify((asset?.pendingTasks ?? []).map((t) => t.id));
  useEffect(() => {
    const remotas = asset?.pendingTasks ?? [];
    setTasks((atuais) => {
      const mescladas = mesclarTasks(atuais, remotas);
      return mescladas.length === atuais.length ? atuais : mescladas;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remotasKey]);

  const patch = (p: Partial<WorkOrder>) => setLocal((prev) => ({ ...prev, ...p }));

  const toggleTipo = (t: string) => {
    const s = new Set(local.tiposManutencao);
    s.has(t) ? s.delete(t) : s.add(t);
    patch({ tiposManutencao: Array.from(s) });
  };


  const addOp = () => {
    if (!newOp.problema) return;
    patch({
      operations: [
        ...local.operations,
        {
          ...newOp,
          problema: normalizarAtividade(newOp.problema),
          causa: normalizarAtividade(newOp.causa),
          solucao: normalizarAtividade(newOp.solucao),
          id: `op-${Date.now()}`,
        },
      ],
    });
    setNewOp({ id: "", problema: "", causa: "", solucao: "", corrigido: false });
    setOpDialog(false);
    toast.success("Operação adicionada");
  };

  const addMaterial = () => {
    const mat: WorkOrderMaterial = { id: `m-${Date.now()}`, codigoOTM: "", descricao: "", quantidade: 1 };
    patch({ materiais: [...local.materiais, mat] });
  };

  const patchMaterial = (idx: number, p: Partial<WorkOrderMaterial>) => {
    const arr = [...local.materiais];
    arr[idx] = { ...arr[idx], ...p };
    // Autocomplete descrição a partir do código OTM
    if (p.codigoOTM) {
      const match = OTM_CATALOG.find((c) => c.codigo === p.codigoOTM);
      if (match) arr[idx].descricao = match.descricao;
    }
    patch({ materiais: arr });
  };

  const save = (silencioso = false) => {
    updateWorkOrder(local.id, local);
    if (asset) {
      const atual = useAppStore.getState().assets.find((a) => a.id === asset.id);
      const mescladas = mesclarTasks(tasks, atual?.pendingTasks ?? []);
      setTasks(mescladas);
      updateAsset(asset.id, { pendingTasks: mescladas, mecanicoObs: mecObs });
    }
    if (!silencioso) toast.success("Progresso parcial salvo. Você pode continuar depois.");
  };

  // Salvamento automático — nada do que for digitado se perde.
  const { salvoEm, pendente } = useAutosave({ local, tasks, mecObs }, () => save(true));


  const toggleTask = (tid: string) =>
    setTasks((t) => t.map((x) => (x.id === tid ? { ...x, done: !x.done } : x)));
  const addTask = () => {
    const text = normalizarAtividade(novaTask);
    if (!text) return;
    setTasks((t) => [...t, { id: `t-${Date.now()}`, text, done: false }]);
    setNovaTask("");
  };
  const removeTask = (tid: string) => setTasks((t) => t.filter((x) => x.id !== tid));

  // ---- Apontamento de tempo (sessões individuais por mecânico) --------------
  const agora = () => new Date().toISOString();
  /** Pausa apenas as sessões DO USUÁRIO LOGADO nas demais atividades. */
  const pararOutras = (exceto: { tipo: "task" | "op"; id: string }) => {
    setTasks((arr) =>
      arr.map((x) => {
        if (exceto.tipo === "task" && x.id === exceto.id) return x;
        const ss = sessoes(x);
        if (!ss.some((s) => (meuId ? s.userId === meuId : !s.userId) && s.inicio && !s.fim)) return x;
        return { ...x, apontamentos: pausarSessaoDoUsuario(ss, meuId) };
      }),
    );
    setLocal((prev) => ({
      ...prev,
      operations: prev.operations.map((o) => {
        if (exceto.tipo === "op" && o.id === exceto.id) return o;
        const ss = sessoes(o);
        if (!ss.some((s) => (meuId ? s.userId === meuId : !s.userId) && s.inicio && !s.fim)) return o;
        return { ...o, apontamentos: pausarSessaoDoUsuario(ss, meuId) };
      }),
    }));
  };
  const garantirOsIniciada = () =>
    setLocal((prev) => (prev.execInicio ? prev : { ...prev, execInicio: agora() }));

  const iniciouAgora = (list: Apontamento[]) =>
    list.some((s) => (meuId ? s.userId === meuId : !s.userId) && s.inicio && !s.fim);

  const setTaskTempo = (tid: string, list: Apontamento[]) => {
    if (iniciouAgora(list)) {
      pararOutras({ tipo: "task", id: tid });
      garantirOsIniciada();
    }
    setTasks((arr) => arr.map((x) => (x.id === tid ? { ...x, apontamentos: list } : x)));
  };
  const setOpTempo = (oid: string, list: Apontamento[]) => {
    if (iniciouAgora(list)) {
      pararOutras({ tipo: "op", id: oid });
      garantirOsIniciada();
    }
    setLocal((prev) => ({
      ...prev,
      operations: prev.operations.map((o) => (o.id === oid ? { ...o, apontamentos: list } : o)),
    }));
  };
  const osSessoes = () =>
    sessoes({
      apontamentos: local.apontamentos,
      inicio: local.execInicio,
      fim: local.execFim,
      minAcum: local.execMinAcum,
    });
  const setOsTempo = (list: Apontamento[]) => {
    patch({
      apontamentos: list,
      execInicio: local.execInicio || list.find((x) => x.inicio)?.inicio,
      execFim: undefined,
      execMinAcum: undefined,
    });
  };
  const totalAtividades = somaTotais([...tasks, ...local.operations]);




  return (
    <div className="mx-auto max-w-4xl px-3 py-4 pb-36 md:px-6 md:py-8 md:pb-8">
      <BackButton fallbackTo="/planner" className="mb-3" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="font-display text-2xl font-bold md:text-3xl">Ordem de Serviço · Corretiva</h1>
        <Badge variant="outline">{local.numeroSAP}</Badge>
        <Badge>{local.prefixo}</Badge>
        <div className="ml-auto">
          <OsPdfActions wo={local} asset={asset ? { ...asset, pendingTasks: tasks, mecanicoObs: mecObs } : undefined} />
        </div>
      </div>

      {local.pendenciaSupervisor && !local.pendenciaResolvidaEm && (
        <div className="mb-4 rounded-md border-2 border-warning bg-warning/10 p-3 text-sm">
          <div className="mb-1 font-bold uppercase text-warning-foreground">Pendência apontada pelo supervisor</div>
          <p className="whitespace-pre-line">{local.pendenciaSupervisor}</p>
          {local.pendenciaEm && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Devolvida em {new Date(local.pendenciaEm).toLocaleString("pt-BR")}
            </p>
          )}
        </div>
      )}

      {asset && <OSTabs assetId={asset.id} current="corretiva" />}

      <Card className="border-primary/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Apontamento de horas</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <TimeTracker
            apontamentos={osSessoes()}
            userId={meuId}
            nome={meuNome}
            onChange={setOsTempo}
            podeEditar={podeEditarMateriais}
            podeApontar={podeApontar}
            size="lg"
            labelIniciar="Iniciar OS"
            labelFinalizar="Finalizar OS"
          />
          <p className="text-[11px] text-muted-foreground">
            Tempo total da OS (equipe): <strong>{formatMin(totalSessoes(osSessoes()))}</strong> · soma das
            atividades apontadas: <strong>{formatMin(totalAtividades)}</strong>
          </p>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Cabeçalho SAP / PCM</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div><Label>Nº OS (SAP)</Label><Input className="h-11" value={local.numeroSAP} onChange={(e) => patch({ numeroSAP: e.target.value })} /></div>
          <div><Label>Filial</Label><Input className="h-11" value={local.filial} onChange={(e) => patch({ filial: e.target.value })} /></div>
          <div><Label>Solicitante</Label><Input className="h-11" value={local.solicitante} onChange={(e) => patch({ solicitante: e.target.value })} /></div>
          <div><Label>Setor executante</Label><Input className="h-11" value={local.setorExecutante} onChange={(e) => patch({ setorExecutante: e.target.value })} /></div>
          <div><Label>Centro de custo</Label><Input className="h-11" value={local.centroCusto} onChange={(e) => patch({ centroCusto: e.target.value })} /></div>
          <div className="md:col-span-2">
            <Label>Nº Reserva de Material (Almox)</Label>
            <Input
              className="h-11"
              placeholder="Ex.: 4500123456"
              value={local.reservaMaterial ?? ""}
              onChange={(e) => patch({ reservaMaterial: e.target.value })}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">Use este nº para retirar as peças no almoxarifado.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Tipo de manutenção</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
            {TIPOS_MANUT.map((t) => {
              const active = local.tiposManutencao.includes(t);
              return (
                <label key={t} className={cn("tap-target flex items-center gap-2 rounded-md border-2 p-2 text-sm cursor-pointer", active ? "border-primary bg-primary/10 font-semibold" : "border-border")}>
                  <Checkbox checked={active} onCheckedChange={() => toggleTipo(t)} />
                  <span>{t}</span>
                </label>
              );
            })}
          </div>
        </CardContent>
      </Card>




      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm">Operações registradas ({local.operations.length})</CardTitle>
          <Dialog open={opDialog} onOpenChange={setOpDialog}>
            <DialogTrigger asChild>
              <Button size="lg" className="tap-target gap-2"><Plus className="h-4 w-4" /> Adicionar operação</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova operação</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div><Label>Problema</Label><Textarea rows={2} value={newOp.problema} onChange={(e) => setNewOp({ ...newOp, problema: e.target.value })} /></div>
                <div><Label>Causa</Label><Textarea rows={2} value={newOp.causa} onChange={(e) => setNewOp({ ...newOp, causa: e.target.value })} /></div>
                <div><Label>Solução</Label><Textarea rows={2} value={newOp.solucao} onChange={(e) => setNewOp({ ...newOp, solucao: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={addOp}>Adicionar</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="grid gap-2">
          {local.operations.map((o, i) => (
            <div key={o.id} className="rounded-md border p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold">#{i + 1} · {o.problema}</div>
                <button
                  onClick={() => patch({ operations: local.operations.filter((x) => x.id !== o.id) })}
                  className="text-muted-foreground hover:text-destructive"
                ><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="mt-1 grid gap-1 text-xs text-muted-foreground">
                <div><span className="font-semibold">Causa:</span> {o.causa || "—"}</div>
                <div><span className="font-semibold">Solução:</span> {o.solucao || "—"}</div>
              </div>
              <TimeTracker
                className="mt-2"
                apontamentos={sessoes(o)}
                userId={meuId}
                nome={meuNome}
                onChange={(list) => setOpTempo(o.id, list)}
                podeEditar={podeEditarMateriais}
                podeApontar={podeApontar}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Material requisitado — somente PCM/Admin edita */}
      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm">
            Material requisitado ({local.materiais.length})
            {local.materiais.length > 0 && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {local.materiais.filter((m) => m.liberado).length} liberado(s) no almox
              </span>
            )}
            {!podeEditarMateriais && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">· somente leitura (PCM gerencia)</span>
            )}
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="default" className="tap-target gap-2 bg-warning text-warning-foreground hover:bg-warning/90" onClick={() => window.open(PARTS_APP_URL, "_blank", "noopener,noreferrer")}>
              <PackagePlus className="h-4 w-4" /> Solicitar peça <ExternalLink className="h-3.5 w-3.5 opacity-70" />
            </Button>
            {podeEditarMateriais && (
              <Button size="sm" variant="outline" className="tap-target gap-2" onClick={addMaterial}><Plus className="h-4 w-4" /> Item</Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {local.materiais.length === 0 && (
            <div className="text-sm text-muted-foreground">
              {podeEditarMateriais ? "Nenhum material requisitado." : "Nenhum material requisitado pelo PCM."}
            </div>
          )}

          <div className="grid gap-3">
            {local.materiais.map((m, i) =>
              podeEditarMateriais ? (
                <div key={m.id} className="grid gap-2 rounded-md border p-3">
                  <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_5rem_minmax(0,1fr)]">
                    <div className="grid gap-1">
                      <Label className="text-[11px] uppercase text-muted-foreground">Código</Label>
                      <Input className="h-11" placeholder="Código OTM" list="otm-list" value={m.codigoOTM} onChange={(e) => patchMaterial(i, { codigoOTM: e.target.value })} />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[11px] uppercase text-muted-foreground">Descrição do material</Label>
                      <Input className="h-11" placeholder="Descrição" value={m.descricao} onChange={(e) => patchMaterial(i, { descricao: e.target.value })} />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[11px] uppercase text-muted-foreground">Qtd</Label>
                      <Input className="h-11" type="number" min={0} value={m.quantidade} onChange={(e) => patchMaterial(i, { quantidade: Number(e.target.value) })} />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[11px] uppercase text-muted-foreground">Reserva</Label>
                      <Input className="h-11" placeholder="Nº da reserva" value={m.reserva ?? ""} onChange={(e) => patchMaterial(i, { reserva: e.target.value })} />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      type="button"
                      className={cn(
                        "tap-target gap-2 font-semibold",
                        m.liberado ? "bg-success text-success-foreground hover:bg-success/90" : "bg-warning text-warning-foreground hover:bg-warning/90",
                      )}
                      onClick={() =>
                        patchMaterial(i, {
                          liberado: !m.liberado,
                          liberadoEm: !m.liberado ? new Date().toISOString() : undefined,
                        })
                      }
                    >
                      {m.liberado ? <Check className="h-4 w-4" /> : <PackagePlus className="h-4 w-4" />}
                      {m.liberado ? "Liberado para retirar no almox" : "Aguardando liberação do almox"}
                    </Button>
                    {m.liberado && m.liberadoEm && (
                      <span className="text-[11px] text-muted-foreground">
                        desde {new Date(m.liberadoEm).toLocaleString("pt-BR")}
                      </span>
                    )}
                    <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => patch({ materiais: local.materiais.filter((x) => x.id !== m.id) })}>
                      <Trash2 className="mr-2 h-4 w-4" /> Remover
                    </Button>
                  </div>
                </div>
              ) : (
                <div key={m.id} className="grid gap-1 rounded-md border p-3 text-sm">
                  <div className="font-semibold break-words">{m.descricao || "Material"}</div>
                  <div className="text-xs text-muted-foreground break-words">
                    Cód.: {m.codigoOTM || "—"} · Qtd: {m.quantidade} · Reserva: {m.reserva || "—"}
                  </div>
                  <div
                    className={cn(
                      "mt-1 inline-flex w-fit items-center gap-2 rounded-md px-2 py-1 text-xs font-semibold",
                      m.liberado ? "bg-success text-success-foreground" : "bg-warning text-warning-foreground",
                    )}
                  >
                    {m.liberado ? <Check className="h-3.5 w-3.5" /> : <PackagePlus className="h-3.5 w-3.5" />}
                    {m.liberado ? "Liberado para retirar no almox" : "Aguardando liberação do almox"}
                  </div>
                </div>
              ),
            )}
          </div>
          <datalist id="otm-list">
            {OTM_CATALOG.map((o) => <option key={o.codigo} value={o.codigo}>{o.descricao}</option>)}
          </datalist>
        </CardContent>
      </Card>



      {/* Execução do mecânico */}
      <Card className="mt-4 border-primary/30">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Execução do mecânico — o que foi feito ({tasksDone}/{tasks.length})</CardTitle>
            {tasks.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {Math.round((tasksDone / tasks.length) * 100)}%
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-2">
          {tasks.length === 0 && (
            <p className="text-xs italic text-muted-foreground">Adicione abaixo as tarefas que serão executadas.</p>
          )}
          {tasks.map((t) => (
            <div key={t.id} className="grid gap-2 rounded-md border bg-card p-3">
              <div className="flex items-start gap-2">
                <Checkbox checked={t.done} onCheckedChange={() => toggleTask(t.id)} className="tap-target mt-0.5 shrink-0" />
                <span className={t.done ? "min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-snug text-muted-foreground line-through" : "min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-snug"}>{t.text}</span>
                <button onClick={() => removeTask(t.id)} className="shrink-0 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <TimeTracker
                apontamentos={sessoes(t)}
                userId={meuId}
                nome={meuNome}
                onChange={(list) => setTaskTempo(t.id, list)}
                podeEditar={podeEditarMateriais}
                podeApontar={podeApontar}
              />
            </div>
          ))}

          <div className="mt-1 flex gap-2">
            <Input
              value={novaTask}
              onChange={(e) => setNovaTask(e.target.value)}
              placeholder="Adicionar tarefa (ex.: troca de filtro de ar)"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTask(); } }}
              className="h-11"
            />
            <Button onClick={addTask} className="tap-target gap-1"><Plus className="h-4 w-4" /> Add</Button>
          </div>
          <div className="mt-2 grid gap-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Observações do mecânico</Label>
            <Textarea
              rows={4}
              value={mecObs}
              onChange={(e) => setMecObs(e.target.value)}
              placeholder="Causa, ações executadas, pendências, peças aguardando, etc."
            />
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Observações gerais da OS</CardTitle></CardHeader>
        <CardContent>
          <Textarea rows={3} value={local.observacoes ?? ""} onChange={(e) => patch({ observacoes: e.target.value })} placeholder="Pendências, observações e informações complementares." />
        </CardContent>
      </Card>

      {/* Assinaturas */}
      <Card className="mt-4">
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Signature className="h-4 w-4" /> Assinaturas</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Mecânico executante</Label>
            {local.assinaturaTecnico ? (
              <SignedBlock
                dataUrl={local.assinaturaTecnico}
                nome={local.assinaturaTecnicoNome}
                cargo={local.assinaturaTecnicoCargo}
                em={local.assinaturaTecnicoEm}
              />
            ) : (
              <SignaturePad
                storageKey={asset?.mecanicoId ? `mecanico:${asset.mecanicoId}` : "mecanico:demo"}
                label="Mecânico"
                applyLabel="Assinar como mecânico"
                onApply={(sig) => {
                  const now = new Date().toISOString();
                  const patched = {
                    assinaturaTecnico: sig.dataUrl,
                    assinaturaTecnicoNome: sig.nome,
                    assinaturaTecnicoCargo: sig.cargo,
                    assinaturaTecnicoEm: now,
                  };
                  patch(patched);
                  updateWorkOrder(local.id, patched);
                }}
              />
            )}
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Supervisor</Label>
            {local.assinaturaSupervisor ? (
              <SignedBlock
                dataUrl={local.assinaturaSupervisor}
                nome={local.assinaturaSupervisorNome}
                cargo={local.assinaturaSupervisorCargo}
                em={local.assinaturaSupervisorEm}
              />
            ) : local.status === "aguardando_supervisor" ? (
              <SignaturePad
                storageKey="supervisor:global"
                label="Supervisor"
                applyLabel="Aprovar e assinar"
                onApply={(sig) => {
                  const now = new Date().toISOString();
                  const patched = {
                    assinaturaSupervisor: sig.dataUrl,
                    assinaturaSupervisorNome: sig.nome,
                    assinaturaSupervisorCargo: sig.cargo,
                    assinaturaSupervisorEm: now,
                  };
                  patch(patched);
                  updateWorkOrder(local.id, patched);
                  toast.success("Assinatura registrada — agora toque em “Finalizar OS” abaixo para enviar ao PCM.");
                }}

              />
            ) : (
              <div className="rounded-md border-2 border-dashed p-4 text-center text-xs text-muted-foreground">
                Aguardando o mecânico concluir e assinar
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Status banner */}
      {local.status === "aguardando_supervisor" && (
        <div className="mt-3 rounded-md border border-info/40 bg-info/10 p-3 text-xs text-info">
          {local.assinaturaSupervisor
            ? "Supervisor assinou — toque em “Finalizar OS” para enviar ao PCM encerrar no SAP."
            : "Aguardando assinatura do supervisor."}
        </div>

      )}
      {local.status === "aguardando_pcm_encerramento" && (
        <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning-foreground">
          Aprovado pelo supervisor — PCM deve encerrar no SAP.
        </div>
      )}
      {local.status === "fechada" && (
        <div className="mt-3 rounded-md border border-success/40 bg-success/10 p-3 text-xs text-success">
          OS encerrada no SAP.
        </div>
      )}

      {/* Sticky footer save */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t bg-background/95 p-3 backdrop-blur md:bottom-0 md:left-60">
        <div className="mx-auto max-w-4xl">
        <p className="mb-1 text-center text-[11px] text-muted-foreground">{textoAutosave(salvoEm, pendente)}</p>
        <div className="flex items-center gap-2">
          <Button onClick={() => save()} size="lg" variant="outline" className="tap-target flex-1 gap-2">
            <Save className="h-4 w-4" /> Salvar
          </Button>
          <Button
            onClick={() => {
              // Etapa do supervisor: já assinou → finaliza e envia ao PCM
              if (local.status === "aguardando_supervisor" && local.assinaturaSupervisor) {
                save();
                const patched = { status: "aguardando_pcm_encerramento" as const };
                patch(patched);
                updateWorkOrder(local.id, patched);
                toast.success("OS finalizada pelo supervisor — enviada ao PCM para encerramento no SAP.");
                return;
              }
              if (!local.assinaturaTecnico) {
                toast.error("Assine como mecânico antes de finalizar.");
                return;
              }
              const pendentes = tasks.length - tasksDone;
              if (
                pendentes > 0 &&
                !window.confirm(
                  `Ainda há ${pendentes} atividade(s) não concluída(s). Finalizar mesmo assim?`,
                )
              ) {
                return;
              }
              const agoraIso = new Date().toISOString();
              const tasksFechadas = tasks.map((t) => ({
                ...t,
                apontamentos: fecharSessoesAbertas(sessoes(t), agoraIso),
              }));
              setTasks(tasksFechadas);
              const agora = agoraIso;
              const patchClose: Partial<WorkOrder> = {
                ...local,
                apontamentos: fecharSessoesAbertas(osSessoes(), agoraIso),
                operations: local.operations.map((o) => ({
                  ...o,
                  apontamentos: fecharSessoesAbertas(sessoes(o), agoraIso),
                })),
                status: "aguardando_supervisor",
                execInicio: local.execInicio || agora,
                execFim: local.execFim || agora,
                horarioInicioSap: local.horarioInicioSap || agora,
                horarioFimSap: local.horarioFimSap || agora,
              };

              if (local.pendenciaSupervisor && !local.pendenciaResolvidaEm) {
                patchClose.pendenciaResolvidaEm = new Date().toISOString();
              }
              updateWorkOrder(local.id, patchClose);
              if (asset) updateAsset(asset.id, { pendingTasks: tasksFechadas, mecanicoObs: mecObs, column: "teste" });
              toast.success(
                pendentes > 0
                  ? `OS finalizada com ${pendentes} atividade(s) pendente(s) — enviada ao supervisor.`
                  : "OS finalizada — enviada ao supervisor.",
              );
            }}
            disabled={
              (local.status === "aguardando_supervisor" && !local.assinaturaSupervisor) ||
              local.status === "aguardando_pcm_encerramento" ||
              local.status === "fechada"
            }
            size="lg"
            className="tap-target flex-1 gap-2"
          >
            <Check className="h-4 w-4" />
            {local.status === "aguardando_supervisor" && local.assinaturaSupervisor
              ? "Finalizar OS e enviar ao PCM"
              : "Finalizar OS"}
          </Button>

        </div>
        </div>
      </div>
    </div>


  );
}
