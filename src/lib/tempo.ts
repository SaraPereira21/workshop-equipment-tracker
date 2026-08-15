// Helpers de apontamento de tempo (cronômetro das OSs).

/** Duração em minutos entre dois instantes ISO. */
export function duracaoMin(inicio?: string, fim?: string): number | null {
  if (!inicio || !fim) return null;
  const a = new Date(inicio).getTime();
  const b = new Date(fim).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / 60000);
}

/** Formata minutos como "1h 20min" / "18min". */
export function formatMin(min?: number | null): string {
  if (min === null || min === undefined) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h <= 0) return `${m}min`;
  return m ? `${h}h ${m}min` : `${h}h`;
}

/** Formata a duração entre dois ISO. */
export function formatDuracao(inicio?: string, fim?: string): string {
  return formatMin(duracaoMin(inicio, fim));
}

/** Cronômetro em andamento: "01:42:07" a partir do início. */
export function formatCronometro(inicio: string, agora = Date.now(), acumMin = 0): string {
  const a = new Date(inicio).getTime();
  const s = Math.max(0, Math.floor((agora - a) / 1000)) + Math.round(acumMin * 60);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/** Hora curta local (HH:MM) de um ISO. */
export function horaCurta(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Data + hora local de um ISO. */
export function dataHora(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR");
}

/** Total apontado de uma atividade: sessões anteriores + sessão fechada atual. */
export function totalMin(v: { inicio?: string; fim?: string; minAcum?: number }): number | null {
  const atual = duracaoMin(v.inicio, v.fim);
  const acum = v.minAcum ?? 0;
  if (atual === null && !acum) return null;
  return acum + (atual ?? 0);
}

/** Formata o total apontado (incluindo pausas/retomadas). */
export function formatTotal(v: { inicio?: string; fim?: string; minAcum?: number }): string {
  return formatMin(totalMin(v));
}

/** Soma das durações apontadas de uma lista de atividades. */
export function somaDuracoes(
  itens: { inicio?: string; fim?: string; minAcum?: number }[],
): number {
  return itens.reduce((acc, i) => acc + (totalMin(i) ?? 0), 0);
}

/** Converte "HH:MM" (do input type=time) em ISO, mantendo a data de base. */
export function horaParaIso(base: string | undefined, hhmm: string): string | undefined {
  if (!hhmm) return undefined;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return undefined;
  const d = base ? new Date(base) : new Date();
  if (Number.isNaN(d.getTime())) return undefined;
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

/** Valor para input type=time a partir de um ISO. */
export function isoParaHora(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Pausa uma atividade em andamento: acumula os minutos e zera a sessão atual. */
export function pausar<T extends { inicio?: string; fim?: string; minAcum?: number }>(v: T): T {
  if (!v.inicio || v.fim) return v;
  const parcial = duracaoMin(v.inicio, new Date().toISOString()) ?? 0;
  return { ...v, inicio: undefined, fim: undefined, minAcum: (v.minAcum ?? 0) + parcial };
}

// ---------------------------------------------------------------------------
// Sessões de apontamento por mecânico
// ---------------------------------------------------------------------------

export interface Apontamento {
  id: string;
  /** profiles.id de quem apontou (ausente = apontamento legado, sem dono) */
  userId?: string;
  nome?: string;
  inicio?: string;
  fim?: string;
  minAcum?: number;
  /** última vez que a sessão foi mexida (usado quando a sessão está pausada) */
  em?: string;
}


export interface ComApontamentos {
  apontamentos?: Apontamento[];
  inicio?: string;
  fim?: string;
  minAcum?: number;
}

/** Sessões de uma atividade/OS, convertendo o formato legado (um só cronômetro). */
export function sessoes(v?: ComApontamentos): Apontamento[] {
  if (!v) return [];
  if (v.apontamentos && v.apontamentos.length) return v.apontamentos;
  if (v.inicio || v.fim || v.minAcum)
    return [{ id: "legado", inicio: v.inicio, fim: v.fim, minAcum: v.minAcum }];
  return [];
}

export function totalSessoes(list: Apontamento[]): number {
  return list.reduce((acc, s) => acc + (totalMin(s) ?? 0), 0);
}

/** Total apontado de uma atividade considerando todas as sessões. */
export function totalDe(v?: ComApontamentos): number | null {
  const list = sessoes(v);
  if (!list.length) return null;
  return totalSessoes(list);
}

export function formatTotalDe(v?: ComApontamentos): string {
  return formatMin(totalDe(v));
}

export function temApontamento(v?: ComApontamentos): boolean {
  return sessoes(v).length > 0;
}

export function sessaoDoUsuario(list: Apontamento[], userId?: string): Apontamento | undefined {
  if (!userId) return list.find((s) => !s.userId);
  return list.find((s) => s.userId === userId);
}

/** Cria/atualiza a sessão do usuário logado dentro da lista. */
export function upsertSessao(
  list: Apontamento[],
  userId: string | undefined,
  nome: string | undefined,
  val: { inicio?: string; fim?: string; minAcum?: number },
): Apontamento[] {
  const atual = sessaoDoUsuario(list, userId);
  const vazia = !val.inicio && !val.fim && !val.minAcum;
  const em = new Date().toISOString();
  if (atual) {
    if (vazia) return list.filter((s) => s !== atual);
    return list.map((s) => (s === atual ? { ...s, ...val, em, nome: nome ?? s.nome } : s));
  }
  if (vazia) return list;
  return [
    ...list,
    { id: `ap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, userId, nome, em, ...val },
  ];
}

/** Pausa a sessão em andamento do usuário (acumula os minutos). */
export function pausarSessaoDoUsuario(list: Apontamento[], userId?: string): Apontamento[] {
  const em = new Date().toISOString();
  return list.map((s) => {
    const dono = userId ? s.userId === userId : !s.userId;
    return dono && s.inicio && !s.fim ? ({ ...(pausar(s) as Apontamento), em }) : s;
  });
}


/** Fecha todas as sessões em andamento (usado ao encerrar a OS). */
export function fecharSessoesAbertas(list: Apontamento[], iso = new Date().toISOString()): Apontamento[] {
  return list.map((s) => (s.inicio && !s.fim ? { ...s, fim: iso } : s));
}

/** Soma o total apontado de uma lista de atividades (com ou sem sessões). */
export function somaTotais(itens: ComApontamentos[]): number {
  return itens.reduce((acc, i) => acc + (totalDe(i) ?? 0), 0);
}
