import type { Asset } from "@/lib/types";

/**
 * Máquina liberada: saiu do fluxo de oficina.
 * Some das telas de supervisor/mecânico; permanece apenas no PCM (encerrar OS).
 *
 * Exceção: se a máquina voltou para "Nova solicitação" (chegada), ela entrou de
 * novo no fluxo — a data de liberação antiga não pode escondê-la das telas.
 */
export function isLiberado(a: Pick<Asset, "column" | "dataLiberacao">): boolean {
  if (a.column === "chegada") return false;
  return a.column === "liberado" || !!a.dataLiberacao;
}
