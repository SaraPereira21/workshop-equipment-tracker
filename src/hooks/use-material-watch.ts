import { useEffect } from "react";
import { comprasSupabase, COMPRAS_VIEW } from "@/integrations/compras/client";
import { useAppStore } from "@/lib/store";

const POLL_MS = 90_000;

/** Status que ainda bloqueiam a execução (material não chegou ao mecânico). */
const PENDENTES = new Set([
  "SOLICITADA",
  "APROVADA_SUPERVISOR",
  "EM_COTACAO",
  "PEDIDO_EMITIDO",
  "EM_TRANSITO",
  "RECEBIDA_ALMOX",
]);

function cleanPrefixo(p: string) {
  return p.split("|")[0].split("-")[0].trim();
}

/**
 * Observa o portal de Compras: quando o material de uma máquina em
 * "Aguardando Material" é entregue ao mecânico, move automaticamente
 * para "Execução Liberada".
 */
export function useMaterialWatch() {
  useEffect(() => {
    let stopped = false;

    async function tick() {
      const st = useAppStore.getState();
      const alvos = st.assets.filter((a) => a.column === "aguardando_pcm");
      if (!alvos.length) return;

      try {
        const prefixos = Array.from(new Set(alvos.map((a) => cleanPrefixo(a.prefixo))));

        const osNumeros = alvos
          .flatMap((a) => [a.sapOsCorretiva, a.sapOsPreventiva])
          .filter((x): x is string => !!x);

        const filters: string[] = [];
        if (prefixos.length) filters.push(`prefixo_engelog.in.(${prefixos.map((p) => `"${p}"`).join(",")})`);
        if (osNumeros.length) filters.push(`os_numero.in.(${osNumeros.join(",")})`);
        if (!filters.length) return;

        const { data: sols } = await comprasSupabase
          .from(COMPRAS_VIEW)
          .select("status, os_numero, prefixo_engelog, data_entrega_mecanico")
          .or(filters.join(","));

        if (stopped || !sols) return;

        for (const asset of alvos) {
          const pref = cleanPrefixo(asset.prefixo);
          const meus = (sols as { status: string; os_numero: string | null; prefixo_engelog: string | null; data_entrega_mecanico: string | null }[]).filter(
            (r) =>
              (r.prefixo_engelog && cleanPrefixo(r.prefixo_engelog) === pref) ||
              (r.os_numero &&
                [asset.sapOsCorretiva, asset.sapOsPreventiva].filter(Boolean).includes(r.os_numero)),
          );
          if (!meus.length) continue;

          const temEntregue = meus.some(
            (r) => r.status === "ENTREGUE_MECANICO" || !!r.data_entrega_mecanico,
          );
          const aindaPendente = meus.some((r) => PENDENTES.has(r.status));
          if (!temEntregue || aindaPendente) continue;

          const store = useAppStore.getState();
          const atual = store.assets.find((a) => a.id === asset.id);
          if (!atual || atual.column !== "aguardando_pcm") continue;

          store.updateAsset(asset.id, {
            column: "execucao_liberada",
            chatMessages: [
              ...(atual.chatMessages ?? []),
              {
                id: crypto.randomUUID(),
                autor: "Sistema",
                autorCargo: "Automação",
                texto: "📦 Material entregue ao mecânico. Máquina movida para Execução Liberada.",
                createdAt: new Date().toISOString(),
              },
            ],
          });
        }
      } catch (e) {
        console.warn("[material-watch]", e);
      }
    }

    void tick();
    const id = setInterval(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, []);
}
