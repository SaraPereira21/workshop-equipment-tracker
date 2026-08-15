import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { BackButton } from "@/components/back-button";
import { useState } from "react";
import { ArrowLeft, Save, CheckCircle2, Camera } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useAppStore } from "@/lib/store";
import { OSTabs } from "@/components/os-tabs";
import { SignaturePad, SignedBlock } from "@/components/signature-pad";
import { OsPdfActions } from "@/components/os-pdf-actions";
import type { Asset, WorkOrder } from "@/lib/types";
import { TimeTracker } from "@/components/time-tracker";
import { useAuth } from "@/hooks/use-auth";
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


export const Route = createFileRoute("/_authenticated/os/preventiva/$id")({
  head: () => ({ meta: [{ title: "OS Preventiva (PMP)" }, { name: "description", content: "Plano de Manutenção Preventiva com assinatura digital." }] }),
  component: OSPreventiva,
});

const DEFAULT_PMP = (intervalo: string) => [
  { id: "1", label: "Troca de óleo do motor", intervalo, done: false },
  { id: "2", label: "Substituição de filtros (óleo, combustível, ar)", intervalo, done: false },
  { id: "3", label: "Verificação de níveis (arrefecimento, hidráulico, transmissão)", intervalo, done: false },
  { id: "4", label: "Inspeção de correias e mangueiras", intervalo, done: false },
  { id: "5", label: "Análise de folgas em pinos e articulações", intervalo, done: false },
  { id: "6", label: "Verificação de sistema elétrico e bateria", intervalo, done: false },
  { id: "7", label: "Teste de freios e freio de serviço", intervalo, done: false },
  { id: "8", label: "Lubrificação geral (graxeiros)", intervalo, done: false },
  { id: "9", label: "Aperto de parafusos estruturais (torque)", intervalo, done: false },
  { id: "10", label: "Teste operacional final", intervalo, done: false },
];

