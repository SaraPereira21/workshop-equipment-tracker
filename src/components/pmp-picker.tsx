import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle, BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PmpUpload } from "@/components/pmp-upload";
import { PmpGerador } from "@/components/pmp-gerador";
import {
  findPlansForModelo,
  getCumulativeOperations,
  type PmpPlan,
  type PmpOperation,
} from "@/lib/pmp-catalog";

export interface PmpSelection {
  plan: PmpPlan;
  operations: PmpOperation[];
}

interface Props {
  modelo: string;
  marca?: string;
  /** Intervalo alvo do equipamento (h) — pré-seleciona o plano correspondente. */
  alvoHoras?: number;
  criadoPor?: string;
  onChange: (sel: PmpSelection | null) => void;
}

/** Busca o PMP cadastrado para o modelo; se não houver, permite cadastrar na hora. */
export function PmpPicker({ modelo, marca, alvoHoras, criadoPor, onChange }: Props) {
  const [plans, setPlans] = useState<PmpPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ops, setOps] = useState<PmpOperation[]>([]);
  const [incluidos, setIncluidos] = useState<PmpPlan[]>([]);
  const [loadingOps, setLoadingOps] = useState(false);
  const [cadastrar, setCadastrar] = useState(false);
  const [familia, setFamilia] = useState<string>("");

  const busca = [marca, modelo].filter(Boolean).join(" ").trim() || modelo;

  const load = async () => {
    setLoading(true);
    try {
      const found = await findPlansForModelo(busca);
      setPlans(found);
      const fams = [...new Set(found.map((p) => p.familia ?? ""))];
      const fam = fams[0] ?? "";
      setFamilia(fam);
      const escopo = found.filter((p) => (p.familia ?? "") === fam);
      const preferido = escopo.find((p) => p.intervaloHoras === alvoHoras) ?? escopo[0];
      if (preferido) void selecionar(preferido, escopo);
      else {
        setSelectedId(null);
        onChange(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const selecionar = async (plan: PmpPlan, source?: PmpPlan[]) => {
    setSelectedId(plan.id);
    setLoadingOps(true);
    const base = source ?? plans.filter((p) => (p.familia ?? "") === familia);
    try {
      // Preventiva cumulativa: 500h inclui 250h, 1000h inclui 500h+250h, etc. (sem duplicar)
      const { operations, incluidos: usados } = await getCumulativeOperations(base, plan.intervaloHoras);
      setOps(operations);
      setIncluidos(usados);
      onChange({ plan, operations });
    } catch (e) {
      console.error(e);
      onChange(null);
    } finally {
      setLoadingOps(false);

    }
  };


  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, alvoHoras]);

  const familias = [...new Set(plans.map((p) => p.familia ?? ""))];
  const planosFamilia = plans.filter((p) => (p.familia ?? "") === familia);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Procurando PMP cadastrado para {busca}…
      </div>
    );
  }

  if (plans.length === 0 || cadastrar) {
    return (
      <div className="grid gap-3 rounded-md border-2 border-warning/60 bg-warning/10 p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-warning-foreground">
          <AlertTriangle className="h-4 w-4" />
          {plans.length === 0 ? `Sem PMP cadastrado para ${busca}` : "Cadastrar novo PMP"}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Envie a planilha do PMP deste modelo — ela fica salva no catálogo e será reutilizada nas próximas máquinas.
        </p>
        <PmpUpload
          modeloSugerido={busca}
          criadoPor={criadoPor}
          onSaved={() => {
            setCadastrar(false);
            void load();
          }}
        />
        <div className="rounded-md border bg-background p-3">
          <div className="mb-2 text-xs font-semibold">Ou escolha um PMP já cadastrado no catálogo</div>
          <PmpGerador
            modeloInicial={busca}
            onChange={(sel) => onChange(sel ? { plan: sel.plan, operations: sel.operations } : null)}
          />
        </div>
        {plans.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setCadastrar(false)}>
            Cancelar
          </Button>
        )}
      </div>
    );
  }


  return (
    <div className="grid gap-2 rounded-md border-2 border-success/50 bg-success/10 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-success">
        <CheckCircle2 className="h-4 w-4" /> PMP cadastrado: {plans[0].modeloOriginal}
        {familia && <Badge variant="outline">Família {familia}</Badge>}
      </div>
      {familias.length > 1 && (
        <div>
          <Label className="text-[11px]">Família do equipamento</Label>
          <div className="mt-1 flex flex-wrap gap-2">
            {familias.map((f) => (
              <Button
                key={f || "sem"}
                type="button"
                size="sm"
                variant={familia === f ? "default" : "outline"}
                onClick={() => {
                  setFamilia(f);
                  const escopo = plans.filter((p) => (p.familia ?? "") === f);
                  const pref = escopo.find((x) => x.intervaloHoras === alvoHoras) ?? escopo[0];
                  if (pref) void selecionar(pref, escopo);
                }}
              >
                {f || "Sem família"}
              </Button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Este modelo tem PMPs diferentes por família — confira a família da máquina antes de gerar.
          </p>
        </div>
      )}
      <div>
        <Label className="text-[11px]">Intervalo da manutenção</Label>
        <div className="mt-1 flex flex-wrap gap-2">
          {planosFamilia
            .slice()
            .sort((a, b) => a.intervaloHoras - b.intervaloHoras)
            .map((p) => (
              <Button
                key={p.id}
                type="button"
                size="sm"
                variant={selectedId === p.id ? "default" : "outline"}
                onClick={() => void selecionar(p)}
              >
                {p.intervaloHoras}h
              </Button>
            ))}
        </div>
      </div>
      {incluidos.length > 1 && (
        <p className="text-[11px] text-muted-foreground">
          Preventiva cumulativa: inclui {incluidos.map((p) => `${p.intervaloHoras}h`).join(" + ")} — itens repetidos
          entram uma única vez.
        </p>
      )}
      {loadingOps ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando operações…
        </div>
      ) : (
        ops.length > 0 && (
          <>
            <div className="text-xs font-semibold">{ops.length} operações serão enviadas ao mecânico</div>
            <div className="max-h-40 overflow-y-auto rounded border bg-background p-2 text-[11px]">
              <ul className="grid gap-1">
                {ops.slice(0, 30).map((o) => (
                  <li key={o.ordem} className="leading-snug">
                    <span className="font-mono text-[10px] text-muted-foreground">{o.item ?? o.ordem}</span>{" "}
                    {o.procedimento}
                    {o.origemHoras && (
                      <Badge variant="outline" className="ml-1 text-[9px]">{o.origemHoras}h</Badge>
                    )}
                    {o.servico && <Badge variant="outline" className="ml-1 text-[9px]">{o.servico}</Badge>}
                    {o.material && <Badge variant="secondary" className="ml-1 text-[9px]">{o.material}</Badge>}
                  </li>
                ))}

                {ops.length > 30 && (
                  <li className="italic text-muted-foreground">+ {ops.length - 30} outras…</li>
                )}
              </ul>
            </div>
          </>
        )
      )}
      <Button size="sm" variant="ghost" className="justify-start gap-1 text-xs" onClick={() => setCadastrar(true)}>
        <BookOpen className="h-3.5 w-3.5" /> Enviar/atualizar planilha deste modelo
      </Button>
    </div>
  );
}
