import type { Apontamento } from "@/lib/tempo";

export type UserRole = "inspetor" | "mecanico" | "supervisor" | "pcm";

export type ChecklistStatus = "A" | "AR" | "R" | "NA" | null;

export type KanbanColumn =
  | "chegada"
  | "pcm"
  | "triagem"
  | "mdo"
  | "atribu_do"
  | "manutencao"
  | "teste"
  | "aguardando_pcm"
  | "liberado"
  | (string & {});

export type AssetStatus =
  | "operando"
  | "em_inspecao"
  | "em_manutencao"
  | "aguardando_pcm"
  | "liberado";

export type Priority = "baixa" | "media" | "alta" | "critica";

export interface AssetDocument {
  id: string;
  nome: string;
  tipo: "checklist_entrada_saida" | "os_corretiva" | "os_preventiva" | "outro";
  dataUrl: string; // base64 data: URL
  createdAt: string;
  autor?: string;
}

export interface PendingTask {
  id: string;
  text: string;
  done: boolean;
  /** Apontamento de tempo da atividade (ISO) */
  inicio?: string;
  fim?: string;
  /** Minutos já acumulados em sessões anteriores (pausas / outro dia) */
  minAcum?: number;
  /** Apontamentos individuais por mecânico */
  apontamentos?: Apontamento[];
}


export interface ChatMessage {
  id: string;
  autor: string;
  autorCargo?: string;
  texto: string;
  /** IDs (profiles.id) dos usuários mencionados via @ */
  mencionados?: string[];
  /** Quando true, a mensagem aparece na frente do card no Kanban */
  fixadoNoCard?: boolean;
  createdAt: string;
}


export interface AssetAnexo {
  id: string;
  nome: string;
  tipo: string; // mime type
  dataUrl: string;
  descricao?: string;
  createdAt: string;
  autor?: string;
}


export interface Asset {
  id: string;
  /** Quando preenchido, a máquina foi excluída e não deve aparecer em nenhuma tela */
  deletedAt?: string;
  prefixo: string;
  marca: string;
  modelo: string;
  tipo: string;
  horimetroAtual: number;
  dataUltimaPreventiva: string;
  horimetroUltimoPMP: number;
  proximoAlvoPMP: 100 | 250 | 500 | 1000 | 2000 | 4000;
  status: AssetStatus;
  column: KanbanColumn;
  priority: Priority;
  dataEntrada?: string;
  dataLiberacao?: string;
  dataEntregaPrevista?: string;
  dataEntregaOriginal?: string;
  /** Auditoria: quem criou / quem alterou por último */
  criadoPor?: string;
  criadoEm?: string;
  ultimaAlteracaoPor?: string;
  ultimaAlteracaoEm?: string;
  chatMessages?: ChatMessage[];
  anexos?: AssetAnexo[];
  mecanicoId?: string;
  /** Suporte a múltiplos manutentores na mesma máquina. O primeiro é o "principal". */
  mecanicoIds?: string[];
  hasFotos?: boolean;
  faltaDocPCM?: boolean;
  /** Trava de inspeção: id do inspetor que reservou a máquina para si */
  inspetorLockId?: string;
  inspetorLockNome?: string;
  inspetorLockEm?: string;
  /** Inspetor alocado pelo supervisor para a inspeção de entrada */
  inspetorAlocadoId?: string;
  inspetorAlocadoNome?: string;
  inspetorAlocadoEm?: string;
  /** Envio para inspeção cancelado pelo supervisor — sai da tela do inspetor */
  inspecaoCancelada?: boolean;

  ultimaPreventivaDocUrl?: string;
  /** Preventiva já realizada na base, antes de chegar na Oficina Matriz — PCM só anexa o arquivo */
  preventivaBaseFeita?: boolean;
  /** Info livre informada pelo inspetor (data, horímetro, OS SAP da preventiva da base) */
  preventivaBaseInfo?: string;
  preventivaBaseDocUrl?: string;
  preventivaBaseAnexadaEm?: string;
  tags?: string[];
  contrato?: string;
  inventario?: string;
  codigoAtivo?: string;
  numeroSerie?: string;
  descricao?: string;
  pendingTasks?: PendingTask[];
  mecanicoObs?: string;
  sapOsCorretiva?: string;
  sapOsPreventiva?: string;
  temPreventiva?: boolean;
  /** Reinspeção solicitada pelo PCM (máquina volta ao inspetor sem reiniciar o fluxo) */
  reinspecaoSolicitada?: boolean;
  reinspecaoOrigemColumn?: KanbanColumn;
  reinspecaoMotivo?: string;
  /** Decisão do inspetor ao encerrar a inspeção de saída */
  inspetorDecisao?: "aprovado" | "corretiva";
  corretivaLiberada?: boolean;
  preventivaLiberada?: boolean;
  pcmObs?: string;
  pcmDecididoEm?: string;
  // Fluxo de liberação de equipamento NOVO (< 40h)
  libNovoStatus?: "aguardando_supervisor" | "pronto_envio" | "enviado" | "rejeitado";
  libNovoInspetorSig?: SavedSignature;
  libNovoInspetorEm?: string;
  libNovoSupervisorSig?: SavedSignature;
  libNovoSupervisorEm?: string;
  libNovoRejeicaoMotivo?: string;
  libNovoRejeicaoEm?: string;
  libNovoInspectionId?: string;
  documentos?: AssetDocument[];
  inspectionDraft?: {
    tipo: "entrada" | "saida";
    tipoEntradaSaida?: boolean;
    inspetorId?: string;
    inspetorNome?: string;
    updatedAt: string;
    header?: Record<string, string>;
    combustivel: number;
    fotoChassi?: string;
    fotoHorimetro?: string;
    fotosEquipamento?: Record<string, string>;
    items: ChecklistItem[];
    observacoesGerais?: string;
    decisao?: "aprovado" | "corretiva" | null;
  };
}

