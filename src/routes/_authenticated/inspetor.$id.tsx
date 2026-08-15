import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { BackButton } from "@/components/back-button";
import { ArrowLeft, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/inspetor/$id")({
  head: () => ({ meta: [{ title: "Detalhe da Inspeção" }, { name: "description", content: "Detalhe da inspeção" }] }),
  component: InspectionDetail,
});

function InspectionDetail() {
  const { id } = Route.useParams();
  const insp = useAppStore((s) => s.inspections.find((i) => i.id === id));
  if (!insp) throw notFound();

  const falhas = insp.items.filter((i) => i.status === "R");
  const restr = insp.items.filter((i) => i.status === "AR");
  const aprovados = insp.items.filter((i) => i.status === "A");

  return (
    <div className="mx-auto max-w-4xl px-3 py-4 md:px-6 md:py-8">
      <BackButton fallbackTo="/inspetor" className="mb-3" />

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="font-display text-2xl">{insp.prefixo}</CardTitle>
            <Badge variant="outline">{insp.tipo}</Badge>
            <Badge>{insp.classificacao === "novo" ? "Novo (<40h)" : "Frota"}</Badge>
            {insp.bloqueadoPor && <Badge variant="destructive">Bloqueado</Badge>}
          </div>
        </CardHeader>
        <CardContent className="text-sm">
          <div className="grid gap-2 md:grid-cols-3">
            <div><span className="text-muted-foreground">Inspetor:</span> {insp.inspetor}</div>
            <div><span className="text-muted-foreground">Data:</span> {new Date(insp.data).toLocaleString("pt-BR")}</div>
            <div><span className="text-muted-foreground">Horímetro:</span> {insp.horimetro}h</div>
            <div><span className="text-muted-foreground">Combustível:</span> {insp.combustivel}%</div>
          </div>
          {insp.bloqueadoPor && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {insp.bloqueadoPor}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Aprovados</div><div className="font-display text-3xl font-bold text-success">{aprovados.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Com restrição</div><div className="font-display text-3xl font-bold text-warning-foreground">{restr.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Reprovados</div><div className="font-display text-3xl font-bold text-destructive">{falhas.length}</div></CardContent></Card>
      </div>

      {falhas.length > 0 && (
        <Card className="mt-4">
          <CardHeader className="pb-2"><CardTitle className="text-base">Falhas registradas</CardTitle></CardHeader>
          <CardContent className="grid gap-2">
            {falhas.map((f) => (
              <div key={f.id} className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <div className="font-semibold">#{f.id} — {f.description}</div>
                <div className="text-xs text-muted-foreground">{f.group}</div>
                {f.observation && <div className="mt-1 text-xs">{f.observation}</div>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {aprovados.length > 0 && (
        <Card className="mt-4">
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success" /> Itens aprovados ({aprovados.length})</CardTitle></CardHeader>
          <CardContent className="max-h-64 overflow-y-auto text-xs text-muted-foreground grid gap-1">
            {aprovados.slice(0, 40).map((a) => <div key={a.id}>#{a.id} — {a.description}</div>)}
            {aprovados.length > 40 && <div>…e mais {aprovados.length - 40}</div>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
