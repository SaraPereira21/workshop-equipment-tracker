// FR 284_02 — Checklist de Frota (Entrada/Saída)
// Fiel ao modelo Excel oficial: 120 itens em 12 grupos, status A/AR/R/NA.
export interface ChecklistDef {
  id: number;
  description: string;
}

export interface ChecklistGroup {
  key: string;
  title: string;
  items: ChecklistDef[];
}

// Portal de Compras (Solicitação de Peças).
// Pode ser sobrescrita via VITE_PARTS_APP_URL no build.
export const PARTS_APP_URL: string =
  (import.meta.env.VITE_PARTS_APP_URL as string | undefined) ??
  "https://comprasengelogmatriz.lovable.app";

export const CHECKLIST_GROUPS: ChecklistGroup[] = [
  {
    key: "geral",
    title: "1. GERAL",
    items: [
      { id: 1, description: "Garantir lubrificação geral da máquina" },
      { id: 2, description: "Verificar ruídos anormais no funcionamento" },
    ],
  },
  {
    key: "motor",
    title: "2. MOTOR",
    items: [
      { id: 3, description: "Nível do óleo do motor" },
      { id: 4, description: "Filtro lubrificante" },
      { id: 5, description: "Cárter" },
      { id: 6, description: "Cabeçote" },
      { id: 7, description: "Tampas das válvulas" },
      { id: 8, description: "Verificar líquido de arrefecimento (nível/limpeza)" },
      { id: 9, description: "Verificar reservatórios + tampa — líq. arrefecimento" },
      { id: 10, description: "Testar sistema de injeção (funcionamento)" },
      { id: 11, description: "Inspecionar bomba injetora" },
      { id: 12, description: "Verificar filtros de combustível e separador" },
      { id: 13, description: "Inspecionar tanque de combustível + tampa" },
      { id: 14, description: "Inspecionar correias, tensores e polias" },
      { id: 15, description: "Verificar proteção da hélice do motor" },
      { id: 16, description: "Verificar coxins" },
      { id: 17, description: "Verificar filtro de ar interno e externo" },
      { id: 18, description: "Verificar carcaça do filtro de ar" },
      { id: 19, description: "Verificar radiadores (água e óleo) fixação e colmeias" },
      { id: 20, description: "Aspecto visual do motor (limpeza/vazamentos)" },
      { id: 21, description: "Verificar sistema de escape" },
    ],
  },
  {
    key: "hidraulico",
    title: "3. SISTEMA HIDRÁULICO",
    items: [
      { id: 22, description: "Cilindros de levantamento + mangueiras" },
      { id: 23, description: "Cilindro da lança + mangueiras" },
      { id: 24, description: "Cilindro do braço + mangueiras" },
      { id: 25, description: "Cilindro de inclinação + mangueiras" },
      { id: 26, description: "Cilindro de direção + mangueiras" },
      { id: 27, description: "Cilindro dos estabilizadores/patola + mangueiras" },
      { id: 28, description: "Cilindro de basculamento + mangueiras" },
      { id: 29, description: "Cilindro patolas + mangueiras" },
      { id: 30, description: "Cilindros deslocamento lateral + mangueiras" },
      { id: 31, description: "Cilindros de compensação + mangueiras" },
      { id: 32, description: "Cilindros da concha + mangueiras" },
      { id: 33, description: "Cilindros do bulldozer + mangueiras" },
      { id: 34, description: "Outros cilindros" },
      { id: 35, description: "Outras mangueiras" },
      { id: 36, description: "Inspecionar vazamentos do sistema em geral" },
      { id: 37, description: "Verificar filtros hidráulicos" },
      { id: 38, description: "Verificar bomba hidráulica" },
      { id: 39, description: "Verificar nível de óleo hidráulico" },
      { id: 40, description: "Verificar grupo de válvulas/comando hidráulico" },
      { id: 41, description: "Verificar motor redutor/hidrostático" },
      { id: 42, description: "Comando final LD" },
      { id: 43, description: "Comando final LE" },
    ],
  },
  {
    key: "eletrico",
    title: "4. SISTEMA ELÉTRICO / AR CONDICIONADO",
    items: [
      { id: 44, description: "Verificar funcionamento do ar condicionado" },
      { id: 45, description: "Verificar componentes do A/C (condens./compress./válvu.)" },
      { id: 46, description: "Verificar correia ar condicionado" },
      { id: 47, description: "Verificar painel do operador e instrumentos em geral" },
      { id: 48, description: "Verificar códigos de falha" },
      { id: 49, description: "Verificar estado dos chicotes elétricos" },
      { id: 50, description: "Verificar buzina/sirene de deslocamento" },
      { id: 51, description: "Motores dos limpadores (dianteiros, traseiros, laterais)" },
      { id: 52, description: "Farol e lanternas, dianteiras e traseiras" },
      { id: 53, description: "Verificar baterias" },
      { id: 54, description: "Verificar chave geral" },
      { id: 55, description: "Verificar chave de ignição" },
      { id: 56, description: "Verificar pisca alerta" },
      { id: 57, description: "Verificar chave de seta/luz alta" },
      { id: 58, description: "Verificar indicador de combustível/horímetro" },
      { id: 59, description: "Verificar alternador (tensão, cabeamento, fixação, correia)" },
      { id: 60, description: "Verificar motor de partida" },
    ],
  },
  {
    key: "freio",
    title: "5. SISTEMA DE FREIO",
    items: [
      { id: 61, description: "Verificar mangueiras, tubos e conexões" },
      { id: 62, description: "Verificar nível de óleo e tampa do reservatório e sensor" },
      { id: 63, description: "Verificar atuação dos freios" },
      { id: 64, description: "Verificar cilindros de freios (mestre e de rodas)" },
      { id: 65, description: "Inspecionar desgaste dos discos/tambor/pastilha/lonas" },
      { id: 66, description: "Verificar freio estacionário" },
      { id: 67, description: "Verificar regulagem catraca de freio/cuíca" },
      { id: 68, description: "Verificar pressão dos acumuladores" },
    ],
  },
  {
    key: "chassis",
    title: "6. SISTEMA CHASSIS E ESTRUTURA",
    items: [
      { id: 69, description: "Pintura" },
      { id: 70, description: "Retrovisores" },
      { id: 71, description: "Faixas refletivas" },
      { id: 72, description: "Logotipo e prefixo" },
      { id: 73, description: "Extintor (base, pressurização, vencimento)" },
      { id: 74, description: "Verificar integridade do assento do operador" },
      { id: 75, description: "Verificar cinto de segurança" },
      { id: 76, description: "Maçanetas, fechaduras e amortecedor do capô" },
      { id: 77, description: "Chassis (trincas)" },
      { id: 78, description: "Vidros (laterais, traseiros e para-brisas)" },
      { id: 79, description: "Verificar lanternas/faróis" },
      { id: 80, description: "Verificar giroflex" },
      { id: 81, description: "Verificar estado dos painéis (consoles)" },
      { id: 82, description: "Verificar sistema interno (rádio, iluminação, difusor A/C)" },
      { id: 83, description: "Palhetas do limpador" },
    ],
  },
  {
    key: "direcao",
    title: "7. SISTEMA DIREÇÃO E EIXOS",
    items: [
      { id: 84, description: "Verificar funcionamento e vazamentos" },
      { id: 85, description: "Verificar coluna de direção, manoplas e amortecedor" },
      { id: 86, description: "Verificar níveis de óleo (cubo LD e LE)" },
      { id: 87, description: "Verificar cruzetas e cardan" },
      { id: 88, description: "Verificar retentor do cubo/cardan" },
      { id: 89, description: "Verificar bomba de direção" },
      { id: 90, description: "Verificar nível do(s) diferencial(is)" },
    ],
  },
  {
    key: "implementos",
    title: "8. IMPLEMENTOS",
    items: [
      { id: 91, description: "Verificar mangueiras" },
      { id: 92, description: "Verificar correias" },
      { id: 93, description: "Verificar bombas/compressores/geradores" },
      { id: 94, description: "Verificar vedações" },
      { id: 95, description: "Verificar materiais de desgaste (ponteiros/cerdas)" },
      { id: 96, description: "Verificar filtros" },
      { id: 97, description: "Verificar níveis de óleo/gás" },
      { id: 98, description: "Garantir lubrificação geral do implemento" },
    ],
  },
  {
    key: "transmissao",
    title: "9. TRANSMISSÃO",
    items: [
      { id: 99, description: "Verificar nível de óleo da transmissão" },
      { id: 100, description: "Verificar vazamentos" },
      { id: 101, description: "Analisar folgas e anomalias" },
      { id: 102, description: "Verificar calibração" },
      { id: 103, description: "Verificar conversor" },
      { id: 104, description: "Verificar solenoides/sensores" },
    ],
  },
  {
    key: "acessorios",
    title: "10. SISTEMA ACESSÓRIOS E MAT. DESGASTE",
    items: [
      { id: 105, description: "Concha" },
      { id: 106, description: "Caçamba" },
      { id: 107, description: "Garfos" },
      { id: 108, description: "Torre" },
      { id: 109, description: "Cesto" },
      { id: 110, description: "Unhas/bordas cortantes" },
      { id: 111, description: "Escarificador" },
      { id: 112, description: "Lâminas" },
    ],
  },
  {
    key: "rodante",
    title: "11. MATERIAL RODANTE / PNEUS",
    items: [
      { id: 113, description: "Pneus (calibração/desgaste)" },
      { id: 114, description: "Verificar parafusos de fixação das rodas" },
      { id: 115, description: "Conferir macaco e chave de roda" },
      { id: 116, description: "Pneu estepe" },
      { id: 117, description: "Seguimentos" },
      { id: 118, description: "Roletes" },
      { id: 119, description: "Pinos e buchas" },
      { id: 120, description: "Tensão das sapatas" },
    ],
  },
];

