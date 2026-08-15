import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { KANBAN_COLUMNS as DEFAULT_COLUMNS } from "@/lib/store";
import type { KanbanColumn } from "@/lib/types";

export interface KanbanColumnDef {
  key: KanbanColumn;
  title: string;
  short: string;
  ordem?: number;
}

let cache: KanbanColumnDef[] | null = null;
const listeners = new Set<() => void>();

async function fetchColumns(): Promise<KanbanColumnDef[]> {
  const { data, error } = await supabase
    .from("kanban_columns")
    .select("chave, titulo, titulo_curto, ordem")
    .order("ordem");
  if (error || !data || data.length === 0) return DEFAULT_COLUMNS;
  return data.map((r) => ({
    key: r.chave as KanbanColumn,
    title: r.titulo,
    short: r.titulo_curto,
    ordem: r.ordem,
  }));
}

function notify() {
  listeners.forEach((fn) => fn());
}

async function refreshCache() {
  cache = await fetchColumns();
  notify();
}

export function useKanbanColumns(): { columns: KanbanColumnDef[]; refresh: () => Promise<void> } {
  const [, setTick] = useState(0);

  const refresh = useCallback(async () => {
    await refreshCache();
  }, []);

  useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    listeners.add(fn);
    if (!cache) refreshCache();
    return () => { listeners.delete(fn); };
  }, []);

  return { columns: cache ?? DEFAULT_COLUMNS, refresh };
}

export async function updateKanbanColumnTitles(
  updates: { chave: string; titulo: string; titulo_curto: string }[],
) {
  for (const u of updates) {
    const { error } = await supabase
      .from("kanban_columns")
      .update({ titulo: u.titulo, titulo_curto: u.titulo_curto })
      .eq("chave", u.chave);
    if (error) throw error;
  }
  await refreshCache();
}

export async function reorderKanbanColumns(orderedChaves: string[]) {
  // Two-phase update to avoid unique(ordem) collisions if a constraint exists
  for (let i = 0; i < orderedChaves.length; i++) {
    const { error } = await supabase
      .from("kanban_columns")
      .update({ ordem: 1000 + i })
      .eq("chave", orderedChaves[i]);
    if (error) throw error;
  }
  for (let i = 0; i < orderedChaves.length; i++) {
    const { error } = await supabase
      .from("kanban_columns")
      .update({ ordem: i })
      .eq("chave", orderedChaves[i]);
    if (error) throw error;
  }
  await refreshCache();
}

export async function addKanbanColumn(input: { chave: string; titulo: string; titulo_curto: string }) {
  const chave = input.chave.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (!chave) throw new Error("Chave inválida");
  const { data: existing } = await supabase.from("kanban_columns").select("ordem").order("ordem", { ascending: false }).limit(1);
  const nextOrder = (existing?.[0]?.ordem ?? -1) + 1;
  const { error } = await supabase.from("kanban_columns").insert({
    chave,
    titulo: input.titulo.trim() || chave,
    titulo_curto: (input.titulo_curto || input.titulo).trim().slice(0, 24) || chave,
    ordem: nextOrder,
  });
  if (error) throw error;
  await refreshCache();
  return chave;
}

export async function deleteKanbanColumn(chave: string) {
  const { error } = await supabase.from("kanban_columns").delete().eq("chave", chave);
  if (error) throw error;
  await refreshCache();
}
