import type { Mechanic } from "./types";

export const JORNADA_PADRAO = {
  entrada: "07:45",
  saida: "17:30",
  utilPct: 0.7,
} as const;

function parseHM(hm: string): number {
  const [h, m] = hm.split(":").map((x) => parseInt(x, 10));
  return h + (m || 0) / 60;
}

/** Duração total do turno em horas (07:45 → 17:30 = 9,75h). */
export function duracaoTurno(m?: Mechanic): number {
  const e = parseHM(m?.entradaHora ?? JORNADA_PADRAO.entrada);
  const s = parseHM(m?.saidaHora ?? JORNADA_PADRAO.saida);
  return Math.max(0, s - e);
}

/** Capacidade útil diária em horas (default 9,75 × 70% ≈ 6h50min). */
export function capacidadeDiaria(m?: Mechanic): number {
  const pct = m?.utilPct ?? JORNADA_PADRAO.utilPct;
  return duracaoTurno(m) * pct;
}

/** Formata horas decimais como "6h50" */
export function fmtHoras(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return mm === 0 ? `${hh}h` : `${hh}h${String(mm).padStart(2, "0")}`;
}