export interface ChecklistItem {
  id: number;
  group: string;
  description: string;
  status: ChecklistStatus;
  observation?: string;
  photos?: string[];
}

export interface Inspection {
  id: string;
  assetId: string;
  prefixo: string;
  tipo: "entrada" | "saida";
  tipoEntradaSaida?: boolean; // marcado como entrada E saída simultâneas (equipamento novo)
  inspetor: string;
  data: string;
  horimetro: number;
  combustivel: number; // 0-100
  items: ChecklistItem[];
  /** Foto da plaqueta do chassi (URL pública) */
  fotoChassi?: string;
  /** Foto do horímetro (URL pública) */
  fotoHorimetro?: string;
  /** Fotos padrão do equipamento (chave do catálogo -> URL) */
  fotosEquipamento?: Record<string, string>;
  observacoesGerais?: string;

  /** Assinaturas gravadas na própria inspeção (não se perdem quando o card muda de etapa) */
  inspetorSig?: SavedSignature;
  inspetorSigEm?: string;
  supervisorSig?: SavedSignature;
  supervisorSigEm?: string;

  falhas: string[]; // computed list of R items
  classificacao: "novo" | "frota";
  liberado?: boolean;
  bloqueadoPor?: string;
}

export interface Mechanic {
  id: string;
  nome: string;
  fotoUrl?: string;
  turno: "manha" | "tarde" | "noite";
  especialidade: string;
  status: "ativo" | "livre" | "fora_turno";
  cargaHoras: number;
  osAtivaId?: string;
  /** Jornada padrão da oficina — entrada 07:45, saída 17:30 */
  entradaHora?: string; // "HH:MM"
  saidaHora?: string;   // "HH:MM"
  /** % de tempo útil do turno (default 70%) */
  utilPct?: number;
}

export interface WorkOrderMaterial {
  id: string;
  codigoOTM: string;
  descricao: string;
  quantidade: number;
  horas?: number;
  /** Nº da reserva do material no almoxarifado */
  reserva?: string;
  /** Material liberado para retirada no almoxarifado */
  liberado?: boolean;
  liberadoEm?: string;
}

export interface WorkOrderExecutor {
  id: string;
  mecanicoId: string;
  mecanicoNome: string;
  inicio?: string;
  fim?: string;
}

export interface WorkOrderOperation {
  id: string;
  problema: string;
  causa: string;
  solucao: string;
  corrigido: boolean;
  /** Apontamento de tempo da operação (ISO) */
  inicio?: string;
  fim?: string;
  /** Minutos já acumulados em sessões anteriores (pausas / outro dia) */
  minAcum?: number;
  /** Apontamentos individuais por mecânico */
  apontamentos?: Apontamento[];
}

export type WorkOrderType = "corretiva" | "preventiva";
export type WorkOrderStatus =
  | "aberta"
  | "em_execucao"
  | "aguardando_supervisor"
  | "aguardando_pcm_encerramento"
  | "aguardando_pcm"
  | "fechada";

export interface SavedSignature {
  nome: string;
  cargo: string;
  dataUrl: string;
}

export interface WorkOrder {
  id: string;
  numeroSAP: string;
  tipo: WorkOrderType;
  assetId: string;
  prefixo: string;
  filial: string;
  solicitante: string;
  setorExecutante: string;
  centroCusto: string;
  tiposManutencao: string[];
  operations: WorkOrderOperation[];
  falhasHerdadas: { descricao: string; corrigido: boolean }[];
  materiais: WorkOrderMaterial[];
  executores: WorkOrderExecutor[];
  paradaInicio?: string;
  paradaFim?: string;
  observacoes?: string;
  reservaMaterial?: string;
  pmpChecklist?: {
    id: string;
    label: string;
    intervalo: string;
    done: boolean;
    /** Item marcado como "não se aplica" nesta preventiva */
    na?: boolean;
    material?: string;
    servico?: string;
    foto?: string;
    /** Apontamento de tempo do item (ISO) */
    inicio?: string;
    fim?: string;
    /** Minutos já acumulados em sessões anteriores (pausas / outro dia) */
    minAcum?: number;
    /** Apontamentos individuais por mecânico */
    apontamentos?: Apontamento[];
  }[];
  pmpPdfName?: string;
  pmpSapPdfName?: string;
  /** Qual PMP está sendo executado (ex.: "PMP 500h") */
  pmpPlanoLabel?: string;
  pmpIntervaloHoras?: number;
  pmpCodigoPlano?: string;
  pmpModeloPlano?: string;

  assinaturaTecnico?: string;
  assinaturaTecnicoNome?: string;
  assinaturaTecnicoCargo?: string;
  assinaturaTecnicoEm?: string;
  assinaturaSupervisor?: string;
  assinaturaSupervisorNome?: string;
  assinaturaSupervisorCargo?: string;
  assinaturaSupervisorEm?: string;
  /** Apontamento de tempo do serviço inteiro (ISO) */
  execInicio?: string;
  execFim?: string;
  /** Minutos já acumulados em sessões anteriores do serviço (pausas / outro dia) */
  execMinAcum?: number;
  /** Apontamentos individuais por mecânico no nível da OS */
  apontamentos?: Apontamento[];
  horarioInicioSap?: string;
  horarioFimSap?: string;
  fotosEncerramento?: string[];
  encerradoPorPcm?: string;
  pendenciaSupervisor?: string;
  pendenciaEm?: string;
  pendenciaResolvidaEm?: string;
  status: WorkOrderStatus;
  createdAt: string;
}
