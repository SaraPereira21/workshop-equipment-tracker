// Catálogo de PMP (Planos de Manutenção Preventiva)
// - Lê planilhas Excel do SAP em dois formatos e devolve planos normalizados
// - Persiste/consulta os planos no backend (pmp_plans + pmp_operations)

import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";

export interface PmpOperation {
  ordem: number;
  item?: string;
  procedimento: string;
  servico?: string;
  material?: string;
  materialCodigo?: string;
  qtde?: number;
  unidade?: string;
  tempo?: string;
  /** Intervalo (h) do plano de origem quando as operações são acumuladas. */
  origemHoras?: number;
}

export interface PmpPlanDraft {
  modelo: string;
  modeloOriginal: string;
  fabricante?: string;
  /** Família do equipamento quando o cabeçalho do PMP informa (ex.: "FAMILIA E878"). */
  familia?: string;
  intervaloHoras: number;
  intervaloLabel: string;
  codigoPlano?: string;
  setorExecutante?: string;
  origemArquivo?: string;
  operations: PmpOperation[];
}

export interface PmpPlan extends PmpPlanDraft {
  id: string;
  createdAt: string;
  criadoPor?: string;
}

/** Normaliza modelo para busca: maiúsculas, sem acento, sem pontuação redundante. */
export function normalizeModelo(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function cell(row: unknown[], i: number): string {
  const v = row?.[i];
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function toNumber(v: string): number | undefined {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

/** Extrai intervalo em horas de textos como "20000KM /500H", "- 250H", "1.000H", "A CADA 1000 HORAS". */
export function parseIntervalo(text: string): { horas: number; label: string } | null {
  // Remove separadores de milhar (ponto/vírgula entre dígitos) para não capturar "000" de "1.000H".
  const t = (text || "").toUpperCase().replace(/(\d)[.,](\d{3})(?!\d)/g, "$1$2");
  const horas = [...t.matchAll(/(\d{2,6})\s*(?:H\b|HS\b|HORAS?\b)/g)].map((m) => Number(m[1]));
  if (horas.length) {
    const h = horas[horas.length - 1];
    return { horas: h, label: `${h}H` };
  }
  return null;
}

/** Extrai a família do equipamento de textos como "... - FAMILIA E878 - 250H". */
export function parseFamilia(text: string): string | undefined {
  const m = (text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .match(/FAMILIA\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-./]*)/);
  return m ? m[1].replace(/[-./]+$/, "") : undefined;
}

type Grid = unknown[][];

function sheets(wb: XLSX.WorkBook): { name: string; grid: Grid }[] {
  return wb.SheetNames.map((name) => ({
    name,
    grid: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, blankrows: false, defval: "" }),
  }));
}

function findHeaderRow(grid: Grid, firstCol: RegExp): number {
  return grid.findIndex((r) => firstCol.test(cell(r, 0)));
}

function headerMap(row: unknown[]): Record<string, number> {
  const map: Record<string, number> = {};
  row.forEach((c, i) => {
    const k = normalizeModelo(String(c ?? ""));
    if (k) map[k] = i;
  });
  return map;
}