export const ALL_CHECKLIST_ITEMS: (ChecklistDef & { group: string })[] =
  CHECKLIST_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.title })));

/** Descrição/grupo oficial do item pelo número — usado como fallback quando
 *  a inspeção salva não trouxe o texto do item. */
export function describeChecklistItem(id: number) {
  const found = ALL_CHECKLIST_ITEMS.find((i) => i.id === id);
  return { description: found?.description ?? `Item ${id}`, group: found?.group ?? "—" };
}

export function createEmptyChecklist() {
  return CHECKLIST_GROUPS.flatMap((g) =>
    g.items.map((it) => ({
      id: it.id,
      group: g.title,
      description: it.description,
      status: null,
      observation: "",
      photos: [],
    })),
  );
}

/**
 * Garante que a inspeção sempre tenha os 120 itens oficiais na tela.
 * Rascunhos/inspeções antigas podem vir incompletos (itens salvos parcialmente);
 * aqui o template completo é preenchido com o que já foi respondido, sem perder
 * status, observações ou fotos já lançados.
 */
export function mergeChecklist(saved?: { id: number; status?: unknown; observation?: string; photos?: string[] }[]) {
  const base = createEmptyChecklist();
  if (!saved?.length) return base;
  const porId = new Map(saved.map((s) => [Number(s.id), s]));
  const extras = saved.filter((s) => !base.some((b) => b.id === Number(s.id)));
  const merged = base.map((it) => {
    const s = porId.get(it.id);
    return s
      ? {
          ...it,
          status: (s.status ?? null) as (typeof base)[number]["status"],
          observation: s.observation ?? "",
          photos: s.photos ?? [],
        }
      : it;
  });
  return [...merged, ...(extras as unknown as typeof base)];
}
