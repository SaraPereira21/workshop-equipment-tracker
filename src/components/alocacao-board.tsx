import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarClock, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ColumnBadge } from "@/components/status-badges";
import { PreventivaResumoBadges } from "@/components/preventiva-status-badges";
import { isLiberado } from "@/lib/liberado";
import { useAppStore } from "@/lib/store";
import type { Mechanic } from "@/lib/types";
import { useInspetorNomes, normNomePessoa } from "@/hooks/use-inspetor-nomes";


export function AlocacaoBoard({ tv = false }: { tv?: boolean } = {}) {
  const assets = useAppStore((s) => s.assets);
  const inspetorNomes = useInspetorNomes();
  const allMechanics = useAppStore((s) => s.mechanics);
  const mechanics = useMemo(
    () => allMechanics.filter((m) => !inspetorNomes.has(normNomePessoa(m.nome))),
    [allMechanics, inspetorNomes],
  );
  const [q, setQ] = useState("");


  const alocadas = useMemo(() => {
    const termo = q.trim().toLowerCase();
    return assets
      .filter((a) => {
        const equipe = a.mecanicoIds ?? (a.mecanicoId ? [a.mecanicoId] : []);
        return equipe.length > 0 && !isLiberado(a);
      })
      .filter((a) => {
        if (!termo) return true;
        const equipe = a.mecanicoIds ?? (a.mecanicoId ? [a.mecanicoId] : []);
        const nomes = equipe.map((id) => mechanics.find((m) => m.id === id)?.nome ?? "").join(" ");
        return [a.prefixo, a.marca, a.modelo, a.column, nomes].join(" ").toLowerCase().includes(termo);
      });
  }, [assets, mechanics, q]);

  const normNome = (n: string) =>
    n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");

  const workOrders = useAppStore((s) => s.workOrders);

  const semMaquina = useMemo(() => {
    const equipes = assets
      .filter((a) => !isLiberado(a))
      .flatMap((a) => a.mecanicoIds ?? (a.mecanicoId ? [a.mecanicoId] : []));
    const ocupadosIds = new Set(equipes);
    // O mesmo manutentor pode existir com ids diferentes (cadastro x perfil),
    // então também consideramos ocupado quem bate pelo nome.
    const nomePorId = new Map<string, string>();
    for (const m of mechanics) nomePorId.set(m.id, m.nome);
    for (const w of workOrders)
      for (const e of w.executores ?? []) if (e.mecanicoId && e.mecanicoNome) nomePorId.set(e.mecanicoId, e.mecanicoNome);

    const ocupadosNomes = new Set(
      equipes
        .map((id) => nomePorId.get(id))
        .filter((n): n is string => !!n)
        .map(normNome),
    );

    const vistos = new Set<string>();
    return mechanics
      .filter((m) => {
        const key = normNome(m.nome);
        if (ocupadosIds.has(m.id) || ocupadosNomes.has(key)) return false;
        if (vistos.has(key)) return false;
        vistos.add(key);
        return true;
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  }, [assets, mechanics, workOrders]);


  const iniciais = (nome: string) => nome.trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join("");

  const hojeISO = new Date().toISOString().slice(0, 10);
  const fmtData = (iso: string) => {
    const [y, m, d] = iso.slice(0, 10).split("-");
    return d && m && y ? `${d}/${m}/${y}` : iso;
  };
  const diasAtraso = (iso: string) => {
    const a = new Date(`${iso.slice(0, 10)}T00:00:00`).getTime();
    const b = new Date(`${hojeISO}T00:00:00`).getTime();
    return Math.round((b - a) / 86400000);
  };
  /** Só os dois primeiros nomes, para não estourar o card */
  const nomeCurto = (nome: string) => nome.trim().split(/\s+/).slice(0, 2).join(" ");

  return (
    <div className="grid gap-4">
      {!tv && (
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por máquina ou nome do manutentor…"
            className="pl-8"
          />
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className={tv ? "text-2xl" : "text-base"}>
            Quem está em qual máquina ({alocadas.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {alocadas.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              Nenhuma máquina com manutentor alocado.
            </div>
          ) : (
            <div
              className={
                tv
                  ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5"
                  : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
              }
            >
              {alocadas.map((a) => {
                const equipe = (a.mecanicoIds ?? (a.mecanicoId ? [a.mecanicoId] : []))
                  .map((id) => mechanics.find((m) => m.id === id))
                  .filter(Boolean) as Mechanic[];
                return (
                  <Link
                    key={a.id}
                    to="/planner/$prefixo"
                    params={{ prefixo: a.prefixo }}
                    className={
                      "rounded-lg border bg-card transition-colors hover:border-primary/60 " +
                      (tv ? "p-4" : "p-3")
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className={"font-display font-bold truncate " + (tv ? "text-xl" : "text-sm")}>
                          {a.prefixo}
                        </div>
                        <div className={"truncate text-muted-foreground " + (tv ? "text-sm" : "text-[11px]")}>
                          {a.marca} {a.modelo}
                        </div>
                      </div>
                      <div className="shrink-0"><ColumnBadge column={a.column} /></div>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <PreventivaResumoBadges asset={a} />
                      {a.dataEntregaPrevista && (
                        <>
                          <span
                            className={
                              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold text-muted-foreground " +
                              (tv ? "text-xs" : "text-[10px]")
                            }
                          >
                            <CalendarClock className={tv ? "h-3.5 w-3.5" : "h-3 w-3"} />
                            Entrega {fmtData(a.dataEntregaPrevista)}
                          </span>
                          {diasAtraso(a.dataEntregaPrevista) > 0 && (
                            <span
                              className={
                                "inline-flex items-center rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 font-bold uppercase tracking-wide text-destructive " +
                                (tv ? "text-xs" : "text-[10px]")
                              }
                            >
                              Atrasada {diasAtraso(a.dataEntregaPrevista)}d
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    <div className="mt-2 grid gap-1">
                      {equipe.map((m) => (
                        <div
                          key={m.id}
                          className={"flex min-w-0 items-center gap-2 " + (tv ? "text-base" : "text-xs")}
                        >
                          <span
                            className={
                              "grid shrink-0 place-items-center rounded-full bg-primary/10 font-bold text-primary " +
                              (tv ? "h-9 w-9 text-xs" : "h-6 w-6 text-[10px]")
                            }
                          >
                            {iniciais(m.nome)}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-medium" title={m.nome}>
                            {nomeCurto(m.nome)}
                          </span>
                        </div>
                      ))}
                    </div>

                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>


      <Card>
        <CardHeader className="pb-2">
          <CardTitle className={tv ? "text-2xl" : "text-base"}>
            Manutentores sem máquina ({semMaquina.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {semMaquina.length === 0 && (
            <div className="text-sm text-muted-foreground">Todos os manutentores estão alocados.</div>
          )}
          {semMaquina.map((m) => (
            <span
              key={m.id}
              className={
                "flex max-w-full items-center gap-2 rounded-full border " +
                (tv ? "px-4 py-2 text-base" : "px-3 py-1.5 text-xs")
              }
              title={m.nome}
            >
              <span
                className={
                  "grid shrink-0 place-items-center rounded-full bg-muted font-bold " +
                  (tv ? "h-9 w-9 text-xs" : "h-6 w-6 text-[10px]")
                }
              >
                {iniciais(m.nome)}
              </span>
              <span className="truncate">{nomeCurto(m.nome)}</span>
            </span>
          ))}


        </CardContent>
      </Card>
    </div>
  );
}
