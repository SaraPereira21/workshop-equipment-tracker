import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAppStore } from "@/lib/store";
import type { Asset, Inspection, Mechanic, SavedSignature, WorkOrder } from "@/lib/types";

/**
 * Hidrata o store a partir do Supabase e assina Realtime.
 * Deve ser montado UMA vez no root autenticado.
 */
export function useAppSync() {
  useEffect(() => {
    let cancelled = false;
    const s = useAppStore.getState();
    if (!s.hydrated) {
      void s._hydrate().catch((e) => console.warn("hydrate", e));
    }

    const ch = supabase
      .channel("app-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "app_assets" }, (p) => {
        const st = useAppStore.getState();
        if (p.eventType === "DELETE") {
          const id = (p.old as { id?: string })?.id;
          if (id) st._applyAssetRow(id, null);
        } else {
          const row = p.new as { id: string; data: Asset };
          if (row?.id) st._applyAssetRow(row.id, row.data);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "app_inspections" }, (p) => {
        const st = useAppStore.getState();
        if (p.eventType === "DELETE") {
          const id = (p.old as { id?: string })?.id;
          if (id) st._applyInspRow(id, null);
        } else {
          const row = p.new as { id: string; data: Inspection };
          if (row?.id) st._applyInspRow(row.id, row.data);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "app_work_orders" }, (p) => {
        const st = useAppStore.getState();
        if (p.eventType === "DELETE") {
          const id = (p.old as { id?: string })?.id;
          if (id) st._applyWORow(id, null);
        } else {
          const row = p.new as { id: string; data: WorkOrder };
          if (row?.id) st._applyWORow(row.id, row.data);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "app_mechanics" }, (p) => {
        const st = useAppStore.getState();
        if (p.eventType === "DELETE") {
          const id = (p.old as { id?: string })?.id;
          if (id) st._applyMechRow(id, null);
        } else {
          const row = p.new as { id: string; data: Mechanic };
          if (row?.id) st._applyMechRow(row.id, row.data);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "app_tags" }, (p) => {
        const st = useAppStore.getState();
        if (p.eventType === "DELETE") {
          const id = (p.old as { id?: string })?.id;
          if (id) st._applyTagRow(id, false);
        } else {
          const row = p.new as { id: string };
          if (row?.id) st._applyTagRow(row.id, true);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "app_signatures" }, (p) => {
        const st = useAppStore.getState();
        if (p.eventType === "DELETE") {
          const id = (p.old as { id?: string })?.id;
          if (id) st._applySigRow(id, null);
        } else {
          const row = p.new as { id: string; data: SavedSignature };
          if (row?.id) st._applySigRow(row.id, row.data);
        }
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
      void cancelled;
    };
  }, []);
}
