import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, Plus, Trash2, Loader2, Search, ChevronDown, Pencil } from "lucide-react";
import { PmpEditarDialog } from "@/components/pmp-editar-dialog";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PmpUpload } from "@/components/pmp-upload";
import { PmpGerador } from "@/components/pmp-gerador";
import { useAuth } from "@/hooks/use-auth";
import {
  listPmpPlans,
  getPmpOperations,
  deletePmpPlan,
  type PmpPlan,
  type PmpOperation,
} from "@/lib/pmp-catalog";

export const Route = createFileRoute("/_authenticated/pmp")({
  head: () => ({
    meta: [
      { title: "Catálogo de PMP · Planner Matriz" },
      { name: "description", content: "Biblioteca de Planos de Manutenção Preventiva por modelo e intervalo." },
      { property: "og:title", content: "Catálogo de PMP · Planner Matriz" },
      { property: "og:description", content: "Planos de manutenção preventiva cadastrados por modelo de equipamento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PmpCatalogo,
});

function PmpCatalogo() {
  const { profile } = useAuth();
  const [plans, setPlans] = useState<PmpPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      setPlans(await listPmpPlans());
      setVersion((v) => v + 1);
    } catch (e) {
      console.error(e);
      toast.error("Falha ao carregar o catálogo.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const grupos = useMemo(() => {
    const q = busca.trim().toUpperCase();
    const filtered = q
      ? plans.filter(
          (p) =>
            p.modelo.includes(q) ||
            p.modeloOriginal.toUpperCase().includes(q) ||
            (p.familia ?? "").toUpperCase().includes(q),
        )
      : plans;
    const map = new Map<string, PmpPlan[]>();
    for (const p of filtered) {
      const key = `${p.modelo}||${p.familia ?? ""}`;
      const list = map.get(key) ?? [];
      list.push(p);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [plans, busca]);

  return (
    <div className="mx-auto max-w-5xl px-3 py-4 md:px-6 md:py-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold md:text-3xl">
            <BookOpen className="h-6 w-6 text-primary" /> Catálogo de PMP
          </h1>
          <p className="text-sm text-muted-foreground">
            Planos de manutenção preventiva por modelo e intervalo — cadastre uma vez, reutilize sempre.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1"><Plus className="h-4 w-4" /> Cadastrar PMP</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Cadastrar PMP (planilha Excel)</DialogTitle></DialogHeader>
            <PmpUpload
              criadoPor={profile?.nome}
              onSaved={() => {
                setOpen(false);
                void load();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Gerar preventiva</CardTitle>
        </CardHeader>
        <CardContent>
          <PmpGerador refreshKey={version} />
        </CardContent>
      </Card>

      <div className="mb-4 flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          className="h-10 max-w-sm"
          placeholder="Buscar modelo ou família (ex.: CASE 721E, E878)"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <Badge variant="secondary">{plans.length} planos</Badge>
      </div>


      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : grupos.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Nenhum PMP cadastrado ainda. Clique em “Cadastrar PMP” e envie a planilha do SAP.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {grupos.map(([chave, list]) => (
            <Card key={chave}>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {list[0].modeloOriginal}
                  {list[0].familia && <Badge variant="outline">Família {list[0].familia}</Badge>}
                  <span className="text-xs font-normal text-muted-foreground">{list[0].modelo}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                {list
                  .sort((a, b) => a.intervaloHoras - b.intervaloHoras)
                  .map((p) => (
                    <PlanRow key={p.id} plan={p} onDeleted={load} />
                  ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function PlanRow({ plan, onDeleted }: { plan: PmpPlan; onDeleted: () => void }) {
  const [ops, setOps] = useState<PmpOperation[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);

  const toggle = async () => {
    setExpanded((v) => !v);
    if (!ops) {
      setLoading(true);
      try {
        setOps(await getPmpOperations(plan.id));
      } catch (e) {
        console.error(e);
        toast.error("Falha ao carregar operações.");
      } finally {
        setLoading(false);
      }
    }
  };

  const remover = async () => {
    if (!confirm(`Excluir o PMP ${plan.modeloOriginal} · ${plan.intervaloHoras}h?`)) return;
    try {
      await deletePmpPlan(plan.id);
      toast.success("PMP excluído.");
      onDeleted();
    } catch (e) {
      console.error(e);
      toast.error("Falha ao excluir.");
    }
  };

  return (
    <div className="rounded-md border">
      <div className="flex flex-wrap items-center justify-between gap-2 p-3">
        <button onClick={toggle} className="flex items-center gap-2 text-left text-sm">
          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
          <Badge>{plan.intervaloHoras}h</Badge>
          <span className="text-xs text-muted-foreground">{plan.intervaloLabel}</span>
          {plan.codigoPlano && (
            <Badge variant="outline" className="text-[10px]">{plan.codigoPlano}</Badge>
          )}
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {new Date(plan.createdAt).toLocaleDateString("pt-BR")}
            {plan.criadoPor ? ` · ${plan.criadoPor}` : ""}
          </span>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={remover}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <PmpEditarDialog
        plan={plan}
        open={editing}
        onOpenChange={setEditing}
        onSaved={() => {
          setOps(null);
          setExpanded(false);
          onDeleted();
        }}
      />

      {expanded && (
        <div className="border-t bg-muted/30 p-3 text-xs">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando operações…
            </div>
          ) : (
            <ul className="grid max-h-72 gap-1 overflow-y-auto">
              {(ops ?? []).map((o) => (
                <li key={o.ordem} className="leading-snug">
                  <span className="font-mono text-[10px] text-muted-foreground">{o.item ?? o.ordem}</span>{" "}
                  {o.procedimento}
                  {o.servico && <Badge variant="outline" className="ml-1 text-[9px]">{o.servico}</Badge>}
                  {o.material && <Badge variant="secondary" className="ml-1 text-[9px]">{o.material}</Badge>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
