import type { Inspection, Mechanic, WorkOrder } from "./types";

export const OTM_CATALOG = [
  { codigo: "OTM-1001", descricao: "Filtro de óleo hidráulico" },
  { codigo: "OTM-1002", descricao: "Filtro de combustível primário" },
  { codigo: "OTM-1003", descricao: "Filtro de combustível secundário" },
  { codigo: "OTM-1004", descricao: "Filtro de ar externo" },
  { codigo: "OTM-1005", descricao: "Filtro de ar interno" },
  { codigo: "OTM-1006", descricao: "Óleo hidráulico ISO 68 (L)" },
  { codigo: "OTM-1007", descricao: "Óleo motor 15W40 (L)" },
  { codigo: "OTM-1008", descricao: "Óleo transmissão SAE 30 (L)" },
  { codigo: "OTM-1009", descricao: "Graxa lítio EP2 (kg)" },
  { codigo: "OTM-1010", descricao: "Correia alternador" },
  { codigo: "OTM-1011", descricao: "Correia ar condicionado" },
  { codigo: "OTM-1012", descricao: "Pastilha de freio dianteira" },
  { codigo: "OTM-1013", descricao: "Disco de freio" },
  { codigo: "OTM-1014", descricao: "Mangueira hidráulica 1/2\"" },
  { codigo: "OTM-1015", descricao: "Conector hidráulico JIC 06" },
  { codigo: "OTM-1016", descricao: "Bateria 12V 150Ah" },
  { codigo: "OTM-1017", descricao: "Lâmpada H4 24V" },
  { codigo: "OTM-1018", descricao: "Sensor de temperatura" },
  { codigo: "OTM-1019", descricao: "Sensor de pressão hidráulica" },
  { codigo: "OTM-1020", descricao: "Retentor de cubo LD" },
  { codigo: "OTM-1021", descricao: "Retentor de cubo LE" },
  { codigo: "OTM-1022", descricao: "Rolamento cônico 30208" },
  { codigo: "OTM-1023", descricao: "Vedação cilindro 80mm" },
  { codigo: "OTM-1024", descricao: "Pino de articulação Ø 50" },
  { codigo: "OTM-1025", descricao: "Bucha bronze Ø 50x40" },
  { codigo: "OTM-1026", descricao: "Unha de escavação padrão" },
  { codigo: "OTM-1027", descricao: "Borda cortante caçamba" },
  { codigo: "OTM-1028", descricao: "Sapata esteira 500mm" },
  { codigo: "OTM-1029", descricao: "Elo mestre corrente" },
  { codigo: "OTM-1030", descricao: "Kit reparo bomba injetora" },
];

// Equipe real da Planner Matriz — jornada 07:45→17:30, 70% útil (≈ 6h50min/dia)
const JORNADA = { entradaHora: "07:45", saidaHora: "17:30", utilPct: 0.7 } as const;
export const SEED_MECHANICS: Mechanic[] = [
  { id: "meq-alef",       nome: "ALEF SILVA MAXIMIANO",              turno: "manha", especialidade: "Lavador",                       status: "livre", cargaHoras: 0, ...JORNADA },
  { id: "meq-anderson-a", nome: "ANDERSON ABREU DE LIMA",            turno: "manha", especialidade: "Mecânico Sênior II",            status: "livre", cargaHoras: 0, ...JORNADA },
  { id: "meq-anderson-f", nome: "ANDERSON JOSE RODRIGUES DA FONSECA", turno: "manha", especialidade: "Auxiliar de Mecânico I",        status: "livre", cargaHoras: 0, ...JORNADA },
  { id: "meq-carlos",     nome: "CARLOS LEANDRO SILVA DA COSTA",     turno: "manha", especialidade: "Mecânico Pleno IV",             status: "livre", cargaHoras: 0, ...JORNADA },
  { id: "meq-ednardo",    nome: "EDNARDO FELIX DE OLIVEIRA",         turno: "manha", especialidade: "Mecânico Sênior VI",            status: "livre", cargaHoras: 0, ...JORNADA },
  { id: "meq-erineudo",   nome: "ERINEUDO DA SILVA BARROS",          turno: "manha", especialidade: "Mecânico Sênior VI",            status: "livre", cargaHoras: 0, ...JORNADA },
  { id: "meq-fco-a",      nome: "FRANCISCO AZEVEDO DOS SANTOS LIMA", turno: "manha", especialidade: "Mecânico Pleno",                status: "livre", cargaHoras: 0, ...JORNADA },
  { id: "meq-fco-l",      nome: "FRANCISCO LUZIVALDO DA SILVA ROSA", turno: "manha", especialidade: "Mecânico Eletricista Pleno I",  status: "livre", cargaHoras: 0, ...JORNADA },
  { id: "meq-fco-s",      nome: "FRANCISCO SAMUEL XAVIER DE SOUZA",  turno: "manha", especialidade: "Mecânico Júnior I",             status: "livre", cargaHoras: 0, ...JORNADA },
  { id: "meq-glailton",   nome: "GLAILTON OLIVEIRA SOARES",          turno: "manha", especialidade: "Auxiliar de Mecânico I",        status: "livre", cargaHoras: 0, ...JORNADA },
  { id: "meq-marcio",     nome: "MARCIO LEAN BERNARDINO DA SILVA",   turno: "manha", especialidade: "Auxiliar de Mecânico I",        status: "livre", cargaHoras: 0, ...JORNADA },
  { id: "meq-matheus",    nome: "MATHEUS MESQUITA DE ARAUJO",        turno: "manha", especialidade: "Auxiliar de Mecânico de Comboio", status: "livre", cargaHoras: 0, ...JORNADA },
  { id: "meq-pedro",      nome: "PEDRO HENRIQUE MORAIS BASTOS",      turno: "manha", especialidade: "Inspetor de Manutenção",        status: "livre", cargaHoras: 0, ...JORNADA },
];

// Sem OS/inspeções fictícias — dados reais entram pelo fluxo do app.
export const SEED_INSPECTIONS: Inspection[] = [];
export const SEED_WORK_ORDERS: WorkOrder[] = [];
