import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  listPmpPlans,
  getCumulativeOperations,
  type PmpPlan,
  type PmpOperation,
} from "@/lib/pmp-catalog";

interface Props {
  /** Modelo inicial (ex.: vindo do cadastro do equipamento). */
  modeloInicial?: string;
  /** Recarrega quando o catálogo muda. */
  refreshKey?: number;
  /** Chamado ao escolher modelo + intervalo. */
  onChange?: (sel: { plan: PmpPlan; operations: PmpOperation[] } | null) => void;
}

/** Busca um modelo no catálogo, escolhe o intervalo e monta a preventiva cumulativa. */
export function PmpGerador({ modeloInicial, refreshKey, onChange }: Props) {
  const [all, setAll] = useState<PmpPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState(modeloInicial ?? "");
  const [modelo, setModelo] = useState<string | null>(null);
  const [horas, setHoras] = useState<number | null>(null);
  const [ops, setOps] = useState<PmpOperation[]>([]);
  const [incluidos, setIncluidos] = useState<PmpPlan[]>([]);
  const [loadingOps, setLoadingOps] = useState(false);

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    listPmpPlans()
      .then((p) => vivo && setAll(p))
      .catch(console.error)
      .finally(() => vivo && setLoading(false));
    return () => {
      vivo = false;
    };
  }, [refreshKey]);

  const modelos = useMemo(() => {
    const q = busca.trim().toUpperCase();
    // Tokens: aceita modelos no formato SAP (ex.: "254W-GLP-YALE-GP050VX")
    const tokens = q.split(/[^A-Z0-9]+/).filter((t) => t.length >= 3);
    const texto = (p: PmpPlan) =>
      `${p.modelo} ${p.modeloOriginal} ${p.fabricante ?? ""} ${p.familia ?? ""}`.toUpperCase();

    const filtrar = (modo: "exato" | "tokens" | "tudo") => {
      const map = new Map<string, PmpPlan[]>();
      for (const p of all) {
        const t = texto(p);
        if (modo === "exato" && q && !t.includes(q)) continue;
        if (modo === "tokens" && tokens.length && !tokens.some((tk) => t.includes(tk))) continue;
        const key = `${p.modelo}||${p.familia ?? ""}`;
        const list = map.get(key) ?? [];
        list.push(p);
        map.set(key, list);
      }
      return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    };

    let res = filtrar("exato");
    if (res.length === 0 && tokens.length) res = filtrar("tokens");
    if (res.length === 0) res = filtrar("tudo");
    return res;
  }, [all, busca]);

  const planosDoModelo = useMemo(
    () => (modelo ? (modelos.find(([m]) => m === modelo)?.[1] ?? []) : []),
    [modelo, modelos],
  );

  const escolher = async (alvo: number) => {
    setHoras(alvo);
    setLoadingOps(true);
    try {
      const { operations, incluidos: usados } = await getCumulativeOperations(planosDoModelo, alvo);
      setOps(operations);
      setIncluidos(usados);
      const plan = planosDoModelo.find((p) => p.intervaloHoras === alvo);
      onChange?.(plan ? { plan, operations } : null);
    } catch (e) {
      console.error(e);
      onChange?.(null);
    } finally {
      setLoadingOps(false);
    }
  };

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Input
          className="h-10 max-w-sm"
          placeholder="Buscar modelo no catálogo (ex.: CASE 721E)"
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setModelo(null);
            setHoras(null);
            setOps([]);
            onChange?.(null);
          }}
        />
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      </div>

      {!loading && modelos.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhum modelo encontrado no catálogo para essa busca.</p>
      )}

      {modelos.length > 0 && (
        <div>
          <Label className="text-[11px]">Modelo / família</Label>
          <p className="text-[11px] text-muted-foreground">
            Não achou o modelo exato? Apague a busca para ver todos os PMPs do catálogo.
          </p>

          <div className="mt-1 flex flex-wrap gap-2">
            {modelos.slice(0, 24).map(([m, list]) => (
              <Button
                key={m}
                type="button"
                size="sm"
                variant={modelo === m ? "default" : "outline"}
                onClick={() => {
                  setModelo(m);
                  setHoras(null);
                  setOps([]);
                  onChange?.(null);
                }}
              >
                {list[0].modeloOriginal}
                {list[0].familia && (
                  <Badge variant="outline" className="ml-1 text-[10px]">Família {list[0].familia}</Badge>
                )}
                <Badge variant="secondary" className="ml-1 text-[10px]">{list.length}</Badge>
              </Button>
            ))}
          </div>
        </div>
      )}

      {planosDoModelo.length > 0 && (
        <div>
          <Label className="text-[11px]">Preventiva (intervalo)</Label>
          <div className="mt-1 flex flex-wrap gap-2">
            {planosDoModelo
              .slice()
              .sort((a, b) => a.intervaloHoras - b.intervaloHoras)
              .map((p) => (
                <Button
                  key={p.id}
                  type="button"
                  size="sm"
                  variant={horas === p.intervaloHoras ? "default" : "outline"}
                  onClick={() => void escolher(p.intervaloHoras)}
                >
                  {p.intervaloHoras}h
                </Button>
              ))}
          </div>
        </div>
      )}

      {loadingOps && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Montando preventiva…
        </div>
      )}

      {!loadingOps && ops.length > 0 && (
        <div className="grid gap-2 rounded-md border-2 border-success/50 bg-success/10 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-success">
            <Wrench className="h-4 w-4" /> Preventiva {horas}h · {ops.length} operações
          </div>
          {incluidos.length > 1 && (
            <p className="text-[11px] text-muted-foreground">
              Cumulativa: inclui {incluidos.map((p) => `${p.intervaloHoras}h`).join(" + ")} — sem duplicar itens.
            </p>
          )}
          <div className="max-h-72 overflow-y-auto rounded border bg-background p-2 text-[11px]">
            <ul className="grid gap-1">
              {ops.map((o) => (
                <li key={o.ordem} className="leading-snug">
                  <span className="font-mono text-[10px] text-muted-foreground">{o.item ?? o.ordem}</span>{" "}
                  {o.procedimento}
                  {o.origemHoras && <Badge variant="outline" className="ml-1 text-[9px]">{o.origemHoras}h</Badge>}
                  {o.servico && <Badge variant="outline" className="ml-1 text-[9px]">{o.servico}</Badge>}
                  {o.material && <Badge variant="secondary" className="ml-1 text-[9px]">{o.material}</Badge>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
