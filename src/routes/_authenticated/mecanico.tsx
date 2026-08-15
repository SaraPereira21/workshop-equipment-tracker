import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Wrench, Clock, CheckCircle2, AlertTriangle, PlayCircle, ClipboardList, Camera, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isLiberado } from "@/lib/liberado";
import { doAtivo, umaOsPorTipo } from "@/lib/match-ativo";
import { useAppStore } from "@/lib/store";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { Priority, KanbanColumn, Asset, WorkOrder, WorkOrderType } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/mecanico")({
  head: () => ({
    meta: [
      { title: "Mecânico — Minhas Ordens" },
      { name: "description", content: "Equipamentos atribuídos ao mecânico e execução de ordens de serviço." },
    ],
  }),
  component: MecanicoPage,
});

const PRIORITY_STYLE: Record<Priority, string> = {
  critica: "bg-destructive/15 text-destructive border-destructive/30",
  alta: "bg-warning/15 text-warning border-warning/30",
  media: "bg-info/15 text-info border-info/30",
  baixa: "bg-muted text-muted-foreground border-border",
};

function osNumberFor(asset: Asset, tipo: WorkOrderType) {
  return tipo === "preventiva" ? asset.sapOsPreventiva : asset.sapOsCorretiva;
}

function buildWorkOrderFromAsset(asset: Asset, tipo: WorkOrderType): WorkOrder {
  const now = new Date().toISOString();
  const numeroSAP = osNumberFor(asset, tipo)?.trim() || `${tipo === "preventiva" ? "PREV" : "CORR"}-${asset.prefixo}`;
  return {
    id: `wo-${tipo === "preventiva" ? "prev" : "corr"}-${asset.id}`,
    numeroSAP,
    tipo,
    assetId: asset.id,
    prefixo: asset.prefixo,
    filial: "Matriz",
    solicitante: "PCM",
    setorExecutante: "Manutenção",
    centroCusto: "",
    tiposManutencao: [tipo === "preventiva" ? "Preventiva" : "Corretiva"],
    operations: [],
    falhasHerdadas:
      tipo === "corretiva"
        ? (asset.pendingTasks ?? []).map((t) => ({ descricao: t.text, corrigido: t.done }))
        : [],
    materiais: [],
    executores: [],
    observacoes: asset.mecanicoObs ?? asset.pcmObs ?? "",
    pmpPlanoLabel: tipo === "preventiva" ? `PMP ${asset.proximoAlvoPMP}h` : undefined,
    pmpIntervaloHoras: tipo === "preventiva" ? asset.proximoAlvoPMP : undefined,
    status: "aberta",
    createdAt: now,
  };
}