/** Formato SAP "Plano de Manutenção" (pode conter vários PMPs no mesmo arquivo). */
function parseFormatoSap(all: { name: string; grid: Grid }[], fileName: string): PmpPlanDraft[] {
  // Junta todas as linhas de todas as abas em uma sequência única.
  const rows: Grid = [];
  for (const { grid } of all) rows.push(...grid);
  if (!rows.length) return [];

  // Localiza cada início de PMP (linha "Plano de Manutenção:").
  const starts: number[] = [];
  rows.forEach((r, i) => {
    if (/^Plano de Manuten/i.test(cell(r, 0))) starts.push(i);
  });
  if (!starts.length) return [];

  const drafts: PmpPlanDraft[] = [];

  for (let s = 0; s < starts.length; s++) {
    const from = starts[s];
    const to = s + 1 < starts.length ? starts[s + 1] : rows.length;
    const section = rows.slice(from, to);

    const tRow = section[0];
    const titulo = tRow.slice(1).map((c) => String(c ?? "").trim()).filter(Boolean)[0] ?? "";
    const sRow = section.find((r) => /^Setor Executante/i.test(cell(r, 0)));
    const setor = sRow ? (sRow.slice(1).map((c) => String(c ?? "").trim()).filter(Boolean)[0] ?? "") : "";

    const hIdx = section.findIndex((r) => /^Item$/i.test(cell(r, 0)));
    if (hIdx < 0) continue;
    const h = headerMap(section[hIdx]);
    const cProc = h["PROCEDIMENTO"] ?? 1;
    const cServ = h["SERVICO"] ?? 4;
    const cMat = h["MATERIAL"] ?? 6;
    const cQtde = h["QTDE"] ?? 7;
    const cUnid = h["UNID"] ?? 8;
    const cTempo = h["TEMPO"] ?? 10;

    const operations: PmpOperation[] = [];
    for (let i = hIdx + 1; i < section.length; i++) {
      const row = section[i];
      const item = cell(row, 0);
      if (!/^\d{1,4}$/.test(item)) continue;
      const proc = cell(row, cProc) || row.slice(1, cServ).map((c) => String(c ?? "").trim()).filter(Boolean).join(" ");
      if (!proc) continue;
      const servRaw = cell(row, cServ);
      const matRaw = cell(row, cMat);
      // Ignora linha-título que às vezes aparece como item 001 sem serviço/material.
      const isTituloRepetido =
        /PLANO\s+MANUTEN/i.test(proc) && (!servRaw || servRaw === "-") && (!matRaw || matRaw === "-");
      if (isTituloRepetido) continue;
      const matCode = matRaw.match(/(\d{5,})/)?.[1];
      operations.push({
        ordem: operations.length + 1,
        item,
        procedimento: proc,
        servico: servRaw.replace(/^-$/, "") || undefined,
        material: matRaw && matRaw !== "-" ? matRaw : undefined,
        materialCodigo: matCode,
        qtde: toNumber(cell(row, cQtde)),
        unidade: cell(row, cUnid) || undefined,
        tempo: cell(row, cTempo) || undefined,
      });
    }

    if (!operations.length) continue;

    const parts = titulo.split(/\s+-\s+/).map((p) => p.trim()).filter(Boolean);
    const codigo = parts.length >= 2 ? `${parts[0]} - ${parts[1]}` : undefined;
    const familia = parseFamilia(titulo);
    const intervalo = parseIntervalo(titulo) ?? { horas: 0, label: "SEM INTERVALO" };
    const idxPlano = parts.findIndex((p) => /PLANO\s+MANUTEN/i.test(p));
    const resto = parts
      .slice(idxPlano >= 0 ? idxPlano + 1 : 2)
      .map((p) => p.replace(/\s*-?\s*FAM[IÍ]LIA\s*[:\-]?\s*[A-Z0-9][A-Z0-9\-./]*/i, "").trim())
      .filter(Boolean)
      .filter((p) => !/\d+\s*(H|KM)\b/i.test(p));
    const modeloOriginal = (resto[0] ?? titulo).replace(/\s*-\s*$/, "").trim();

    drafts.push({
      modelo: normalizeModelo(modeloOriginal),
      modeloOriginal,
      fabricante: modeloOriginal.split(/\s+/)[0],
      familia,
      intervaloHoras: intervalo.horas,
      intervaloLabel: intervalo.label,
      codigoPlano: codigo,
      setorExecutante: setor || undefined,
      origemArquivo: fileName,
      operations,
    });
  }

  return drafts;
}

