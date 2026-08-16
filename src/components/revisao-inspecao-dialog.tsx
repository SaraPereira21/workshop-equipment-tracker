import { useMemo, useState } from "react";
import { CheckCircle2, XCircle, Fuel, AlertTriangle, Camera, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { sendLiberacaoEmail } from "@/lib/email-liberacao.functions";
import { prepararDocumentosLiberacao } from "@/lib/liberacao-docs";
import type { Asset, ChecklistStatus } from "@/lib/types";
import { describeChecklistItem } from "@/lib/checklist-items";

function statusBadge(s: ChecklistStatus) {
  if (s === "A") return <Badge className="bg-success text-success-foreground">A</Badge>;
  if (s === "AR") return <Badge className="bg-warning text-warning-foreground">AR</Badge>;
  if (s === "R") return <Badge className="bg-destructive text-destructive-foreground">R</Badge>;
  if (s === "NA") return <Badge variant="outline">NA</Badge>;
  return null;
}

export function RevisaoInspecaoDialog({
  asset,
  trigger,
}: {
  asset: Asset;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const inspections = useAppStore((s) => s.inspections);
  const workOrders = useAppStore((s) => s.workOrders);
  const supervisorSig = useAppStore((s) => s.signatures["supervisor:global"]);
  const updateAsset = useAppStore((s) => s.updateAsset);
  const updateInspection = useAppStore((s) => s.updateInspection);
  const enviarEmail = useServerFn(sendLiberacaoEmail);

  const inspection = useMemo(() => {
    if (asset.libNovoInspectionId) {
      const found = inspections.find((i) => i.id === asset.libNovoInspectionId);
      if (found) return found;
    }
    // fallback: última inspeção de saída do ativo
    return inspections.find((i) => i.assetId === asset.id && i.tipo === "saida") ?? null;
  }, [inspections, asset]);

  const preenchidos = useMemo(
    () => (inspection ? inspection.items.filter((it) => it.status !== null) : []),
    [inspection],
  );
  const falhas = preenchidos.filter((i) => i.status === "R");
  const restr = preenchidos.filter((i) => i.status === "AR");
  const okItens = preenchidos.filter((i) => i.status === "A");
  const naItens = preenchidos.filter((i) => i.status === "NA");
  const galeria = useMemo(() => {
    const fotos: { url: string; legenda: string }[] = [];
    if (!inspection) return fotos;
    if (inspection.fotoChassi) fotos.push({ url: inspection.fotoChassi, legenda: "Plaqueta do chassi" });
    if (inspection.fotoHorimetro) fotos.push({ url: inspection.fotoHorimetro, legenda: "Horímetro" });
    Object.entries(inspection.fotosEquipamento ?? {}).forEach(([k, url]) => {
      if (url) fotos.push({ url, legenda: k });
    });
    inspection.items.forEach((it) => {
      (it.photos ?? []).forEach((url) =>
        fotos.push({ url, legenda: `#${it.id} ${it.description || describeChecklistItem(it.id).description}` }),
      );
    });
    return fotos;
  }, [inspection]);
  const totalFotos = galeria.length;

  /** OS ainda abertas para este equipamento */
  const osAbertas = useMemo(
    () => workOrders.filter((w) => w.assetId === asset.id && w.status !== "fechada"),
    [workOrders, asset.id],
  );

  /** Preventiva: existe anexo/documento comprovando a preventiva? */
  const temAnexoPreventiva = useMemo(() => {
    if (asset.ultimaPreventivaDocUrl || asset.preventivaBaseDocUrl) return true;
    if ((asset.documentos ?? []).some((d) => d.tipo === "os_preventiva")) return true;
    if ((asset.anexos ?? []).some((a) => /prevent/i.test(a.nome) || /prevent/i.test(a.descricao ?? ""))) return true;
    return false;
  }, [asset.ultimaPreventivaDocUrl, asset.preventivaBaseDocUrl, asset.documentos, asset.anexos]);

  const alertas = useMemo(() => {
    const list: string[] = [];
    if (osAbertas.length > 0) {
      list.push(
        `${osAbertas.length} OS ainda aberta(s): ${osAbertas
          .map((w) => `${w.tipo === "preventiva" ? "Preventiva" : "Corretiva"} ${w.numeroSAP || w.id}`)
          .join(", ")}.`,
      );
    }
    if (!temAnexoPreventiva) {
      list.push("Sem anexo de preventiva no card (nem preventiva feita na base, nem OS preventiva encerrada).");
    }
    return list;
  }, [osAbertas, temAnexoPreventiva]);

  const [cienteAlertas, setCienteAlertas] = useState(false);


  const abrirPdf = async () => {
    if (!inspection) return;
    setPdfLoading(true);
    try {
      const { generateInspectionPdf } = await import("@/lib/inspection-pdf");
      const { dataUrl, filename } = await generateInspectionPdf(asset, inspection);
      const bin = atob(dataUrl.split(",")[1]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const win = window.open(blobUrl, "_blank");
      if (!win) {
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (err: any) {
      toast.error(`Falha ao gerar o PDF: ${err?.message ?? "erro desconhecido"}`);
    }
    setPdfLoading(false);
  };



  const assinar = async () => {
    if (falhas.length > 0) {
      toast.error(`Não é possível liberar: ${falhas.length} item(ns) REPROVADO(S). Reprove e devolva para reprogramação.`);
      return;
    }
    if (alertas.length > 0 && !cienteAlertas) {
      toast.error("Existem pendências (OS aberta / anexo de preventiva). Marque a ciência para liberar assim mesmo.");
      return;
    }
    if (!supervisorSig) {
      toast.error("Cadastre sua assinatura padrão de supervisor primeiro.");
      return;
    }


    setSaving(true);
    const nowIso = new Date().toISOString();
    const signedAsset: Asset = {
      ...asset,
      libNovoStatus: "pronto_envio",
      libNovoSupervisorSig: supervisorSig,
      libNovoSupervisorEm: nowIso,
    };
    updateAsset(asset.id, signedAsset);
    // Grava a assinatura também na inspeção (para o PDF nunca perder a assinatura)
    if (inspection) {
      updateInspection(inspection.id, { supervisorSig, supervisorSigEm: nowIso });
    }



    // Envio automático do e-mail de liberação
    try {
      const { data } = await supabase
        .from("email_recipients")
        .select("email, contrato, ativo")
        .eq("ativo", true);
      const destinatarios = Array.from(
        new Set(
          (data ?? [])
            .filter((r: any) =>
              !r.contrato || (asset.contrato && String(r.contrato).toLowerCase() === asset.contrato.toLowerCase()),
            )
            .map((r: any) => r.email as string),
        ),
      );
      if (destinatarios.length === 0) {
        toast.warning("Assinado, mas não há destinatários cadastrados — envie a liberação manualmente.");
      } else {
        const docs = await prepararDocumentosLiberacao({ asset: signedAsset, inspection: inspection ?? undefined, workOrders });
        updateAsset(asset.id, { documentos: docs.documentosAtualizados });
        const cardUrl = `${window.location.origin}/planner/${encodeURIComponent(asset.prefixo)}`;
        const res = await enviarEmail({
          data: {
            prefixo: asset.prefixo,
            inventario: asset.inventario,
            codigo_Ativo: asset.codigoAtivo,
            numero_serie: asset.numeroSerie,
            modelo: asset.modelo,
            marca: asset.marca,
            tipo_objeto: asset.tipo,
            horimetro: asset.horimetroAtual,
            classificacao: (asset.horimetroAtual ?? 0) < 40 ? "novo" : "frota",
            contrato: asset.contrato,
            observacoes: inspection?.observacoesGerais,
            responsavel_pcm: supervisorSig.nome,
            destinatarios,
            pdf_inspecao_url: docs.pdfInspecaoUrl,
            pdf_os_url: docs.pdfOsUrl,
            card_url: cardUrl,
            anexos: docs.anexosEmail,
          },
        });
        if (res.ok) {
          updateAsset(asset.id, { libNovoStatus: "enviado", column: "liberado", status: "liberado", dataLiberacao: nowIso });
          toast.success(`Liberação assinada e e-mail enviado para ${destinatarios.length} destinatário(s).`);
        } else {
          toast.error(`Assinado, mas o e-mail falhou: ${res.message}`);
        }
      }
    } catch (err: any) {
      toast.error(`Assinado, mas o e-mail falhou: ${err?.message ?? "erro desconhecido"}`);
    }
    setSaving(false);
    setOpen(false);
  };


  const rejeitar = () => {
    if (!motivo.trim()) {
      toast.error("Descreva o motivo da rejeição.");
      return;
    }
    setSaving(true);
    const nowIso = new Date().toISOString();
    const inspetorId = asset.inspetorLockId ?? asset.inspectionDraft?.inspetorId;
    const aviso = {
      id: crypto.randomUUID(),
      autor: supervisorSig?.nome ?? "Supervisor",
      autorCargo: supervisorSig?.cargo ?? "Supervisor",
      texto: `⛔ Liberação REPROVADA pelo supervisor. Motivo: ${motivo.trim()}. Máquina devolvida para reprogramação e alocação de manutentor.`,
      mencionados: inspetorId ? [inspetorId] : undefined,
      createdAt: nowIso,
    };
    updateAsset(asset.id, {
      libNovoStatus: "rejeitado",
      libNovoRejeicaoMotivo: motivo.trim(),
      libNovoRejeicaoEm: nowIso,
      libNovoSupervisorSig: undefined,
      libNovoSupervisorEm: undefined,
      // volta para reprogramação / alocação de manutentor
      column: "mdo",
      status: "em_manutencao",
      mecanicoId: undefined,
      mecanicoIds: undefined,
      chatMessages: [...(asset.chatMessages ?? []), aviso],
    });
    toast.success("Reprovado — inspetor notificado e máquina devolvida para alocação de manutentor.");
    setSaving(false);
    setOpen(false);
    setMotivo("");
    setRejectMode(false);
  };


  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setRejectMode(false); setMotivo(""); } }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Revisão da Inspeção — {asset.prefixo}
            <Badge variant="outline" className="text-[10px]">{asset.marca} {asset.modelo}</Badge>
            <Badge variant="secondary" className="text-[10px]">Novo (&lt; 40h)</Badge>
          </DialogTitle>
        </DialogHeader>

        {!inspection ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Inspeção não encontrada para este ativo.
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            {/* Resumo */}
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span><b>Inspetor:</b> {inspection.inspetor}</span>
                <span><b>Data:</b> {new Date(inspection.data).toLocaleString("pt-BR")}</span>
                <span><b>Horímetro:</b> {inspection.horimetro}h</span>
                <span className="inline-flex items-center gap-1"><Fuel className="h-3 w-3" /> {inspection.combustivel}%</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                <span className="rounded bg-success/15 px-2 py-0.5 font-semibold text-success">{okItens.length} Aprovado(s)</span>
                <span className="rounded bg-warning/25 px-2 py-0.5 font-semibold text-warning-foreground">{restr.length} c/ Restrição</span>
                <span className="rounded bg-destructive/15 px-2 py-0.5 font-semibold text-destructive">{falhas.length} Reprovado(s)</span>
                <span className="rounded bg-muted px-2 py-0.5 font-semibold text-muted-foreground">{naItens.length} N/A</span>
                <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                  <Camera className="h-3 w-3" /> {totalFotos} foto(s)
                </span>
              </div>
            </div>

            {/* Alertas de pendência antes de liberar */}
            {alertas.length > 0 && (
              <div className="rounded-md border-2 border-warning bg-warning/10 p-3">
                <div className="mb-1 flex items-center gap-1 text-xs font-bold uppercase text-warning-foreground">
                  <AlertTriangle className="h-4 w-4" /> Atenção antes de assinar a liberação
                </div>
                <ul className="ml-4 list-disc space-y-1 text-xs">
                  {alertas.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
                <label className="mt-2 flex items-start gap-2 text-xs font-medium">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={cienteAlertas}
                    onChange={(e) => setCienteAlertas(e.target.checked)}
                  />
                  Estou ciente das pendências acima e autorizo a liberação mesmo assim.
                </label>
              </div>
            )}

            {/* PDF completo da inspeção */}

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-3">
              <div className="text-xs text-muted-foreground">
                Abra o PDF da inspeção para ver todo o checklist e as fotos antes de assinar.
              </div>
              <Button variant="outline" size="sm" className="gap-1" onClick={abrirPdf} disabled={pdfLoading}>
                {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                Abrir PDF da inspeção
              </Button>
            </div>

            {/* Todas as fotos do inspetor */}
            {galeria.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                  Fotos do inspetor ({galeria.length})
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                  {galeria.map((f, idx) => (
                    <a key={idx} href={f.url} target="_blank" rel="noreferrer" className="group block">
                      <img
                        src={f.url}
                        alt={f.legenda}
                        loading="lazy"
                        className="h-20 w-full rounded border object-cover transition group-hover:opacity-80"
                      />
                      <div className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-muted-foreground">{f.legenda}</div>
                    </a>
                  ))}
                </div>
              </div>
            )}



            {/* Reprovados — bloqueiam a liberação */}
            {falhas.length > 0 && (
              <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-destructive">
                  <XCircle className="h-4 w-4" /> Reprovados ({falhas.length}) — liberação bloqueada
                </div>
                <div className="space-y-2">
                  {falhas.map((it) => (
                    <div key={it.id} className="rounded border bg-background p-2">
                      <div className="flex items-start gap-2">
                        {statusBadge(it.status)}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold">#{it.id} {it.description || describeChecklistItem(it.id).description}</div>
                          {it.observation && <div className="mt-0.5 text-xs text-muted-foreground">{it.observation}</div>}
                          {it.photos && it.photos.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {it.photos.map((p, idx) => (
                                <a key={idx} href={p} target="_blank" rel="noreferrer">
                                  <img src={p} alt="foto" className="h-14 w-14 rounded object-cover" />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-[11px] font-medium text-destructive">
                  Máquina com item reprovado não pode ser liberada. Reprove para devolver à reprogramação e alocação de manutentor.
                </div>
              </div>
            )}

            {/* Aprovados com restrição — decisão do supervisor */}
            {restr.length > 0 && (
              <div className="rounded-md border border-warning/50 bg-warning/5 p-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-warning-foreground">
                  <AlertTriangle className="h-4 w-4" /> Aprovados com restrição ({restr.length}) — decisão do supervisor
                </div>
                <div className="space-y-2">
                  {restr.map((it) => (
                    <div key={it.id} className="rounded border bg-background p-2">
                      <div className="flex items-start gap-2">
                        {statusBadge(it.status)}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold">#{it.id} {it.description || describeChecklistItem(it.id).description}</div>
                          {it.observation && <div className="mt-0.5 text-xs text-muted-foreground">{it.observation}</div>}
                          {it.photos && it.photos.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {it.photos.map((p, idx) => (
                                <a key={idx} href={p} target="_blank" rel="noreferrer">
                                  <img src={p} alt="foto" className="h-14 w-14 rounded object-cover" />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  Conforme a estratégia, assine para liberar mesmo com estas restrições ou reprove — o inspetor é notificado e a máquina volta para reprogramação.
                </div>
              </div>
            )}


            {/* Todos os itens preenchidos */}
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Itens inspecionados ({preenchidos.length}/{inspection.items.length})
              </div>
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
                {preenchidos.map((it) => (
                  <div key={it.id} className="flex items-start gap-2 border-b py-1 last:border-b-0">
                    <div className="shrink-0">{statusBadge(it.status)}</div>
                    <div className="flex-1 min-w-0 text-xs">
                      <span className="text-muted-foreground">#{it.id}</span> {it.description || describeChecklistItem(it.id).description}
                      {it.observation && <span className="text-muted-foreground"> — {it.observation}</span>}
                      {it.photos && it.photos.length > 0 && (
                        <span className="ml-1 inline-flex items-center gap-0.5 text-primary">
                          <Camera className="h-3 w-3" />{it.photos.length}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Observações gerais */}
            {inspection.observacoesGerais && (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Observações gerais do inspetor</div>
                <div className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs">
                  {inspection.observacoesGerais}
                </div>
              </div>
            )}

            {/* Assinatura do inspetor */}
            {asset.libNovoInspetorSig && (
              <div className="rounded-md border p-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground">Assinatura do inspetor</div>
                <img src={asset.libNovoInspetorSig.dataUrl} alt="assinatura" className="mt-1 h-16" />
                <div className="text-xs">
                  <b>{asset.libNovoInspetorSig.nome}</b> — {asset.libNovoInspetorSig.cargo}
                </div>
                {asset.libNovoInspetorEm && (
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(asset.libNovoInspetorEm).toLocaleString("pt-BR")}
                  </div>
                )}
              </div>
            )}

            {rejectMode && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <Label className="text-xs font-semibold">Motivo da rejeição</Label>
                <Textarea
                  rows={3}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: item #45 sem foto, refazer o teste operacional…"
                  className="mt-1"
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button>
          {inspection && !rejectMode && (
            <>
              <Button
                variant="outline"
                className="gap-1 border-destructive/60 text-destructive hover:bg-destructive/10"
                onClick={() => setRejectMode(true)}
              >
                <XCircle className="h-4 w-4" /> Rejeitar
              </Button>
              <Button
                onClick={assinar}
                disabled={saving || falhas.length > 0 || (alertas.length > 0 && !cienteAlertas)}
                title={falhas.length > 0 ? "Existe item reprovado — liberação bloqueada" : alertas.length > 0 ? "Confirme a ciência das pendências" : undefined}
                className="gap-1"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Assinar liberação
              </Button>
            </>
          )}
          {rejectMode && (
            <>
              <Button variant="ghost" onClick={() => { setRejectMode(false); setMotivo(""); }}>Cancelar rejeição</Button>
              <Button variant="destructive" onClick={rejeitar} disabled={saving} className="gap-1">
                <XCircle className="h-4 w-4" /> Confirmar rejeição
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
