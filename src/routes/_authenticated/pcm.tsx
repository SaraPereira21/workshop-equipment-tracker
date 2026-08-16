import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ClipboardList,
  FileText,
  Send,
  Paperclip,
  CalendarCheck,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  FileDown,
} from "lucide-react";
import { generateOsPdf } from "@/lib/os-pdf";
import { uploadFile } from "@/lib/storage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAppStore } from "@/lib/store";
import { PriorityPill } from "@/components/status-badges";
import type { Asset, Inspection, WorkOrder } from "@/lib/types";
import { parsePmpPdf, type ParsedPmpItem } from "@/lib/pdf-parse";
import { PmpPicker, type PmpSelection } from "@/components/pmp-picker";
import { EnviarLiberacaoDialog } from "@/components/enviar-liberacao-dialog";
import { InspectionFotosView } from "@/components/inspection-fotos-view";
import { DevolverSolicitacaoDialog } from "@/components/devolver-solicitacao-dialog";
import { LancarOsCorretivaDialog } from "@/components/lancar-os-corretiva-dialog";
import { CancelarPreventivaDialog } from "@/components/cancelar-preventiva-dialog";
import { PreventivaStatusBadges } from "@/components/preventiva-status-badges";
import { geraPreventiva, normalizeTipo } from "@/lib/tipo-equipamento";
import { AssetDataGrid } from "@/components/asset-data-grid";
import { doAtivo as pertenceAoAtivo } from "@/lib/match-ativo";



import { Mail } from "lucide-react";

export const Route = createFileRoute("/_authenticated/pcm")({
  head: () => ({
    meta: [
      { title: "PCM — Criação de OS SAP" },
      { name: "description", content: "Fila PCM: criar OS corretiva/preventiva no SAP e liberar para o Supervisor." },
    ],
  }),
  component: PcmPage,
});

