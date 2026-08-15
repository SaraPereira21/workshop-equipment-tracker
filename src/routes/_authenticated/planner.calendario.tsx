import { createFileRoute, Link } from "@tanstack/react-router";
import { BackButton } from "@/components/back-button";
import { ArrowLeft } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/planner/calendario")({
  head: () => ({
    meta: [{ title: "Calendário — Planner" }, { name: "description", content: "Agenda de entregas da oficina." }],
  }),
  component: CalendarView,
});

function CalendarView() {
  const assets = useAppStore((s) => s.assets).filter((a) => a.dataEntregaPrevista && a.column !== "liberado");
  const today = new Date();
  const start = startOfMonth(today);
  const end = endOfMonth(today);
  const days = eachDayOfInterval({ start, end });

  const byDay = (d: Date) => assets.filter((a) => a.dataEntregaPrevista && isSameDay(new Date(a.dataEntregaPrevista), d));

  return (
    <div className="mx-auto max-w-6xl px-3 py-4 md:px-6 md:py-8">
      <BackButton fallbackTo="/planner" label="Voltar" className="mb-3" />

      <div className="mb-4">
        <h1 className="font-display text-2xl font-bold md:text-3xl">Agenda de entregas</h1>
        <p className="text-sm text-muted-foreground">{format(today, "MMMM 'de' yyyy", { locale: ptBR })}</p>
      </div>

      {/* Mobile: agenda list */}
      <div className="md:hidden grid gap-3">
        {days.filter((d) => byDay(d).length > 0).map((d) => (
          <Card key={d.toISOString()}>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">{format(d, "EEEE, dd/MM", { locale: ptBR })}</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              {byDay(d).map((a) => (
                <Link key={a.id} to="/planner/$prefixo" params={{ prefixo: a.prefixo }} className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <div><div className="font-semibold">{a.prefixo}</div><div className="text-xs text-muted-foreground">{a.marca} {a.modelo}</div></div>
                  <span className="text-xs uppercase text-primary">{a.column}</span>
                </Link>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Desktop: monthly grid */}
      <div className="hidden md:block">
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-muted-foreground">
          {["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {Array.from({ length: start.getDay() }).map((_, i) => <div key={"pad-" + i} />)}
          {days.map((d) => {
            const items = byDay(d);
            const isToday = isSameDay(d, today);
            return (
              <div key={d.toISOString()} className={cn("min-h-[92px] rounded border p-1.5 bg-card", isToday && "ring-2 ring-primary")}>
                <div className="text-xs font-semibold">{d.getDate()}</div>
                <div className="mt-1 space-y-1">
                  {items.slice(0, 3).map((a) => (
                    <Link key={a.id} to="/planner/$prefixo" params={{ prefixo: a.prefixo }} className="block truncate rounded bg-primary/10 px-1 text-[10px] text-primary font-semibold hover:bg-primary/20">
                      {a.prefixo}
                    </Link>
                  ))}
                  {items.length > 3 && (
                    <Popover>
                      <PopoverTrigger className="w-full text-left text-[10px] text-muted-foreground hover:text-primary hover:underline">
                        +{items.length - 3} mais
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-64 p-2">
                        <div className="mb-2 px-1 text-xs font-semibold">
                          {format(d, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                        </div>
                        <div className="grid gap-1">
                          {items.map((a) => (
                            <Link
                              key={a.id}
                              to="/planner/$prefixo"
                              params={{ prefixo: a.prefixo }}
                              className="flex items-center justify-between rounded-md border px-2 py-1.5 text-xs hover:border-primary hover:bg-primary/5"
                            >
                              <div className="min-w-0">
                                <div className="font-semibold truncate">{a.prefixo}</div>
                                <div className="text-[10px] text-muted-foreground truncate">{a.marca} {a.modelo}</div>
                              </div>
                              <span className="ml-2 text-[9px] uppercase text-primary shrink-0">{a.column}</span>
                            </Link>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
