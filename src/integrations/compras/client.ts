// Cliente Supabase somente-leitura para o portal de Compras (Parts Request Flow)
// URL/anon key fixos porque a política `solic_read_all` já permite leitura pública.
import { createClient } from "@supabase/supabase-js";

const COMPRAS_URL = "https://lronvpwpfnyxofugcszr.supabase.co";
const COMPRAS_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyb252cHdwZm55eG9mdWdjc3pyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3NjcyNTgsImV4cCI6MjA5OTM0MzI1OH0.4dCNP9R1WbQxBVrwpeyEO9kOiJoK1JjuhdPKEVob5xY";

export const comprasSupabase = createClient(COMPRAS_URL, COMPRAS_ANON, {
  auth: { persistSession: false, autoRefreshToken: false, storageKey: "compras-anon" },
});

export const COMPRAS_URL_PUBLIC = "https://comprasengelogmatriz.lovable.app";

export type SolicitacaoStatus =
  | "SOLICITADA"
  | "APROVADA_SUPERVISOR"
  | "REPROVADA_SUPERVISOR"
  | "EM_COTACAO"
  | "PEDIDO_EMITIDO"
  | "EM_TRANSITO"
  | "RECEBIDA_ALMOX"
  | "ENTREGUE_MECANICO"
  | "REPROVADA_GESTAO"
  | (string & {});

export interface SolicitacaoCompra {
  id: string;
  os_numero: string;
  descricao: string;
  codigo_peca: string | null;
  quantidade: number;
  unidade: string | null;
  urgencia: string;
  status: SolicitacaoStatus;
  rc_numero: string | null;
  numero_pedido_compra: string | null;
  reserva_numero: string | null;
  prazo_entrega: string | null;
  data_recebimento_almox: string | null;
  data_entrega_mecanico: string | null;
  created_at: string;
  equipamento_id: string;
  prefixo_engelog: string | null;
  codigo_Ativo: string | null;
  solicitante_nome: string | null;
}

/** View pública somente-leitura do Portal de Compras (sem campos sensíveis). */
export const COMPRAS_VIEW = "solicitacoes_publicas";
