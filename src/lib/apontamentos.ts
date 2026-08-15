import type { WorkOrder, Asset } from "@/lib/types";
import { totalMin, dataHora, sessoes, type Apontamento } from "@/lib/tempo";

export interface ApontamentoRow {
  osId: string;
  numeroSAP: string;
  tipo: string;
  prefixo: string;
  tipoEquipamento?: string;
  mecanico: string;
  nivel: "OS" | "Atividade";
  atividade: string;
  inicio?: string;
  fim?: string;
  minutos: number | null;
  /** data de referência do apontamento (início, fim ou última mexida na sessão) */
  em?: string;
  createdAt: string;
}




export type NomeMecanico = (id: string) => string | undefined;

function mecanicoDaOs(wo: WorkOrder, asset?: Asset, nome?: NomeMecanico): string {
  const execs = (wo.executores ?? []).map((e) => e.mecanicoNome).filter(Boolean);
  if (execs.length) return Array.from(new Set(execs)).join(", ");
  // Fallback: manutentores alocados na máquina (fluxo atual do planner)
  const ids = asset?.mecanicoIds?.length
    ? asset.mecanicoIds
    : asset?.mecanicoId
      ? [asset.mecanicoId]
      : [];
  const nomes = ids.map((id) => nome?.(id)).filter(Boolean) as string[];
  return Array.from(new Set(nomes)).join(", ");
}


/** Achata as OSs em linhas de apontamento, prontas para relatório/CSV. */
export function apontamentosDeOs(
  wo: WorkOrder,
  asset?: Asset,
  nome?: NomeMecanico,
): ApontamentoRow[] {
  const base = {
    osId: wo.id,
    numeroSAP: wo.numeroSAP,
    tipo: wo.tipo,
    prefixo: wo.prefixo,
    tipoEquipamento: asset?.tipo,
    mecanico: mecanicoDaOs(wo, asset, nome),
    createdAt: wo.createdAt,
  };
  const rows: ApontamentoRow[] = [];
  const fallback = base.mecanico;

  const push = (
    nivel: "OS" | "Atividade",
    atividade: string,
    v: { apontamentos?: Apontamento[]; inicio?: string; fim?: string; minAcum?: number },
  ) => {
    sessoes(v).forEach((s) => {
      rows.push({
        ...base,
        mecanico: s.nome || fallback,
        nivel,
        atividade,
        inicio: s.inicio,
        fim: s.fim,
        em: s.inicio ?? s.fim ?? s.em,
        minutos: totalMin(s),

      });
    });
  };

  push("OS", `SERVIÇO COMPLETO (${wo.tipo.toUpperCase()})`, {
    apontamentos: wo.apontamentos,
    inicio: wo.execInicio,
    fim: wo.execFim,
    minAcum: wo.execMinAcum,
  });

  (wo.pmpChecklist ?? []).forEach((it) => push("Atividade", it.label, it));
  (wo.operations ?? []).forEach((o) =>
    push("Atividade", o.problema || o.solucao || "OPERAÇÃO", o),
  );
  if (wo.tipo === "corretiva") {
    (asset?.pendingTasks ?? []).forEach((t) => push("Atividade", t.text, t));
  }

  return rows;
}

export function apontamentosDeOrdens(
  ordens: WorkOrder[],
  assets: Asset[],
  nome?: NomeMecanico,
): ApontamentoRow[] {
  const byId = new Map(assets.map((a) => [a.id, a]));
  return ordens.flatMap((wo) => apontamentosDeOs(wo, byId.get(wo.assetId), nome));
}

export const APONTAMENTO_HEADERS = [
  "Prefixo",
  "Tipo equipamento",
  "Tipo OS",
  "Nº OS SAP",
  "Nível",
  "Atividade",
  "Mecânico",
  "Início",
  "Fim",
  "Minutos",
];

export function apontamentoParaLinha(r: ApontamentoRow) {
  return [
    r.prefixo,
    r.tipoEquipamento ?? "",
    r.tipo,
    r.numeroSAP,
    r.nivel,
    r.atividade,
    r.mecanico,
    dataHora(r.inicio),
    dataHora(r.fim),
    r.minutos ?? "",
  ];
}
