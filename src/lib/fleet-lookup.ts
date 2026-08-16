// Busca de equipamentos no cadastro SAP (fleet_assets).
//
// REGRA: o vínculo automático só acontece com correspondência de 100% no
// Nº INVENTÁRIO ou no CÓD. Ativo (comparação normalizada: sem espaços,
// pontuação ou diferença de maiúsculas — "TI 014" == "TI014").
// Nada de casamento parcial por número (era isso que fazia "TI 014" puxar
// um caminhão só porque terminava em 14). Sem correspondência exata o
// equipamento é tratado como "Sem cadastro SAP" e os dados são digitados
// manualmente.

import { supabase } from "@/integrations/supabase/client";

export interface FleetCandidate {
  codigo_Ativo: string;
  marca: string | null;
  modelo: string;
  tipo_objeto: string | null;
  numero_inventario: string | null;
  numero_serie: string | null;
}

const COLS = "codigo_Ativo, marca, modelo, tipo_objeto, numero_inventario, numero_serie";

export function normalizeTerm(term: string) {
  return term.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** Número final do prefixo — "CVW 092" -> "092" */
export function prefixNumber(term: string): string | null {
  const m = term.match(/(\d{1,6})\s*$/);
  return m ? m[1] : null;
}

/** Verdadeiro só quando o registro bate 100% no inventário ou no Ativo. */
function isExactMatch(term: string, row: FleetCandidate) {
  const p = normalizeTerm(term);
  if (!p) return false;
  return normalizeTerm(row.codigo_Ativo ?? "") === p || normalizeTerm(row.numero_inventario ?? "") === p;
}

/**
 * Busca por correspondência exata (100%) no Nº inventário ou Cód. Ativo.
 * Retorna null quando não há cadastro no SAP.
 */
export async function findFleetExact(term: string): Promise<FleetCandidate | null> {
  const p = normalizeTerm(term);
  if (!p) return null;

  // O cadastro pode guardar o inventário com espaço ("TI 014"); buscamos por
  // padrões equivalentes e conferimos a igualdade normalizada no cliente.
  const letters = p.match(/^[A-Z]+/)?.[0] ?? "";
  const digits = p.slice(letters.length);

  const base = () => supabase.from("fleet_assets").select(COLS).eq("ativo", true).limit(5);
  const tentativas = [
    base().eq("codigo_Ativo", p),
    base().ilike("numero_inventario", p),
  ];
  if (letters && digits) {
    tentativas.push(base().ilike("numero_inventario", `${letters} ${digits}`));
    tentativas.push(base().ilike("codigo_Ativo", `${letters} ${digits}`));
  }

  for (const t of tentativas) {
    const { data } = (await t) as { data: FleetCandidate[] | null };
    const hit = (data ?? []).find((row) => isExactMatch(term, row));
    if (hit) return hit;
  }
  return null;
}

/**
 * Mantido por compatibilidade: como a regra agora exige 100%, devolve no
 * máximo o registro exato (ou nada). Para busca manual use `searchFleet`.
 */
export async function findFleetCandidates(term: string): Promise<FleetCandidate[]> {
  const exact = await findFleetExact(term);
  return exact ? [exact] : [];
}


/** Busca livre no cadastro: prefixo, Ativo, inventário, série, modelo ou tipo. */
export async function searchFleet(term: string): Promise<FleetCandidate[]> {
  const t = term.trim().replace(/[,()]/g, " ").trim();
  if (t.length < 2) return [];
  const { data } = await supabase
    .from("fleet_assets")
    .select(COLS)
    .eq("ativo", true)
    .or(
      [
        `codigo_Ativo.ilike.%${t}%`,
        `numero_inventario.ilike.%${t}%`,
        `numero_serie.ilike.%${t}%`,
        `modelo.ilike.%${t}%`,
        `tipo_objeto.ilike.%${t}%`,
      ].join(","),
    )
    .order("codigo_Ativo")
    .limit(20);
  return (data ?? []) as FleetCandidate[];
}

