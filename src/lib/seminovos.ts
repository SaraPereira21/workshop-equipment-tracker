// Seminovos: importação da planilha comercial e cruzamento com o Planner.
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

export interface SeminovoItem {
  id: string;
  prefixo: string;
  prefixo_norm: string;
  modelo: string | null;
  familia: string | null;
  serie: string | null;
  ano: string | null;
  preco_venda: number | null;
  data_liberacao_venda: string | null;
  status_sn: string | null;
  status_manutencao: string | null;
  localizacao: string | null;
  obs: string | null;
  origem_arquivo: string | null;
  importado_em: string;
}

/** Normaliza prefixo para casar com o Planner: "EH 120" / "eh120" / "EH 0120" -> "EH120" */
export function normPrefixo(v: string): string {
  const s = String(v ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const m = s.match(/^([A-Z]+)0*(\d+)$/);
  return m ? `${m[1]}${String(Number(m[2]))}` : s;
}

export function brl(v?: number | null): string {
  return (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function mesRef(iso?: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 7); // YYYY-MM
}

export function rotuloMes(mes: string): string {
  if (!mes) return "Sem data";
  const [y, m] = mes.split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${nomes[Number(m) - 1] ?? m}/${y}`;
}

function txt(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/\s+/g, " ").trim();
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "" || v === "-") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toISODate(v: unknown): string | null {
  if (v === null || v === undefined || v === "" || v === "-") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // serial Excel
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    const iso = new Date(Date.UTC(d.y, d.m - 1, d.d));
    return Number.isNaN(iso.getTime()) ? null : iso.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (br) {
    const y = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${y}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export interface SeminovoParsed {
  prefixo: string;
  prefixo_norm: string;
  modelo: string;
  familia: string;
  serie: string;
  ano: string;
  preco_venda: number | null;
  data_liberacao_venda: string | null;
  status_sn: string;
  status_manutencao: string;
  localizacao: string;
  obs: string;
}

const HEADER_ALIASES: Record<keyof Omit<SeminovoParsed, "prefixo_norm">, string[]> = {
  prefixo: ["PREFIXO"],
  modelo: ["MARCA | MODELO", "MODELO"],
  familia: ["FAMÍLIA", "FAMILIA", "FAMILIA 2.0"],
  serie: ["SÉRIE", "SERIE"],
  ano: ["ANO"],
  preco_venda: ["PREÇO VENDA USADO", "PRECO VENDA USADO", "PREÇO VENDAS", "VALOR VENDA"],
  data_liberacao_venda: ["DATA LIBERAÇÃO PRA VENDA", "DATA LIBERACAO PRA VENDA", "DATA LIBERAÇÃO P/ VENDA"],
  status_sn: ["STATUS SN", "STATUS"],
  status_manutencao: ["EM MANUTENÇÃO", "EM MANUTENCAO", "STATUS 2"],
  localizacao: ["LOCALIZAÇÃO", "LOCALIZACAO"],
  obs: ["OBS. STATUS", "OBS", "OBSERVAÇÃO"],
};

function limpaHeader(v: unknown): string {
  return txt(v).toUpperCase();
}

/** Lê a planilha comercial (aba "Controle Seminovos" ou a primeira que tiver PREFIXO + preço). */
export async function parseSeminovosXlsx(file: File): Promise<SeminovoParsed[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const nomes = wb.SheetNames;
  const preferida = nomes.find((n) => limpaHeader(n).includes("CONTROLE SEMINOVOS")) ?? nomes[0];
  const ordem = [preferida, ...nomes.filter((n) => n !== preferida)];

  for (const nome of ordem) {
    const ws = wb.Sheets[nome];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
    // acha a linha de cabeçalho
    let hIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const cells = (rows[i] ?? []).map(limpaHeader);
      if (cells.some((c) => c === "PREFIXO") && cells.some((c) => c.includes("PREÇO VENDA") || c.includes("PRECO VENDA"))) {
        hIdx = i;
        break;
      }
    }
    if (hIdx < 0) continue;
    const header = (rows[hIdx] ?? []).map(limpaHeader);
    const col = (aliases: string[]) => {
      for (const a of aliases) {
        const i = header.indexOf(limpaHeader(a));
        if (i >= 0) return i;
      }
      return -1;
    };
    const idx = Object.fromEntries(
      Object.entries(HEADER_ALIASES).map(([k, v]) => [k, col(v)]),
    ) as Record<keyof typeof HEADER_ALIASES, number>;

    const out: SeminovoParsed[] = [];
    const vistos = new Set<string>();
    for (let i = hIdx + 1; i < rows.length; i++) {
      const r = rows[i] ?? [];
      const prefixo = txt(r[idx.prefixo]).toUpperCase();
      if (!prefixo || prefixo === "PREFIXO") continue;
      const pn = normPrefixo(prefixo);
      if (!pn || vistos.has(pn)) continue;
      vistos.add(pn);
      out.push({
        prefixo,
        prefixo_norm: pn,
        modelo: txt(r[idx.modelo]),
        familia: txt(r[idx.familia]),
        serie: txt(r[idx.serie]),
        ano: txt(r[idx.ano]).replace(/\.0$/, ""),
        preco_venda: num(r[idx.preco_venda]),
        data_liberacao_venda: toISODate(r[idx.data_liberacao_venda]),
        status_sn: txt(r[idx.status_sn]).toUpperCase(),
        status_manutencao: txt(r[idx.status_manutencao]).toUpperCase(),
        localizacao: txt(r[idx.localizacao]).toUpperCase(),
        obs: txt(r[idx.obs]),
      });
    }
    if (out.length) return out;
  }
  throw new Error("Não encontrei a aba de controle de seminovos (com PREFIXO e PREÇO VENDA).");
}

export async function listSeminovos(): Promise<SeminovoItem[]> {
  const { data, error } = await supabase
    .from("seminovos_items")
    .select("*")
    .order("data_liberacao_venda", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SeminovoItem[];
}

/** Substitui a lista inteira pela nova importação (o comercial reenvia a planilha atualizada). */
export async function importarSeminovos(itens: SeminovoParsed[], arquivo: string) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? null;
  const del = await supabase.from("seminovos_items").delete().neq("prefixo_norm", "__none__");
  if (del.error) throw del.error;
  const payload = itens.map((i) => ({ ...i, origem_arquivo: arquivo, importado_por: uid, importado_em: new Date().toISOString() }));
  for (let i = 0; i < payload.length; i += 200) {
    const { error } = await supabase.from("seminovos_items").insert(payload.slice(i, i + 200));
    if (error) throw error;
  }
}

/** Fila de prioridade de entrega (independe da planilha: fica por prefixo). */
export async function listPrioridades(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from("seminovos_prioridade").select("prefixo_norm, ordem");
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r) => [r.prefixo_norm as string, Number(r.ordem)]));
}

export async function setPrioridade(prefixoNorm: string, ordem: number) {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("seminovos_prioridade")
    .upsert({ prefixo_norm: prefixoNorm, ordem, updated_by: auth.user?.id ?? null, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function removePrioridade(prefixoNorm: string) {
  const { error } = await supabase.from("seminovos_prioridade").delete().eq("prefixo_norm", prefixoNorm);
  if (error) throw error;
}

export async function getMeta(mes: string): Promise<number> {
  const { data } = await supabase.from("seminovos_meta").select("valor").eq("mes", mes).maybeSingle();
  return Number(data?.valor ?? 5_000_000);
}

export async function setMeta(mes: string, valor: number) {
  const { error } = await supabase.from("seminovos_meta").upsert({ mes, valor });
  if (error) throw error;
}
