import type { ChecklistItem, PendingTask } from "@/lib/types";

/**
 * Converte um item de checklist na descrição curta usada na lista de tarefas
 * do card: apenas o texto do item, sem prefixos de status, número ou grupo.
 * Ex.: "[Ressalva] #73 — 6. SISTEMA CHASSIS — Extintor (base, pressurização)"
 *  ->  "Extintor (base, pressurização)"
 */
export function normalizarAtividade(texto: string): string {
  return (texto ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("pt-BR");
}

export function textoTarefaItem(item: { description: string }): string {
  const bruto = item.description ?? "";
  const semStatus = bruto.replace(/^\s*\[[^\]]+\]\s*/, "");
  const semNumero = semStatus.replace(/^#\d+\s*[—-]\s*/, "");
  const partes = semNumero.split(/\s+—\s+/);
  return normalizarAtividade(partes[partes.length - 1] ?? semNumero);
}

/**
 * Gera a lista de tarefas do card a partir dos apontamentos (R e AR) da
 * inspeção, mantendo as tarefas já existentes e sem duplicar textos.
 */
export function mesclarTarefasDaInspecao(
  items: ChecklistItem[],
  existentes: PendingTask[] = [],
): PendingTask[] {
  const resultado = [...existentes];
  const vistos = new Set(
    existentes.map((t) => t.text.trim().toLowerCase()).filter(Boolean),
  );

  items
    .filter((i) => i.status === "R" || i.status === "AR")
    .forEach((i) => {
      const text = textoTarefaItem(i);
      if (!text) return;
      const chave = text.toLowerCase();
      if (vistos.has(chave)) return;
      vistos.add(chave);
      resultado.push({ id: `t-insp-${i.id}`, text, done: false });
    });

  return resultado;
}

/**
 * Tarefas do card derivadas de TODAS as inspeções do equipamento.
 * Prioriza as inspeções de entrada (onde ficam os apontamentos da corretiva);
 * se não houver nenhuma, usa todas as inspeções disponíveis.
 */
export function tarefasDoAsset(
  inspecoes: { tipo?: string; data?: string; items?: ChecklistItem[] }[],
  existentes: PendingTask[] = [],
): PendingTask[] {
  const ordenadas = [...inspecoes].sort((a, b) => (a.data ?? "").localeCompare(b.data ?? ""));
  const entradas = ordenadas.filter((i) => i.tipo === "entrada");
  const base = entradas.length ? entradas : ordenadas;
  let tarefas = existentes;
  for (const insp of base) tarefas = mesclarTarefasDaInspecao(insp.items ?? [], tarefas);
  return tarefas;
}

/**
 * Tarefas derivadas das Ordens de Serviço: falhas herdadas (apontamentos
 * lançados pelo PCM) e operações registradas pelo mecânico.
 */
export function tarefasDasOrdens(
  ordens: {
    falhasHerdadas?: { descricao: string; corrigido: boolean }[];
    operations?: { problema?: string; solucao?: string; corrigido?: boolean }[];
  }[],
  existentes: PendingTask[] = [],
): PendingTask[] {
  const resultado = [...existentes];
  const vistos = new Set(
    existentes.map((t) => t.text.trim().toLowerCase()).filter(Boolean),
  );

  const push = (raw: string, done: boolean, id: string) => {
    const text = textoTarefaItem({ description: raw });
    if (!text) return;
    const chave = text.toLowerCase();
    if (vistos.has(chave)) return;
    vistos.add(chave);
    resultado.push({ id, text, done });
  };

  ordens.forEach((wo, wi) => {
    (wo.falhasHerdadas ?? []).forEach((f, i) =>
      push(f.descricao, !!f.corrigido, `t-os-${wi}-f${i}`),
    );
    (wo.operations ?? []).forEach((o, i) =>
      push(o.problema || o.solucao || "", !!o.corrigido, `t-os-${wi}-o${i}`),
    );
  });

  return resultado;
}

/** Tarefas do card considerando inspeções + ordens de serviço. */
export function tarefasDoCard(
  inspecoes: { tipo?: string; data?: string; items?: ChecklistItem[] }[],
  ordens: Parameters<typeof tarefasDasOrdens>[0],
  existentes: PendingTask[] = [],
): PendingTask[] {
  return tarefasDasOrdens(ordens, tarefasDoAsset(inspecoes, existentes));
}
