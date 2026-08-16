import { horas } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Mail, Send, Loader2, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { sendLiberacaoEmail } from "@/lib/email-liberacao.functions";
import { useAppStore } from "@/lib/store";
import { prepararDocumentosLiberacao } from "@/lib/liberacao-docs";
import { lerHorimetroDoChecklist } from "@/lib/pdf-horimetro";
import type { Asset } from "@/lib/types";

interface Recipient {
  id: string;
  nome: string;
  email: string;
  contrato: string | null;
  perfil: string | null;
  ativo: boolean;
}

export function EnviarLiberacaoDialog({
  asset,
  trigger,
  open: openProp,
  onOpenChange,
}: {
  asset: Asset;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = (v: boolean) => {
    onOpenChange?.(v);
    if (openProp === undefined) setInternalOpen(v);
  };
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [extraEmail, setExtraEmail] = useState("");
  const [extras, setExtras] = useState<string[]>([]);
  const [observacoes, setObservacoes] = useState("");
  const [sending, setSending] = useState(false);
  const [manuais, setManuais] = useState<{ nome: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [horimetroPdf, setHorimetroPdf] = useState<string>("");
  const [emailJaEnviado, setEmailJaEnviado] = useState<"sim" | "nao" | "">("");
  const [salvando, setSalvando] = useState(false);
  const send = useServerFn(sendLiberacaoEmail);

  const inspection = useAppStore((s) =>
    s.inspections.find((i) => (asset.libNovoInspectionId && i.id === asset.libNovoInspectionId) || (i.assetId === asset.id && i.tipo === "saida")),
  );
  const workOrders = useAppStore((s) => s.workOrders);
  const updateAsset = useAppStore((s) => s.updateAsset);

  useEffect(() => {
    if (!open) return;
    setManuais(
      (asset.documentos ?? [])
        .filter((doc) => doc.id.startsWith("doc-manual-"))
        .map((doc) => ({ nome: doc.nome, url: doc.dataUrl })),
    );
    supabase
      .from("email_recipients")
      .select("id, nome, email, contrato, perfil, ativo")
      .eq("ativo", true)
      .order("nome")
      .then(({ data }) => {
        const list = (data ?? []) as Recipient[];
        setRecipients(list);
        // Pré-selecionar por contrato do ativo
        const preSel = new Set<string>();
        list.forEach((r) => {
          const matchContrato = asset.contrato && r.contrato && r.contrato.toLowerCase() === asset.contrato.toLowerCase();
          if (matchContrato || !r.contrato) preSel.add(r.id);
        });
        setSelected(preSel);
      });
  }, [open, asset.contrato]);

  const classificacao: "novo" | "frota" = (asset.horimetroAtual ?? 0) < 40 ? "novo" : "frota";

  /** Prévia do que será anexado no e-mail (checklist digital é gerado no envio). */
  const anexosPreview = useMemo(() => {
    const lista: { nome: string; origem: string }[] = [];
    if (inspection) lista.push({ nome: `Checklist de inspeção (gerado no envio)`, origem: "digital" });
    workOrders
      .filter((w) => w.assetId === asset.id)
      .forEach((w) => lista.push({ nome: `OS ${w.tipo} ${w.numeroSAP || w.id} (gerada no envio)`, origem: "digital" }));
    (asset.anexos ?? []).filter((a) => a.dataUrl).forEach((a) => lista.push({ nome: a.nome, origem: "anexo do card" }));
    const urlsIncluidas = new Set(lista.map((item) => item.nome));
    (asset.documentos ?? []).forEach((doc) => {
      if (!urlsIncluidas.has(doc.nome)) {
        lista.push({ nome: doc.nome, origem: doc.id.startsWith("doc-manual-") ? "checklist manual" : "documento do card" });
        urlsIncluidas.add(doc.nome);
      }
    });
    manuais.forEach((m) => {
      if (!urlsIncluidas.has(m.nome)) lista.push({ nome: m.nome, origem: "checklist manual" });
    });
    return lista;
  }, [asset.id, asset.anexos, inspection, workOrders, manuais]);

  const temPreventiva = useMemo(
    () =>
      !!asset.ultimaPreventivaDocUrl ||
      !!asset.preventivaBaseDocUrl ||
      (asset.documentos ?? []).some((d) => d.tipo === "os_preventiva") ||
      (asset.anexos ?? []).some((a) => /prevent/i.test(a.nome) || /prevent/i.test(a.descricao ?? "")),
    [asset.ultimaPreventivaDocUrl, asset.preventivaBaseDocUrl, asset.documentos, asset.anexos],
  );

  /** Horímetro considerado: o lido no PDF do checklist (editável) ou o do card. */
  const horimetroConsiderado = horimetroPdf.trim() !== "" ? Number(horimetroPdf) : (asset.horimetroAtual ?? 0);
  /** Acima de 250h sem preventiva anexada: precisa passar pelo PCM antes do e-mail. */
  const exigePcm = emailJaEnviado === "nao" && Number.isFinite(horimetroConsiderado) && horimetroConsiderado > 250 && !temPreventiva;

  /** O e-mail de liberação só sai com um checklist junto (digital ou em papel). */
  const temChecklist = useMemo(
    () =>
      !!inspection ||
      manuais.length > 0 ||
      (asset.documentos ?? []).some((d) => d.tipo === "checklist_entrada_saida") ||
      (asset.anexos ?? []).some((a) => a.dataUrl && /check/i.test(`${a.nome} ${a.descricao ?? ""}`)),
    [inspection, manuais, asset.documentos, asset.anexos],
  );

  /** Pendências que o supervisor precisa conhecer antes de liberar. */
  const alertasLiberacao = useMemo(() => {
    const list: string[] = [];
    const abertas = workOrders.filter((w) => w.assetId === asset.id && w.status !== "fechada");
    if (abertas.length > 0) {
      list.push(
        `${abertas.length} OS ainda aberta(s): ${abertas
          .map((w) => `${w.tipo === "preventiva" ? "Preventiva" : "Corretiva"} ${w.numeroSAP || w.id}`)
          .join(", ")}.`,
      );
    }
    if (!temPreventiva) list.push("Sem anexo de preventiva no card.");
    return list;
  }, [workOrders, asset.id, temPreventiva]);


  const destinatarios = useMemo(() => {
    const emails = new Set<string>();
    recipients.forEach((r) => { if (selected.has(r.id)) emails.add(r.email); });
    extras.forEach((e) => emails.add(e));
    return Array.from(emails);
  }, [recipients, selected, extras]);

  function addExtra() {
    const e = extraEmail.trim();
    if (!e) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { toast.error("E-mail inválido"); return; }
    if (extras.includes(e)) return;
    setExtras([...extras, e]);
    setExtraEmail("");
  }

  async function anexarChecklistManual(lista: File[]) {
    if (!lista.length) return;
    setUploading(true);
    try {
      const { uploadBlobDirect } = await import("@/lib/storage");
      const novos: { nome: string; url: string }[] = [];
      for (const file of lista) {
        const url = await uploadBlobDirect(`documentos/${asset.prefixo}/checklist-manual`, file, file.name);
        novos.push({ nome: file.name, url });
        if (!horimetroPdf) {
          const lido = await lerHorimetroDoChecklist(file);
          if (lido !== null) {
            setHorimetroPdf(String(lido));
            toast.info(`Horímetro identificado no checklist: ${lido}h`);
          }
        }
      }

      // Persiste já no card (não depende do envio do e-mail) e só confirma
      // o anexo depois que o banco aceitar a gravação.
      const nowIso = new Date().toISOString();
      const documentosAtuais = useAppStore.getState().assets.find((item) => item.id === asset.id)?.documentos ?? asset.documentos ?? [];
      const documentos = [
        ...documentosAtuais,
        ...novos.map((m, i) => ({
          id: `doc-manual-${Date.now()}-${i}`,
          nome: m.nome,
          tipo: "checklist_entrada_saida" as const,
          dataUrl: m.url,
          createdAt: nowIso,
        })),
      ];
      updateAsset(asset.id, {
        documentos,
      });
      const atualizado = useAppStore.getState().assets.find((item) => item.id === asset.id);
      if (!atualizado) throw new Error("Máquina não encontrada para salvar o anexo");
      const { error: saveError } = await supabase.from("app_assets").upsert({ id: atualizado.id, data: atualizado as unknown as Json });
      if (saveError) throw saveError;
      setManuais((prev) => {
        const existentes = new Set(prev.map((item) => item.url));
        return [...prev, ...novos.filter((item) => !existentes.has(item.url))];
      });
      toast.success(`${novos.length} checklist(s) anexado(s)`);
    } catch (e: any) {
      console.error("Falha ao anexar checklist manual", e);
      toast.error(e?.message || "Falha ao anexar arquivo");
    }
    setUploading(false);
  }


  async function gerarPdfLiberacao() {
    const [{ default: jsPDF }, logoAsset] = await Promise.all([
      import("jspdf"),
      import("@/assets/logo-engelog.png.asset.json"),
    ]);
    const BRAND = { r: 24, g: 40, b: 72 };
    const ACCENT = { r: 235, g: 118, b: 30 };
    const MUTED = { r: 110, g: 116, b: 128 };
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 15;
    let y = 38;

    // Logo
    try {
      const res = await fetch((logoAsset as any).url ?? (logoAsset as any).default?.url);
      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
      doc.addImage(dataUrl, "PNG", margin, 12, 55, 16);
    } catch { /* ignore */ }

    // Header title (duas linhas à direita, não sobrepõe a logo)
    doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("CHECKLIST DE ENTRADA E SAÍDA", pageW - margin, 16, { align: "right" });
    doc.text("DE EQUIPAMENTOS", pageW - margin, 22, { align: "right" });
    doc.setFontSize(9);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.setFont("helvetica", "normal");
    doc.text(`Prefixo: ${asset.prefixo}`, pageW - margin, 27, { align: "right" });
    doc.text(`Emitido em ${new Date().toLocaleString("pt-BR")}`, pageW - margin, 31, { align: "right" });
    doc.setFillColor(ACCENT.r, ACCENT.g, ACCENT.b);
    doc.rect(margin, 32, pageW - margin * 2, 1.2, "F");
    doc.setTextColor(30, 30, 30);

    const ensureSpace = (need: number) => {
      if (y + need > pageH - 20) {
        doc.setDrawColor(220);
        doc.line(15, pageH - 12, pageW - 15, pageH - 12);
        doc.setFontSize(8);
        doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
        doc.text("Documento gerado eletronicamente", 15, pageH - 7);
        doc.text(`Página ${doc.getNumberOfPages()}`, pageW - 15, pageH - 7, { align: "right" });
        doc.addPage();
        y = 20;
        doc.setTextColor(30, 30, 30);
      }
    };

    const sectionTitle = (label: string) => {
      ensureSpace(12);
      doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
      doc.rect(margin, y, pageW - margin * 2, 7, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(label.toUpperCase(), margin + 2, y + 5);
      y += 10;
      doc.setTextColor(30, 30, 30);
      doc.setFont("helvetica", "normal");
    };

    const kvGrid = (pairs: [string, string][], cols = 2) => {
      const colW = (pageW - margin * 2) / cols;
      const rowH = 10;
      doc.setFontSize(9);
      pairs.forEach((p, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        if (col === 0) ensureSpace(rowH);
        const x = margin + col * colW;
        const yy = y + row * rowH;
        doc.setDrawColor(230);
        doc.rect(x, yy, colW, rowH);
        doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.text(p[0].toUpperCase(), x + 2, yy + 3.5);
        doc.setTextColor(30, 30, 30);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(doc.splitTextToSize(p[1] || "—", colW - 4)[0] ?? "—", x + 2, yy + 8);
      });
      y += Math.ceil(pairs.length / cols) * rowH + 4;
    };

    // Identificação
    sectionTitle("Identificação do Equipamento");
    kvGrid([
      ["Prefixo", asset.prefixo],
      ["Tipo", asset.tipo || "—"],
      ["Marca / Modelo", [asset.marca, asset.modelo].filter(Boolean).join(" ") || "—"],
      ["Horímetro atual", horas(asset.horimetroAtual)],
      ["Classificação", classificacao === "novo" ? "NOVO (< 40h)" : "FROTA"],
      ["Contrato", asset.contrato ?? "—"],
      ["Data de Liberação", new Date().toLocaleString("pt-BR")],
      ["Tipo de inspeção", inspection?.tipoEntradaSaida ? "Entrada + Saída" : (inspection?.tipo === "saida" ? "Saída" : "Entrada")],
    ], 2);

    if (observacoes) {
      sectionTitle("Observações da Liberação");
      doc.setFontSize(9);
      const lines = doc.splitTextToSize(observacoes, pageW - margin * 2);
      lines.forEach((ln: string) => { ensureSpace(5); doc.text(ln, margin, y); y += 4.5; });
      y += 3;
    }

    if (inspection) {
      const filled = inspection.items.filter((i) => i.status !== null);
      const nA = filled.filter((i) => i.status === "A").length;
      const nAR = filled.filter((i) => i.status === "AR").length;
      const nR = filled.filter((i) => i.status === "R").length;
      const nNA = filled.filter((i) => i.status === "NA").length;

      sectionTitle("Resumo da Inspeção");
      kvGrid([
        ["Inspetor", inspection.inspetor],
        ["Data", new Date(inspection.data).toLocaleString("pt-BR")],
        ["Horímetro", `${inspection.horimetro}h`],
        ["Combustível", `${inspection.combustivel}%`],
        ["Aprovados (A)", String(nA)],
        ["Com restrição (AR)", String(nAR)],
        ["Reprovados (R)", String(nR)],
        ["Não aplicáveis (NA)", String(nNA)],
      ], 4);

      // Pontos de atenção
      const atencao = filled.filter((i) => i.status === "R" || i.status === "AR");
      if (atencao.length > 0) {
        sectionTitle(`Pontos de atenção (${atencao.length})`);
        doc.setFontSize(9);
        atencao.forEach((it) => {
          const txt = `[${it.status}] #${it.id} ${it.description}${it.observation ? " — " + it.observation : ""}${it.photos && it.photos.length ? "  (" + it.photos.length + " foto/s)" : ""}`;
          const lines = doc.splitTextToSize(txt, pageW - margin * 2);
          ensureSpace(lines.length * 4.5 + 2);
          doc.text(lines, margin, y);
          y += lines.length * 4.5 + 1;
        });
        y += 3;
      }

      // TODOS os 120 itens (marcados e não marcados)
      sectionTitle(`Itens do Checklist (${inspection.items.length})`);
      doc.setFontSize(8);
      inspection.items.forEach((it) => {
        const st = it.status ?? "—";
        const txt = `[${st}] #${it.id} ${it.description}${it.observation ? " — " + it.observation : ""}`;
        const lines = doc.splitTextToSize(txt, pageW - margin * 2);
        ensureSpace(lines.length * 3.8 + 1);
        // Faixa colorida por status
        if (it.status === "R") doc.setTextColor(180, 30, 30);
        else if (it.status === "AR") doc.setTextColor(180, 110, 20);
        else if (it.status === "A") doc.setTextColor(30, 110, 50);
        else doc.setTextColor(110, 116, 128);
        doc.text(lines, margin, y);
        y += lines.length * 3.8 + 0.4;
      });
      doc.setTextColor(30, 30, 30);
      y += 3;

      if (inspection.observacoesGerais) {
        sectionTitle("Observações Gerais do Inspetor");
        doc.setFontSize(9);
        const lines = doc.splitTextToSize(inspection.observacoesGerais, pageW - margin * 2);
        lines.forEach((ln: string) => { ensureSpace(5); doc.text(ln, margin, y); y += 4.5; });
        y += 3;
      }
    }

    // Assinaturas
    sectionTitle("Assinaturas");
    ensureSpace(40);
    const boxW = (pageW - margin * 2) / 2 - 4;
    const boxH = 34;
    const drawSig = (x: number, label: string, sig?: { dataUrl: string; nome: string; cargo: string }, em?: string) => {
      doc.setDrawColor(210);
      doc.rect(x, y, boxW, boxH);
      doc.setFontSize(7);
      doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
      doc.text(label.toUpperCase(), x + 2, y + 3.5);
      if (sig?.dataUrl) {
        try { doc.addImage(sig.dataUrl, "PNG", x + 4, y + 5, boxW - 8, 16); } catch { /* ignore */ }
      }
      doc.setDrawColor(180);
      doc.line(x + 4, y + boxH - 12, x + boxW - 4, y + boxH - 12);
      doc.setTextColor(30, 30, 30);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(sig?.nome ?? "—", x + boxW / 2, y + boxH - 8, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
      doc.text((sig?.cargo ?? "").toUpperCase(), x + boxW / 2, y + boxH - 4.5, { align: "center" });
      if (em) doc.text(new Date(em).toLocaleString("pt-BR"), x + boxW / 2, y + boxH - 1.5, { align: "center" });
      doc.setTextColor(30, 30, 30);
    };
    drawSig(margin, "Inspetor", asset.libNovoInspetorSig, asset.libNovoInspetorEm);
    drawSig(margin + boxW + 8, "Supervisor de Manutenção", asset.libNovoSupervisorSig, asset.libNovoSupervisorEm);
    y += boxH + 6;

    // Footer final
    doc.setDrawColor(220);
    doc.line(15, pageH - 12, pageW - 15, pageH - 12);
    doc.setFontSize(8);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text("Documento gerado eletronicamente — Planner Matriz / Fluxo de Máquinas", 15, pageH - 7);
    doc.text(`Página ${doc.getNumberOfPages()}`, pageW - 15, pageH - 7, { align: "right" });

    const filename = `Checklist_Entrada_Saida_${asset.prefixo}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
    try {
      const dataUrl = doc.output("datauristring");
      const { uploadDataUrl } = await import("@/lib/storage");
      const publicUrl = await uploadDataUrl(`documentos/${asset.prefixo}`, dataUrl, filename);
      // Mantém apenas o último checklist gerado (checklists manuais são preservados)
      const existing = (asset.documentos ?? []).filter(
        (d) => d.id.startsWith("doc-manual-") || d.tipo !== "checklist_entrada_saida",
      );
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
    } catch (err) { console.error("Falha ao arquivar PDF", err); }
  }

  /** Persiste no banco o estado atual do ativo. */
  async function persistirAtivo() {
    const atualizado = useAppStore.getState().assets.find((item) => item.id === asset.id);
    if (!atualizado) throw new Error("Máquina não encontrada");
    const { error } = await supabase.from("app_assets").upsert({ id: atualizado.id, data: atualizado as unknown as Json });
    if (error) throw error;
  }

  /** E-mail já foi enviado antes: apenas guarda o checklist no card. */
  async function salvarSomenteChecklist() {
    if (manuais.length === 0) { toast.error("Anexe o PDF/foto do checklist"); return; }
    setSalvando(true);
    try {
      const patch: Partial<Asset> = {};
      if (horimetroPdf.trim() !== "" && Number.isFinite(Number(horimetroPdf))) patch.horimetroAtual = Number(horimetroPdf);
      if (Object.keys(patch).length) updateAsset(asset.id, patch);
      await persistirAtivo();
      toast.success("Checklist salvo no card (e-mail de liberação já havia sido enviado)");
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao salvar checklist");
    }
    setSalvando(false);
  }

  /** Acima de 250h e sem preventiva: card vai para o PCM anexar a preventiva. */
  async function enviarAoPcm() {
    if (manuais.length === 0) { toast.error("Anexe o PDF/foto do checklist"); return; }
    setSalvando(true);
    try {
      const patch: Partial<Asset> = {
        column: "pcm",
        status: "aguardando_pcm",
        faltaDocPCM: true,
      };
      if (horimetroPdf.trim() !== "" && Number.isFinite(Number(horimetroPdf))) patch.horimetroAtual = Number(horimetroPdf);
      patch.chatMessages = [
        ...(asset.chatMessages ?? []),
        {
          id: `msg-${Date.now()}`,
          autor: "Sistema",
          texto: `CHECKLIST ANTIGO ANEXADO. HORÍMETRO ${horimetroConsiderado}H (> 250H) — AGUARDANDO PCM ANEXAR A PREVENTIVA ANTES DO E-MAIL DE LIBERAÇÃO.`,
          fixadoNoCard: true,
          createdAt: new Date().toISOString(),
        },
      ];
      updateAsset(asset.id, patch);
      await persistirAtivo();
      toast.success("Enviado ao PCM para anexar a preventiva");
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao enviar ao PCM");
    }
    setSalvando(false);
  }


  async function enviar() {
    if (!destinatarios.length) { toast.error("Selecione ao menos um destinatário"); return; }
    if (!temChecklist) {
      toast.error("Anexe o checklist (PDF/foto) antes de enviar a liberação");
      return;
    }

    setSending(true);
    let emailOk = false;
    try {
      const docs = await prepararDocumentosLiberacao({ asset, inspection, workOrders });
      const nowIso = new Date().toISOString();
      const jaSalvos = new Set((asset.documentos ?? []).map((d) => d.dataUrl));
      const docsManuais = manuais
        .filter((m) => !jaSalvos.has(m.url))
        .map((m, i) => ({
          id: `doc-manual-${Date.now()}-${i}`,
          nome: m.nome,
          tipo: "checklist_entrada_saida" as const,
          dataUrl: m.url,
          createdAt: nowIso,
        }));
      updateAsset(asset.id, { documentos: [...docs.documentosAtualizados, ...docsManuais] });

      const cardUrl = `${window.location.origin}/planner/${encodeURIComponent(asset.prefixo)}`;
      const res = await send({
        data: {
          prefixo: asset.prefixo,
          inventario: asset.inventario,
          codigo_Ativo: asset.codigoAtivo,
          numero_serie: asset.numeroSerie,
          marca: asset.marca,
          modelo: asset.modelo,
          tipo_objeto: asset.tipo,
          horimetro: asset.horimetroAtual,
          classificacao,
          contrato: asset.contrato,
          observacoes,
          destinatarios,
          pdf_inspecao_url: docs.pdfInspecaoUrl ?? manuais[0]?.url,
          pdf_os_url: docs.pdfOsUrl,
          card_url: cardUrl,
          anexos: [
            ...docs.anexosEmail,
            ...manuais.map((m) => ({ nome: m.nome, tipo: "checklist_entrada_saida" as const, url: m.url })),
          ],

        },
      });
      if (res.ok) {
        emailOk = true;
        // Liberou = sai de todas as filas (inspeção, supervisor, mecânico).
        // Fica só como LIBERADA para o PCM encerrar a OS.
        updateAsset(asset.id, {
          column: "liberado",
          status: "liberado",
          dataLiberacao: nowIso,
          libNovoStatus: "enviado",
          reinspecaoSolicitada: false,
          faltaDocPCM: false,
          inspetorLockId: undefined,
          inspetorLockNome: undefined,
          inspetorLockEm: undefined,
          inspetorAlocadoId: undefined,
          inspetorAlocadoNome: undefined,
          inspetorAlocadoEm: undefined,
        });
        try { await persistirAtivo(); } catch (err) { console.error("persistir liberação", err); }
        toast.success(`E-mail enviado para ${res.destinatarios.length} destinatário(s)`);
      } else {
        toast.error(res.message || "Falha ao enviar e-mail");
      }
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (msg.includes("WorkflowTriggerIsNotEnabled") || msg.includes("is not enabled")) {
        toast.error("Fluxo do Power Automate está desativado. Ative-o em make.powerautomate.com e tente novamente.");
      } else {
        toast.error(msg || "Falha ao enviar e-mail");
      }
    }
    setSending(false);
    if (emailOk) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="gap-2">
            <Mail className="h-4 w-4" /> Enviar liberação
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Enviar liberação — {asset.prefixo}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-md border bg-muted/30 p-3 text-xs">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span><b>Prefixo:</b> {asset.prefixo}</span>
              <span><b>Marca/Modelo:</b> {asset.marca} {asset.modelo}</span>
              <span><b>Tipo:</b> {asset.tipo}</span>
              <span><b>Horímetro:</b> {asset.horimetroAtual}h</span>
              {asset.contrato && <span><b>Contrato:</b> {asset.contrato}</span>}
              <Badge variant={classificacao === "novo" ? "default" : "outline"} className="text-[10px]">
                {classificacao === "novo" ? "NOVO (< 30h)" : "FROTA"}
              </Badge>
            </div>
          </div>

          <div>
            <Label className="text-xs uppercase text-muted-foreground">Destinatários cadastrados</Label>
            <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
              {recipients.length === 0 && (
                <p className="p-2 text-xs text-muted-foreground">
                  Nenhum destinatário cadastrado. Cadastre em <b>Admin → Destinatários de e-mail</b>.
                </p>
              )}
              {recipients.map((r) => (
                <label key={r.id} className="flex cursor-pointer items-center gap-2 rounded p-1.5 hover:bg-muted/50">
                  <Checkbox
                    checked={selected.has(r.id)}
                    onCheckedChange={(v) => {
                      const next = new Set(selected);
                      if (v) next.add(r.id); else next.delete(r.id);
                      setSelected(next);
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm">{r.nome} <span className="text-muted-foreground">— {r.email}</span></div>
                    <div className="flex gap-1 text-[10px] text-muted-foreground">
                      {r.contrato && <span>Contrato: {r.contrato}</span>}
                      {r.perfil && <span>· {r.perfil}</span>}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs uppercase text-muted-foreground">E-mails avulsos</Label>
            <div className="mt-1 flex gap-2">
              <Input
                type="email"
                placeholder="fulano@fornecedoraengelog.com.br"
                value={extraEmail}
                onChange={(e) => setExtraEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExtra(); } }}
                className="min-w-0 flex-1"
              />
              <Button type="button" variant="outline" size="sm" onClick={addExtra}><Plus className="h-4 w-4" /></Button>
            </div>
            {extras.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {extras.map((e) => (
                  <Badge key={e} variant="secondary" className="gap-1">
                    {e}
                    <button onClick={() => setExtras(extras.filter((x) => x !== e))}><X className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs uppercase text-muted-foreground">Checklist manual (papel) — PDF/foto</Label>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Use quando o checklist de liberação foi feito em papel, antes do sistema. O arquivo vai anexado no e-mail e fica no card da máquina.
            </p>
            <div className="mt-1 flex w-full items-center gap-2">
              <Input
                type="file"
                accept="application/pdf,image/*"
                multiple
                disabled={uploading}
                onChange={(e) => { const lista = Array.from(e.target.files ?? []); e.target.value = ""; void anexarChecklistManual(lista); }}
                className="min-w-0 flex-1 text-xs"
              />
              {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
            </div>
            {manuais.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {manuais.map((m) => (
                  <Badge key={m.url} variant="secondary" className="gap-1 max-w-full">
                    <span className="truncate">{m.nome}</span>
                    <button onClick={() => setManuais(manuais.filter((x) => x.url !== m.url))}><X className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {manuais.length > 0 && (
            <div className="space-y-3 rounded-md border bg-muted/30 p-3">
              <div>
                <Label className="text-xs uppercase text-muted-foreground">Horímetro apontado no checklist</Label>
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={horimetroPdf}
                    onChange={(e) => setHorimetroPdf(e.target.value)}
                    placeholder={String(asset.horimetroAtual ?? 0)}
                    className="w-40"
                  />
                  <span className="text-xs text-muted-foreground">h — identificado automaticamente no PDF (confira/ajuste)</span>
                </div>
              </div>

              <div>
                <Label className="text-xs uppercase text-muted-foreground">O e-mail de liberação já foi enviado?</Label>
                <RadioGroup
                  className="mt-2 flex gap-6"
                  value={emailJaEnviado}
                  onValueChange={(v) => setEmailJaEnviado(v as "sim" | "nao")}
                >
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <RadioGroupItem value="sim" /> Sim, já foi enviado
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <RadioGroupItem value="nao" /> Não, ainda não
                  </label>
                </RadioGroup>
              </div>

              {emailJaEnviado === "sim" && (
                <p className="text-[11px] text-muted-foreground">
                  O checklist será apenas salvo no card, sem novo envio de e-mail.
                </p>
              )}
              {exigePcm && (
                <div className="rounded-md border-2 border-warning bg-warning/10 p-2 text-[11px]">
                  Máquina com <b>{horimetroConsiderado}h</b> (acima de 250h) e sem preventiva anexada. O card vai para o
                  <b> PCM anexar a preventiva</b>; o e-mail de liberação só pode ser enviado depois disso.
                </div>
              )}
            </div>
          )}




          <div>
            <Label className="text-xs uppercase text-muted-foreground">Observações (opcional)</Label>
            <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Ex: liberação para o contrato XPTO, retirada no pátio." rows={2} />
          </div>

          {alertasLiberacao.length > 0 && (
            <div className="rounded-md border-2 border-warning bg-warning/10 p-2 text-[11px]">
              <div className="mb-1 font-bold uppercase">Atenção antes de liberar</div>
              <ul className="ml-4 list-disc">
                {alertasLiberacao.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          {!temChecklist && (
            <div className="rounded-md border-2 border-destructive bg-destructive/10 p-2 text-[11px] font-medium">
              Nenhum checklist anexado. Anexe o PDF/foto do checklist acima — sem ele o e-mail de liberação não pode ser enviado.
            </div>
          )}


          <div className="rounded-md border bg-primary/5 p-2 text-[11px] text-muted-foreground">

            Assunto: <b className="text-foreground">Liberação de Equipamento {asset.prefixo}{asset.modelo ? " - " + [asset.marca, asset.modelo].filter(Boolean).join(" ") : ""}</b><br />
            Total: <b>{destinatarios.length}</b> destinatário(s) · <b>{anexosPreview.length}</b> anexo(s)
            {anexosPreview.length > 0 && (
              <ul className="mt-1 list-disc pl-4">
                {anexosPreview.map((a, i) => (
                  <li key={`${a.nome}-${i}`} className="truncate">{a.nome} <span className="opacity-70">({a.origem})</span></li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          {emailJaEnviado === "sim" ? (
            <Button onClick={salvarSomenteChecklist} disabled={salvando} className="gap-2">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar checklist
            </Button>
          ) : exigePcm ? (
            <Button onClick={enviarAoPcm} disabled={salvando} className="gap-2">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Enviar ao PCM para anexar preventiva
            </Button>
          ) : (
            <Button onClick={enviar} disabled={sending || destinatarios.length === 0 || !temChecklist} className="gap-2">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar liberação
            </Button>
          )}
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
