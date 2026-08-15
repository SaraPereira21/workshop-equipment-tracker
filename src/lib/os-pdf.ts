import { horas } from "@/lib/utils";
import jsPDF from "jspdf";
import logoAsset from "@/assets/logo-engelog.png.asset.json";
import type { Asset, WorkOrder } from "./types";
import { drawApontamentoManual } from "./os-apontamento";
import { dataHora, formatDuracao, formatMin, horaCurta, somaTotais, sessoes, totalSessoes, totalMin } from "./tempo";

const BRAND = { r: 24, g: 40, b: 72 }; // deep navy
const ACCENT = { r: 235, g: 118, b: 30 }; // orange
const MUTED = { r: 110, g: 116, b: 128 };

async function loadImageDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

interface Ctx {
  doc: jsPDF;
  y: number;
  pageH: number;
  pageW: number;
  margin: number;
}

function ensureSpace(ctx: Ctx, needed: number) {
  if (ctx.y + needed > ctx.pageH - 20) {
    drawFooter(ctx);
    ctx.doc.addPage();
    ctx.y = 20;
  }
}

function drawFooter(ctx: Ctx) {
  const { doc, pageH, pageW } = ctx;
  const page = doc.getNumberOfPages();
  doc.setDrawColor(220);
  doc.line(15, pageH - 12, pageW - 15, pageH - 12);
  doc.setFontSize(8);
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  doc.text("Documento gerado eletronicamente", 15, pageH - 7);
  doc.text(`Página ${page}`, pageW - 15, pageH - 7, { align: "right" });
}

function sectionTitle(ctx: Ctx, label: string) {
  ensureSpace(ctx, 42);
  const { doc, margin, pageW } = ctx;
  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
  doc.rect(margin, ctx.y, pageW - margin * 2, 7, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(label.toUpperCase(), margin + 2, ctx.y + 5);
  ctx.y += 10;
  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "normal");
}

function keyValueGrid(ctx: Ctx, pairs: [string, string][], cols = 2) {
  const { doc, margin, pageW } = ctx;
  const colW = (pageW - margin * 2) / cols;
  const rowH = 10;
  doc.setFontSize(9);
  pairs.forEach((p, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    if (col === 0) ensureSpace(ctx, rowH);
    const x = margin + col * colW;
    const y = ctx.y + row * rowH;
    doc.setDrawColor(230);
    doc.rect(x, y, colW, rowH);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(p[0].toUpperCase(), x + 2, y + 3.5);
    doc.setTextColor(30, 30, 30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const val = p[1] || "—";
    doc.text(doc.splitTextToSize(val, colW - 4)[0] ?? "—", x + 2, y + 8);
  });
  const rows = Math.ceil(pairs.length / cols);
  ctx.y += rows * rowH + 4;
}

async function drawHeader(ctx: Ctx, wo: WorkOrder, asset?: Asset) {
  const { doc, margin, pageW } = ctx;
  const logo = await loadImageDataUrl(logoAsset.url);
  if (logo) {
    try { doc.addImage(logo, "PNG", margin, 12, 55, 16); } catch { /* ignore */ }
  }
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  const title = wo.tipo === "preventiva"
    ? "ORDEM DE SERVIÇO — PREVENTIVA (PMP)"
    : "ORDEM DE SERVIÇO — CORRETIVA";
  doc.text(title, pageW - margin, 18, { align: "right" });
  doc.setFontSize(10);
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  doc.setFont("helvetica", "normal");
  doc.text(`Nº SAP: ${wo.numeroSAP}`, pageW - margin, 24, { align: "right" });
  doc.text(`Emitido em ${new Date().toLocaleString("pt-BR")}`, pageW - margin, 29, { align: "right" });

  // Accent bar
  doc.setFillColor(ACCENT.r, ACCENT.g, ACCENT.b);
  doc.rect(margin, 32, pageW - margin * 2, 1.2, "F");
  ctx.y = 38;

  // Plano PMP abaixo da barra, para não sobrepor a logo
  if (wo.tipo === "preventiva") {
    const lbl = pmpLabel(wo);
    if (lbl) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(ACCENT.r, ACCENT.g, ACCENT.b);
      doc.text(`Plano executado: ${lbl}`, margin, ctx.y);
      ctx.y += 5;
      const sub = [wo.pmpCodigoPlano ? `Cód. plano ${wo.pmpCodigoPlano}` : "", wo.pmpModeloPlano ?? ""]
        .filter(Boolean)
        .join(" · ");
      if (sub) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
        doc.text(sub, margin, ctx.y);
        ctx.y += 5;
      }
      ctx.y += 1;
    }
  }
  doc.setTextColor(30, 30, 30);
}


