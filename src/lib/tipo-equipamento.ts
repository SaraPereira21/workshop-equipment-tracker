/**
 * Tipos de equipamento padronizados.
 * O SAP traz variações ("ESCAVADEIRA ESTEIRA (0004)", "MANIPULADOR TELESCOP"),
 * então tudo passa por `normalizeTipo` para virar um nome único e legível.
 */
export const TIPOS_EQUIPAMENTO = [
  "Caminhão",
  "Carro",
  "Ônibus",
  "Empilhadeira",
  "Transpaleteira",
  "Paleteira",
  "Escavadeira de Esteira",
  "Escavadeira de Rodas",
  "Miniescavadeira de Esteira",
  "Miniescavadeira de Rodas",
  "Retroescavadeira",
  "Miniretroescavadeira",
  "Pá Carregadeira",
  "Minicarregadeira",
  "Rolo Compactador",
  "Rolo Compactador Pneumático",
  "Motoniveladora",
  "Trator de Esteira",
  "Trator de Rodas",
  "Manipulador Telescópico",
  "Manipulador de Sucata",
  "Plataforma Elevatória",
  "Gerador",
  "Torre de Iluminação",
  "Implemento",
  "Vassoura",
  "Rompedor",
  "Rebocador",
  "Grade Aradora",
  "Vibroacabadora",
  "Perfuratriz",
  "Roçadeira",
  "Valetadeira",
  "Guindaste Hidráulico",
  "Colheitadeira",
  "Recicladora",
  "Vácuo",
  "Outro",
];

/** chave sem acento/código -> nome padronizado */
const MAP: Record<string, string> = {
  CAMINHAO: "Caminhão",
  CARRO: "Carro",
  ONIBUS: "Ônibus",
  EMPILHADEIRA: "Empilhadeira",
  TRANSPALETEIRA: "Transpaleteira",
  PALETEIRA: "Paleteira",
  ESCAVADEIRA: "Escavadeira de Esteira",
  "ESCAVADEIRA ESTEIRA": "Escavadeira de Esteira",
  "ESCAVADEIRA DE ESTEIRA": "Escavadeira de Esteira",
  "ESCAVADEIRA RODA": "Escavadeira de Rodas",
  "ESCAVADEIRA RODAS": "Escavadeira de Rodas",
  "ESCAVADEIRA DE RODAS": "Escavadeira de Rodas",
  MINIESCAVADEIRA: "Miniescavadeira de Esteira",
  "MINIESCAVADEIRA ESTE": "Miniescavadeira de Esteira",
  "MINIESCAVADEIRA ESTEIRA": "Miniescavadeira de Esteira",
  "MINIESCAVADEIRA DE ESTEIRA": "Miniescavadeira de Esteira",
  "MINIESCAVADEIRA RODA": "Miniescavadeira de Rodas",
  "MINIESCAVADEIRA RODAS": "Miniescavadeira de Rodas",
  "MINIESCAVADEIRA DE RODAS": "Miniescavadeira de Rodas",
  RETROESCAVADEIRA: "Retroescavadeira",
  MINIRETROESCAVADEIRA: "Miniretroescavadeira",
  "PA CARREGADEIRA": "Pá Carregadeira",
  "MINICARREGADEIRA ROD": "Minicarregadeira",
  MINICARREGADEIRA: "Minicarregadeira",
  "ROLO COMPACTADOR": "Rolo Compactador",
  "ROLO COMPACTADOR PNE": "Rolo Compactador Pneumático",
  "ROLO COMPACTADOR PNEUMATICO": "Rolo Compactador Pneumático",
  MOTONIVELADORA: "Motoniveladora",
  TRATOR: "Trator de Esteira",
  "TRATOR ESTEIRA": "Trator de Esteira",
  "TRATOR DE ESTEIRA": "Trator de Esteira",
  "TRATOR RODA": "Trator de Rodas",
  "TRATOR RODAS": "Trator de Rodas",
  "TRATOR DE RODAS": "Trator de Rodas",
  "MANIPULADOR TELESCOP": "Manipulador Telescópico",
  "MANIPULADOR TELESCOPICO": "Manipulador Telescópico",
  "MANIPULADOR SUCATA": "Manipulador de Sucata",
  "MANIPULADOR DE SUCATA": "Manipulador de Sucata",
  "PLATAFORMA ELEVATORI": "Plataforma Elevatória",
  "PLATAFORMA ELEVATORIA": "Plataforma Elevatória",
  GERADOR: "Gerador",
  "TORRE DE ILUMINACAO": "Torre de Iluminação",
  "TORRE ILUMINACAO": "Torre de Iluminação",
  IMPLEMENTO: "Implemento",
  IMPLEMENTOS: "Implemento",
  VASSOURA: "Vassoura",
  ROMPEDOR: "Rompedor",
  REBOCADOR: "Rebocador",
  "GRADE ARADORA": "Grade Aradora",
  VIBROACABADORA: "Vibroacabadora",
  PERFURATRIZ: "Perfuratriz",
  ROCADEIRA: "Roçadeira",
  VALETADEIRA: "Valetadeira",
  "GUINDASTE HIDRAULICO": "Guindaste Hidráulico",
  COLHEITADEIRA: "Colheitadeira",
  RECICLADORA: "Recicladora",
  VACUO: "Vácuo",
  EQUIPAMENTO: "Outro",
  OUTRO: "Outro",
};

const MINUSCULAS = new Set(["de", "da", "do", "e"]);

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && MINUSCULAS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** Converte qualquer variação de tipo (SAP ou digitada) no nome padronizado. */
export function normalizeTipo(raw?: string | null): string {
  if (!raw) return "";
  const limpo = raw
    .replace(/\([^)]*\)/g, " ") // remove códigos "(0004)"
    .replace(/\s+/g, " ")
    .trim();
  if (!limpo || limpo === "—") return "";
  const chave = limpo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  return MAP[chave] ?? titleCase(limpo);
}

/** Tipos que NÃO geram plano preventivo (não têm PMP/horímetro próprio). */
export const TIPOS_SEM_PREVENTIVA = ["Implemento"];

/** true quando o tipo de máquina deve gerar preventiva. */
export function geraPreventiva(tipo?: string | null): boolean {
  const t = normalizeTipo(tipo);
  return !TIPOS_SEM_PREVENTIVA.some((x) => x.toLowerCase() === t.toLowerCase());
}
