/** Fotos padrão do equipamento (modelo FastField — Inspeção de Entrega). */
export interface FotoPadrao {
  key: string;
  label: string;
  hint?: string;
}

export const FOTOS_EQUIPAMENTO: FotoPadrao[] = [
  { key: "dianteira", label: "Foto dianteira", hint: "Usar o celular na horizontal" },
  { key: "lateral_direita", label: "Foto lateral direita", hint: "Usar o celular na horizontal" },
  { key: "lateral_esquerda", label: "Foto lateral esquerda", hint: "Usar o celular na horizontal" },
  { key: "traseira", label: "Foto traseira", hint: "Usar o celular na horizontal" },
  { key: "implemento", label: "Foto do implemento / caçamba" },
  { key: "radiador", label: "Foto do radiador de água" },
  { key: "nivel_oleo", label: "Foto do nível de óleo" },
  { key: "niveis_hidraulico", label: "Foto dos níveis hidráulico e transmissão" },
  { key: "filtros_ar", label: "Fotos dos filtros de ar primário e secundário" },
  { key: "cabine", label: "Foto da cabine", hint: "Usar o celular na horizontal" },
  { key: "cabine_frontal", label: "Foto frontal da cabine" },
  { key: "cabine_direito", label: "Foto lado direito da cabine" },
  { key: "cabine_esquerdo", label: "Foto lado esquerdo da cabine" },
  { key: "cabine_traseira", label: "Foto traseira da cabine" },
  { key: "painel", label: "Foto do painel c/ mostrador de horas" },
  { key: "adesivo_identificacao", label: "Foto do adesivo de identificação" },
  { key: "bateria_modelo", label: "Foto do modelo e série da bateria" },
  { key: "bateria", label: "Foto da(s) bateria(s)", hint: "Usar o celular na horizontal" },
  { key: "bateria_conector", label: "Foto do(s) conector(es) da(s) bateria(s)" },
];

export const labelFotoEquipamento = (key: string) =>
  FOTOS_EQUIPAMENTO.find((f) => f.key === key)?.label ?? key;
