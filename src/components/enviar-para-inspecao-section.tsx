import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ClipboardCheck, ExternalLink, Undo2, UserCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { filaInspecao, foraDoFluxo, responsavelInspecao } from "@/lib/fila-inspecao";
import { useAppStore } from "@/lib/store";
import { listInspetores } from "@/lib/inspetores.functions";
import type { Asset } from "@/lib/types";

const COLUNAS_FORA = new Set(["aguardando_saida", "liberado"]);

type Inspetor = { id: string; nome: string };

function matches(a: Asset, q: string) {
  if (!q) return true;
  return [a.prefixo, a.modelo, a.marca, a.column].some((v) =>
    (v ?? "").toLowerCase().includes(q),
  );
}

const inspetorAtual = responsavelInspecao;

export function EnviarParaInspecaoSection() {
  const assets = useAppStore((s) => s.assets);
  const updateAsset = useAppStore((s) => s.updateAsset);
  const [buscaDisp, setBuscaDisp] = useState("");
  const [buscaInsp, setBuscaInsp] = useState("");

  const fetchInspetores = useServerFn(listInspetores);
  const { data: inspetores = [] } = useQuery<Inspetor[]>({
    queryKey: ["inspetores"],
    queryFn: () => fetchInspetores(),
    staleTime: 5 * 60_000,
  });

  const emInspecao = useMemo(() => {
    const q = buscaInsp.trim().toLowerCase();
    // FONTE ÚNICA: mesma fila mostrada na tela do inspetor.
    return filaInspecao(assets).filter((a) => matches(a, q));
  }, [assets, buscaInsp]);

  const emInspecaoIds = useMemo(() => new Set(filaInspecao(assets).map((a) => a.id)), [assets]);

  const disponiveis = useMemo(() => {
    const q = buscaDisp.trim().toLowerCase();
    return assets
      .filter((a) => !emInspecaoIds.has(a.id) && !COLUNAS_FORA.has(a.column) && !foraDoFluxo(a))
      .filter((a) => matches(a, q))
      .sort((a, b) => (a.prefixo ?? "").localeCompare(b.prefixo ?? ""));
  }, [assets, buscaDisp, emInspecaoIds]);

  const enviar = (a: Asset, inspetorId: string) => {
    const insp = inspetores.find((i) => i.id === inspetorId);
    const base = {
      inspetorAlocadoId: inspetorId,
      inspetorAlocadoNome: insp?.nome ?? "",
      inspetorAlocadoEm: new Date().toISOString(),
      inspecaoCancelada: undefined,
    };
    if (a.column === "chegada") {
      updateAsset(a.id, base);
    } else {
      updateAsset(a.id, {
        ...base,
        column: "aguardando_saida",
        status: "em_inspecao",
        reinspecaoSolicitada: true,
        reinspecaoOrigemColumn: a.column,
        inspetorDecisao: undefined,
        inspetorLockId: undefined,
        inspetorLockNome: undefined,
        inspetorLockEm: undefined,
      });
    }
    toast.success(`${a.prefixo} enviado para ${insp?.nome ?? "o inspetor"}.`);
  };

  const trocar = (a: Asset, inspetorId: string) => {
    const insp = inspetores.find((i) => i.id === inspetorId);
    updateAsset(a.id, {
      inspetorAlocadoId: inspetorId,
      inspetorAlocadoNome: insp?.nome ?? "",
      inspetorAlocadoEm: new Date().toISOString(),
      inspecaoCancelada: undefined,
      inspetorLockId: undefined,
      inspetorLockNome: undefined,
      inspetorLockEm: undefined,
    });
    toast.success(`${a.prefixo} agora com ${insp?.nome ?? "o inspetor"}.`);
  };

  const cancelar = (a: Asset) => {
    updateAsset(a.id, {
      ...(a.reinspecaoSolicitada
        ? {
            column: (a.reinspecaoOrigemColumn ?? "atribu_do") as Asset["column"],
            status: "em_manutencao" as Asset["status"],
            reinspecaoSolicitada: undefined,
            reinspecaoOrigemColumn: undefined,
            reinspecaoMotivo: undefined,
          }
        : {}),
      // Cancelou o envio: some da tela do inspetor (alocação, trava e sinalizador).
      inspecaoCancelada: true,
      inspetorAlocadoId: undefined,
      inspetorAlocadoNome: undefined,
      inspetorAlocadoEm: undefined,
      inspetorLockId: undefined,
      inspetorLockNome: undefined,
      inspetorLockEm: undefined,
    });
    toast.info(`${a.prefixo} removido da fila de inspeção.`);
  };


  const seletor = (a: Asset, onPick: (v: string) => void, placeholder: string) => (
    <Select value={inspetorAtual(a)?.id ?? ""} onValueChange={onPick}>
      <SelectTrigger className="h-9 w-[200px]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {inspetores.map((i) => (
          <SelectItem key={i.id} value={i.id}>
            {i.nome}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="mt-6 grid gap-8">
      <div>
        <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-bold">
          <UserCheck className="h-5 w-5 text-primary" />
          Disponíveis para inspeção ({disponiveis.length})
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Selecione o inspetor responsável — a máquina entra na tela dele imediatamente.
        </p>

        <Input
          value={buscaDisp}
          onChange={(e) => setBuscaDisp(e.target.value)}
          placeholder="Buscar por prefixo, modelo, coluna…"
          className="mb-2 max-w-xs"
        />

        <Card>
          <CardContent className="grid max-h-[420px] gap-2 overflow-y-auto p-3">
            {disponiveis.length === 0 && (
              <div className="p-3 text-center text-sm text-muted-foreground">
                Nenhuma máquina disponível.
              </div>
            )}
            {disponiveis.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{a.prefixo}</span>
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {a.column.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {a.marca} {a.modelo} · {a.horimetroAtual ?? 0}h
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {seletor(a, (v) => enviar(a, v), "Selecionar inspetor")}
                  <Button asChild size="sm" variant="outline" className="gap-1">
                    <Link to="/planner/$prefixo" params={{ prefixo: a.prefixo }}>
                      <ExternalLink className="h-4 w-4" /> Abrir card
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-bold">
          <ClipboardCheck className="h-5 w-5 text-primary" />
          Em inspeção ({emInspecao.length})
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Troque o inspetor a qualquer momento ou cancele o envio.
        </p>

        <Input
          value={buscaInsp}
          onChange={(e) => setBuscaInsp(e.target.value)}
          placeholder="Buscar máquina em inspeção…"
          className="mb-2 max-w-xs"
        />

        <Card>
          <CardContent className="grid max-h-[420px] gap-2 overflow-y-auto p-3">
            {emInspecao.length === 0 && (
              <div className="p-3 text-center text-sm text-muted-foreground">
                Nenhuma máquina em inspeção.
              </div>
            )}
            {emInspecao.map((a) => {
              const resp = inspetorAtual(a);
              return (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{a.prefixo}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {resp?.nome || "Sem inspetor"}
                      </Badge>
                      {a.inspectionDraft && (
                        <Badge variant="outline" className="text-[10px] uppercase">
                          Inspeção iniciada
                        </Badge>
                      )}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {a.marca} {a.modelo}
                      {a.reinspecaoMotivo ? ` · ${a.reinspecaoMotivo}` : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {seletor(a, (v) => trocar(a, v), "Trocar inspetor")}
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => cancelar(a)}>
                      <Undo2 className="h-4 w-4" /> Cancelar
                    </Button>
                    <Button asChild size="sm" variant="outline" className="gap-1">
                      <Link to="/planner/$prefixo" params={{ prefixo: a.prefixo }}>
                        <ExternalLink className="h-4 w-4" /> Abrir card
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
