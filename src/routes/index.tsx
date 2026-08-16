import { createFileRoute, Link } from "@tanstack/react-router";
import { ClipboardCheck, KanbanSquare, ShieldCheck, Truck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AppShell } from "@/components/app-shell";
import { HomeDashboard } from "@/components/home-dashboard";
import { useAuth } from "@/hooks/use-auth";
import logoAsset from "@/assets/logo-engelog.png.asset.json";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "PLANNER MATRIZ — Fluxo de Máquinas" },
      {
        name: "description",
        content:
          "Plataforma de inspeção, liberação de equipamentos e gestão da oficina: kanban, ordens de serviço e indicadores da frota.",
      },
      { property: "og:title", content: "PLANNER MATRIZ — Fluxo de Máquinas" },
      {
        property: "og:description",
        content: "Inspeções digitais, liberação de equipamentos e ordens de serviço em um só lugar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

const DESTAQUES = [
  { icon: ClipboardCheck, titulo: "Inspeções digitais", texto: "Checklists de entrada e saída com fotos e assinaturas." },
  { icon: KanbanSquare, titulo: "Planner da oficina", texto: "Kanban com o fluxo completo de cada equipamento." },
  { icon: Truck, titulo: "Frota integrada", texto: "Cadastro SAP, PMPs e histórico de manutenção." },
  { icon: ShieldCheck, titulo: "Liberação controlada", texto: "Aprovações do PCM e do supervisor com e-mail automático." },
];

function HomePage() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (session?.user) {
    return (
      <AppShell>
        <HomeDashboard />
      </AppShell>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10">
      <div className="mx-auto max-w-5xl px-4 py-10 md:py-16">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <img src="/logo.png" alt="Engelog" className="h-10 w-auto" />
          <Button asChild size="sm">
            <Link to="/auth">Entrar</Link>
          </Button>
        </header>

        <main className="mt-12 md:mt-20">
          <h1 className="font-display text-3xl font-bold leading-tight md:text-5xl">
            PLANNER MATRIZ — Fluxo de Máquinas
          </h1>
          <p className="mt-4 max-w-2xl text-sm text-muted-foreground md:text-base">
            Sistema corporativo para inspeção, liberação de equipamentos e gestão da oficina.
            Faça login para acessar o planner, as ordens de serviço e os indicadores.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Acessar o sistema</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/instalar">Instalar o app</Link>
            </Button>
          </div>

          <div className="mt-12 grid gap-3 sm:grid-cols-2">
            {DESTAQUES.map((d) => (
              <Card key={d.titulo}>
                <CardContent className="flex gap-3 p-4">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <d.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{d.titulo}</div>
                    <p className="text-xs text-muted-foreground">{d.texto}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
