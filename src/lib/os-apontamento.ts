import type jsPDF from "jspdf";

const BRAND = { r: 24, g: 40, b: 72 };
const MUTED = { r: 110, g: 116, b: 128 };

export interface ApontamentoCtx {
  doc: jsPDF;
  y: number;
  pageH: number;
  pageW: number;
  margin: number;
}

function ensure(ctx: ApontamentoCtx, needed: number) {
  if (ctx.y + needed > ctx.pageH - 18) {
    ctx.doc.addPage();
    ctx.y = 20;
  }
}

function title(ctx: ApontamentoCtx, label: string) {
  ensure(ctx, 14);
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

function grid(
  ctx: ApontamentoCtx,
  headers: string[],
  weights: number[],
  rows: number,
  rowH = 8,
) {
  const { doc, margin, pageW } = ctx;
  const total = pageW - margin * 2;
  const sum = weights.reduce((a, b) => a + b, 0);
  const cw = weights.map((w) => (w / sum) * total);
  ensure(ctx, 7 + rows * rowH + 3);

  doc.setFillColor(240, 242, 245);
  doc.rect(margin, ctx.y, total, 7, "F");
  doc.setDrawColor(190);
  doc.rect(margin, ctx.y, total, 7);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  headers.forEach((h, i) => {
    const x = margin + cw.slice(0, i).reduce((a, b) => a + b, 0);
    doc.text(h.toUpperCase(), x + 1.5, ctx.y + 4.7);
    if (i > 0) doc.line(x, ctx.y, x, ctx.y + 7);
  });
  ctx.y += 7;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 30, 30);

  for (let r = 0; r < rows; r++) {
    doc.setDrawColor(205);
    doc.rect(margin, ctx.y, total, rowH);
    for (let i = 1; i < cw.length; i++) {
      const x = margin + cw.slice(0, i).reduce((a, b) => a + b, 0);
      doc.line(x, ctx.y, x, ctx.y + rowH);
    }
    ctx.y += rowH;
  }
  ctx.y += 3;
}

function linhas(ctx: ApontamentoCtx, count: number, gap = 8) {
  const { doc, margin, pageW } = ctx;
  ensure(ctx, count * gap + 3);
  for (let i = 0; i < count; i++) {
    doc.setDrawColor(210);
    doc.line(margin, ctx.y + gap - 2, pageW - margin, ctx.y + gap - 2);
    ctx.y += gap;
  }
  ctx.y += 2;
}

export interface AssinaturaCampo {
  label: string;
  dataUrl?: string;
  nome?: string;
  cargo?: string;
  em?: string;
}

function assinaturasCampo(ctx: ApontamentoCtx, campos: AssinaturaCampo[]) {
  const { doc, margin, pageW } = ctx;
  const total = pageW - margin * 2;
  const boxH = 30;
  ensure(ctx, boxH + 4);
  const w = total / campos.length;
  doc.setDrawColor(195);
  doc.rect(margin, ctx.y, total, boxH);
  campos.forEach((c, i) => {
    const x = margin + i * w;
    if (i > 0) doc.line(x, ctx.y, x, ctx.y + boxH);
    doc.setFontSize(7);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text(c.label.toUpperCase(), x + 1.5, ctx.y + 4);
    if (c.dataUrl) {
      try { doc.addImage(c.dataUrl, "PNG", x + 3, ctx.y + 5, w - 6, 12); } catch { /* ignore */ }
    }
    doc.setDrawColor(180);
    doc.line(x + 3, ctx.y + boxH - 10, x + w - 3, ctx.y + boxH - 10);
    doc.setDrawColor(195);
    doc.setTextColor(30, 30, 30);
    if (c.nome) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(c.nome, x + w / 2, ctx.y + boxH - 6.5, { align: "center", maxWidth: w - 4 });
      doc.setFont("helvetica", "normal");
    }
    doc.setFontSize(6.5);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    if (c.cargo) doc.text(c.cargo.toUpperCase(), x + w / 2, ctx.y + boxH - 3.5, { align: "center", maxWidth: w - 4 });
    if (c.em) doc.text(new Date(c.em).toLocaleString("pt-BR"), x + w / 2, ctx.y + boxH - 1, { align: "center" });
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(7);
  });
  ctx.y += boxH + 4;
}

export interface ApontamentoOptions {
  /** linhas para apontamento de horas do executante */
  linhasServico?: number;
  /** linhas para paradas / interferências */
  linhasParada?: number;
  /** linhas de observações manuscritas */
  linhasObservacoes?: number;
  /** assinaturas (digitais quando já existirem, senão campos em branco) */
  assinaturas?: AssinaturaCampo[];
}

/**
 * Bloco manual (padrão SAP) para preenchimento à caneta quando o mecânico
 * não tem celular da empresa: horários, paradas, localização, observações
 * e assinaturas de liberação (único bloco de assinatura da OS).
 */
export function drawApontamentoManual(ctx: ApontamentoCtx, opts: ApontamentoOptions = {}) {
  const {
    linhasServico = 5,
    linhasParada = 4,
    linhasObservacoes = 4,
    assinaturas = [
      { label: "Executante" },
      { label: "Responsável" },
      { label: "Supervisor Manutenção" },
      { label: "Data / Hora Liberação" },
    ],
  } = opts;

  const { doc, margin, pageW } = ctx;

  title(ctx, "Apontamento manual de horas (preenchimento à caneta)");

  grid(ctx, ["Executante", "Início do Serviço", "Fim do Serviço", "Tempo"], [40, 25, 25, 15], linhasServico);

  grid(
    ctx,
    ["Início da Parada", "Fim da Parada", "Interferência", "% Int.", "Produto"],
    [24, 24, 22, 12, 22],
    linhasParada,
  );

  ensure(ctx, 14);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("Alteração da Localização · Origem:", margin, ctx.y + 4);
  doc.setFont("helvetica", "normal");
  doc.setDrawColor(200);
  doc.line(margin + 52, ctx.y + 4.8, margin + (pageW - margin * 2) / 2 - 2, ctx.y + 4.8);
  doc.setFont("helvetica", "bold");
  doc.text("Destino:", margin + (pageW - margin * 2) / 2 + 4, ctx.y + 4);
  doc.setFont("helvetica", "normal");
  doc.line(margin + (pageW - margin * 2) / 2 + 20, ctx.y + 4.8, pageW - margin, ctx.y + 4.8);
  ctx.y += 10;

  // mantém observações + assinaturas juntas na mesma página
  ensure(ctx, 10 + linhasObservacoes * 8 + 34);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Observações:", margin, ctx.y + 3);
  doc.setFont("helvetica", "normal");
  ctx.y += 5;
  linhas(ctx, linhasObservacoes);

  assinaturasCampo(ctx, assinaturas);
}
