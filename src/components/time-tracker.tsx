import { useEffect, useState } from "react";
import { Play, Square, Timer, Pencil, RotateCcw, Pause, User2, Trash2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  duracaoMin,
  formatCronometro,
  formatMin,
  formatTotal,
  horaCurta,
  horaParaIso,
  isoParaHora,
  sessaoDoUsuario,
  totalSessoes,
  upsertSessao,
  type Apontamento,
} from "@/lib/tempo";

/**
 * Cronômetro de apontamento com sessões individuais por mecânico.
 * Os botões agem SOMENTE sobre a sessão do usuário logado; as sessões
 * dos colegas continuam intactas (podem rodar em paralelo).
 */
export function TimeTracker({
  apontamentos,
  userId,
  nome,
  onChange,
  podeEditar = false,
  podeApontar = true,
  motivoBloqueio = "Somente o mecânico alocado, logado na própria conta, pode apontar horas.",
  size = "sm",
  labelIniciar = "Iniciar",
  labelFinalizar = "Finalizar",
  className,
}: {
  apontamentos: Apontamento[];
  userId?: string;
  nome?: string;
  onChange: (list: Apontamento[]) => void;
  /** Permite corrigir os horários manualmente (PCM / supervisor). */
  podeEditar?: boolean;
  /** Libera os botões Iniciar / Pausar / Finalizar para o usuário logado. */
  podeApontar?: boolean;
  motivoBloqueio?: string;
  size?: "sm" | "lg";
  labelIniciar?: string;
  labelFinalizar?: string;
  className?: string;
}) {
  const minha = sessaoDoUsuario(apontamentos, userId);
  const inicio = minha?.inicio;
  const fim = minha?.fim;
  const minAcum = minha?.minAcum ?? 0;
  const rodando = !!inicio && !fim;
  const pausado = !inicio && !fim && minAcum > 0;
  const outros = apontamentos.filter((s) => s !== minha);
  const totalGeral = totalSessoes(apontamentos);

  const [, tick] = useState(0);
  useEffect(() => {
    if (!apontamentos.some((s) => s.inicio && !s.fim)) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [apontamentos]);

  const btnSize = size === "lg" ? "default" : "sm";

  const setMinha = (v: { inicio?: string; fim?: string; minAcum?: number }) =>
    onChange(upsertSessao(apontamentos, userId, nome, v));

  const setSessao = (s: Apontamento, patch: Partial<Apontamento>) =>
    onChange(apontamentos.map((x) => (x === s ? { ...x, ...patch } : x)));

  const removeSessao = (s: Apontamento) => onChange(apontamentos.filter((x) => x !== s));

  return (
    <div className={cn("grid gap-1.5", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {!podeApontar && (
          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
            <Lock className="h-3 w-3" /> {motivoBloqueio}
          </span>
        )}

        {podeApontar && !inicio && !fim && (
          <Button
            type="button"
            size={btnSize}
            variant="outline"
            className="tap-target gap-1.5"
            onClick={() => setMinha({ inicio: new Date().toISOString(), minAcum })}
          >
            <Play className="h-3.5 w-3.5" /> {pausado ? "Retomar" : labelIniciar}
          </Button>
        )}

        {pausado && (
          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-semibold">
            <Pause className="h-3.5 w-3.5 text-muted-foreground" /> Pausado · {formatMin(minAcum)}
          </span>
        )}

        {rodando && (
          <>
            <span className="inline-flex items-center gap-1 rounded-md bg-warning/15 px-2 py-1 font-mono text-xs font-bold text-warning-foreground">
              <Timer className="h-3.5 w-3.5" /> {formatCronometro(inicio!, Date.now(), minAcum)}
            </span>
            {podeApontar && (
              <>
                <Button
                  type="button"
                  size={btnSize}
                  variant="outline"
                  className="tap-target gap-1.5"
                  onClick={() => {
                    const parcial = duracaoMin(inicio, new Date().toISOString()) ?? 0;
                    setMinha({ inicio: undefined, fim: undefined, minAcum: minAcum + parcial });
                  }}
                >
                  <Pause className="h-3.5 w-3.5" /> Pausar
                </Button>
                <Button
                  type="button"
                  size={btnSize}
                  className="tap-target gap-1.5 bg-success text-success-foreground hover:bg-success/90"
                  onClick={() => setMinha({ inicio, fim: new Date().toISOString(), minAcum })}
                >
                  <Square className="h-3.5 w-3.5" /> {labelFinalizar}
                </Button>
              </>
            )}

          </>
        )}

        {inicio && fim && (
          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-semibold">
            <Timer className="h-3.5 w-3.5 text-primary" />
            {formatTotal({ inicio, fim, minAcum })}
            <span className="font-normal text-muted-foreground">
              ({horaCurta(inicio)}–{horaCurta(fim)}
              {minAcum > 0 ? ` +${formatMin(minAcum)}` : ""})
            </span>
            {podeApontar && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-[11px] text-muted-foreground"
                onClick={() =>
                  setMinha({ inicio: undefined, fim: undefined, minAcum: (minAcum || 0) + (duracaoMin(inicio, fim) ?? 0) })
                }
              >
                Retomar
              </Button>
            )}

          </span>
        )}

        {outros.length > 0 && (
          <span className="text-[11px] text-muted-foreground">
            Equipe: <strong>{formatMin(totalGeral)}</strong>
          </span>
        )}
      </div>

      {apontamentos.length > 0 && (
        <ul className="grid gap-0.5">
          {apontamentos.map((s, i) => {
            const meu = s === minha;
            const ativo = !!s.inicio && !s.fim;
            return (
              <li
                key={s.id || i}
                className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground"
              >
                <User2 className="h-3 w-3 shrink-0" />
                <span className={cn("font-semibold uppercase", meu && "text-foreground")}>
                  {s.nome || (meu ? "VOCÊ" : "APONTAMENTO ANTERIOR")}
                </span>
                <span>·</span>
                <span className={cn(ativo && "font-bold text-warning-foreground")}>
                  {formatMin(totalSessoes([s]))}
                  {ativo ? " (em execução)" : ""}
                </span>
                {(s.inicio || s.fim) && (
                  <span className="text-muted-foreground/70">
                    {horaCurta(s.inicio)}–{s.fim ? horaCurta(s.fim) : "…"}
                  </span>
                )}
                {podeEditar && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-muted-foreground"
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="grid w-64 gap-3">
                      <div className="text-xs font-semibold uppercase">{s.nome || "Sessão"}</div>
                      <div className="grid gap-1">
                        <Label className="text-[11px] uppercase text-muted-foreground">Início</Label>
                        <Input
                          type="time"
                          className="h-10"
                          value={isoParaHora(s.inicio)}
                          onChange={(e) => setSessao(s, { inicio: horaParaIso(s.inicio, e.target.value) })}
                        />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-[11px] uppercase text-muted-foreground">Fim</Label>
                        <Input
                          type="time"
                          className="h-10"
                          value={isoParaHora(s.fim)}
                          onChange={(e) => setSessao(s, { fim: horaParaIso(s.fim ?? s.inicio, e.target.value) })}
                        />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-[11px] uppercase text-muted-foreground">
                          Minutos de sessões anteriores
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          className="h-10"
                          value={s.minAcum || 0}
                          onChange={(e) =>
                            setSessao(s, { minAcum: Math.max(0, Number(e.target.value) || 0) })
                          }
                        />
                      </div>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-destructive"
                          onClick={() => removeSessao(s)}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Excluir
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => setSessao(s, { inicio: undefined, fim: undefined, minAcum: 0 })}
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Limpar
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
