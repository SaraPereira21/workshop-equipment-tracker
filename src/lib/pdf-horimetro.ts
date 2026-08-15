// Extração do horímetro apontado em um checklist digitalizado (PDF).
// Lê o texto do PDF com pdfjs-dist e procura padrões como
// "Horímetro: 1.234", "HORIMETRO 1234 h", "Horas: 987,5".

export async function extrairTextoPdf(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = worker as string;
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  let texto = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    texto += (content.items as Array<{ str: string }>).map((i) => i.str).join(" ") + "\n";
  }
  return texto;
}

export function paraNumero(bruto: string): number | null {
  let s = bruto.trim().replace(/\s+/g, "");
  // remove separadores soltos no fim (ex.: "1.234." ou "530,")
  s = s.replace(/[.,]+$/, "");
  if (!/\d/.test(s)) return null;

  let normalizado: string;
  if (s.includes(",")) {
    // padrão BR: vírgula é decimal, ponto é milhar
    normalizado = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(".")) {
    const partes = s.split(".");
    const ultima = partes[partes.length - 1];
    // ".123" com 3 dígitos = milhar; ".3" ou ".30" = casa decimal
    if (partes.length > 2 || ultima.length === 3) {
      normalizado = partes.join("");
    } else {
      normalizado = partes.slice(0, -1).join("") + "." + ultima;
    }
  } else {
    normalizado = s;
  }

  const n = Number(normalizado);
  if (!Number.isFinite(n) || n < 0 || n >= 1_000_000) return null;
  // preserva até 2 casas decimais (ex.: 5.30 -> 5.3)
  return Math.round(n * 100) / 100;
}


/** Procura o horímetro no texto do checklist. Retorna null se não encontrar. */
export function encontrarHorimetro(texto: string): number | null {
  const t = texto.replace(/\s+/g, " ");
  const padroes = [
    /hor[ií]metro\s*(?:atual|de\s*entrada|de\s*sa[ií]da)?\s*[:\-]?\s*([\d.,]{1,12})/i,
    /hor[ií]metro[^0-9]{0,20}([\d.,]{1,12})/i,
    /\bhoras?\s*[:\-]\s*([\d.,]{1,12})/i,
    /\bhm\s*[:\-]?\s*([\d.,]{1,12})/i,
  ];
  for (const re of padroes) {
    const m = t.match(re);
    if (m?.[1]) {
      const n = paraNumero(m[1]);
      if (n !== null) return n;
    }
  }
  return null;
}

/** Lê o PDF e devolve o horímetro apontado (ou null). */
export async function lerHorimetroDoChecklist(file: File): Promise<number | null> {
  try {
    if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) return null;
    const texto = await extrairTextoPdf(file);
    return encontrarHorimetro(texto);
  } catch (e) {
    console.error("Falha ao ler horímetro do PDF", e);
    return null;
  }
}
