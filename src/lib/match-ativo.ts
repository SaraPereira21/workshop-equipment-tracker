/**
 * Correspondência de máquina entre setores (inspeção ↔ planner ↔ OS).
 *
 * Os prefixos são digitados por pessoas diferentes em telas diferentes:
 * "EH 110", "EH110", "eh 110" e "MO00197 | DESMOB" são o mesmo equipamento.
 * Comparar a string crua fazia a inspeção do inspetor não aparecer no card do
 * PCM e a OS do mecânico não aparecer no planner. Toda comparação por prefixo
 * deve usar estas funções.
 */

/** Normaliza um prefixo: sem acento, sem sufixo após "|", só letras e números. */
export function normPrefixo(v?: string | null): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split("|")[0]
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** True quando os dois prefixos representam o mesmo equipamento. */
export function mesmoPrefixo(a?: string | null, b?: string | null): boolean {
  const na = normPrefixo(a);
  return !!na && na === normPrefixo(b);
}

type Ativo = { id: string; prefixo: string };
type Registro = { assetId?: string; prefixo?: string };

/** True quando o registro (inspeção/OS) pertence ao ativo — por id ou prefixo. */
export function doAtivo(ativo: Ativo | null | undefined, reg: Registro): boolean {
  if (!ativo) return false;
  if (reg.assetId && reg.assetId === ativo.id) return true;
  return mesmoPrefixo(reg.prefixo, ativo.prefixo);
}

/**
 * Mantém apenas uma OS por tipo (corretiva/preventiva) para o mesmo equipamento.
 * Cards antigos/duplicados deixam OSs "órfãs" com o mesmo prefixo, que apareciam
 * repetidas na tela do mecânico. Preferimos a OS do próprio card e, entre elas,
 * a mais recente.
 */
export function umaOsPorTipo<T extends Registro & { id: string; tipo: string }>(
  ativo: Ativo | null | undefined,
  lista: T[],
): T[] {
  const melhor = new Map<string, T>();
  for (const os of lista) {
    const atual = melhor.get(os.tipo);
    if (!atual) {
      melhor.set(os.tipo, os);
      continue;
    }
    const novoDoCard = os.assetId === ativo?.id;
    const atualDoCard = atual.assetId === ativo?.id;
    if (novoDoCard !== atualDoCard) {
      if (novoDoCard) melhor.set(os.tipo, os);
      continue;
    }
    if (os.id.localeCompare(atual.id) > 0) melhor.set(os.tipo, os);
  }
  return [...melhor.values()];
}

