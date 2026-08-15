import { createFileRoute, Link } from "@tanstack/react-router";
import { Truck, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAppStore } from "@/lib/store";
import { ColumnBadge, PriorityPill } from "@/components/status-badges";
import { NovaSolicitacaoDialog } from "@/components/nova-solicitacao-dialog";

export const Route = createFileRoute("/_authenticated/frota/")({
  head: () => ({
    meta: [
      { title: "Frota — Oficina Matriz" },
      { name: "description", content: "Cadastro e status dos ativos da frota." },
      { property: "og:title", content: "Frota — Oficina Matriz" },
      { property: "og:description", content: "Cadastro e status dos ativos da frota." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FrotaList,
});

function FrotaList() {
  const assets = useAppStore((s) => s.assets);

  return (
    <div className="mx-auto max-w-6xl px-3 py-4 md:px-6 md:py-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold md:text-3xl">Frota — Oficina</h1>
          <p className="text-sm text-muted-foreground">{assets.length} ativos em atendimento</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild className="gap-2">
            <Link to="/frota/catalogo"><Database className="h-4 w-4" /> Catálogo SAP</Link>
          </Button>
          <NovaSolicitacaoDialog navigateAfter />
        </div>
      </div>

      <div className="grid gap-2 md:hidden">
        {assets.map((a) => (
          <Link key={a.id} to="/planner/$prefixo" params={{ prefixo: a.prefixo }}>
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-display font-bold">{a.prefixo}</div>
                    <div className="truncate text-xs text-muted-foreground">{a.marca} {a.modelo}</div>
                  </div>
                  <PriorityPill p={a.priority} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <ColumnBadge column={a.column} />
                  <span className="text-muted-foreground">{a.horimetroAtual}h · PMP {a.proximoAlvoPMP}h</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="hidden md:block">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3 text-left">Prefixo</th>
                  <th className="p-3 text-left">Marca / Modelo</th>
                  <th className="p-3 text-left">Tipo</th>
                  <th className="p-3 text-right">Horímetro</th>
                  <th className="p-3 text-right">Últ. PMP</th>
                  <th className="p-3 text-right">Alvo</th>
                  <th className="p-3 text-left">Coluna</th>
                  <th className="p-3 text-left">Prioridade</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => (
                  <tr key={a.id} className="border-t hover:bg-muted/30">
                    <td className="p-3">
                      <Link to="/planner/$prefixo" params={{ prefixo: a.prefixo }} className="flex items-center gap-2 font-display font-semibold text-primary hover:underline">
                        <Truck className="h-3.5 w-3.5" /> {a.prefixo}
                      </Link>
                    </td>
                    <td className="p-3">{a.marca} {a.modelo}</td>
                    <td className="p-3 text-muted-foreground">{a.tipo}</td>
                    <td className="p-3 text-right font-mono">{a.horimetroAtual}h</td>
                    <td className="p-3 text-right font-mono">{a.horimetroUltimoPMP}h</td>
                    <td className="p-3 text-right font-mono">{a.proximoAlvoPMP}h</td>
                    <td className="p-3"><ColumnBadge column={a.column} /></td>
                    <td className="p-3"><PriorityPill p={a.priority} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}