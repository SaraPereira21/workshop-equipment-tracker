import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ClipboardCheck,
  KanbanSquare,
  Users,
  Truck,
  Wrench,
  AlertTriangle,
  TrendingUp,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import { useKanbanColumns } from "@/hooks/use-kanban";
import { ColumnBadge } from "@/components/status-badges";
import { AlocacaoBoard } from "@/components/alocacao-board";

function Kpi({ label, value, hint, icon: Icon, accent }: { label: string; value: string; hint?: string; icon: React.ElementType; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="mt-1 font-display text-2xl font-bold md:text-3xl">{value}</div>
            {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
          </div>
          <div className={"grid h-10 w-10 shrink-0 place-items-center rounded-lg " + (accent ?? "bg-primary/10 text-primary")}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function HomeDashboard() {
  const assets = useAppStore((s) => s.assets);
  const workOrders = useAppStore((s) => s.workOrders);
  const mechanics = useAppStore((s) => s.mechanics);
  const { columns: KANBAN_COLUMNS } = useKanbanColumns();
  const inspections = useAppStore((s) => s.inspections);
  const [apresentacao, setApresentacao] = useState(false);

  const emManut = assets.filter((a) => a.column === "manutencao" || a.column === "teste").length;
  const aguardando = assets.filter((a) => a.column === "aguardando_pcm").length;
  const mecAtivos = mechanics.filter((m) => m.status === "ativo").length;
  const horasAtivas = mechanics.reduce((acc, m) => acc + m.cargaHoras, 0).toFixed(1);
  const openOs = workOrders.filter((w) => w.status !== "fechada").length;

  async function entrarApresentacao() {
    setApresentacao(true);
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      /* alguns navegadores bloqueiam; o overlay continua funcionando */
    }
  }

  async function sairApresentacao() {
    setApresentacao(false);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      /* ignora */
    }
  }

  if (apresentacao) {
    return (
      <div className="fixed inset-0 z-50 overflow-auto bg-background p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold md:text-4xl">Alocação de Equipe — Oficina Matriz</h1>
            <p className="text-sm text-muted-foreground md:text-base">
              {emManut} em manutenção · {openOs} OS abertas · {mecAtivos}/{mechanics.length} manutentores ativos
            </p>
          </div>
          <Button size="lg" variant="outline" onClick={sairApresentacao} className="gap-2">
            <Minimize2 className="h-5 w-5" /> Sair da apresentação
          </Button>
        </div>
        <AlocacaoBoard tv />
      </div>
    );
  }

  return (
    <div className="w-full px-3 py-4 md:px-6 md:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold md:text-3xl">Dashboard da Oficina</h1>
          <p className="text-sm text-muted-foreground">Visão consolidada de frota, inspeções e ordens de serviço.</p>
        </div>
        <Button variant="outline" onClick={entrarApresentacao} className="gap-2">
          <Maximize2 className="h-4 w-4" /> Modo apresentação
        </Button>
      </div>


      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <Kpi label="Em Manutenção" value={String(emManut)} hint="Boxes ativos" icon={Wrench} />
        <Kpi label="Aguard. PCM" value={String(aguardando)} hint="Trava por preventiva" icon={AlertTriangle} accent="bg-destructive/10 text-destructive" />
        <Kpi label="Mecânicos Ativos" value={`${mecAtivos}/${mechanics.length}`} hint={`${horasAtivas}h de MO`} icon={Users} accent="bg-info/10 text-info" />
        <Kpi label="OS Abertas" value={String(openOs)} hint={`${inspections.length} inspeções`} icon={TrendingUp} accent="bg-accent/20 text-accent-foreground" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Kanban da Oficina</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
              {KANBAN_COLUMNS.map((c) => {
                const count = assets.filter((a) => a.column === c.key).length;
                return (
                  <Link key={c.key} to="/planner" className="rounded-lg border bg-card p-3 transition-colors hover:border-primary/60">
                    <div className="mt-2 font-display text-2xl font-bold">{count}</div>
                    <div className="text-[11px] text-muted-foreground">{c.title}</div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Atalhos rápidos</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Button asChild size="lg" className="tap-target justify-start gap-2">
              <Link to="/inspetor/nova" search={{ prefixo: "" }}>
                <ClipboardCheck className="h-5 w-5" /> Nova inspeção
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="tap-target justify-start gap-2">
              <Link to="/planner">
                <KanbanSquare className="h-5 w-5" /> Abrir Kanban
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="tap-target justify-start gap-2">
              <Link to="/supervisor">
                <Users className="h-5 w-5" /> Painel do Supervisor
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="tap-target justify-start gap-2">
              <Link to="/frota">
                <Truck className="h-5 w-5" /> Frota / Ativos
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Users className="h-4 w-4" /> Alocação de Equipe — Oficina Matriz
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AlocacaoBoard />
        </CardContent>
      </Card>
    </div>
  );
}