/** Formato "Export": Modelo na 2ª linha + coluna Pacote com vários intervalos. */
function parseFormatoExport(all: { name: string; grid: Grid }[], fileName: string): PmpPlanDraft[] {
  const plans = new Map<string, PmpPlanDraft>();

  for (const { grid } of all) {
    const mIdx = findHeaderRow(grid, /^Modelo$/i);
    const hIdx = findHeaderRow(grid, /^Pacote$/i);
    if (hIdx < 0) continue;
    const modeloOriginal = mIdx >= 0 ? cell(grid[mIdx + 1], 0).split("|")[0].trim() : "";
    if (!modeloOriginal) continue;

    const h = headerMap(grid[hIdx]);
    const cOper = h["N OPERACAO UNICO"] ?? 1;
    const cOem = h["CODIGO OEM"];
    const cUnid = h["UNIDADE"];
    const cMat = h["MATERIAL"];
    const cDesc = h["DESCRICAO"];
    const cQtd = h["QTD"];

    for (let i = hIdx + 1; i < grid.length; i++) {
      const row = grid[i];
      const pacote = cell(row, 0);
      const oper = cell(row, cOper);
      if (!pacote || !oper) continue;
      const intervalo = parseIntervalo(pacote);
      if (!intervalo) continue;
      const key = String(intervalo.horas);
      if (!plans.has(key)) {
        plans.set(key, {
          modelo: normalizeModelo(modeloOriginal),
          modeloOriginal,
          fabricante: modeloOriginal.split(/\s+/)[0],
          familia: parseFamilia(modeloOriginal),
          intervaloHoras: intervalo.horas,
          intervaloLabel: pacote,
          origemArquivo: fileName,
          operations: [],
        });
      }
      const plan = plans.get(key)!;
      const partes = oper.split(/\s+-\s+/);
      const codigoOper = partes.length > 1 ? partes[0] : undefined;
      const procedimento = partes.length > 1 ? partes.slice(1).join(" - ") : oper;
      const desc = cDesc != null ? cell(row, cDesc) : "";
      const matCod = cMat != null ? cell(row, cMat) : "";
      plan.operations.push({
        ordem: plan.operations.length + 1,
        item: codigoOper,
        procedimento,
        servico: undefined,
        material: [matCod, desc].filter((x) => x && x !== "-").join(" - ") || undefined,
        materialCodigo: matCod || (cOem != null ? cell(row, cOem) : undefined) || undefined,
        qtde: cQtd != null ? toNumber(cell(row, cQtd)) : undefined,
        unidade: cUnid != null ? cell(row, cUnid) : undefined,
      });
    }
  }

  return [...plans.values()].filter((p) => p.operations.length > 0);
}

/** Lê um arquivo .xlsx/.xls e devolve os planos encontrados. */
export async function parsePmpWorkbook(file: File): Promise<PmpPlanDraft[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const all = sheets(wb);

  const isExport = all.some((s) => findHeaderRow(s.grid, /^Pacote$/i) >= 0);
  const plans = isExport ? parseFormatoExport(all, file.name) : parseFormatoSap(all, file.name);
  return plans;
}

// ---------------------------------------------------------------- backend

type PlanRow = {
  id: string;
  modelo: string;
  modelo_original: string;
  fabricante: string | null;
  familia: string | null;
  intervalo_horas: number;
  intervalo_label: string;
  codigo_plano: string | null;
  setor_executante: string | null;
  origem_arquivo: string | null;
  criado_por: string | null;
  created_at: string;
};

function toPlan(row: PlanRow, operations: PmpOperation[] = []): PmpPlan {
  return {
    id: row.id,
    modelo: row.modelo,
    modeloOriginal: row.modelo_original,
    fabricante: row.fabricante ?? undefined,
    familia: row.familia ?? undefined,
    intervaloHoras: row.intervalo_horas,
    intervaloLabel: row.intervalo_label,
    codigoPlano: row.codigo_plano ?? undefined,
    setorExecutante: row.setor_executante ?? undefined,
    origemArquivo: row.origem_arquivo ?? undefined,
    criadoPor: row.criado_por ?? undefined,
    createdAt: row.created_at,
    operations,
  };
}

/** Lista todos os planos (sem operações). */
export async function listPmpPlans(): Promise<PmpPlan[]> {
  const { data, error } = await supabase
    .from("pmp_plans")
    .select("*")
    .order("modelo")
    .order("intervalo_horas");
  if (error) throw error;
  return (data as PlanRow[]).map((r) => toPlan(r));
}

/** Palavras genéricas que não ajudam a identificar o modelo. */
const STOP_TOKENS = new Set([
  "GLP", "DIESEL", "ELETRICA", "ELETRICO", "GAS", "GASOLINA", "T", "TON", "KG",
  "PLANO", "MANUTENCAO", "PREVENTIVA", "MAQUINA", "EQUIPAMENTO", "DE", "DA", "DO",
]);

/** Normaliza token: remove zeros à esquerda de blocos numéricos (GP050MX -> GP50MX). */
function tokenKey(t: string): string {
  return t.replace(/0+(\d)/g, "$1");
}

function tokensDoModelo(s: string): string[] {
  return normalizeModelo(s)
    .split(" ")
    .map(tokenKey)
    .filter((t) => t.length >= 2 && !STOP_TOKENS.has(t));
}

