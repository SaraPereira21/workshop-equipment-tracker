/**
 * Fonte ÚNICA da fila de inspeção.
 */
import { isLiberado } from "@/lib/liberado";
import type { Asset } from "@/lib/types";

export type ResponsavelInspecao = { id: string; nome?: string } | null;

/** Inspetor responsável: alocação do supervisor, trava ou rascunho iniciado. */
export function responsavelInspecao(a: Asset): ResponsavelInspecao {
  if (a.inspetorAlocadoId) return { id: a.inspetorAlocadoId, nome: a.inspetorAlocadoNome };
  if (a.inspetorLockId) return { id: a.inspetorLockId, nome: a.inspetorLockNome };
  if (a.inspectionDraft?.inspetorId)
    return { id: a.inspectionDraft.inspetorId, nome: a.inspectionDraft.inspetorNome };
  return null;
}

/** Máquina que já saiu do fluxo de oficina/inspeção (liberada ou em liberação). */
export function foraDoFluxo(a: Asset): boolean {
  return (
    isLiberado(a) ||
    a.status === "liberado" ||
    a.libNovoStatus === "aguardando_supervisor" ||
    a.libNovoStatus === "pronto_envio" ||
    a.libNovoStatus === "enviado"
  );
}

const porPrefixo = (a: Asset, b: Asset) => (a.prefixo ?? "").localeCompare(b.prefixo ?? "");

/**
 * Colunas em que a máquina é considerada ativa no fluxo de inspeção/oficina.
 */
const COLUNAS_INSPECAO = new Set([
  "chegada",
  "aguardando_saida",
  "mdo",
  "atribu_do",
  "manutencao",
  "pcm",
  "aguardando_rc",
  "aguardando_pedido",
  "aguardando_pcm",
  "execucao_liberada",
  "melhoria"
]);

export function emColunaDeInspecao(a: Asset): boolean {
  return COLUNAS_INSPECAO.has(String(a.column));
}

/** Tudo que está em inspeção: alocado pelo supervisor, reinspeção ou rascunho. */
export function filaInspecao(assets: Asset[]): Asset[] {
  return assets
    .filter(
      (a) =>
        !foraDoFluxo(a) &&
        !a.inspecaoCancelada &&
        (!!a.reinspecaoSolicitada ||
          (emColunaDeInspecao(a) && (!!responsavelInspecao(a) || !!a.inspectionDraft))),
    )
    .sort(porPrefixo);
}

/** Inspeção de saída x inspeção de entrada/reinspeção. */
export function ehInspecaoSaida(a: Asset): boolean {
  return a.column === "aguardando_saida";
}

/** Máquinas em "Nova solicitação" ainda sem inspetor alocado pelo supervisor. */
export function aguardandoAlocacao(assets: Asset[]): Asset[] {
  return assets
    .filter(
      (a) =>
        a.column === "chegada" &&
        !foraDoFluxo(a) &&
        !a.inspecaoCancelada &&
        !responsavelInspecao(a) &&
        !a.reinspecaoSolicitada &&
        !a.inspectionDraft,
    )
    .sort(porPrefixo);
}