function MecanicoPage() {
  const navigate = useNavigate();
  const mechanics = useAppStore((s) => s.mechanics);
  const assets = useAppStore((s) => s.assets);
  const inspections = useAppStore((s) => s.inspections);
  const workOrders = useAppStore((s) => s.workOrders);
  const updateAsset = useAppStore((s) => s.updateAsset);
  const addWorkOrder = useAppStore((s) => s.addWorkOrder);
  const updateWorkOrder = useAppStore((s) => s.updateWorkOrder);
  const hydrated = useAppStore((s) => s.hydrated);
  const { user, profile, roles } = useAuth();

  const normalizarNome = (nome?: string | null) =>
    (nome ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");

  const loggedMechanicIds = useMemo(() => {
    if (!user) return [];
    const ids = new Set<string>([user.id]);
    const nomeUsuario = normalizarNome(profile?.nome ?? user.user_metadata?.nome ?? user.email?.split("@")[0]);
    for (const m of mechanics) {
      const nomeMecanico = normalizarNome(m.nome);
      if (
        m.id === user.id ||
        (nomeUsuario && (nomeMecanico === nomeUsuario || nomeMecanico.startsWith(nomeUsuario) || nomeUsuario.startsWith(nomeMecanico)))
      ) {
        ids.add(m.id);
      }
    }
    return Array.from(ids);
  }, [mechanics, profile?.nome, user]);

  // O mecânico logado já entra na própria tela; gestores podem trocar de pessoa.
  const souMecanico = loggedMechanicIds.length > 0 || roles.includes("mecanico");
  const podeTrocar = !souMecanico || roles.some((r: AppRole) => r !== "mecanico");

  const [mecanicoManual, setMecanicoManual] = useState<string | null>(null);
  const mecanicoId = mecanicoManual ?? (souMecanico ? loggedMechanicIds[0] ?? user?.id ?? "" : mechanics[0]?.id ?? "");
  const setMecanicoId = (v: string) => setMecanicoManual(v);
  const currentMec = mechanics.find((m) => m.id === mecanicoId || loggedMechanicIds.includes(m.id));


  const isActionable = (status: string) =>
    status === "aberta" || status === "em_execucao";

  const getVisibleOsList = (asset: Asset) => {
    // A preventiva só aparece para o mecânico depois que o PCM libera a OS SAP preventiva.
    const prevLiberada = asset.preventivaLiberada === true;
    const existing = umaOsPorTipo(
      asset,
      workOrders.filter(
        (w) =>
          doAtivo(asset, w) &&
          isActionable(w.status) &&
          (w.tipo !== "preventiva" || prevLiberada),
      ),
    );

    const tiposExistentes = new Set(existing.map((w) => w.tipo));
    const fallback: WorkOrder[] = [];
    if (asset.sapOsCorretiva && !tiposExistentes.has("corretiva")) {
      fallback.push(buildWorkOrderFromAsset(asset, "corretiva"));
    }
    if (prevLiberada && !tiposExistentes.has("preventiva")) {
      fallback.push(buildWorkOrderFromAsset(asset, "preventiva"));
    }
    return [...existing, ...fallback];
  };

  const persistAndOpenOs = (asset: Asset, os: WorkOrder) => {
    const exists = workOrders.some((w) => w.id === os.id);
    const now = new Date().toISOString();
    const patch: Partial<WorkOrder> = {
      status: "em_execucao",
      horarioInicioSap: os.horarioInicioSap || now,
    };
    if (exists) {
      updateWorkOrder(os.id, patch);
    } else {
      addWorkOrder({ ...os, ...patch });
    }
    updateAsset(asset.id, { status: "em_manutencao", column: "manutencao" as KanbanColumn });
    navigate({
      to: os.tipo === "preventiva" ? "/os/preventiva/$id" : "/os/corretiva/$id",
      params: { id: os.id },
    });
  };

  const myAssets = useMemo(
    () => {
      const idsPermitidos = new Set(mecanicoManual ? [mecanicoManual] : souMecanico ? loggedMechanicIds : [mecanicoId]);
      return assets.filter((a) => {
        if (isLiberado(a)) return false;
        const equipe = a.mecanicoIds ?? (a.mecanicoId ? [a.mecanicoId] : []);
        if (!equipe.some((id) => idsPermitidos.has(id))) return false;
        const osDoAsset = workOrders.filter((w) => doAtivo(a, w));
        // Se a OS SAP já está no card, o mecânico pode abrir mesmo que a WorkOrder ainda não tenha sido materializada.
        const temOsNoCard = !!a.sapOsCorretiva || !!a.sapOsPreventiva;
        if (osDoAsset.length === 0) return true;
        // Só se ainda houver algo pendente pro mecânico agir
        return osDoAsset.some((w) => isActionable(w.status)) || (temOsNoCard && ["atribu_do", "manutencao", "execucao_liberada"].includes(a.column));
      });
    },
    [assets, loggedMechanicIds, mecanicoId, mecanicoManual, souMecanico, workOrders],
  );

  const emAndamento = myAssets.filter((a) => a.column === "manutencao");
  const emTeste = myAssets.filter((a) => a.column === "teste");

  const iniciarOS = (asset: Asset) => {
    const now = new Date().toISOString();
    const osList = getVisibleOsList(asset);
    if (osList.length === 0) {
      updateAsset(asset.id, { status: "em_manutencao", column: "manutencao" as KanbanColumn });
      toast.error("Nenhuma OS SAP liberada para este equipamento.");
      return;
    }

    const started = osList.map((os) => ({
      ...os,
      status: "em_execucao" as const,
      horarioInicioSap: os.horarioInicioSap || now,
    }));
    for (const os of started) {
      if (workOrders.some((w) => w.id === os.id)) updateWorkOrder(os.id, os);
      else addWorkOrder(os);
    }
    updateAsset(asset.id, { status: "em_manutencao", column: "manutencao" as KanbanColumn });
    const first = started.find((os) => os.tipo === "corretiva") ?? started[0];
    toast.success("OS iniciada. Abrindo apontamento do mecânico.");
    navigate({
      to: first.tipo === "preventiva" ? "/os/preventiva/$id" : "/os/corretiva/$id",
      params: { id: first.id },
    });
  };


  const enviarTeste = (assetId: string) => {
    updateAsset(assetId, { column: "teste" });
    toast.success("Equipamento enviado para Teste / Liberação.");
  };

  const devolverAoSupervisor = (assetId: string, motivo: string) => {
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return;
    const now = new Date().toISOString();
    const msg = {
      id: crypto.randomUUID(),
      autor: currentMec?.nome ?? "Mecânico",
      autorCargo: currentMec?.especialidade ?? "Mecânico",
      texto: `↩️ Devolvido ao supervisor. Motivo: ${motivo}`,
      createdAt: now,
    };
    updateAsset(assetId, {
      mecanicoId: undefined,
      column: "mdo" as KanbanColumn,
      status: "operando",
      chatMessages: [...(asset.chatMessages ?? []), msg],
    });
    toast.success("Máquina devolvida ao supervisor.");
  };

  return (
    <div className="mx-auto max-w-5xl px-3 py-4 pb-24 md:px-6 md:py-8">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold md:text-3xl">Minhas Ordens</h1>
          <p className="text-sm text-muted-foreground">
            {currentMec ? `${currentMec.nome} — equipamentos atribuídos a você.` : "Equipamentos atribuídos pelo supervisor."}
          </p>
        </div>
        {podeTrocar && (
          <div className="min-w-[220px]">
            <label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">
              Mecânico
            </label>
            <Select value={mecanicoId} onValueChange={setMecanicoId}>
              <SelectTrigger className="tap-target">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {mechanics.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.nome} — {m.especialidade}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground md:text-xs">
              <ClipboardList className="h-3.5 w-3.5" /> Atribuídos
            </div>
            <div className="font-display text-2xl font-bold">{myAssets.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground md:text-xs">
              <Wrench className="h-3.5 w-3.5" /> Em execução
            </div>
            <div className="font-display text-2xl font-bold">{emAndamento.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground md:text-xs">
              <Clock className="h-3.5 w-3.5" /> Carga (h)
            </div>
            <div className="font-display text-2xl font-bold">
              {currentMec?.cargaHoras.toFixed(1) ?? "0.0"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Assets */}
      <div className="mt-6 grid gap-3">
        {myAssets.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              {!hydrated ? "Carregando suas OS…" : "Nenhum equipamento atribuído a você no momento."}
              <br />
              {hydrated && "Aguarde o supervisor direcionar uma ordem da triagem."}
            </CardContent>
          </Card>
        )}

        {myAssets.map((a) => {
          const ultimaInspecao = inspections.find((i) => doAtivo(a, i));
          const osList = getVisibleOsList(a);
          const pendencias = osList.filter((w) => w.pendenciaSupervisor);
          const falhas = ultimaInspecao?.falhas ?? [];
          const tasksTotal = a.pendingTasks?.length ?? 0;
          const tasksDone = a.pendingTasks?.filter((t) => t.done).length ?? 0;

          return (
            <Card key={a.id} className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                      <span className="font-display font-bold">{a.prefixo}</span>
                      <Badge
                        variant="outline"
                        className={cn("border text-[10px] uppercase", PRIORITY_STYLE[a.priority])}
                      >
                        {a.priority}
                      </Badge>
                    </CardTitle>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {a.marca} {a.modelo} · {a.horimetroAtual}h
                      {a.contrato ? ` · ${a.contrato}` : ""}
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className="text-[10px] uppercase tracking-wider"
                  >
                    {a.column === "atribu_do"
                      ? "Alocado — aguardando início"
                      : a.column === "manutencao"
                      ? "Em execução"
                      : a.column === "pcm"
                      ? "Fila PCM — você pode continuar"
                      : a.column === "aguardando_saida" || a.column === "teste"
                      ? "Inspeção de saída — OS continua com você"
                      : a.column.replace(/_/g, " ")}
                  </Badge>


                </div>
              </CardHeader>
              <CardContent className="grid gap-3">
                {(a.column === "aguardando_saida" || a.column === "teste" || a.reinspecaoSolicitada) &&
                  osList.some((w) => isActionable(w.status)) && (
                    <div className="rounded-md border-2 border-info bg-info/10 p-3 text-xs">
                      <div className="mb-1 flex items-center gap-1 font-bold uppercase">
                        <ClipboardList className="h-4 w-4" /> Inspeção de saída antecipada
                      </div>
                      O inspetor já está adiantando o check de saída, mas a(s) OS continua(m) aberta(s) com você —
                      finalize os apontamentos e encerre a OS normalmente.
                    </div>
                  )}

                {pendencias.length > 0 && (
                  <div className="rounded-md border-2 border-warning bg-warning/10 p-3">
                    <div className="mb-1 flex items-center gap-1 text-xs font-bold uppercase text-warning-foreground">
                      <AlertTriangle className="h-4 w-4" /> Devolvido pelo supervisor
                    </div>
                    {pendencias.map((w) => (
                      <div key={w.id} className="text-xs">
                        <span className="font-semibold">OS {w.numeroSAP}:</span>{" "}
                        <span className="whitespace-pre-line">{w.pendenciaSupervisor}</span>
                      </div>
                    ))}
                    <p className="mt-1 text-[10px] italic text-muted-foreground">
                      Resolva as pendências, re-assine e finalize novamente.
                    </p>
                  </div>
                )}
                {a.descricao && (
                  <div className="rounded-md bg-muted/40 p-2 text-xs">{a.descricao}</div>
                )}

                {a.tags && a.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {a.tags.map((t) => (
                      <Badge key={t} variant="outline" className="text-[10px]">
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}

                {falhas.length > 0 && (
                  <div>
                    <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Falhas apontadas na inspeção ({falhas.length})
                    </div>
                    <ul className="grid gap-1 text-xs text-muted-foreground">
                      {falhas.slice(0, 5).map((f, i) => (
                        <li key={i} className="rounded border border-destructive/20 bg-destructive/5 px-2 py-1">
                          {f}
                        </li>
                      ))}
                      {falhas.length > 5 && (
                        <li className="text-[11px] italic">+ {falhas.length - 5} outras…</li>
                      )}
                    </ul>
                  </div>
                )}

                {tasksTotal > 0 && (
                  <div className="text-xs text-muted-foreground">
                    <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                    Tarefas: <strong>{tasksDone}/{tasksTotal}</strong>
                  </div>
                )}

                {osList.length === 0 ? (
                  <div className="rounded-md border border-dashed p-3 text-xs italic text-muted-foreground">
                    OS ainda não liberada pelo PCM.
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {osList.map((os) => (
                      <Button
                        key={os.id}
                        size="lg"
                        variant={os.tipo === "preventiva" ? "secondary" : "default"}
                        className="tap-target justify-start gap-2"
                        onClick={() => persistAndOpenOs(a, os)}
                      >
                        <Wrench className="h-4 w-4" />
                        <span className="flex flex-col items-start leading-tight">
                          <span className="text-[10px] uppercase opacity-80">
                            {os.tipo === "preventiva" ? "Preventiva" : "Corretiva"}
                          </span>
                          <span className="font-semibold">OS {os.numeroSAP}</span>
                        </span>
                      </Button>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button size="sm" variant="outline" asChild className="tap-target gap-1">
                    <Link to="/planner/$prefixo" params={{ prefixo: a.prefixo }}>
                      <ClipboardList className="h-4 w-4" /> Abrir card
                    </Link>
                  </Button>

                  {a.column !== "manutencao" && (
                    <Button
                      size="sm"
                      onClick={() => iniciarOS(a)}
                      className="tap-target gap-1"
                    >
                      <PlayCircle className="h-4 w-4" />
                      {a.column === "atribu_do" ? "Iniciar OS" : "Continuar OS"}
                    </Button>
                  )}

                  <DevolverDialog
                    obrigatorio={a.column === "manutencao"}
                    onConfirm={(motivo) => devolverAoSupervisor(a.id, motivo)}
                  />


                  <Button size="sm" variant="ghost" className="tap-target gap-1">
                    <Camera className="h-4 w-4" /> Fotos
                  </Button>

                  {a.column === "manutencao" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="tap-target ml-auto"
                      onClick={() => enviarTeste(a.id)}
                    >
                      Enviar p/ teste
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}

      </div>

      {emTeste.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-2 font-display text-lg font-bold">Em teste / liberação</h2>
          <p className="text-xs text-muted-foreground">
            {emTeste.length} equipamento(s) aguardando validação após reparo.
          </p>
        </div>
      )}
    </div>
  );
}

function DevolverDialog({
  obrigatorio,
  onConfirm,
}: {
  obrigatorio: boolean;
  onConfirm: (motivo: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");

  const confirmar = () => {
    if (obrigatorio && !motivo.trim()) {
      toast.error("Descreva o motivo da devolução.");
      return;
    }
    onConfirm(motivo.trim() || "Sem motivo informado");
    setOpen(false);
    setMotivo("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="tap-target gap-1 border-warning/60 text-warning-foreground hover:bg-warning/10"
        >
          <Undo2 className="h-4 w-4" /> Devolver ao supervisor
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Devolver máquina ao supervisor</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          <Label>
            Motivo {obrigatorio && <span className="text-destructive">*</span>}
          </Label>
          <Textarea
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder={
              obrigatorio
                ? "Ex.: emergência em outra máquina, fim de turno…"
                : "Opcional — ex.: não vou conseguir pegar hoje"
            }
          />
          <p className="text-[11px] text-muted-foreground">
            A máquina volta para <b>Aguardando MO</b> e o motivo fica registrado no chat da máquina.
          </p>
        </div>
        <DialogFooter>
          <Button onClick={confirmar} className="gap-1">
            <Undo2 className="h-4 w-4" /> Confirmar devolução
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