/** Rótulo do PMP em execução (plano salvo ou deduzido dos itens do checklist). */
function pmpLabel(wo: WorkOrder): string {
  if (wo.pmpPlanoLabel) return wo.pmpPlanoLabel;
  const ints = Array.from(new Set((wo.pmpChecklist ?? []).map((i) => i.intervalo).filter(Boolean)));
  return ints.join(" + ");
}

function drawChecklist(ctx: Ctx, wo: WorkOrder) {
  if (!wo.pmpChecklist?.length) return;
  const feitos = wo.pmpChecklist.filter((i) => i.done).length;
  sectionTitle(ctx, `Operações ${pmpLabel(wo) || "PMP"} · ${feitos}/${wo.pmpChecklist.length} executadas`);

  const { doc, margin, pageW } = ctx;
  const total = pageW - margin * 2;

  // Legenda padrão SAP
  ensureSpace(ctx, 8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  doc.text("E = EXECUTADO   /   P = PENDENTE   /   N = NÃO EXECUTADO", margin, ctx.y + 3);
  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "normal");
  ctx.y += 6;

  const headers = ["E", "P", "N", "Descrição", "Serviço", "Material", "Prev.", "Real"];
  const weights = [5, 5, 5, 36, 17, 22, 7, 7];
  const sum = weights.reduce((a, b) => a + b, 0);
  const cw = weights.map((w) => (w / sum) * total);
  const xs = cw.map((_, i) => margin + cw.slice(0, i).reduce((a, b) => a + b, 0));
  const fontSize = 7.6;
  const lineH = 3.9;
  const padY = 2.4;

  const header = (firstRowH: number) => {
    ensureSpace(ctx, 7 + firstRowH + 2);
    doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
    doc.rect(margin, ctx.y, total, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(fontSize);
    doc.setTextColor(255, 255, 255);
    headers.forEach((h, i) => {
      const center = i < 3 || i > 5;
      if (center) doc.text(h, xs[i] + cw[i] / 2, ctx.y + 4.7, { align: "center" });
      else doc.text(h, xs[i] + 1.5, ctx.y + 4.7);
    });
    ctx.y += 7;
    doc.setTextColor(30, 30, 30);
    doc.setFont("helvetica", "normal");
  };

  const rows = wo.pmpChecklist.map((it, i) => {
    const desc = `${String(i + 1).padStart(3, "0")}-${it.label}`;
    const cells = [
      doc.splitTextToSize(desc, cw[3] - 3) as string[],
      doc.splitTextToSize(it.servico || "-", cw[4] - 3) as string[],
      doc.splitTextToSize(it.material || "-", cw[5] - 3) as string[],
    ];
    const maxLines = Math.max(...cells.map((c) => c.length));
    return { it, cells, rowH: Math.max(6.5, maxLines * lineH + padY * 2) };
  });

  header(rows[0]?.rowH ?? 8);

  rows.forEach(({ it, cells, rowH }, r) => {
    if (ctx.y + rowH > ctx.pageH - 22) {
      drawFooter(ctx);
      doc.addPage();
      ctx.y = 20;
      header(rowH);
    }
    if (r % 2 === 1) {
      doc.setFillColor(247, 248, 250);
      doc.rect(margin, ctx.y, total, rowH, "F");
    }
    doc.setDrawColor(200);
    doc.rect(margin, ctx.y, total, rowH);
    for (let i = 1; i < xs.length; i++) doc.line(xs[i], ctx.y, xs[i], ctx.y + rowH);

    // Marcação E / P / N — só marca "E" quando executado no app;
    // P e N ficam em branco para o mecânico preencher à mão.
    if (it.na || it.done) {
      const col = it.na ? 2 : 0;
      doc.setFontSize(fontSize);
      doc.setFont("helvetica", "bold");
      if (it.na) doc.setTextColor(150, 100, 0);
      else doc.setTextColor(30, 130, 60);
      doc.text("X", xs[col] + cw[col] / 2, ctx.y + rowH / 2 + 1.2, { align: "center" });
      doc.setTextColor(30, 30, 30);
      doc.setFont("helvetica", "normal");
    }
    doc.setFontSize(fontSize);


    doc.text(cells[0], xs[3] + 1.5, ctx.y + padY + 2.9);
    doc.text(cells[1], xs[4] + 1.5, ctx.y + padY + 2.9);
    doc.text(cells[2], xs[5] + 1.5, ctx.y + padY + 2.9);
    ctx.y += rowH;
  });
  ctx.y += 6;
}


function drawFalhas(ctx: Ctx, wo: WorkOrder) {
  if (!wo.falhasHerdadas?.length) return;
  sectionTitle(ctx, `Falhas apontadas na inspeção (${wo.falhasHerdadas.length})`);
  drawTable(
    ctx,
    ["Nº", "Falha apontada", "Situação"],
    [8, 72, 20],
    wo.falhasHerdadas.map((f, i) => [
      String(i + 1).padStart(2, "0"),
      f.descricao || "—",
      f.corrigido ? "Corrigido" : "Pendente",
    ]),
  );
}


/** Tabela genérica com quebra de linha e espaçamento confortável. */
function drawTable(
  ctx: Ctx,
  headers: string[],
  weights: number[],
  rows: string[][],
  opts: { fontSize?: number; padY?: number; lineH?: number; zebra?: boolean } = {},
) {
  const { doc, margin, pageW } = ctx;
  const { fontSize = 8.5, padY = 3, lineH = 4.4, zebra = true } = opts;
  const total = pageW - margin * 2;
  const sum = weights.reduce((a, b) => a + b, 0);
  const cw = weights.map((w) => (w / sum) * total);
  const xs = cw.map((_, i) => margin + cw.slice(0, i).reduce((a, b) => a + b, 0));

  const measured = rows.map((row) => {
    const cells = row.map((c, i) => doc.splitTextToSize(c || "—", cw[i] - 4) as string[]);
    const maxLines = Math.max(...cells.map((c) => c.length));
    return { cells, rowH: maxLines * lineH + padY * 2 };
  });

  const header = (firstRowH: number) => {
    ensureSpace(ctx, 8 + firstRowH + 2);
    doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
    doc.rect(margin, ctx.y, total, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(fontSize);
    doc.setTextColor(255, 255, 255);
    headers.forEach((h, i) => doc.text(h.toUpperCase(), xs[i] + 2, ctx.y + 5.4));
    ctx.y += 8;
    doc.setTextColor(30, 30, 30);
    doc.setFont("helvetica", "normal");
  };

  header(measured[0]?.rowH ?? 10);

  measured.forEach(({ cells, rowH }, r) => {
    if (ctx.y + rowH > ctx.pageH - 22) {
      drawFooter(ctx);
      doc.addPage();
      ctx.y = 20;
      header(rowH);
    }

    if (zebra && r % 2 === 1) {
      doc.setFillColor(247, 248, 250);
      doc.rect(margin, ctx.y, total, rowH, "F");
    }
    doc.setDrawColor(215);
    doc.rect(margin, ctx.y, total, rowH);
    doc.setFontSize(fontSize);
    cells.forEach((lines, i) => {
      if (i > 0) doc.line(xs[i], ctx.y, xs[i], ctx.y + rowH);
      doc.text(lines, xs[i] + 2, ctx.y + padY + 3.2);
    });
    ctx.y += rowH;
  });
  ctx.y += 6;
}

function drawOperations(ctx: Ctx, wo: WorkOrder) {
  if (!wo.operations?.length) return;
  sectionTitle(ctx, `Operações executadas (${wo.operations.length})`);
  drawTable(
    ctx,
    ["Nº", "Problema / Operação", "Causa", "Solução aplicada", "Status"],
    [7, 27, 22, 30, 14],
    wo.operations.map((o, i) => [
      String(i + 1).padStart(2, "0"),
      o.problema || "—",
      o.causa || "—",
      o.solucao || "—",
      o.corrigido ? "Concluída" : "Pendente",
    ]),
  );
}

/** Tarefas executadas pelo mecânico (corretiva) — vivem no card do equipamento. */
function drawTarefasExecutadas(ctx: Ctx, wo: WorkOrder, asset?: Asset) {
  if (wo.tipo !== "corretiva") return;
  const tarefas = asset?.pendingTasks ?? [];
  if (!tarefas.length) return;
  const feitas = tarefas.filter((t) => t.done).length;
  sectionTitle(ctx, `Execução do mecânico — o que foi feito (${feitas}/${tarefas.length})`);
  drawTable(
    ctx,
    ["Nº", "Atividade", "Situação", "Tempo"],
    [7, 63, 15, 15],
    tarefas.map((t, i) => [
      String(i + 1).padStart(2, "0"),
      t.text || "—",
      t.done ? "Executada" : "Pendente",
      formatMin(totalSessoes(sessoes(t))) || "—",
    ]),
  );

  if (asset?.mecanicoObs) {
    const { doc, margin, pageW } = ctx;
    doc.setFontSize(9);
    doc.splitTextToSize(`Observações do mecânico: ${asset.mecanicoObs}`, pageW - margin * 2).forEach((ln: string) => {
      ensureSpace(ctx, 5);
      doc.text(ln, margin, ctx.y);
      ctx.y += 5.2;
    });
    ctx.y += 3;
  }
}



function drawMateriais(ctx: Ctx, wo: WorkOrder) {
  if (!wo.materiais?.length) return;
  sectionTitle(ctx, `Materiais aplicados nas operações (${wo.materiais.length})`);
  drawTable(
    ctx,
    ["Item", "Código OTM", "Descrição do material", "Qtd", "Horas"],
    [8, 20, 52, 10, 10],
    wo.materiais.map((m, i) => [
      String(i + 1).padStart(2, "0"),
      m.codigoOTM || "—",
      m.descricao || "—",
      String(m.quantidade ?? 0),
      m.horas != null ? String(m.horas) : "—",
    ]),
  );
}


function drawObservacoes(ctx: Ctx, wo: WorkOrder) {
  if (!wo.observacoes) return;
  sectionTitle(ctx, "Observações");
  const { doc, margin, pageW } = ctx;
  doc.setFontSize(9);
  const lines = doc.splitTextToSize(wo.observacoes, pageW - margin * 2);
  lines.forEach((ln: string) => {
    ensureSpace(ctx, 5);
    doc.text(ln, margin, ctx.y);
    ctx.y += 5.2;
  });
  ctx.y += 3;
}

function drawApontamentoDigital(ctx: Ctx, wo: WorkOrder, asset?: Asset) {
  const rows: string[][] = [];
  const push = (label: string, v: Parameters<typeof sessoes>[0]) => {
    sessoes(v).forEach((s) => {
      rows.push([
        label,
        (s.nome || "—").toUpperCase(),
        horaCurta(s.inicio),
        horaCurta(s.fim),
        formatMin(totalMin(s)),
      ]);
    });
  };
  (wo.pmpChecklist ?? []).forEach((it) => push(it.label, it));
  (wo.operations ?? []).forEach((o) => push(o.problema || o.solucao || "OPERAÇÃO", o));
  if (wo.tipo === "corretiva") {
    (asset?.pendingTasks ?? []).forEach((t) => push(t.text, t));
  }

  const osSes = sessoes({
    apontamentos: wo.apontamentos,
    inicio: wo.execInicio,
    fim: wo.execFim,
    minAcum: wo.execMinAcum,
  });

  if (!rows.length && !osSes.length) return;

  sectionTitle(ctx, "Apontamento de horas (digital)");
  keyValueGrid(ctx, [
    ["Início do serviço", dataHora(wo.execInicio)],
    ["Fim do serviço", dataHora(wo.execFim)],
    ["Tempo total (equipe)", formatMin(totalSessoes(osSes)) || formatDuracao(wo.execInicio, wo.execFim)],
    ["Soma das atividades", formatMin(somaTotais([
      ...(wo.pmpChecklist ?? []),
      ...(wo.operations ?? []),
      ...(wo.tipo === "corretiva" ? (asset?.pendingTasks ?? []) : []),
    ]))],
  ], 2);

  if (rows.length) {
    drawTable(ctx, ["Atividade", "Mecânico", "Início", "Fim", "Duração"], [44, 22, 12, 12, 10], rows);
  }
}

function drawTempos(ctx: Ctx, wo: WorkOrder) {
  if (!wo.horarioInicioSap && !wo.horarioFimSap) return;
  sectionTitle(ctx, "Tempos e Encerramento SAP");
  keyValueGrid(ctx, [
    ["Início SAP", wo.horarioInicioSap ? new Date(wo.horarioInicioSap).toLocaleString("pt-BR") : "—"],
    ["Fim SAP", wo.horarioFimSap ? new Date(wo.horarioFimSap).toLocaleString("pt-BR") : "—"],
    ["Encerrado pelo PCM", wo.encerradoPorPcm ? new Date(wo.encerradoPorPcm).toLocaleString("pt-BR") : "—"],
    ["Reserva de material", wo.reservaMaterial ?? "—"],
  ], 2);
}


export interface OsPdfResult {
  filename: string;
  dataUrl: string;
}

async function buildOsPdf(wo: WorkOrder, asset?: Asset) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const ctx: Ctx = {
    doc,
    y: 38,
    pageH: doc.internal.pageSize.getHeight(),
    pageW: doc.internal.pageSize.getWidth(),
    margin: 15,
  };

  await drawHeader(ctx, wo, asset);

  // Identificação
  sectionTitle(ctx, "Identificação do Equipamento");
  keyValueGrid(ctx, [
    ["Prefixo", asset?.prefixo ?? wo.prefixo],
    ["Tipo", asset?.tipo ?? "—"],
    ["Marca / Modelo", asset ? `${asset.marca} ${asset.modelo}` : "—"],
    ["Horímetro atual", asset ? horas(asset.horimetroAtual) : ""],
    ["Último PMP", asset ? horas(asset.horimetroUltimoPMP) : ""],
    ["Próximo alvo PMP", asset ? horas(asset.proximoAlvoPMP) : ""],
    ["Contrato", asset?.contrato ?? "—"],
    ["Prioridade", (asset?.priority ?? "—").toUpperCase()],
  ], 2);

  // Dados da OS
  sectionTitle(ctx, "Dados da Ordem de Serviço");
  keyValueGrid(ctx, [
    ["Nº OS SAP", wo.numeroSAP],
    ["Tipo", wo.tipo.toUpperCase()],
    ["Filial", wo.filial],
    ["Solicitante", wo.solicitante],
    ["Setor executante", wo.setorExecutante],
    ["Centro de custo", wo.centroCusto || "—"],
    ["Reserva material", wo.reservaMaterial ?? "—"],
    ["Tipos", wo.tiposManutencao.join(", ") || "—"],
    ...(wo.tipo === "preventiva"
      ? ([
          ["PMP executado", pmpLabel(wo) || "—"],
          ["Código do plano / modelo", [wo.pmpCodigoPlano, wo.pmpModeloPlano].filter(Boolean).join(" · ") || "—"],
        ] as [string, string][])
      : []),
  ], 2);

  drawFalhas(ctx, wo);
  drawChecklist(ctx, wo);
  drawOperations(ctx, wo);
  drawTarefasExecutadas(ctx, wo, asset);
  drawMateriais(ctx, wo);
  drawObservacoes(ctx, wo);
  drawApontamentoDigital(ctx, wo, asset);
  drawTempos(ctx, wo);
  // Assinaturas ficam apenas no bloco final (junto ao apontamento manual)

  // Fotos anexadas nos itens da preventiva (após as assinaturas)
  const itensComFoto = (wo.pmpChecklist ?? []).filter((it) => !!it.foto);
  if (itensComFoto.length) {
    sectionTitle(ctx, `Fotos dos itens da preventiva (${itensComFoto.length})`);
    const per = 3;
    const w = (ctx.pageW - ctx.margin * 2 - (per - 1) * 4) / per;
    const h = w * 0.75;
    for (let i = 0; i < itensComFoto.length; i += per) {
      const linha = itensComFoto.slice(i, i + per);
      const imgs = await Promise.all(linha.map((it) => loadImageDataUrl(it.foto!)));
      ensureSpace(ctx, h + 12);
      linha.forEach((it, col) => {
        const x = ctx.margin + col * (w + 4);
        const data = imgs[col];
        if (data) {
          try { doc.addImage(data, "JPEG", x, ctx.y, w, h); } catch { /* ignore */ }
        } else {
          doc.setDrawColor(220);
          doc.rect(x, ctx.y, w, h);
        }
        doc.setFontSize(7);
        doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
        const cap = doc.splitTextToSize(`${it.intervalo ? it.intervalo + " · " : ""}${it.label}`, w).slice(0, 2);
        doc.text(cap, x, ctx.y + h + 3);
        doc.setTextColor(30, 30, 30);
      });
      ctx.y += h + 11;
    }
  }

  // Fotos de encerramento
  if (wo.fotosEncerramento?.length) {
    sectionTitle(ctx, `Fotos do serviço (${wo.fotosEncerramento.length})`);
    const per = 3;
    const w = (ctx.pageW - ctx.margin * 2 - (per - 1) * 4) / per;
    const h = w * 0.75;
    const fotos = await Promise.all(wo.fotosEncerramento.map((src) => loadImageDataUrl(src)));
    fotos.forEach((src, i) => {
      const col = i % per;
      if (col === 0) ensureSpace(ctx, h + 4);
      const x = ctx.margin + col * (w + 4);
      if (src) {
        try { doc.addImage(src, "JPEG", x, ctx.y, w, h); } catch { /* ignore */ }
      }
      if (col === per - 1 || i === fotos.length - 1) ctx.y += h + 4;
    });
  }

  // Bloco manual (SAP) + assinaturas (digitais quando já coletadas)
  drawApontamentoManual(ctx, {
    linhasServico: 5,
    linhasParada: 4,
    linhasObservacoes: 3,
    assinaturas: [
      {
        label: "Mecânico Executante",
        dataUrl: wo.assinaturaTecnico,
        nome: wo.assinaturaTecnicoNome,
        cargo: wo.assinaturaTecnicoCargo,
        em: wo.assinaturaTecnicoEm,
      },
      {
        label: "Supervisor de Manutenção",
        dataUrl: wo.assinaturaSupervisor,
        nome: wo.assinaturaSupervisorNome,
        cargo: wo.assinaturaSupervisorCargo,
        em: wo.assinaturaSupervisorEm,
      },
      { label: "Responsável PCM" },
      { label: "Data / Hora Liberação" },
    ],
  });


  drawFooter(ctx);
  const fname = `OS_${wo.tipo}_${wo.prefixo}_${wo.numeroSAP || wo.id}.pdf`;
  return { doc, filename: fname };
}

export async function generateOsPdfData(wo: WorkOrder, asset?: Asset): Promise<OsPdfResult> {
  const { doc, filename } = await buildOsPdf(wo, asset);
  return { filename, dataUrl: doc.output("datauristring") };
}

export async function generateOsPdf(wo: WorkOrder, asset?: Asset, opts: { save?: boolean } = {}) {
  const { doc, filename } = await buildOsPdf(wo, asset);
  if (opts.save !== false) doc.save(filename);
  return filename;
}
