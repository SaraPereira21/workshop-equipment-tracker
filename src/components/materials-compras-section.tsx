import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Package, RefreshCw } from "lucide-react";
import {
  comprasSupabase,
  COMPRAS_URL_PUBLIC,
  COMPRAS_VIEW,
  type SolicitacaoCompra,
} from "@/integrations/compras/client";

interface Props {
  prefixo: string;
  osNumeros: string[]; // sapOsCorretiva, sapOsPreventiva etc.
}

type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

/** Mesmos rótulos usados no Portal de Compras */
const STATUS_LABEL: Record<string, { label: string; variant: BadgeVariant }> = {
  SOLICITADA: { label: "Solicitada", variant: "outline" },
  APROVADA_SUPERVISOR: { label: "Aprovação Técnica (Supervisor)", variant: "secondary" },
  REPROVADA_SUPERVISOR: { label: "Reprovada pelo Supervisor", variant: "destructive" },
  CANCELADA_SUPERVISOR: { label: "Cancelada pelo Supervisor", variant: "destructive" },
  REPROVADA: { label: "Reprovada", variant: "destructive" },
  EM_COTACAO: { label: "Em cotação", variant: "secondary" },
  RC_EMITIDA: { label: "RC Emitida pelo PCM", variant: "secondary" },
  PEDIDO_EM_APROVACAO_COORD: { label: "Aprovação da Gestão (Coord. / Gerência)", variant: "secondary" },
  PEDIDO_APROVADO_GESTAO: { label: "Pedido aprovado pela Gestão", variant: "secondary" },
  PEDIDO_REPROVADO_GESTAO: { label: "Pedido reprovado pela Gestão", variant: "destructive" },
  REPROVADA_GESTAO: { label: "Reprovada pela Gestão", variant: "destructive" },
  PEDIDO_EMITIDO: { label: "Ordem de Compra Gerada", variant: "secondary" },
  PEDIDO_COLOCADO: { label: "Pedido Enviado ao Fornecedor", variant: "secondary" },
  EM_TRANSITO: { label: "Em trânsito", variant: "secondary" },
  RECEBIDA_ALMOX: { label: "Recebido no Almoxarifado", variant: "default" },
  ENTREGUE_MECANICO: { label: "Entregue ao Mecânico", variant: "default" },
};

function statusInfo(status: string): { label: string; variant: BadgeVariant } {
  const known = STATUS_LABEL[status];
  if (known) return known;
  const label = status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
  return { label, variant: /REPROV|CANCEL/i.test(status) ? "destructive" : "outline" };
}

const URGENCIA_COLOR: Record<string, string> = {
  NORMAL: "bg-muted text-foreground",
  URGENTE: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  PARADA: "bg-destructive/15 text-destructive",
};

export function MaterialsComprasSection({ prefixo, osNumeros }: Props) {
  const [rows, setRows] = useState<SolicitacaoCompra[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setErr(null);
    try {
      // Normaliza prefixo: "ED 108 | SEMINOVOS" -> "ED 108"
      const cleanPrefixo = prefixo.split("|")[0].split("-")[0].trim();

      const filters: string[] = [];
      if (cleanPrefixo) filters.push(`prefixo_engelog.eq.${cleanPrefixo}`);
      const validOS = osNumeros.filter(Boolean);
      if (validOS.length) filters.push(`os_numero.in.(${validOS.join(",")})`);

      if (!filters.length) {
        setRows([]);
        return;
      }

      const { data, error } = await comprasSupabase
        .from(COMPRAS_VIEW)
        .select("*")
        .or(filters.join(","))
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRows((data ?? []) as unknown as SolicitacaoCompra[]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao carregar materiais";
      setErr(
        /permission denied|42501/i.test(msg)
          ? "O Portal de Compras bloqueou a leitura pública das solicitações (view `solicitacoes_publicas`)."
          : msg,
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefixo, osNumeros.join("|")]);

  const totalEntregue = rows.filter((r) => r.data_entrega_mecanico || r.data_recebimento_almox).length;

  return (
    <Card className="mt-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Materiais solicitados ({rows.length}
            {rows.length > 0 && ` · ${totalEntregue} recebidos`})
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchData}
              disabled={loading}
              className="h-7"
              title="Atualizar"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => window.open(COMPRAS_URL_PUBLIC, "_blank", "noopener")}
            >
              Portal <ExternalLink className="h-3 w-3" />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {loading && rows.length === 0 && (
          <div className="text-sm text-muted-foreground">Carregando solicitações do portal de Compras…</div>
        )}
        {err && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
            {err}
          </div>
        )}
        {!loading && !err && rows.length === 0 && (
          <div className="text-sm text-muted-foreground">
            Nenhuma solicitação de peça vinculada a este equipamento/OS.
          </div>
        )}
        {rows.map((r) => {
          const st = statusInfo(r.status);
          return (
            <div key={r.id} className="rounded-md border p-2 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold">{r.descricao}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${URGENCIA_COLOR[r.urgencia] ?? URGENCIA_COLOR.NORMAL}`}
                    >
                      {r.urgencia}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {r.codigo_peca && <span>Cód: {r.codigo_peca} · </span>}
                    Qtd: {r.quantidade}
                    {r.unidade ? ` ${r.unidade}` : ""} · OS {r.os_numero}
                  </div>
                </div>
                <Badge variant={st.variant} className="shrink-0 whitespace-normal text-right">
                  {st.label}
                </Badge>
              </div>
              {(r.rc_numero || r.numero_pedido_compra || r.reserva_numero || r.prazo_entrega) && (
                <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground sm:grid-cols-4">
                  {r.rc_numero && <div>RC: <span className="text-foreground">{r.rc_numero}</span></div>}
                  {r.numero_pedido_compra && (
                    <div>Pedido: <span className="text-foreground">{r.numero_pedido_compra}</span></div>
                  )}
                  {r.reserva_numero && <div>Reserva: <span className="text-foreground">{r.reserva_numero}</span></div>}
                  {r.prazo_entrega && (
                    <div>Prazo: <span className="text-foreground">{new Date(r.prazo_entrega).toLocaleDateString("pt-BR")}</span></div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