function PcmPage() {
  const assets = useAppStore((s) => s.assets);
  const inspections = useAppStore((s) => s.inspections);
  const workOrders = useAppStore((s) => s.workOrders);

  const filaCorretiva = useMemo(
    () =>
      assets.filter(
        (a) =>
          (a.column === "pcm" && a.inspetorDecisao !== "aprovado") ||
          // Inspetor encaminhou para corretiva: aparece na fila do PCM mesmo
          // antes da OS ser lançada, para os gestores verem os apontamentos.
          (a.inspetorDecisao === "corretiva" && !a.corretivaLiberada && a.column !== "liberado"),
      ),
    [assets],
  );
  const filaAprovadas = useMemo(
    () => assets.filter((a) => a.column === "pcm" && a.inspetorDecisao === "aprovado"),
    [assets],
  );
  const fila = filaCorretiva;
  const aguardandoPreventiva = useMemo(
    () =>
      assets.filter(
        (a) =>
          a.temPreventiva &&
          geraPreventiva(a.tipo) &&
          !a.preventivaLiberada &&
          a.column !== "liberado",
      ),
    [assets],
  );
  const [buscaPreventiva, setBuscaPreventiva] = useState("");
  const preventivasFiltradas = useMemo(() => {
    const q = buscaPreventiva.trim().toLowerCase();
    if (!q) return aguardandoPreventiva;
    return aguardandoPreventiva.filter((a) =>
      [a.prefixo, a.modelo, a.marca, a.tipo, a.codigoAtivo, a.numeroSerie]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [aguardandoPreventiva, buscaPreventiva]);
  const aguardandoEncerramento = useMemo(
    () => workOrders.filter((w) => w.status === "aguardando_pcm_encerramento"),
    [workOrders],
  );
  const encerradas = useMemo(
    () => workOrders.filter((w) => w.status === "fechada"),
    [workOrders],
  );
  const prontasLiberacao = useMemo(
    () => assets.filter((a) => a.libNovoStatus === "pronto_envio"),
    [assets],
  );
  const preventivaBase = useMemo(
    () => assets.filter((a) => a.preventivaBaseFeita && !a.preventivaBaseDocUrl),
    [assets],
  );

  /** Todas as máquinas ativas — com destaque para quem está sem anexo e/ou sem OS corretiva */
  const pendenciasDoc = useMemo(() => {
    const corretivaPorPrefixo = new Set(
      workOrders.filter((w) => w.tipo === "corretiva").map((w) => w.prefixo),
    );
    return assets
      .map((a) => {
        const semAnexo =
          a.column !== "liberado" &&
          (a.anexos?.length ?? 0) === 0 &&
          (a.documentos?.length ?? 0) === 0 &&
          !a.ultimaPreventivaDocUrl &&
          !a.preventivaBaseDocUrl;
        const semOs = !a.sapOsCorretiva && !corretivaPorPrefixo.has(a.prefixo);
        return { asset: a, semAnexo, semOs };
      })
      .sort((a, b) => {
        const score = (x: { semAnexo: boolean; semOs: boolean }) => (x.semAnexo ? 1 : 0) + (x.semOs ? 1 : 0);
        return score(b) - score(a) || (a.asset.prefixo ?? "").localeCompare(b.asset.prefixo ?? "");
      });
  }, [assets, workOrders]);




  const lastInspection = (assetId: string) => {
    const asset = assets.find((a) => a.id === assetId);
    if (asset?.libNovoInspectionId) {
      const byId = inspections.find((i) => i.id === asset.libNovoInspectionId);
      if (byId) return byId;
    }
    // Mais recente do ativo (saída tem prioridade, senão entrada)
    const doAtivo = inspections
      .filter((i) => (asset ? pertenceAoAtivo(asset, i) : i.assetId === assetId))
      .sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""));
    return doAtivo[0];
  };


  return (
    <div className="mx-auto max-w-6xl px-3 py-4 md:px-6 md:py-8">
      <div className="mb-4 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary">
          <ClipboardList className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold md:text-3xl">Painel PCM</h1>
          <p className="text-sm text-muted-foreground">
            Solicitações recebidas da inspeção. Crie a OS no SAP, decida sobre preventiva e libere ao Supervisor.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><CardContent className="p-4">
          <div className="text-xs uppercase text-muted-foreground">Fila PCM</div>
          <div className="font-display text-2xl font-bold">{fila.length}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs uppercase text-muted-foreground">Aguardando Preventiva</div>
          <div className="font-display text-2xl font-bold">{aguardandoPreventiva.length}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs uppercase text-muted-foreground">Críticas</div>
          <div className="font-display text-2xl font-bold text-destructive">
            {fila.filter((a) => a.priority === "critica").length}
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs uppercase text-muted-foreground">Alta prioridade</div>
          <div className="font-display text-2xl font-bold">
            {fila.filter((a) => a.priority === "alta").length}
          </div>
        </CardContent></Card>
      </div>

      {/* OS aprovadas pelo supervisor — encerrar no SAP (topo, alta visibilidade) */}
      <div className="mt-6">
        <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
          <CheckCircle2 className="h-5 w-5 text-success" />
          OS finalizadas pelo supervisor — encerrar no SAP ({aguardandoEncerramento.length})
        </h2>
        {aguardandoEncerramento.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            Nenhuma OS aguardando encerramento. Quando o supervisor assinar e finalizar a OS, ela aparece aqui.
          </div>
        ) : (
          <div className="grid gap-3">
            {aguardandoEncerramento.map((w) => (
              <EncerramentoSapCard key={w.id} wo={w} />
            ))}
          </div>
        )}
      </div>




      <PendenciasDocSection itens={pendenciasDoc} />


      {filaAprovadas.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
            <CheckCircle2 className="h-5 w-5 text-success" />
            Aprovadas pela inspeção — anexar última preventiva ({filaAprovadas.length})
          </h2>
          <div className="grid gap-3">
            {filaAprovadas.map((a) => (
              <AprovadaCard key={a.id} asset={a} inspection={lastInspection(a.id)} />
            ))}
          </div>
        </div>
      )}

      {preventivaBase.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
            <Paperclip className="h-5 w-5 text-warning-foreground" />
            Preventiva feita na base — só anexar o arquivo ({preventivaBase.length})
          </h2>
          <p className="mb-2 text-xs text-muted-foreground">
            O inspetor informou que a preventiva já foi realizada na base. Não é preciso liberar preventiva — apenas localize o documento e anexe.
          </p>
          <div className="grid gap-3">
            {preventivaBase.map((a) => (
              <PreventivaBaseCard key={a.id} asset={a} inspection={lastInspection(a.id)} />
            ))}
          </div>
        </div>
      )}


      {prontasLiberacao.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
            <Mail className="h-5 w-5 text-primary" />
            Prontas para liberação por e-mail ({prontasLiberacao.length})
          </h2>
          <p className="mb-2 text-xs text-muted-foreground">
            Supervisor já assinou. Envie o e-mail de liberação com PDFs da OS e da inspeção anexos.
          </p>
          <div className="grid gap-3">
            {prontasLiberacao.map((a) => (
              <LiberacaoEmailCard key={a.id} asset={a} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <h2 className="mb-3 font-display text-lg font-bold">Solicitações da Inspeção (Corretiva)</h2>
        {fila.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
            Nenhuma solicitação de corretiva aguardando o PCM.
          </CardContent></Card>
        ) : (
          <div className="grid gap-3">
            {fila.map((a) => (
              <PcmCard key={a.id} asset={a} inspection={lastInspection(a.id)} />
            ))}
          </div>
        )}
      </div>

      {aguardandoPreventiva.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
            <CalendarCheck className="h-5 w-5 text-warning-foreground" />
            Preventivas a verificar ({preventivasFiltradas.length}/{aguardandoPreventiva.length})
          </h2>
          <Input
            value={buscaPreventiva}
            onChange={(e) => setBuscaPreventiva(e.target.value)}
            placeholder="Buscar por prefixo, modelo, marca ou tipo..."
            className="mb-3 max-w-sm"
          />
          <div className="grid gap-3">
            {preventivasFiltradas.map((a) => (
              <PreventivaPendenteCard key={a.id} asset={a} />
            ))}
            {preventivasFiltradas.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma máquina encontrada para “{buscaPreventiva}”.</p>
            )}
          </div>
        </div>
      )}



      {encerradas.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
            <FileDown className="h-5 w-5 text-primary" />
            OS encerradas — baixar PDF ({encerradas.length})
          </h2>
          <div className="grid gap-2">
            {encerradas.map((w) => (
              <Card key={w.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div className="min-w-0 text-sm">
                    <span className="font-semibold">{w.prefixo}</span>{" "}
                    <Badge variant="outline" className="ml-1 text-[10px] uppercase">{w.tipo}</Badge>{" "}
                    <Badge variant="secondary" className="ml-1 text-[10px]">OS {w.numeroSAP}</Badge>
                    <div className="text-xs text-muted-foreground">
                      Encerrada {w.encerradoPorPcm ? new Date(w.encerradoPorPcm).toLocaleDateString("pt-BR") : "—"}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={async () => {
                      const a = useAppStore.getState().assets.find((x) => x.id === w.assetId);
                      await generateOsPdf(w, a);
                      toast.success("PDF gerado.");
                    }}
                  >
                    <FileDown className="h-4 w-4" /> Baixar PDF
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}



/** True quando a máquina já passou pela manutenção (OS encerrada/em encerramento). */
function usePosManutencao(assetId: string) {
  return useAppStore((s) =>
    s.workOrders.some(
      (w) =>
        w.assetId === assetId &&
        (w.status === "fechada" || w.status === "aguardando_pcm_encerramento"),
    ),
  );
}

function PcmCard({ asset, inspection }: { asset: Asset; inspection?: ReturnType<typeof Object> }) {
  const updateAsset = useAppStore((s) => s.updateAsset);
  const addWorkOrder = useAppStore((s) => s.addWorkOrder);
  const existingCorretiva = useAppStore((s) =>
    s.workOrders.find((w) => pertenceAoAtivo(asset, w) && w.tipo === "corretiva"),
  );
  const posManutencao = usePosManutencao(asset.id);
  const [open, setOpen] = useState(false);

  const falhas = ((inspection as unknown as { falhas?: string[] } | undefined)?.falhas ?? []) as string[];
  const obs = (inspection as unknown as { observacoesGerais?: string } | undefined)?.observacoesGerais ?? "";
  const insp = inspection as unknown as
    | {
        fotoChassi?: string;
        fotoHorimetro?: string;
        fotosEquipamento?: Record<string, string>;
        horimetro?: number;
        combustivel?: number;
        inspetor?: string;
        data?: string;
        tipo?: string;
        items?: { id: number; group: string; description: string; status: string; observation?: string; photos?: string[] }[];
      }
    | undefined;

  /** Itens reprovados com observação/fotos — base para descrever a OS no SAP */
  const itensReprovados = (insp?.items ?? []).filter((i) => i.status === "R");
  /** Qualquer item com foto (mesmo aprovado com ressalva) */
  const itensComFoto = (insp?.items ?? []).filter((i) => (i.photos?.length ?? 0) > 0);



  const [sapCorretiva, setSapCorretiva] = useState(asset.sapOsCorretiva ?? "");
  const semPreventiva = !geraPreventiva(asset.tipo);
  const [temPrev, setTemPrev] = useState<boolean>(semPreventiva ? false : (asset.temPreventiva ?? false));
  const [pcmObs, setPcmObs] = useState(asset.pcmObs ?? "");

  const liberarCorretiva = () => {
    if (!sapCorretiva.trim()) {
      toast.error("Informe o número da OS Corretiva do SAP.");
      return;
    }

    updateAsset(asset.id, {
      sapOsCorretiva: sapCorretiva.trim(),
      temPreventiva: semPreventiva ? false : temPrev,
      corretivaLiberada: true,
      preventivaLiberada: false,
      pcmObs,
      pcmDecididoEm: new Date().toISOString(),
      ultimaPreventivaDocUrl: asset.ultimaPreventivaDocUrl,

      column: "triagem",
      status: "em_manutencao",
    });


    // Herda falhas do checklist + tarefas cadastradas na Nova Solicitação
    // (ex.: "retirar módulo de telemetria" para máquinas que serão vendidas).
    const tarefasCadastro = (asset.pendingTasks ?? [])
      .filter((t) => !t.done)
      .map((t) => t.text);
    const herdadas = [
      ...falhas.map((descricao) => ({ descricao, corrigido: false })),
      ...tarefasCadastro.map((descricao) => ({ descricao, corrigido: false })),
    ];

    // Gera a WorkOrder de Corretiva (se ainda não existir), herdando as falhas
    // do checklist para o mecânico executar.
    if (!existingCorretiva) {
      const woId = `wo-corr-${asset.id}-${Date.now()}`;
      addWorkOrder({
        id: woId,
        numeroSAP: sapCorretiva.trim(),
        tipo: "corretiva",
        assetId: asset.id,
        prefixo: asset.prefixo,
        filial: "Matriz",
        solicitante: "PCM",
        setorExecutante: "Manutenção",
        centroCusto: "",
        tiposManutencao: ["Corretiva"],
        operations: [],
        falhasHerdadas: herdadas,
        materiais: [],
        executores: [],
        observacoes: pcmObs,
        status: "aberta",
        createdAt: new Date().toISOString(),
      });
    } else {
      // Mescla itens já existentes com novos, sem duplicar por descrição.
      const existentes = existingCorretiva.falhasHerdadas ?? [];
      const descExistentes = new Set(existentes.map((f) => f.descricao));
      const novasHerdadas = [
        ...existentes,
        ...herdadas.filter((h) => !descExistentes.has(h.descricao)),
      ];
      useAppStore.getState().updateWorkOrder(existingCorretiva.id, {
        numeroSAP: sapCorretiva.trim(),
        observacoes: pcmObs,
        falhasHerdadas: novasHerdadas,
      });
    }


    toast.success(
      temPrev
        ? `${asset.prefixo}: Corretiva liberada ao Supervisor. Preventiva fica pendente.`
        : `${asset.prefixo}: Corretiva liberada ao Supervisor.`,
    );
    setOpen(false);
  };


  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display text-lg font-bold">{asset.prefixo}</span>
              <PriorityPill p={asset.priority} />
              {asset.tags?.slice(0, 3).map((t) => (
                <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
              ))}
              <PreventivaStatusBadges asset={asset} />
            </div>
            <div className="text-xs text-muted-foreground">
              {asset.marca} {asset.modelo} · {asset.horimetroAtual}h
              {asset.contrato ? ` · ${asset.contrato}` : ""}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="tap-target gap-1">
                  <FileText className="h-4 w-4" /> Abrir solicitação
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Solicitação — {asset.prefixo}</DialogTitle>
                </DialogHeader>

                <div className="grid gap-4">
                  {/* Dados para abrir a OS no SAP */}
                  <section className="rounded-md border bg-muted/30 p-3">
                    <div className="mb-2 text-sm font-semibold">Dados para a OS do SAP</div>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
                      <div><dt className="text-muted-foreground">Prefixo</dt><dd className="font-medium">{asset.prefixo}</dd></div>
                      <div><dt className="text-muted-foreground">Marca / Modelo</dt><dd className="font-medium">{asset.marca} {asset.modelo}</dd></div>
                      <div><dt className="text-muted-foreground">Tipo</dt><dd className="font-medium">{asset.tipo || "—"}</dd></div>
                      <div><dt className="text-muted-foreground">Contrato</dt><dd className="font-medium">{asset.contrato || "—"}</dd></div>
                      <div><dt className="text-muted-foreground">Horímetro (inspeção)</dt><dd className="font-medium">{insp?.horimetro ?? asset.horimetroAtual}h</dd></div>
                      <div><dt className="text-muted-foreground">Combustível</dt><dd className="font-medium">{typeof insp?.combustivel === "number" ? `${insp.combustivel}%` : "—"}</dd></div>
                      <div><dt className="text-muted-foreground">Últ. PMP</dt><dd className="font-medium">{asset.horimetroUltimoPMP}h</dd></div>
                      <div><dt className="text-muted-foreground">Próx. alvo</dt><dd className="font-medium">{asset.proximoAlvoPMP}h</dd></div>
                      <div><dt className="text-muted-foreground">Inspetor</dt><dd className="font-medium">{insp?.inspetor || "—"}</dd></div>
                      <div><dt className="text-muted-foreground">Data da inspeção</dt><dd className="font-medium">{insp?.data ? new Date(insp.data).toLocaleString("pt-BR") : "—"}</dd></div>
                      <div><dt className="text-muted-foreground">Entrada na oficina</dt><dd className="font-medium">{asset.dataEntrada ? new Date(asset.dataEntrada).toLocaleDateString("pt-BR") : "—"}</dd></div>
                      <div><dt className="text-muted-foreground">Entrega prevista</dt><dd className="font-medium">{asset.dataEntregaPrevista ? new Date(asset.dataEntregaPrevista).toLocaleDateString("pt-BR") : "—"}</dd></div>
                    </dl>
                    {asset.descricao && (
                      <p className="mt-2 whitespace-pre-line text-xs text-muted-foreground">{asset.descricao}</p>
                    )}
                  </section>

                  {/* Falhas herdadas */}
                  <section>
                    <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      Falhas reportadas pela inspeção ({falhas.length})
                    </div>
                    <div className="rounded-md border bg-muted/40 p-3 text-xs">
                      {falhas.length === 0 ? (
                        <span className="text-muted-foreground">Nenhuma falha marcada como R na inspeção.</span>
                      ) : (
                        <ul className="grid gap-1">
                          {falhas.map((f, i) => (
                            <li key={i} className="leading-snug">• {f}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {obs && (
                      <p className="mt-2 whitespace-pre-line text-xs text-muted-foreground">
                        <span className="font-semibold">Obs. do inspetor:</span>
                        {"\n"}{obs}
                      </p>
                    )}
                  </section>

                  {/* Itens reprovados com observação e fotos do inspetor */}
                  {(itensReprovados.length > 0 || itensComFoto.length > 0) && (
                    <section>
                      <div className="mb-1 text-sm font-semibold">Itens inspecionados — observações e fotos</div>
                      <div className="grid gap-2">
                        {Array.from(new Set([...itensReprovados, ...itensComFoto])).map((it) => (
                          <div key={it.id} className="rounded-md border p-2 text-xs">
                            <div className="font-medium">
                              {it.id}. {it.description}
                              <span className="ml-2 text-muted-foreground">({it.group})</span>
                              {it.status === "R" && (
                                <Badge variant="destructive" className="ml-2 text-[10px]">Reprovado</Badge>
                              )}
                            </div>
                            {it.observation && (
                              <p className="mt-1 whitespace-pre-line text-muted-foreground">{it.observation}</p>
                            )}
                            {(it.photos?.length ?? 0) > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {it.photos!.map((url, i) => (
                                  <a key={i} href={url} target="_blank" rel="noreferrer">
                                    <img
                                      src={url}
                                      alt={`Foto ${i + 1} do item ${it.description}`}
                                      loading="lazy"
                                      className="h-24 w-24 rounded border object-cover"
                                    />
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  <InspectionFotosView
                    prefixo={asset.prefixo}
                    fotoChassi={insp?.fotoChassi}
                    fotoHorimetro={insp?.fotoHorimetro}
                    fotosEquipamento={insp?.fotosEquipamento}
                    horimetro={insp?.horimetro}
                  />

                  {/* Anexos enviados junto da solicitação */}
                  {(asset.anexos?.length ?? 0) > 0 && (
                    <section>
                      <div className="mb-1 text-sm font-semibold">Anexos da solicitação ({asset.anexos!.length})</div>
                      <div className="grid gap-1 text-xs">
                        {asset.anexos!.map((a) => (
                          <a key={a.id} href={a.dataUrl} target="_blank" rel="noreferrer" className="text-primary underline">
                            {a.nome}{a.descricao ? ` — ${a.descricao}` : ""}
                          </a>
                        ))}
                      </div>
                    </section>
                  )}


                  <Separator />


                  {/* OS SAP Corretiva */}
                  <section className="grid gap-2">
                    <Label htmlFor="sap-corr">Nº OS Corretiva (SAP)</Label>
                    <Input
                      id="sap-corr"
                      className="h-11"
                      placeholder="Ex.: 40012345"
                      value={sapCorretiva}
                      onChange={(e) => setSapCorretiva(e.target.value)}
                    />
                  </section>

                  {/* Preventiva */}
                  {semPreventiva ? (
                    <section className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
                      <span className="font-semibold">{normalizeTipo(asset.tipo) || "Este tipo"} não gera preventiva.</span>{" "}
                      <span className="text-muted-foreground">Somente OS corretiva é tratada para este equipamento.</span>
                    </section>
                  ) : (
                    <section className="rounded-md border bg-card p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">Deixar na fila do PCM para verificar preventiva?</div>
                          <div className="text-xs text-muted-foreground">
                            Alvo atual: {asset.proximoAlvoPMP}h · Último PMP: {asset.horimetroUltimoPMP}h
                          </div>
                        </div>
                        <Switch checked={temPrev} onCheckedChange={setTemPrev} />
                      </div>
                    </section>
                  )}



                  <section>
                    <Label htmlFor="pcm-obs">Observações do PCM</Label>
                    <Textarea
                      id="pcm-obs"
                      rows={3}
                      value={pcmObs}
                      onChange={(e) => setPcmObs(e.target.value)}
                      placeholder="Instruções para o supervisor / mecânico…"
                    />
                  </section>
                </div>

                <DialogFooter className="gap-2 sm:justify-between">
                  {existingCorretiva ? (
                    <Button variant="outline" asChild size="sm">
                      <Link to="/os/corretiva/$id" params={{ id: existingCorretiva.id }} className="gap-1">
                        <ExternalLink className="h-4 w-4" /> Ver OS Digital
                      </Link>
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground self-center">
                      OS digital disponível após liberar a corretiva
                    </span>
                  )}
                  <Button onClick={liberarCorretiva} className="gap-1">
                    <Send className="h-4 w-4" /> Liberar corretiva ao Supervisor
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <DevolverSolicitacaoDialog
              asset={asset}
              destinoLabel={posManutencao ? "Inspetor (inspeção de saída)" : "Inspetor"}
              destinoColumn={posManutencao ? "aguardando_saida" : "chegada"}
              triggerLabel="Devolver ao inspetor"
              patch={{
                status: "em_inspecao",
                inspetorDecisao: undefined,
                faltaDocPCM: undefined,
              }}
            />
          </div>
        </div>


        {falhas.length > 0 && (
          <div className="mt-2 text-xs text-muted-foreground">
            <span className="font-semibold text-destructive">{falhas.length}</span> falha(s) na inspeção
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AprovadaCard({ asset, inspection }: { asset: Asset; inspection?: Inspection }) {
  const updateAsset = useAppStore((s) => s.updateAsset);
  const [anexoUrl, setAnexoUrl] = useState<string>(asset.ultimaPreventivaDocUrl ?? "");
  const [anexoNome, setAnexoNome] = useState<string>(asset.ultimaPreventivaDocUrl ? "PMP anterior anexado" : "");
  const [uploadingAnexo, setUploadingAnexo] = useState(false);
  const [pcmObs, setPcmObs] = useState(asset.pcmObs ?? "");
  const posManutencao = usePosManutencao(asset.id);
  const [open, setOpen] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploadingAnexo(true);
    try {
      const url = await uploadFile(`preventivas/${asset.prefixo}`, f);
      setAnexoUrl(url);
      setAnexoNome(f.name);
    } catch (err) {
      console.error(err);
      toast.error("Falha ao enviar o PDF. Tente novamente.");
    } finally {
      setUploadingAnexo(false);
    }
  };

  const enviarSupervisor = () => {
    if (!anexoUrl) {
      toast.error("Anexe o documento da última preventiva antes de enviar ao Supervisor.");
      return;
    }
    const novoDoc = {
      id: `doc-pmp-${Date.now()}`,
      nome: anexoNome || "Última preventiva.pdf",
      tipo: "os_preventiva" as const,
      dataUrl: anexoUrl,
      createdAt: new Date().toISOString(),
      autor: "PCM",
    };
    updateAsset(asset.id, {
      ultimaPreventivaDocUrl: anexoUrl,
      documentos: [...(asset.documentos ?? []), novoDoc],
      pcmObs,
      pcmDecididoEm: new Date().toISOString(),
      faltaDocPCM: false,
      column: "liberado",
      status: "liberado",
      libNovoStatus: "aguardando_supervisor",
    });
    toast.success(`${asset.prefixo}: última preventiva anexada. Enviado ao Supervisor para assinatura.`);
    setOpen(false);
  };

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display text-base font-bold">{asset.prefixo}</span>
            <Badge variant="secondary" className="text-[10px] uppercase">Aprovado pela inspeção</Badge>
            {asset.libNovoInspetorSig && (
              <Badge variant="outline" className="text-[10px]">✍ {asset.libNovoInspetorSig.nome}</Badge>
            )}
            <PreventivaStatusBadges asset={asset} />
          </div>
          <div className="text-xs text-muted-foreground">
            {asset.marca} {asset.modelo} · {asset.horimetroAtual}h · sem corretiva
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1"><Paperclip className="h-4 w-4" /> Anexar preventiva</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Anexar última preventiva — {asset.prefixo}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <AssetDataGrid asset={asset} />

              <InspectionFotosView
                prefixo={asset.prefixo}
                fotoChassi={inspection?.fotoChassi}
                fotoHorimetro={inspection?.fotoHorimetro}
                fotosEquipamento={inspection?.fotosEquipamento}
                horimetro={inspection?.horimetro}
              />

              <div>
                <Label className="flex items-center gap-1 text-xs">
                  <Paperclip className="h-3.5 w-3.5" /> PDF / documento da última preventiva
                </Label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    disabled={uploadingAnexo}
                    onChange={handleUpload}
                    className="block w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground"
                  />
                  {uploadingAnexo && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
                  {anexoUrl && !uploadingAnexo && (
                    <a href={anexoUrl} target="_blank" rel="noreferrer" className="shrink-0">
                      <Badge variant="secondary" className="text-[10px]">{anexoNome || "Anexado"}</Badge>
                    </a>
                  )}
                </div>
              </div>
              <div>
                <Label htmlFor="pcm-obs-apr">Observações do PCM (opcional)</Label>
                <Textarea
                  id="pcm-obs-apr"
                  rows={3}
                  value={pcmObs}
                  onChange={(e) => setPcmObs(e.target.value)}
                  placeholder="Notas para o Supervisor…"
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              <DevolverSolicitacaoDialog
                asset={asset}
                destinoLabel={posManutencao ? "Inspetor (inspeção de saída)" : "Inspetor"}
                destinoColumn={posManutencao ? "aguardando_saida" : "chegada"}
                triggerLabel="Devolver ao inspetor"
                patch={{
                  status: "em_inspecao",
                  inspetorDecisao: undefined,
                  faltaDocPCM: undefined,
                }}
              />
              <Button onClick={enviarSupervisor} className="gap-1">
                <Send className="h-4 w-4" /> Enviar ao Supervisor
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </CardContent>
    </Card>
  );
}

function PreventivaPendenteCard({ asset }: { asset: Asset }) {
  const updateAsset = useAppStore((s) => s.updateAsset);
  const addWorkOrder = useAppStore((s) => s.addWorkOrder);
  const existingWO = useAppStore((s) =>
    s.workOrders.find((w) => pertenceAoAtivo(asset, w) && w.tipo === "preventiva"),
  );

  const [open, setOpen] = useState(false);
  const [modo, setModo] = useState<"nova" | "base">("nova");
  const [sapPrev, setSapPrev] = useState(asset.sapOsPreventiva ?? "");
  const [baseInfo, setBaseInfo] = useState(asset.preventivaBaseInfo ?? "");
  const [baseArquivos, setBaseArquivos] = useState<{ url: string; nome: string }[]>(
    asset.preventivaBaseDocUrl ? [{ url: asset.preventivaBaseDocUrl, nome: "Anexado" }] : [],
  );
  const [uploadBase, setUploadBase] = useState(false);
  const [pdfName, setPdfName] = useState<string>("");
  const [parsing, setParsing] = useState(false);
  const [items, setItems] = useState<ParsedPmpItem[]>([]);
  const [origemPmp, setOrigemPmp] = useState<"catalogo" | "pdf">("catalogo");
  const [pmpPlano, setPmpPlano] = useState<{
    label?: string;
    intervaloHoras?: number;
    codigoPlano?: string;
    modelo?: string;
  } | null>(null);
  const [reserva, setReserva] = useState(existingWO?.reservaMaterial ?? "");
  const [obs, setObs] = useState("");

  const onPmpCatalogo = (sel: PmpSelection | null) => {
    if (!sel) {
      if (origemPmp === "catalogo") setItems([]);
      return;
    }
    setOrigemPmp("catalogo");
    setPdfName(`${sel.plan.modeloOriginal} · PMP ${sel.plan.intervaloHoras}h`);
    setPmpPlano({
      label: `PMP ${sel.plan.intervaloHoras}h`,
      intervaloHoras: sel.plan.intervaloHoras,
      codigoPlano: sel.plan.codigoPlano,
      modelo: sel.plan.modeloOriginal,
    });
    setItems(
      sel.operations.map((o) => ({
        id: o.item ?? String(o.ordem),
        label: o.procedimento,
        intervalo: `PMP ${sel.plan.intervaloHoras}h`,
        done: false,
        servico: o.servico,
        material: o.material
          ? `${o.material}${o.qtde ? ` · ${o.qtde}${o.unidade ? " " + o.unidade : ""}` : ""}`
          : undefined,
      })),
    );
  };


  const onBaseFile = async (fs?: FileList | null) => {
    if (!fs || fs.length === 0) return;
    setUploadBase(true);
    try {
      const novos: { url: string; nome: string }[] = [];
      for (const f of Array.from(fs)) {
        const url = await uploadFile(`preventivas/${asset.prefixo}`, f);
        novos.push({ url, nome: f.name });
      }
      setBaseArquivos((prev) => [...prev, ...novos]);
    } catch (e) {
      console.error(e);
      toast.error("Falha ao enviar o arquivo. Tente novamente.");
    } finally {
      setUploadBase(false);
    }
  };

  const salvarBase = () => {
    if (baseArquivos.length === 0) {
      toast.error("Anexe o documento da preventiva feita na base.");
      return;
    }
    const now = new Date().toISOString();
    updateAsset(asset.id, {
      preventivaBaseFeita: true,
      preventivaBaseInfo: baseInfo || undefined,
      preventivaBaseDocUrl: baseArquivos[0].url,
      preventivaBaseAnexadaEm: now,
      preventivaLiberada: true,
      documentos: [
        ...(asset.documentos ?? []),
        ...baseArquivos.map((a, i) => ({
          id: `doc-prevbase-${Date.now()}-${i}`,
          nome: a.nome || "Preventiva realizada na base.pdf",
          tipo: "os_preventiva" as const,
          dataUrl: a.url,
          createdAt: now,
          autor: "PCM",
        })),
      ],
    });
    toast.success(`${asset.prefixo}: preventiva da base anexada — sem nova OS preventiva.`);
    setOpen(false);
  };


  const onFile = async (f?: File | null) => {
    if (!f) return;
    setOrigemPmp("pdf");
    setPdfName(f.name);
    setPmpPlano({ label: `PMP ${asset.proximoAlvoPMP}h`, intervaloHoras: asset.proximoAlvoPMP });
    setParsing(true);
    try {
      const parsed = await parsePmpPdf(f, `PMP ${asset.proximoAlvoPMP}h`);
      if (parsed.items.length === 0) {
        toast.warning("Nenhum item PMP identificado no PDF. Verifique o arquivo.");
      } else {
        toast.success(`${parsed.items.length} itens PMP extraídos do PDF do SAP.`);
      }
      setItems(parsed.items);
    } catch (e) {
      console.error(e);
      toast.error("Falha ao ler o PDF. Tente outro arquivo.");
    } finally {
      setParsing(false);
    }
  };

  const liberar = () => {
    if (!sapPrev.trim()) {
      toast.error("Informe o número da OS Preventiva do SAP.");
      return;
    }
    if (items.length === 0) {
      toast.error("Selecione o PMP no catálogo ou anexe o PDF do SAP.");
      return;
    }
    if (!reserva.trim()) {
      toast.error("Informe o número da reserva de material para o almox.");
      return;
    }

    const now = new Date().toISOString();
    const woId = existingWO?.id ?? `wo-prev-${asset.id}-${Date.now()}`;
    const wo: WorkOrder = {
      id: woId,
      numeroSAP: sapPrev.trim(),

      tipo: "preventiva",
      assetId: asset.id,
      prefixo: asset.prefixo,
      filial: "Matriz",
      solicitante: "PCM",
      setorExecutante: "Manutenção",
      centroCusto: "",
      tiposManutencao: ["Preventiva"],
      operations: [],
      falhasHerdadas: [],
      materiais: [],
      executores: [],
      observacoes: obs,
      reservaMaterial: reserva.trim(),
      pmpChecklist: items.map((it) => ({
        id: it.id,
        label: it.label,
        intervalo: it.intervalo,
        done: false,
        material: it.material,
        servico: it.servico,
      })),
      pmpSapPdfName: pdfName,
      pmpPlanoLabel: pmpPlano?.label ?? `PMP ${asset.proximoAlvoPMP}h`,
      pmpIntervaloHoras: pmpPlano?.intervaloHoras ?? asset.proximoAlvoPMP,
      pmpCodigoPlano: pmpPlano?.codigoPlano,
      pmpModeloPlano: pmpPlano?.modelo,
      status: "aberta",
      createdAt: now,
    };

    if (existingWO) {
      useAppStore.getState().updateWorkOrder(woId, wo);
    } else {
      addWorkOrder(wo);
    }
    updateAsset(asset.id, {
      preventivaLiberada: true,
      sapOsPreventiva: sapPrev.trim(),
      preventivaBaseFeita: undefined,
    });
    toast.success(`${asset.prefixo}: Preventiva liberada — ${items.length} itens gerados para o mecânico.`);

    setOpen(false);
  };

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display text-base font-bold">{asset.prefixo}</span>
            <Badge variant="outline" className="text-[10px]">OS Prev. {asset.sapOsPreventiva ?? "—"}</Badge>
            <PreventivaStatusBadges asset={asset} />
          </div>
          <div className="text-xs text-muted-foreground">
            Corretiva {asset.sapOsCorretiva} já em execução · Alvo {asset.proximoAlvoPMP}h
          </div>
        </div>
        <CancelarPreventivaDialog asset={asset} />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1">
              <CheckCircle2 className="h-4 w-4" /> Verificar preventiva
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Verificar preventiva — {asset.prefixo}</DialogTitle>
            </DialogHeader>

            <div className="grid gap-4">
              <AssetDataGrid asset={asset} />

              <section className="grid gap-2 rounded-md border bg-muted/30 p-3">
                <Label className="text-sm font-semibold">Como será tratada a preventiva?</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant={modo === "base" ? "default" : "outline"}
                    className="h-auto justify-start whitespace-normal py-2 text-left text-xs"
                    onClick={() => setModo("base")}
                  >
                    Já feita na base — só anexar o arquivo
                  </Button>
                  <Button
                    type="button"
                    variant={modo === "nova" ? "default" : "outline"}
                    className="h-auto justify-start whitespace-normal py-2 text-left text-xs"
                    onClick={() => setModo("nova")}
                  >
                    Nova preventiva — liberar ao mecânico
                  </Button>
                </div>
              </section>

              {modo === "base" ? (
                <>
                  <section className="grid gap-2">
                    <Label className="flex items-center gap-1 text-sm">
                      <Paperclip className="h-4 w-4" /> Documentos da preventiva realizada na base
                    </Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        multiple
                        accept="application/pdf,image/*"
                        disabled={uploadBase}
                        onChange={(e) => { void onBaseFile(e.target.files); e.target.value = ""; }}
                        className="block w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground"
                      />
                      {uploadBase && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Você pode anexar vários arquivos (PDF da preventiva, fotos dos materiais trocados etc.).
                    </p>
                    {baseArquivos.length > 0 && (
                      <ul className="grid gap-1">
                        {baseArquivos.map((a, i) => (
                          <li key={a.url} className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs">
                            <a href={a.url} target="_blank" rel="noreferrer" className="truncate underline">
                              {a.nome || "Anexado"}
                            </a>
                            <button
                              type="button"
                              className="shrink-0 text-muted-foreground hover:text-destructive"
                              onClick={() => setBaseArquivos((prev) => prev.filter((_, idx) => idx !== i))}
                            >
                              Remover
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                  <section className="grid gap-2">
                    <Label htmlFor={`base-info-${asset.id}`} className="text-xs">
                      Referência (data, horímetro, OS SAP) — opcional
                    </Label>
                    <Input
                      id={`base-info-${asset.id}`}
                      className="h-11"
                      value={baseInfo}
                      onChange={(e) => setBaseInfo(e.target.value)}
                      placeholder="Ex.: PMP 500h feita em 10/07 na base Sul — OS 4512345"
                    />
                  </section>
                </>
              ) : (
                <>
                  <section className="grid gap-2">
                    <Label htmlFor={`sap-prev-${asset.id}`}>Nº OS Preventiva (SAP)</Label>
                    <Input
                      id={`sap-prev-${asset.id}`}
                      className="h-11"
                      placeholder="Ex.: 40012346"
                      value={sapPrev}
                      onChange={(e) => setSapPrev(e.target.value)}
                    />
                  </section>

                  <section className="grid gap-2">
                    <Label className="text-sm">Plano de manutenção (catálogo PMP)</Label>
                    <PmpPicker
                      modelo={asset.modelo}
                      marca={asset.marca}
                      alvoHoras={asset.proximoAlvoPMP}
                      onChange={onPmpCatalogo}
                    />
                  </section>

                  <details className="rounded-md border p-3">
                    <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
                      Alternativa: ler o PDF da OS Preventiva (SAP)
                    </summary>
                    <div className="mt-2 grid gap-2">
                      <Label className="flex items-center gap-1 text-sm">
                        <Paperclip className="h-4 w-4" /> PDF da OS Preventiva (SAP)
                      </Label>
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={(e) => onFile(e.target.files?.[0])}
                        className="block w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground"
                      />
                      {parsing && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Lendo PDF do SAP…
                        </div>
                      )}
                      {pdfName && !parsing && (
                        <div className="text-xs text-muted-foreground">
                          Origem: <span className="font-semibold">{pdfName}</span> · {items.length} itens
                        </div>
                      )}
                    </div>
                  </details>


                  {items.length > 0 && (
                    <section>
                      <div className="mb-1 text-sm font-semibold">
                        Itens do PMP extraídos ({items.length})
                      </div>
                      <div className="max-h-48 overflow-y-auto rounded-md border bg-muted/30 p-2 text-xs">
                        <ul className="grid gap-1">
                          {items.slice(0, 40).map((it) => (
                            <li key={it.id} className="leading-snug">
                              <span className="font-mono text-[10px] text-muted-foreground">{it.id}</span>{" "}
                              {it.label}
                              {it.servico && (
                                <Badge variant="outline" className="ml-1 text-[9px]">{it.servico}</Badge>
                              )}
                            </li>
                          ))}
                          {items.length > 40 && (
                            <li className="italic text-muted-foreground">+ {items.length - 40} outros…</li>
                          )}
                        </ul>
                      </div>
                    </section>
                  )}

                  <section className="grid gap-2">
                    <Label htmlFor="reserva">Nº da Reserva de Material (Almox)</Label>
                    <Input
                      id="reserva"
                      className="h-11"
                      placeholder="Ex.: 4500123456"
                      value={reserva}
                      onChange={(e) => setReserva(e.target.value)}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      O mecânico usará este número para retirar as peças no almoxarifado.
                    </p>
                  </section>

                  <section className="grid gap-2">
                    <Label htmlFor="obs-prev">Observações para o mecânico</Label>
                    <Textarea
                      id="obs-prev"
                      rows={3}
                      value={obs}
                      onChange={(e) => setObs(e.target.value)}
                      placeholder="Instruções específicas da preventiva…"
                    />
                  </section>
                </>
              )}
            </div>

            <DialogFooter>
              {modo === "base" ? (
                <Button onClick={salvarBase} className="gap-1">
                  <Paperclip className="h-4 w-4" /> Salvar preventiva da base
                </Button>
              ) : (
                <Button onClick={liberar} className="gap-1">
                  <Send className="h-4 w-4" /> Liberar preventiva ao Supervisor
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </CardContent>
    </Card>
  );
}

function EncerramentoSapCard({ wo }: { wo: WorkOrder }) {
  const updateWorkOrder = useAppStore((s) => s.updateWorkOrder);
  const updateAsset = useAppStore((s) => s.updateAsset);
  const [open, setOpen] = useState(false);
  const [inicio, setInicio] = useState(wo.horarioInicioSap ?? "");
  const [fim, setFim] = useState(wo.horarioFimSap ?? "");
  const [fotos, setFotos] = useState<string[]>(wo.fotosEncerramento ?? []);

  const onFotos = (files: FileList | null) => {
    if (!files) return;
    const readers = Array.from(files).map(
      (f) =>
        new Promise<string>((res) => {
          const r = new FileReader();
          r.onload = () => res(r.result as string);
          r.readAsDataURL(f);
        }),
    );
    Promise.all(readers).then((arr) => setFotos((prev) => [...prev, ...arr]));
  };

  const encerrar = () => {
    if (!inicio || !fim) {
      toast.error("Informe horário de início e fim.");
      return;
    }
    updateWorkOrder(wo.id, {
      horarioInicioSap: inicio,
      horarioFimSap: fim,
      fotosEncerramento: fotos,
      status: "fechada",
      encerradoPorPcm: new Date().toISOString(),
    });
    // Se todas as WOs deste asset estão fechadas, libera equipamento
    const state = useAppStore.getState();
    const outras = state.workOrders.filter(
      (w) => w.assetId === wo.assetId && w.id !== wo.id && w.status !== "fechada",
    );
    if (outras.length === 0) {
      updateAsset(wo.assetId, {
        column: "aguardando_saida",
        status: "em_inspecao",
        inspetorLockId: undefined,
        inspetorLockNome: undefined,
        inspetorLockEm: undefined,
      });
    }
    toast.success(`OS ${wo.numeroSAP} encerrada no SAP.`);
    setOpen(false);
  };

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display text-base font-bold">{wo.prefixo}</span>
            <Badge variant="outline" className="text-[10px] uppercase">{wo.tipo}</Badge>
            <Badge variant="secondary" className="text-[10px]">OS {wo.numeroSAP}</Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            Assinado por {wo.assinaturaTecnicoNome ?? "—"} · Aprovado por {wo.assinaturaSupervisorNome ?? "—"}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={async () => {
              const a = useAppStore.getState().assets.find((x) => x.id === wo.assetId);
              const fname = await generateOsPdf(wo, a);
              toast.success(`PDF gerado: ${fname}`);
            }}
          >
            <FileDown className="h-4 w-4" /> PDF
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1"><CheckCircle2 className="h-4 w-4" /> Encerrar SAP</Button>
            </DialogTrigger>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Encerrar OS {wo.numeroSAP} no SAP</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Início</Label>
                  <Input type="datetime-local" className="h-11" value={inicio} onChange={(e) => setInicio(e.target.value)} />
                </div>
                <div>
                  <Label>Fim</Label>
                  <Input type="datetime-local" className="h-11" value={fim} onChange={(e) => setFim(e.target.value)} />
                </div>
              </div>
              <div>
                <Label className="flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" /> Fotos do serviço ({fotos.length})</Label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => onFotos(e.target.files)}
                  className="mt-1 block w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground"
                />
                {fotos.length > 0 && (
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {fotos.map((f, i) => (
                      <img key={i} src={f} alt={`foto ${i + 1}`} className="h-16 w-full rounded border object-cover" />
                    ))}
                  </div>
                )}
              </div>
              {wo.fotosEncerramento && wo.tipo === "preventiva" && (
                <p className="text-[11px] text-muted-foreground">
                  Dica: fotos das substituições já foram anexadas pelo mecânico dentro do checklist PMP.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button onClick={encerrar} className="gap-1"><CheckCircle2 className="h-4 w-4" /> Confirmar encerramento</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}


function LiberacaoEmailCard({ asset }: { asset: Asset }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-base font-bold">{asset.prefixo}</span>
            <Badge variant="secondary" className="text-[10px] uppercase">Supervisor assinou</Badge>
            {asset.libNovoSupervisorSig && (
              <Badge variant="outline" className="text-[10px]">✍ {asset.libNovoSupervisorSig.nome}</Badge>
            )}
            {asset.contrato && (
              <Badge variant="outline" className="text-[10px]">Contrato: {asset.contrato}</Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {asset.marca} {asset.modelo} · {asset.horimetroAtual}h
          </div>
        </div>
        <EnviarLiberacaoDialog
          asset={asset}
          trigger={
            <Button size="sm" className="gap-1">
              <Mail className="h-4 w-4" /> Enviar liberação por e-mail
            </Button>
          }
        />
      </CardContent>
    </Card>
  );
}

function PreventivaBaseCard({ asset, inspection }: { asset: Asset; inspection?: Inspection }) {
  const updateAsset = useAppStore((s) => s.updateAsset);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [arquivos, setArquivos] = useState<{ url: string; nome: string }[]>([]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fs = e.target.files;
    if (!fs || fs.length === 0) return;
    setUploading(true);
    try {
      const novos: { url: string; nome: string }[] = [];
      for (const f of Array.from(fs)) {
        const up = await uploadFile(`preventivas/${asset.prefixo}`, f);
        novos.push({ url: up, nome: f.name });
      }
      setArquivos((prev) => [...prev, ...novos]);
    } catch (err) {
      console.error(err);
      toast.error("Falha ao enviar o arquivo. Tente novamente.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const salvar = () => {
    if (arquivos.length === 0) {
      toast.error("Anexe o documento da preventiva feita na base.");
      return;
    }
    const nowIso = new Date().toISOString();
    updateAsset(asset.id, {
      preventivaBaseDocUrl: arquivos[0].url,
      preventivaBaseAnexadaEm: nowIso,
      ultimaPreventivaDocUrl: arquivos[0].url,
      temPreventiva: false,
      documentos: [
        ...(asset.documentos ?? []),
        ...arquivos.map((a, i) => ({
          id: `doc-prev-base-${Date.now()}-${i}`,
          nome: a.nome || "Preventiva realizada na base.pdf",
          tipo: "os_preventiva" as const,
          dataUrl: a.url,
          createdAt: nowIso,
          autor: "PCM",
        })),
      ],
    });
    toast.success(`${asset.prefixo}: preventiva da base anexada.`);
    setOpen(false);
  };

  return (
    <Card className="border-warning/50">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display text-base font-bold">{asset.prefixo}</span>
            <Badge variant="secondary" className="text-[10px] uppercase">Preventiva feita na base</Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            {asset.marca} {asset.modelo} · {asset.horimetroAtual}h
          </div>
          {asset.preventivaBaseInfo && (
            <div className="mt-1 text-xs">Ref.: {asset.preventivaBaseInfo}</div>
          )}
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1"><Paperclip className="h-4 w-4" /> Anexar arquivo</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Preventiva feita na base — {asset.prefixo}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <AssetDataGrid asset={asset} />

              {asset.preventivaBaseInfo && (
                <div className="rounded-md border border-border bg-muted/40 p-2 text-xs">
                  Informado pelo inspetor: {asset.preventivaBaseInfo}
                </div>
              )}
              <InspectionFotosView
                prefixo={asset.prefixo}
                fotoChassi={inspection?.fotoChassi}
                fotoHorimetro={inspection?.fotoHorimetro}
                fotosEquipamento={inspection?.fotosEquipamento}
                horimetro={inspection?.horimetro}
              />
              <div>
                <Label className="flex items-center gap-1 text-xs">
                  <Paperclip className="h-3.5 w-3.5" /> PDFs / documentos da preventiva realizada na base
                </Label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="file"
                    multiple
                    accept="application/pdf,image/*"
                    disabled={uploading}
                    onChange={handleUpload}
                    className="block w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground"
                  />
                  {uploading && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Pode anexar vários arquivos (PDF da preventiva, fotos dos materiais trocados etc.).
                </p>
                {arquivos.length > 0 && (
                  <ul className="mt-2 grid gap-1">
                    {arquivos.map((a, i) => (
                      <li key={a.url} className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs">
                        <a href={a.url} target="_blank" rel="noreferrer" className="truncate underline">
                          {a.nome || "Anexado"}
                        </a>
                        <button
                          type="button"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => setArquivos((prev) => prev.filter((_, idx) => idx !== i))}
                        >
                          Remover
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button onClick={salvar} className="gap-1">
                <CheckCircle2 className="h-4 w-4" /> Salvar anexo
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

type PendenciaDoc = { asset: Asset; semAnexo: boolean; semOs: boolean };

function PendenciasDocSection({ itens }: { itens: PendenciaDoc[] }) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todas" | "anexo" | "os" | "prev">("todas");

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens
      .filter((x) =>
        filtro === "anexo"
          ? x.semAnexo
          : filtro === "os"
            ? x.semOs
            : filtro === "prev"
              ? x.asset.temPreventiva && !x.asset.preventivaLiberada
              : true,
      )
      .filter((x) => {
        if (!q) return true;
        const a = x.asset;
        return [a.prefixo, a.marca, a.modelo, a.tipo, a.column, ...(a.tags ?? [])]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      });
  }, [itens, busca, filtro]);

  if (itens.length === 0) return null;

  const semAnexoTotal = itens.filter((x) => x.semAnexo).length;
  const semOsTotal = itens.filter((x) => x.semOs).length;
  const prevTotal = itens.filter((x) => x.asset.temPreventiva && !x.asset.preventivaLiberada).length;

  return (
    <div className="mt-6">
      <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-bold">
        <AlertTriangle className="h-5 w-5 text-warning-foreground" />
        Máquinas — OS, preventiva e anexos ({itens.length})
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Todas as máquinas ativas. Use “Lançar OS corretiva” para lançar a OS no SAP e/ou marcar que a
        máquina tem preventiva a verificar — mesmo que ela já tenha OS e anexos.
      </p>


      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por prefixo, modelo, coluna, tag…"
          className="max-w-xs"
        />
        <Button size="sm" variant={filtro === "todas" ? "default" : "outline"} onClick={() => setFiltro("todas")}>
          Todas ({itens.length})
        </Button>
        <Button size="sm" variant={filtro === "anexo" ? "default" : "outline"} onClick={() => setFiltro("anexo")}>
          Sem anexo ({semAnexoTotal})
        </Button>
        <Button size="sm" variant={filtro === "os" ? "default" : "outline"} onClick={() => setFiltro("os")}>
          Sem OS corretiva ({semOsTotal})
        </Button>
        <Button size="sm" variant={filtro === "prev" ? "default" : "outline"} onClick={() => setFiltro("prev")}>
          Preventiva pendente ({prevTotal})
        </Button>

      </div>


      <Card>
        <CardContent className="grid max-h-[520px] gap-2 overflow-y-auto p-3">
          {filtradas.length === 0 && (
            <div className="p-3 text-center text-sm text-muted-foreground">Nenhuma máquina encontrada.</div>
          )}
          {filtradas.map(({ asset, semAnexo, semOs }) => (
            <div key={asset.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{asset.prefixo}</span>
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {(asset.column || "").replace(/_/g, " ")}
                  </Badge>
                  {semAnexo && (
                    <Badge variant="destructive" className="text-[10px]">Sem anexo</Badge>
                  )}
                  {semOs && (
                    <Badge variant="secondary" className="text-[10px]">Sem OS corretiva</Badge>
                  )}

                  {asset.temPreventiva && !asset.preventivaLiberada && (
                    <Badge variant="outline" className="text-[10px]">Preventiva pendente</Badge>
                  )}
                  <PreventivaStatusBadges asset={asset} />
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {asset.marca} {asset.modelo} · {asset.horimetroAtual ?? 0}h
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <CancelarPreventivaDialog asset={asset} />
                <LancarOsCorretivaDialog asset={asset} />
                <Button asChild size="sm" variant="outline" className="shrink-0 gap-1">
                  <Link to="/planner/$prefixo" params={{ prefixo: asset.prefixo }}>
                    <ExternalLink className="h-4 w-4" /> Abrir card
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
