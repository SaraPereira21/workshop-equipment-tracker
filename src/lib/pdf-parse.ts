// Client-side PDF text extraction + PMP item parsing.
// Uses pdfjs-dist to read the SAP-generated preventive PDF and returns a
// checklist compatible with WorkOrder.pmpChecklist.
//
// Strategy — the SAP export is a 4-5 column table:
//   [E P N] | Descrição | Serviço | Material | Prev. | Real
// Descriptions frequently wrap across 2-3 visual lines while Serviço and
// Material stay on a single centered line. So we:
//   1) pull every text run with x/y coordinates from pdf.js
//   2) find column X-thresholds by locating the header row
//      ("Descrição" / "Serviço" / "Material")
//   3) group runs into rows by Y (small tolerance) and columns by X
//   4) walk rows top→bottom: a row whose Descrição starts with "NNN-" or
//      "NNN.NNN-" opens a new item; following rows (until the next code)
//      append their Descrição / Serviço / Material into the current item.

import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker as string;

export interface ParsedPmpItem {
  id: string;
  label: string;
  intervalo: string;
  done: boolean;
  material?: string;
  servico?: string;
}

export interface ParsedPmp {
  numeroSAP?: string;
  equipamento?: string;
  planoServico?: string;
  items: ParsedPmpItem[];
  rawText: string;
}

type Run = { str: string; x: number; y: number; w: number };
type Row = { y: number; desc: string; serv: string; mat: string; raw: string };

const ITEM_CODE_RE = /^(\d{1,3}(?:\.\d{1,3}){0,4})\s*[-–]\s*(.*)$/;

function normalize(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

export async function parsePmpPdf(file: File, intervalo = "PMP"): Promise<ParsedPmp> {
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;

  const allItems: ParsedPmpItem[] = [];
  const seen = new Set<string>();
  let fullText = "";
  let headerNumeroSAP: string | undefined;
  let headerEquipamento: string | undefined;
  let headerPlanoServico: string | undefined;

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const runs: Run[] = (content.items as Array<{ str: string; width?: number; transform: number[] }>)
      .map((it) => ({
        str: it.str,
        x: it.transform[4],
        y: it.transform[5],
        w: it.width ?? 0,
      }))
      .filter((r) => r.str && r.str.trim().length > 0);

    // ---- localizar cabeçalho da tabela ----
    const findX = (label: RegExp) => runs.find((r) => label.test(r.str.trim()))?.x;
    const descX = findX(/^Descri[çc][ãa]o$/i);
    const servX = findX(/^Servi[çc]o$/i);
    const matX = findX(/^Material$/i);
    const prevX = findX(/^Prev\.?$/i);

    // fallback: se página não tem cabeçalho, tenta reusar do documento
    if (descX == null || servX == null || matX == null) {
      // texto bruto para header/rawText
      fullText += runs.map((r) => r.str).join(" ") + "\n";
      continue;
    }

    // margem: metade da distância entre colunas
    const descMax = (descX + servX) / 2;
    const servMax = (servX + matX) / 2;
    const matMax = prevX != null ? (matX + prevX) / 2 : matX + 200;

    // ---- agrupar em linhas por Y (tolerância 2.5) ----
    const yTol = 2.5;
    const rowsByY = new Map<number, Run[]>();
    for (const r of runs) {
      // usa Y arredondado como chave, com tolerância
      let key = Math.round(r.y);
      for (const k of rowsByY.keys()) {
        if (Math.abs(k - key) <= yTol) {
          key = k;
          break;
        }
      }
      if (!rowsByY.has(key)) rowsByY.set(key, []);
      rowsByY.get(key)!.push(r);
    }

    const rows: Row[] = Array.from(rowsByY.entries())
      .sort((a, b) => b[0] - a[0]) // topo → base
      .map(([y, group]) => {
        const sorted = group.sort((a, b) => a.x - b.x);
        const desc: string[] = [];
        const serv: string[] = [];
        const mat: string[] = [];
        for (const r of sorted) {
          if (r.x < descMax) desc.push(r.str);
          else if (r.x < servMax) serv.push(r.str);
          else if (r.x < matMax) mat.push(r.str);
        }
        const raw = sorted.map((r) => r.str).join(" ");
        return {
          y,
          desc: normalize(desc.join(" ")),
          serv: normalize(serv.join(" ")),
          mat: normalize(mat.join(" ")),
          raw,
        };
      });

    fullText += rows.map((r) => r.raw).join("\n") + "\n\n";

    // ---- extrair cabeçalho de cima da tabela (só primeira página) ----
    if (p === 1) {
      const topText = rows.map((r) => r.raw).join("\n");
      headerNumeroSAP =
        topText.match(/Ordem de Servi[çc]o[^0-9]{0,30}(\d{5,})/i)?.[1] ??
        topText.match(/\b(\d{7,8})\b/)?.[1];
      headerEquipamento =
        topText.match(/Equipamento\s+([A-Z]{2,4}\s?\d{2,4})/i)?.[1]?.trim() ??
        topText.match(/\b([A-Z]{2,3}\s?\d{3,4})\b/)?.[1];
      headerPlanoServico = topText
        .match(/Servi[çc]o Solicitado:\s*([^\n]+?)(?=Observa|E = EXECUTADO|$)/i)?.[1]
        ?.trim();
    }

    // ---- caminhar pelas linhas montando os itens ----
    let current: {
      id: string;
      descParts: string[];
      servParts: string[];
      matParts: string[];
    } | null = null;

    const flush = () => {
      if (!current) return;
      if (seen.has(current.id)) {
        current = null;
        return;
      }
      const label = normalize(current.descParts.join(" "));
      if (!label || label.length < 3) {
        current = null;
        return;
      }
      seen.add(current.id);
      allItems.push({
        id: current.id,
        label,
        intervalo,
        done: false,
        servico: current.servParts.length ? normalize(current.servParts.join(" ")) : undefined,
        material: current.matParts.length ? normalize(current.matParts.join(" ")) : undefined,
      });
      current = null;
    };

    for (const row of rows) {
      // ignora linha de cabeçalho / instruções
      if (/^E\s+P\s+N\s+Descri/i.test(row.raw)) continue;
      if (/^E = EXECUTADO/i.test(row.raw)) continue;
      if (/^Descri[çc][ãa]o$/i.test(row.desc)) continue;
      if (/^P[aá]gina\b/i.test(row.raw)) continue;

      const codeMatch = row.desc.match(ITEM_CODE_RE);
      if (codeMatch) {
        flush();
        current = {
          id: codeMatch[1],
          descParts: [codeMatch[2]],
          servParts: row.serv ? [row.serv] : [],
          matParts: row.mat ? [row.mat] : [],
        };
      } else if (current) {
        // continuação do item corrente
        if (row.desc) current.descParts.push(row.desc);
        if (row.serv) current.servParts.push(row.serv);
        if (row.mat) current.matParts.push(row.mat);
      }
    }
    flush();
  }

  return {
    numeroSAP: headerNumeroSAP,
    equipamento: headerEquipamento,
    planoServico: headerPlanoServico,
    items: allItems,
    rawText: fullText,
  };
}