/** Planos cadastrados para um modelo (normalizado, parcial e por tokens/família). */
export async function findPlansForModelo(modelo: string): Promise<PmpPlan[]> {
  const norm = normalizeModelo(modelo);
  if (!norm) return [];
  const all = await listPmpPlans();
  const exact = all.filter((p) => p.modelo === norm);
  if (exact.length) return exact;

  const parcial = all.filter((p) => p.modelo.includes(norm) || norm.includes(p.modelo));
  if (parcial.length) return parcial;

  // Casamento por tokens: "384W-GLP-YALE-GP050MX" encontra "YALE GP50MX 2.5T".
  const alvo = tokensDoModelo(modelo);
  if (!alvo.length) return [];
  const alvoSet = new Set(alvo);

  const scored = all.map((p) => {
    const toks = tokensDoModelo(p.modeloOriginal || p.modelo);
    const comuns = toks.filter((t) => alvoSet.has(t));
    // Token "forte": mistura letras e números (código do modelo).
    const forte = comuns.some((t) => /[A-Z]/.test(t) && /\d/.test(t));
    const fam = p.familia ? tokenKey(normalizeModelo(p.familia)) : "";
    const familiaBate = !!fam && alvoSet.has(fam);
    return { plan: p, score: comuns.length + (forte ? 5 : 0) + (familiaBate ? 3 : 0), forte, familiaBate };
  });

  const validos = scored.filter((s) => s.forte || s.familiaBate);
  if (!validos.length) return [];
  const melhor = Math.max(...validos.map((s) => s.score));
  return validos.filter((s) => s.score === melhor).map((s) => s.plan);
}


/**
 * Preventiva é cumulativa a partir de 250h: a de 500h inclui a de 250h, a de 1000h inclui 500h+250h, etc.
 * Intervalos abaixo de 250h (ex.: 125h) NÃO acumulam e NÃO são incluídos em intervalos maiores —
 * são planos isolados de primeira revisão.
 * Se não houver plano de 250h e o menor for 500h, a acumulação começa a partir de 500h.
 */
const MIN_CUMULATIVE_HOURS = 250;

export function planosCumulativos(plans: PmpPlan[], alvoHoras: number): PmpPlan[] {
  // Alvo abaixo do mínimo: retorna somente o próprio plano (sem acumular nada).
  if (alvoHoras < MIN_CUMULATIVE_HOURS) {
    return plans
      .filter((p) => p.intervaloHoras === alvoHoras)
      .sort((a, b) => a.intervaloHoras - b.intervaloHoras);
  }
  return plans
    .filter(
      (p) =>
        p.intervaloHoras >= MIN_CUMULATIVE_HOURS &&
        p.intervaloHoras <= alvoHoras &&
        alvoHoras % p.intervaloHoras === 0,
    )
    .sort((a, b) => a.intervaloHoras - b.intervaloHoras);
}


/** Chave de deduplicação: mesma operação/material não repete entre intervalos. */
function opKey(o: PmpOperation): string {
  return [normalizeModelo(o.procedimento), normalizeModelo(o.material ?? ""), normalizeModelo(o.servico ?? "")].join("|");
}

/** Operações acumuladas (sem duplicar) do intervalo alvo e de todos os menores contidos nele. */
export async function getCumulativeOperations(
  plans: PmpPlan[],
  alvoHoras: number,
): Promise<{ operations: PmpOperation[]; incluidos: PmpPlan[] }> {
  const incluidos = planosCumulativos(plans, alvoHoras);
  const seen = new Set<string>();
  const operations: PmpOperation[] = [];
  for (const plan of incluidos) {
    const ops = await getPmpOperations(plan.id);
    for (const o of ops) {
      const k = opKey(o);
      if (!o.procedimento || seen.has(k)) continue;
      seen.add(k);
      operations.push({ ...o, ordem: operations.length + 1, origemHoras: plan.intervaloHoras });
    }
  }
  return { operations, incluidos };
}

export async function getPmpOperations(planId: string): Promise<PmpOperation[]> {
  const { data, error } = await supabase
    .from("pmp_operations")
    .select("*")
    .eq("plan_id", planId)
    .order("ordem");
  if (error) throw error;
  return (data as Array<Record<string, unknown>>).map((r, i) => ({
    ordem: (r.ordem as number) ?? i + 1,
    item: (r.item as string) ?? undefined,
    procedimento: (r.procedimento as string) ?? "",
    servico: (r.servico as string) ?? undefined,
    material: (r.material as string) ?? undefined,
    materialCodigo: (r.material_codigo as string) ?? undefined,
    qtde: (r.qtde as number) ?? undefined,
    unidade: (r.unidade as string) ?? undefined,
    tempo: (r.tempo as string) ?? undefined,
  }));
}