function OSPreventiva() {
  const { id } = Route.useParams();
  const wo = useAppStore((s) => s.workOrders.find((w) => w.id === id));
  const asset = useAppStore((s) => s.assets.find((a) => a.id === wo?.assetId));
  const updateWorkOrder = useAppStore((s) => s.updateWorkOrder);
  const hydrated = useAppStore((s) => s.hydrated);
  if (!wo) {
    if (!hydrated)
      return (
        <div className="p-8 text-center text-sm text-muted-foreground">Carregando…</div>
      );
    throw notFound();
  }

  // Trava de segurança: a OS preventiva só pode ser aberta depois que o PCM libera.
  if (asset && asset.preventivaLiberada !== true) {
    return (
      <div className="mx-auto max-w-lg p-6 text-center">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preventiva ainda não liberada</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-muted-foreground">
            <p>
              A preventiva de <strong>{asset.prefixo}</strong> ainda não foi liberada pelo PCM.
              Assim que a OS preventiva do SAP for lançada, ela aparece aqui.
            </p>
            <Button asChild variant="outline" className="gap-1">
              <Link to="/mecanico">
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <OSPreventivaForm wo={wo} asset={asset} updateWorkOrder={updateWorkOrder} />;
}


function OSPreventivaForm({
  wo,
  asset,
  updateWorkOrder,
}: {
  wo: WorkOrder;
  asset?: Asset;
  updateWorkOrder: (id: string, patch: Partial<WorkOrder>) => void;
}) {

  const intervalo =
    wo.pmpPlanoLabel ||
    Array.from(new Set((wo.pmpChecklist ?? []).map((i) => i.intervalo).filter(Boolean))).join(" + ") ||
    (asset ? `PMP ${asset.proximoAlvoPMP}h` : "PMP");
  const [local, setLocal] = useState<WorkOrder>({
    ...wo,
    pmpChecklist: wo.pmpChecklist && wo.pmpChecklist.length > 0 ? wo.pmpChecklist : DEFAULT_PMP(intervalo),
  });

  const patch = (p: Partial<WorkOrder>) => setLocal((prev) => ({ ...prev, ...p }));

  const items = local.pmpChecklist ?? [];
  const doneCount = items.filter((i) => i.done || i.na).length;
  const naCount = items.filter((i) => i.na).length;
  const progress = items.length ? Math.round((doneCount / items.length) * 100) : 0;

  const toggleItem = (i: number) => {
    const arr = [...items];
    if (arr[i].na) return;
    arr[i] = { ...arr[i], done: !arr[i].done };
    patch({ pmpChecklist: arr });
  };

  const toggleNa = (i: number) => {
    const arr = [...items];
    const na = !arr[i].na;
    arr[i] = { ...arr[i], na, done: na ? false : arr[i].done };
    patch({ pmpChecklist: arr });
  };

  const { roles, profile, user } = useAuth();
  const podeEditarTempo = roles.some((r) => r === "admin" || r === "pcm" || r === "supervisor");
  const agora = () => new Date().toISOString();

  const meuId = user?.id;
  const meuNome = (profile?.nome || "").toUpperCase() || undefined;
  // Só o mecânico alocado, logado na própria conta, pode iniciar/pausar/finalizar.
  const equipeIds = asset?.mecanicoIds ?? (asset?.mecanicoId ? [asset.mecanicoId] : []);
  const podeApontar = !!meuId && equipeIds.includes(meuId);


  const setItemTempo = (i: number, list: Apontamento[]) => {
    const iniciando = list.some((s) => s.userId === meuId && s.inicio && !s.fim);
    const arr = items.map((it, idx) => {
      if (idx === i) return { ...it, apontamentos: list };
      // só um cronômetro por vez POR MECÂNICO — pausa apenas as sessões dele
      if (iniciando) {
        const ss = sessoes(it);
        if (ss.some((x) => x.userId === meuId && x.inicio && !x.fim))
          return { ...it, apontamentos: pausarSessaoDoUsuario(ss, meuId) };
      }
      return it;
    });
    patch({
      pmpChecklist: arr,
      ...(iniciando && !local.execInicio ? { execInicio: agora() } : {}),
    });
  };

  const totalAtividades = somaTotais(items);

  const setItemFoto = (i: number, dataUrl?: string) => {
    const arr = [...items];
    arr[i] = { ...arr[i], foto: dataUrl };
    patch({ pmpChecklist: arr });
  };

  const onItemFile = async (i: number, file?: File) => {
    if (!file) return;
    try {
      const { uploadFile } = await import("@/lib/storage");
      const url = await uploadFile(`preventiva/${local.id}/item-${i}`, file);
      setItemFoto(i, url);
    } catch (err) {
      console.error(err);
      toast.error("Falha ao enviar foto.");
    }
  };

  const save = (silencioso = false) => {
    updateWorkOrder(local.id, local);
    if (!silencioso) toast.success("Progresso salvo.");
  };

  // Salvamento automático do PMP em execução.
  const { salvoEm, pendente } = useAutosave(local, () => save(true));

  const finalizarMecanico = () => {
    if (!local.assinaturaTecnico) {
      toast.error("Assine como mecânico antes de finalizar.");
      return;
    }
    if (doneCount < items.length) {
      toast.error("Conclua todos os itens do PMP.");
      return;
    }
    const agoraIso = new Date().toISOString();
    const patchClose: Partial<WorkOrder> = {
      ...local,
      status: "aguardando_supervisor",
      apontamentos: fecharSessoesAbertas(
        sessoes({ apontamentos: local.apontamentos, inicio: local.execInicio, fim: local.execFim, minAcum: local.execMinAcum }),
        agoraIso,
      ),
      pmpChecklist: items.map((it) => ({ ...it, apontamentos: fecharSessoesAbertas(sessoes(it), agoraIso) })),
      execInicio: local.execInicio || agoraIso,
      execFim: local.execFim || agoraIso,
      horarioInicioSap: local.horarioInicioSap || agoraIso,
      horarioFimSap: local.horarioFimSap || agoraIso,
    };

    if (local.pendenciaSupervisor && !local.pendenciaResolvidaEm) {
      patchClose.pendenciaResolvidaEm = new Date().toISOString();
    }
    updateWorkOrder(local.id, patchClose);
    if (asset) useAppStore.getState().updateAsset(asset.id, { column: "teste" });
    toast.success("PMP finalizado — enviado ao supervisor.");
  };

  return (
    <div className="mx-auto max-w-4xl px-3 py-4 pb-36 md:px-6 md:py-8 md:pb-8">
      <BackButton fallbackTo="/planner" className="mb-3" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="font-display text-2xl font-bold md:text-3xl">OS Preventiva · {intervalo}</h1>
        <Badge variant="outline">{local.numeroSAP}</Badge>
        <Badge>{local.prefixo}</Badge>
        {(local.pmpCodigoPlano || local.pmpModeloPlano) && (
          <Badge variant="secondary" className="text-[10px]">
            {[local.pmpCodigoPlano, local.pmpModeloPlano].filter(Boolean).join(" · ")}
          </Badge>
        )}
        {local.pmpSapPdfName && (
          <Badge variant="secondary" className="text-[10px]">PDF SAP: {local.pmpSapPdfName}</Badge>
        )}
        <div className="ml-auto">
          <OsPdfActions wo={local} asset={asset} />
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

      {asset && <OSTabs assetId={asset.id} current="preventiva" />}

      <Card className="border-primary/30">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Apontamento de horas</CardTitle></CardHeader>
        <CardContent className="grid gap-2">
          <TimeTracker
            apontamentos={sessoes({
              apontamentos: local.apontamentos,
              inicio: local.execInicio,
              fim: local.execFim,
              minAcum: local.execMinAcum,
            })}
            userId={meuId}
            nome={meuNome}
            onChange={(list) =>
              patch({
                apontamentos: list,
                execInicio: local.execInicio || list.find((x) => x.inicio)?.inicio,
                execMinAcum: undefined,
                execFim: undefined,
              })
            }
            podeEditar={podeEditarTempo}
            podeApontar={podeApontar}
            size="lg"
            labelIniciar="Iniciar preventiva"
            labelFinalizar="Finalizar preventiva"
          />
          <p className="text-[11px] text-muted-foreground">
            Tempo total da preventiva (equipe): <strong>{formatMin(totalSessoes(sessoes({ apontamentos: local.apontamentos, inicio: local.execInicio, fim: local.execFim, minAcum: local.execMinAcum })))}</strong> · soma
            dos itens apontados: <strong>{formatMin(totalAtividades)}</strong>
          </p>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Cabeçalho</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div><Label>Nº OS</Label><Input className="h-11" value={local.numeroSAP} onChange={(e) => patch({ numeroSAP: e.target.value })} /></div>
          <div><Label>Filial</Label><Input className="h-11" value={local.filial} onChange={(e) => patch({ filial: e.target.value })} /></div>
          <div><Label>Executante</Label><Input className="h-11" value={local.setorExecutante} onChange={(e) => patch({ setorExecutante: e.target.value })} /></div>
          <div><Label>Centro de custo</Label><Input className="h-11" value={local.centroCusto} onChange={(e) => patch({ centroCusto: e.target.value })} /></div>
          <div className="md:col-span-2">
            <Label>Nº Reserva de Material (Almox)</Label>
            <Input
              className="h-11"
              placeholder="Ex.: 4500123456"
              value={local.reservaMaterial ?? ""}
              onChange={(e) => patch({ reservaMaterial: e.target.value })}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">Use este nº para retirar as peças da preventiva no almoxarifado.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm">
              Checklist PMP · {doneCount}/{items.length}
              {naCount > 0 && <span className="ml-1 font-normal text-muted-foreground">({naCount} N/A)</span>}
            </CardTitle>
            <span className="text-xs font-bold text-primary">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </CardHeader>
        <CardContent className="grid gap-2">
          {items.map((it, i) => (
            <div
              key={it.id}
              className={cn(
                "grid gap-2 rounded-md border-2 p-3 text-sm transition-colors",
                it.na
                  ? "border-muted bg-muted/40 opacity-80"
                  : it.done
                    ? "border-success/60 bg-success/10"
                    : "border-border",
              )}
            >
              <div className="flex items-start gap-3">
                <label className="flex flex-1 items-start gap-3 cursor-pointer">
                  <Checkbox
                    checked={it.done}
                    disabled={!!it.na}
                    onCheckedChange={() => toggleItem(i)}
                    className="mt-0.5 h-5 w-5"
                  />
                  <div className="flex flex-1 flex-col gap-1">
                    <span
                      className={cn(
                        "leading-snug",
                        it.done && "line-through decoration-success/60",
                        it.na && "text-muted-foreground line-through",
                      )}
                    >
                      {it.label}
                    </span>
                    {(it.servico || it.material) && (
                      <div className="flex flex-wrap gap-1">
                        {it.servico && (
                          <Badge variant="outline" className="text-[10px]">Serviço: {it.servico}</Badge>
                        )}
                        {it.material && (
                          <Badge variant="secondary" className="text-[10px]">Material: {it.material}</Badge>
                        )}
                      </div>
                    )}
                  </div>
                  {it.done && !it.na && <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-success" />}
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant={it.na ? "secondary" : "outline"}
                  className="tap-target h-8 shrink-0 px-2 text-[11px] font-bold"
                  onClick={() => toggleNa(i)}
                  title="Marcar como não se aplica"
                >
                  {it.na ? "N/A ✓" : "N/A"}
                </Button>
              </div>
              {!it.na && (
                <div className="ml-8">
                  <TimeTracker
                    apontamentos={sessoes(it)}
                    userId={meuId}
                    nome={meuNome}
                    onChange={(list) => setItemTempo(i, list)}
                    podeEditar={podeEditarTempo}
                    podeApontar={podeApontar}
                  />
                </div>
              )}
              {!it.na && (it.material || it.done) && (
                <div className="ml-8 flex items-center gap-2">
                  {it.foto ? (
                    <div className="flex items-center gap-2">
                      <img src={it.foto} alt="Foto substituição" className="h-14 w-14 rounded border object-cover" />
                      <Button size="sm" variant="ghost" className="text-xs text-destructive" onClick={() => setItemFoto(i, undefined)}>
                        Remover foto
                      </Button>
                    </div>
                  ) : (
                    <label className="tap-target inline-flex cursor-pointer items-center gap-1 rounded-md border border-dashed bg-background px-2 py-1 text-xs text-muted-foreground hover:bg-muted">
                      <Camera className="h-3.5 w-3.5" /> Foto da substituição
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => onItemFile(i, e.target.files?.[0])}
                      />
                    </label>
                  )}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Observações</CardTitle></CardHeader>
        <CardContent>
          <Textarea rows={3} value={local.observacoes ?? ""} onChange={(e) => patch({ observacoes: e.target.value })} placeholder="Anotações do serviço, peças trocadas, próximas ações." />
        </CardContent>
      </Card>

      {/* Assinaturas */}
      <Card className="mt-4">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Assinaturas</CardTitle></CardHeader>
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
                  const p = {
                    assinaturaTecnico: sig.dataUrl,
                    assinaturaTecnicoNome: sig.nome,
                    assinaturaTecnicoCargo: sig.cargo,
                    assinaturaTecnicoEm: now,
                  };
                  patch(p);
                  updateWorkOrder(local.id, p);
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
                  const p = {
                    assinaturaSupervisor: sig.dataUrl,
                    assinaturaSupervisorNome: sig.nome,
                    assinaturaSupervisorCargo: sig.cargo,
                    assinaturaSupervisorEm: now,
                  };
                  patch(p);
                  updateWorkOrder(local.id, p);
                  toast.success("Assinatura registrada — toque em “Finalizar” abaixo para enviar ao PCM.");
                }}

              />
            ) : (
              <div className="rounded-md border-2 border-dashed p-4 text-center text-xs text-muted-foreground">
                Aguardando conclusão do mecânico
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {local.status === "aguardando_supervisor" && (
        <div className="mt-3 rounded-md border border-info/40 bg-info/10 p-3 text-xs text-info">
          {local.assinaturaSupervisor
            ? "Supervisor assinou — toque em “Finalizar” para enviar ao PCM encerrar no SAP."
            : "Aguardando assinatura do supervisor."}
        </div>
      )}
      {local.status === "aguardando_pcm_encerramento" && (
        <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning-foreground">
          PCM deve encerrar no SAP.
        </div>
      )}

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t bg-background/95 p-3 backdrop-blur md:bottom-0 md:left-60">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2">
          <p className="w-full text-center text-[11px] text-muted-foreground">
            {textoAutosave(salvoEm, pendente)}
          </p>
          <Button onClick={() => save()} size="lg" variant="outline" className="tap-target flex-1 gap-2">
            <Save className="h-4 w-4" /> Salvar
          </Button>
          <Button
            onClick={() => {
              if (local.status === "aguardando_supervisor" && local.assinaturaSupervisor) {
                save();
                const p = { status: "aguardando_pcm_encerramento" as const };
                patch(p);
                updateWorkOrder(local.id, p);
                toast.success("Preventiva finalizada pelo supervisor — enviada ao PCM.");
                return;
              }
              finalizarMecanico();
            }}
            disabled={
              (local.status === "aguardando_supervisor" && !local.assinaturaSupervisor) ||
              local.status === "aguardando_pcm_encerramento" ||
              local.status === "fechada"
            }
            size="lg"
            className="tap-target flex-1 gap-2 bg-success text-success-foreground hover:bg-success/90"
          >
            <CheckCircle2 className="h-4 w-4" />
            {local.status === "aguardando_supervisor" && local.assinaturaSupervisor
              ? "Finalizar e enviar ao PCM"
              : "Finalizar"}
          </Button>

        </div>
      </div>
    </div>
  );

}
