import { horas } from "@/lib/utils";
import type { Asset, Inspection } from "./types";
import { describeChecklistItem } from "./checklist-items";
import { FOTOS_EQUIPAMENTO } from "./fotos-equipamento";

/** Texto do item: usa o salvo e cai para o catálogo quando ausente. */
const itemDesc = (it: { id: number; description?: string }) =>
  it.description?.trim() || describeChecklistItem(it.id).description;

export interface InspectionPdfResult {
  filename: string;
  dataUrl: string;
}

export async function generateInspectionPdf(
  asset: Asset,
  inspection: Inspection | undefined,
  opts: { observacoes?: string; classificacao?: "novo" | "frota"; save?: boolean } = {},
): Promise<InspectionPdfResult> {
  const [{ default: jsPDF }, logoAsset] = await Promise.all([
    import("jspdf"),
    import("@/assets/logo-engelog.png.asset.json"),
  ]);
  const observacoes = opts.observacoes ?? "";
  const classificacao =
    opts.classificacao ?? ((asset.horimetroAtual ?? 0) < 40 ? "novo" : "frota");

  const BRAND = { r: 24, g: 40, b: 72 };
  const ACCENT = { r: 235, g: 118, b: 30 };
  const MUTED = { r: 110, g: 116, b: 128 };
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  let y = 38;

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
  } catch {
    /* ignore */
  }

  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("CHECKLIST DE ENTRADA E SAÍDA", pageW - margin, 16, { align: "right" });
  doc.text("DE EQUIPAMENTOS", pageW - margin, 22, { align: "right" });
  doc.setFontSize(9);
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  doc.setFont("helvetica", "normal");
  doc.text(`Prefixo: ${asset.prefixo}`, pageW - margin, 27, { align: "right" });
  doc.text(`Emitido em ${new Date().toLocaleString("pt-BR")}`, pageW - margin, 31, {
    align: "right",
  });
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

  sectionTitle("Identificação do Equipamento");
  kvGrid(
    [
      ["Prefixo", asset.prefixo],
      ["Tipo", asset.tipo || "—"],
      ["Marca / Modelo", [asset.marca, asset.modelo].filter(Boolean).join(" ") || "—"],
      ["Horímetro atual", horas(asset.horimetroAtual)],
      ["Classificação", classificacao === "novo" ? "NOVO (< 40h)" : "FROTA"],
      ["Contrato", asset.contrato ?? "—"],
      ["Data de Emissão", new Date().toLocaleString("pt-BR")],
      [
        "Tipo de inspeção",
        inspection?.tipoEntradaSaida
          ? "Entrada + Saída"
          : inspection?.tipo === "saida"
            ? "Saída"
            : "Entrada",
      ],
    ],
    2,
  );

  // Fotos obrigatórias: plaqueta do chassi e horímetro
  const fixas: [string, string | undefined][] = [
    ["Plaqueta do chassi", inspection?.fotoChassi],
    ["Horímetro", inspection?.fotoHorimetro],
  ];
  if (fixas.some(([, u]) => !!u)) {
    sectionTitle("Registros fotográficos");
    const boxWp = (pageW - margin * 2 - 6) / 2;
    const boxHp = 45;
    ensureSpace(boxHp + 8);
    const startY = y;
    for (let i = 0; i < fixas.length; i++) {
      const [label, url] = fixas[i];
      const x = margin + i * (boxWp + 6);
      doc.setDrawColor(220);
      doc.rect(x, startY, boxWp, boxHp);
      doc.setFontSize(7);
      doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
      doc.text(label.toUpperCase(), x + 2, startY + 4);
      if (url) {
        try {
          const res = await fetch(url);
          const blob = await res.blob();
          const du = await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result as string);
            r.onerror = reject;
            r.readAsDataURL(blob);
          });
          const props = doc.getImageProperties(du);
          const ratio = props.width / props.height || 1;
          let w = boxWp - 6;
          let h = w / ratio;
          if (h > boxHp - 10) {
            h = boxHp - 10;
            w = h * ratio;
          }
          doc.addImage(du, x + (boxWp - w) / 2, startY + 6, w, h);
        } catch {
          /* ignore */
        }
      }
      doc.setTextColor(30, 30, 30);
    }
    y = startY + boxHp + 5;
  }

  if (observacoes) {

    sectionTitle("Observações da Liberação");
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(observacoes, pageW - margin * 2);
    lines.forEach((ln: string) => {
      ensureSpace(5);
      doc.text(ln, margin, y);
      y += 4.5;
    });
    y += 3;
  }

  if (inspection) {
    const filled = inspection.items.filter((i) => i.status !== null);
    const nA = filled.filter((i) => i.status === "A").length;
    const nAR = filled.filter((i) => i.status === "AR").length;
    const nR = filled.filter((i) => i.status === "R").length;
    const nNA = filled.filter((i) => i.status === "NA").length;

    sectionTitle("Resumo da Inspeção");
    kvGrid(
      [
        ["Inspetor", inspection.inspetor],
        ["Data", new Date(inspection.data).toLocaleString("pt-BR")],
        ["Horímetro", `${inspection.horimetro}h`],
        ["Combustível", `${inspection.combustivel}%`],
        ["Aprovados (A)", String(nA)],
        ["Com restrição (AR)", String(nAR)],
        ["Reprovados (R)", String(nR)],
        ["Não aplicáveis (NA)", String(nNA)],
      ],
      4,
    );

    const atencao = filled.filter((i) => i.status === "R" || i.status === "AR");
    if (atencao.length > 0) {
      sectionTitle(`Pontos de atenção (${atencao.length})`);
      doc.setFontSize(9);
      atencao.forEach((it) => {
        const txt = `[${it.status}] #${it.id} ${itemDesc(it)}${
          it.observation ? " — " + it.observation : ""
        }${it.photos && it.photos.length ? "  (" + it.photos.length + " foto/s)" : ""}`;
        const lines = doc.splitTextToSize(txt, pageW - margin * 2);
        ensureSpace(lines.length * 4.5 + 2);
        doc.text(lines, margin, y);
        y += lines.length * 4.5 + 1;
      });
      y += 3;
    }

    // Pré-carrega as fotos dos itens (jsPDF exige dataURL síncrono)
    const photoCache = new Map<string, { dataUrl: string; w: number; h: number }>();
    const allPhotos = [
      ...inspection.items.flatMap((i) => i.photos ?? []),
      ...Object.values(inspection.fotosEquipamento ?? {}),
    ];
    await Promise.all(
      Array.from(new Set(allPhotos)).map(async (url) => {
        try {
          const res = await fetch(url);
          const blob = await res.blob();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result as string);
            r.onerror = reject;
            r.readAsDataURL(blob);
          });
          const props = doc.getImageProperties(dataUrl);
          photoCache.set(url, { dataUrl, w: props.width, h: props.height });
        } catch {
          /* ignore */
        }
      }),
    );

    // ---- Tabela de operações inspecionadas ----
    sectionTitle(`Itens do Checklist (${inspection.items.length})`);
    const tableW = pageW - margin * 2;
    const COL = {
      num: 11,
      desc: tableW - 11 - 11 - 13 - 11,
      a: 11,
      ar: 13,
      r: 11,
    };
    const widths = [COL.num, COL.desc, COL.a, COL.ar, COL.r];
    const colX = (i: number) => margin + widths.slice(0, i).reduce((s, w) => s + w, 0);
    const headers = ["#", "OPERAÇÃO", "A", "AR", "R"];

    const drawTableHeader = () => {
      ensureSpace(9);
      doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
      doc.rect(margin, y, tableW, 7, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      headers.forEach((h, i) => {
        const center = i >= 2;
        doc.text(
          h,
          center ? colX(i) + widths[i] / 2 : colX(i) + 1.5,
          y + 4.7,
          center ? { align: "center" } : undefined,
        );
      });
      y += 7;
      doc.setTextColor(30, 30, 30);
      doc.setFont("helvetica", "normal");
    };

    /** Desenha as fotos do item em tamanho grande, logo abaixo da linha. */
    const drawPhotoBand = (
      imgs: { dataUrl: string; w: number; h: number }[],
      caption: string,
    ) => {
      const per = imgs.length > 1 ? 2 : 1;
      const gap = 4;
      const cellW = (tableW - 4 - gap * (per - 1)) / per;
      const cellH = per === 1 ? 78 : 62;
      for (let i = 0; i < imgs.length; i += per) {
        const linha = imgs.slice(i, i + per);
        if (y + cellH + 8 > pageH - 20) {
          ensureSpace(cellH + 8);
        }
        doc.setFillColor(250, 251, 252);
        doc.rect(margin, y, tableW, cellH + 7, "F");
        doc.setDrawColor(215);
        doc.rect(margin, y, tableW, cellH + 7);
        doc.setFontSize(7);
        doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
        doc.text(doc.splitTextToSize(caption, tableW - 6)[0] ?? "", margin + 2, y + 4);
        doc.setTextColor(30, 30, 30);
        linha.forEach((img, c) => {
          const bx = margin + 2 + c * (cellW + gap);
          const ratio = img.w / img.h || 1;
          let w = cellW;
          let h = w / ratio;
          if (h > cellH) {
            h = cellH;
            w = h * ratio;
          }
          try {
            doc.addImage(img.dataUrl, bx + (cellW - w) / 2, y + 5.5, w, h);
          } catch {
            /* ignore */
          }
        });
        y += cellH + 8;
      }
    };

    drawTableHeader();
    doc.setFontSize(7.5);
    let zebra = false;
    inspection.items.forEach((it) => {
      const descLines: string[] = doc.splitTextToSize(
        `${itemDesc(it)}${it.observation ? " — " + it.observation : ""}`,
        COL.desc - 3,
      );
      const imgs = (it.photos ?? []).map((u) => photoCache.get(u)).filter(Boolean) as {
        dataUrl: string;
        w: number;
        h: number;
      }[];
      const rowH = Math.max(descLines.length * 3.4 + 3.5, 7);

      if (y + rowH > pageH - 20) {
        ensureSpace(rowH);
        drawTableHeader();
        doc.setFontSize(7.5);
      }

      if (zebra) {
        doc.setFillColor(245, 246, 248);
        doc.rect(margin, y, tableW, rowH, "F");
      }
      zebra = !zebra;

      doc.setDrawColor(215);
      doc.rect(margin, y, tableW, rowH);
      [1, 2, 3, 4].forEach((i) => doc.line(colX(i), y, colX(i), y + rowH));

      doc.setTextColor(110, 116, 128);
      doc.text(String(it.id), colX(0) + COL.num / 2, y + 4, { align: "center" });
      doc.setTextColor(30, 30, 30);
      doc.text(descLines, colX(1) + 1.5, y + 3.8);

      // marcações A / AR / R
      const mark = (i: number, on: boolean, rgb: [number, number, number]) => {
        if (!on) return;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...rgb);
        doc.text("X", colX(i) + widths[i] / 2, y + 4.6, { align: "center" });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(30, 30, 30);
      };
      mark(2, it.status === "A", [30, 110, 50]);
      mark(3, it.status === "AR", [180, 110, 20]);
      mark(4, it.status === "R", [180, 30, 30]);
      if (it.status === "NA") {
        doc.setTextColor(140, 145, 155);
        doc.text("N/A", colX(1) + COL.desc - 1.5, y + 3.8, { align: "right" });
        doc.setTextColor(30, 30, 30);
      }

      y += rowH;

      // fotos do item — em tamanho grande, logo abaixo da operação
      if (imgs.length) {
        drawPhotoBand(imgs, `#${it.id} — ${itemDesc(it)}`);
        doc.setFontSize(7.5);
      }
    });

    y += 2;
    doc.setFontSize(7);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text("Legenda: A = Aprovado · AR = Aprovado com restrição · R = Reprovado · N/A = Não aplicável", margin, y + 3);
    y += 7;
    doc.setTextColor(30, 30, 30);


    doc.setTextColor(30, 30, 30);
    y += 3;

    // ---- Fotos padrão do equipamento ----
    {
      const mapa = inspection.fotosEquipamento ?? {};
      const registradas = FOTOS_EQUIPAMENTO.filter((f) => !!mapa[f.key]);
      if (registradas.length) {
        sectionTitle(`Fotos do Equipamento (${registradas.length})`);
        registradas.forEach((f) => {
          const img = photoCache.get(mapa[f.key]);
          if (!img) return;
          drawPhotoBand([img], f.label);
        });
      }
    }


    if (inspection.observacoesGerais) {
      sectionTitle("Observações Gerais do Inspetor");
      doc.setFontSize(9);
      const lines = doc.splitTextToSize(inspection.observacoesGerais, pageW - margin * 2);
      lines.forEach((ln: string) => {
        ensureSpace(5);
        doc.text(ln, margin, y);
        y += 4.5;
      });
      y += 3;
    }
  }

  // ---- Parecer final ----
  {
    const preenchidos = inspection?.items.filter((i) => i.status !== null) ?? [];
    const temR = preenchidos.some((i) => i.status === "R");
    const temAR = preenchidos.some((i) => i.status === "AR");
    const parecer: "A" | "AR" | "R" = temR ? "R" : temAR ? "AR" : "A";

    sectionTitle("Parecer Final da Inspeção");
    ensureSpace(16);
    const opts: { key: "A" | "AR" | "R"; label: string }[] = [
      { key: "A", label: "APROVADO" },
      { key: "AR", label: "APROVADO COM RESTRIÇÃO" },
      { key: "R", label: "REPROVADO" },
    ];
    const cw = (pageW - margin * 2) / 3;
    opts.forEach((o, i) => {
      const x = margin + i * cw;
      doc.setDrawColor(210);
      doc.rect(x, y, cw, 12);
      const bx = x + 4;
      const by = y + 4;
      doc.setDrawColor(90);
      doc.rect(bx, by, 5, 5);
      if (parecer === o.key) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(
          o.key === "R" ? 180 : o.key === "AR" ? 180 : 30,
          o.key === "R" ? 30 : o.key === "AR" ? 110 : 110,
          o.key === "R" ? 30 : o.key === "AR" ? 20 : 50,
        );
        doc.text("X", bx + 2.5, by + 4, { align: "center" });
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(30, 30, 30);
      doc.text(doc.splitTextToSize(o.label, cw - 14), bx + 8, by + 2.2);
      doc.setFont("helvetica", "normal");
    });
    y += 16;
  }

  sectionTitle("Assinaturas");

  ensureSpace(40);
  const boxW = (pageW - margin * 2) / 2 - 4;
  const boxH = 34;
  const drawSig = (
    x: number,
    label: string,
    sig?: { dataUrl: string; nome: string; cargo: string },
    em?: string,
  ) => {
    doc.setDrawColor(210);
    doc.rect(x, y, boxW, boxH);
    doc.setFontSize(7);
    doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
    doc.text(label.toUpperCase(), x + 2, y + 3.5);
    if (sig?.dataUrl) {
      try {
        doc.addImage(sig.dataUrl, "PNG", x + 4, y + 5, boxW - 8, 16);
      } catch {
        /* ignore */
      }
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
    doc.text((sig?.cargo ?? "").toUpperCase(), x + boxW / 2, y + boxH - 4.5, {
      align: "center",
    });
    if (em)
      doc.text(new Date(em).toLocaleString("pt-BR"), x + boxW / 2, y + boxH - 1.5, {
        align: "center",
      });
    doc.setTextColor(30, 30, 30);
  };
  // Prioriza a assinatura gravada na própria inspeção; cai para a do card
  const sigInspetor = inspection?.inspetorSig ?? asset.libNovoInspetorSig;
  const sigInspetorEm = inspection?.inspetorSigEm ?? asset.libNovoInspetorEm;
  const sigSupervisor = inspection?.supervisorSig ?? asset.libNovoSupervisorSig;
  const sigSupervisorEm = inspection?.supervisorSigEm ?? asset.libNovoSupervisorEm;
  drawSig(margin, "Inspetor", sigInspetor, sigInspetorEm);
  drawSig(margin + boxW + 8, "Supervisor de Manutenção", sigSupervisor, sigSupervisorEm);
  y += boxH + 6;

  doc.setDrawColor(220);
  doc.line(15, pageH - 12, pageW - 15, pageH - 12);
  doc.setFontSize(8);
  doc.setTextColor(MUTED.r, MUTED.g, MUTED.b);
  doc.text(
    "Documento gerado eletronicamente — Planner Matriz / Fluxo de Máquinas",
    15,
    pageH - 7,
  );
  doc.text(`Página ${doc.getNumberOfPages()}`, pageW - 15, pageH - 7, { align: "right" });

  const filename = `Checklist_Entrada_Saida_${asset.prefixo}_${new Date()
    .toISOString()
    .slice(0, 10)}.pdf`;
  if (opts.save !== false) doc.save(filename);
  const dataUrl = doc.output("datauristring");
  return { filename, dataUrl };
}