/** Salva (ou substitui) um plano do catálogo. */
export async function savePmpPlan(draft: PmpPlanDraft, criadoPor?: string): Promise<string> {
  let q = supabase
    .from("pmp_plans")
    .select("id")
    .eq("modelo", draft.modelo)
    .eq("intervalo_horas", draft.intervaloHoras);
  q = draft.familia ? q.eq("familia", draft.familia) : q.is("familia", null);
  const { data: existing } = await q.maybeSingle();

  const payload = {
    modelo: draft.modelo,
    modelo_original: draft.modeloOriginal,
    fabricante: draft.fabricante ?? null,
    familia: draft.familia ?? null,
    intervalo_horas: draft.intervaloHoras,
    intervalo_label: draft.intervaloLabel,
    codigo_plano: draft.codigoPlano ?? null,
    setor_executante: draft.setorExecutante ?? null,
    origem_arquivo: draft.origemArquivo ?? null,
    criado_por: criadoPor ?? null,
  };

  let planId: string;
  if (existing?.id) {
    planId = existing.id as string;
    const { error } = await supabase.from("pmp_plans").update(payload).eq("id", planId);
    if (error) throw error;
    await supabase.from("pmp_operations").delete().eq("plan_id", planId);
  } else {
    const { data, error } = await supabase.from("pmp_plans").insert(payload).select("id").single();
    if (error) throw error;
    planId = (data as { id: string }).id;
  }

  const rows = draft.operations.map((o) => ({
    plan_id: planId,
    ordem: o.ordem,
    item: o.item ?? null,
    procedimento: o.procedimento,
    servico: o.servico ?? null,
    material: o.material ?? null,
    material_codigo: o.materialCodigo ?? null,
    qtde: o.qtde ?? null,
    unidade: o.unidade ?? null,
    tempo: o.tempo ?? null,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from("pmp_operations").insert(rows.slice(i, i + 500));
    if (error) throw error;
  }
  return planId;
}

/** Atualiza cabeçalho e (opcionalmente) as operações de um plano existente. */
export async function updatePmpPlan(
  planId: string,
  patch: {
    modeloOriginal: string;
    familia?: string;
    fabricante?: string;
    intervaloHoras: number;
    intervaloLabel?: string;
    codigoPlano?: string;
    setorExecutante?: string;
  },
  operations?: PmpOperation[],
): Promise<void> {
  const modeloOriginal = patch.modeloOriginal.trim();
  const { error } = await supabase
    .from("pmp_plans")
    .update({
      modelo: normalizeModelo(modeloOriginal),
      modelo_original: modeloOriginal,
      fabricante: patch.fabricante?.trim() || modeloOriginal.split(/\s+/)[0] || null,
      familia: patch.familia?.trim().toUpperCase() || null,
      intervalo_horas: patch.intervaloHoras,
      intervalo_label: patch.intervaloLabel?.trim() || `${patch.intervaloHoras}H`,
      codigo_plano: patch.codigoPlano?.trim() || null,
      setor_executante: patch.setorExecutante?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", planId);
  if (error) throw error;

  if (!operations) return;
  const { error: delErr } = await supabase.from("pmp_operations").delete().eq("plan_id", planId);
  if (delErr) throw delErr;
  const rows = operations
    .filter((o) => o.procedimento.trim())
    .map((o, i) => ({
      plan_id: planId,
      ordem: i + 1,
      item: o.item ?? null,
      procedimento: o.procedimento.trim(),
      servico: o.servico ?? null,
      material: o.material ?? null,
      material_codigo: o.materialCodigo ?? null,
      qtde: o.qtde ?? null,
      unidade: o.unidade ?? null,
      tempo: o.tempo ?? null,
    }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error: insErr } = await supabase.from("pmp_operations").insert(rows.slice(i, i + 500));
    if (insErr) throw insErr;
  }
}

export async function deletePmpPlan(planId: string): Promise<void> {
  const { error } = await supabase.from("pmp_plans").delete().eq("id", planId);
  if (error) throw error;
}
