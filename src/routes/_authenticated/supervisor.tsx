import { createFileRoute, Link } from "@tanstack/react-router";
import { PreventivaResumoBadges } from "@/components/preventiva-status-badges";
import { ColumnBadge } from "@/components/status-badges";
import { useMemo, useState } from "react";
import { Users, Clock, TrendingUp, Wrench, ClipboardCheck, Undo2, ExternalLink, Search, PenLine } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { isLiberado } from "@/lib/liberado";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Inspection, Mechanic, WorkOrder } from "@/lib/types";
import { SignaturePad } from "@/components/signature-pad";
import { RevisaoInspecaoDialog } from "@/components/revisao-inspecao-dialog";
import { AlocacaoBoard } from "@/components/alocacao-board";
import { EnviarParaInspecaoSection } from "@/components/enviar-para-inspecao-section";
import { useInspetorNomes, normNomePessoa } from "@/hooks/use-inspetor-nomes";
import { useAuth } from "@/hooks/use-auth";



import { CheckCircle2, Eye } from "lucide-react";

export const Route = createFileRoute("/_authenticated/supervisor")({
  head: () => ({
    meta: [{ title: "Supervisor — Painel de Controle" }, { name: "description", content: "Gestão de mão-de-obra e distribuição de frentes de trabalho." }],
  }),
  component: SupervisorPanel,
});

function turnoLabel(t: Mechanic["turno"]) {
  return t === "manha" ? "Manhã" : t === "tarde" ? "Tarde" : "Noite";
}

function SupervisorPanel() {
  const inspetorNomes = useInspetorNomes();
  const allMechanics = useAppStore((s) => s.mechanics);
  const mechanics = useMemo(
    () => allMechanics.filter((m) => !inspetorNomes.has(normNomePessoa(m.nome))),
    [allMechanics, inspetorNomes],
  );

  const assets = useAppStore((s) => s.assets);
  const workOrders = useAppStore((s) => s.workOrders);
  
  const aguardando = useMemo(
    () => workOrders.filter((w) => w.status === "aguardando_supervisor"),
    [workOrders],
  );
  const liberacoesPendentes = useMemo(
    () => assets.filter((a) => a.libNovoStatus === "aguardando_supervisor"),
    [assets],
  );
  const inspections = useAppStore((s) => s.inspections);
  const checkPendente = (i: Inspection) => {
    if (!i.inspetorSig) return false;
    if (i.supervisorSig) return false;
    const a = assets.find((x) => x.id === i.assetId);
    if (a?.deletedAt) return false;
    // Se outra inspeção do mesmo equipamento e tipo já foi assinada, esta é duplicidade.
    const jaAssinada = inspections.some(
      (o) => o.id !== i.id && o.assetId === i.assetId && o.tipo === i.tipo && !!o.supervisorSig,
    );
    return !jaAssinada;
  };
  /** Mantém apenas a inspeção mais recente por equipamento + tipo. */
  const dedupe = (list: Inspection[]) => {
    const byKey = new Map<string, Inspection>();
    for (const i of list) {
      const key = `${i.assetId}|${i.tipo}`;
      const prev = byKey.get(key);
      if (!prev || new Date(i.data).getTime() > new Date(prev.data).getTime()) byKey.set(key, i);
    }
    return [...byKey.values()];
  };
  const checksEntradaPendentes = useMemo(
    () => dedupe(inspections.filter((i) => (i.tipo === "entrada" || i.tipoEntradaSaida) && checkPendente(i))),
    [inspections, assets],
  );
  const checksSaidaPendentes = useMemo(
    () => dedupe(inspections.filter((i) => (i.tipo === "saida" || i.tipoEntradaSaida) && checkPendente(i))),
    [inspections, assets],
  );

  /** Histórico: tudo que o supervisor já assinou, mais recente primeiro. */
  const checksAssinados = useMemo(
    () =>
      inspections
        .filter((i) => !!i.supervisorSig)
        .sort(
          (a, b) =>
            new Date(b.supervisorSigEm ?? b.data).getTime() -
            new Date(a.supervisorSigEm ?? a.data).getTime(),
        ),
    [inspections],
  );




  const supervisorSig = useAppStore((s) => s.signatures["supervisor:global"]);
  const assignMechanic = useAppStore((s) => s.assignMechanic);
  const updateAsset = useAppStore((s) => s.updateAsset);

  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedMecIds, setSelectedMecIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [mecSearch, setMecSearch] = useState("");
  const [equipeSearch, setEquipeSearch] = useState("");

  const normTxt = (n: string) =>
    n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");

  /** Manutentores em ordem alfabética, sem nomes repetidos */
  const mecanicosOrdenados = useMemo(() => {
    const porNome = new Map<string, Mechanic>();
    for (const m of mechanics) {
      const k = normTxt(m.nome);
      const atual = porNome.get(k);
      if (!atual) { porNome.set(k, m); continue; }
      // mantém o cadastro "mais ativo" (com OS ativa / status ativo)
      const score = (x: Mechanic) => (x.osAtivaId ? 2 : 0) + (x.status === "ativo" ? 1 : 0);
      if (score(m) > score(atual)) porNome.set(k, m);
    }
    return [...porNome.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [mechanics]);


  const filtrarMec = (lista: Mechanic[], termo: string) => {
    const q = normTxt(termo);
    if (!q) return lista;
    return lista.filter((m) => normTxt(`${m.nome} ${m.especialidade ?? ""}`).includes(q));
  };

  const ativos = mecanicosOrdenados.filter((m) => m.status === "ativo");
  const downtime = "3.4h";
  const eficiencia = "82%";


  const alocaveis = useMemo(() => {
    // Máquinas em inspeção (triagem/chegada com inspeção em andamento) também podem receber manutentor
    const lista = assets.filter((a) => !isLiberado(a));
    return [...lista].sort((a, b) => {
      const eqA = (a.mecanicoIds ?? (a.mecanicoId ? [a.mecanicoId] : [])).length;
      const eqB = (b.mecanicoIds ?? (b.mecanicoId ? [b.mecanicoId] : [])).length;
      if (eqA === 0 && eqB > 0) return -1;
      if (eqB === 0 && eqA > 0) return 1;
      return (a.prefixo ?? "").localeCompare(b.prefixo ?? "");
    });
  }, [assets]);

  const semManutentorCount = useMemo(
    () =>
      alocaveis.filter((a) => (a.mecanicoIds ?? (a.mecanicoId ? [a.mecanicoId] : [])).length === 0).length,
    [alocaveis],
  );

  const alocaveisFiltradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return alocaveis;
    return alocaveis.filter((a) => {
      const equipeNomes = (a.mecanicoIds ?? (a.mecanicoId ? [a.mecanicoId] : []))
        .map((id) => mechanics.find((m) => m.id === id)?.nome ?? "")
        .join(" ");
      const hay = [a.prefixo, a.marca, a.modelo, a.tipo, a.sapOsCorretiva, a.sapOsPreventiva, equipeNomes, ...(a.tags ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [alocaveis, search, mechanics]);

  const openAssign = (assetId: string) => {
    const a = assets.find((x) => x.id === assetId);
    const equipe = a?.mecanicoIds ?? (a?.mecanicoId ? [a.mecanicoId] : []);
    setSelectedMecIds(equipe);
    setSelectedAssetId(assetId);
  };

  const toggleMec = (id: string) => {
    setSelectedMecIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const confirmAssign = () => {
    if (!selectedAssetId) return;
    if (selectedMecIds.length === 0) {
      const atual = assets.find((a) => a.id === selectedAssetId);
      const destino =
        atual?.column === "manutencao" || atual?.column === "atribu_do" ? "mdo" : atual?.column;
      updateAsset(selectedAssetId, {
        mecanicoId: undefined,
        mecanicoIds: undefined,
        ...(destino ? { column: destino } : {}),
      });
      toast.success("Manutentores removidos da máquina.");
      setSelectedAssetId(null);
      setSelectedMecIds([]);
      return;
    }
    assignMechanic(selectedAssetId, selectedMecIds);
    const nomes = selectedMecIds
      .map((id) => mechanics.find((m) => m.id === id)?.nome)
      .filter(Boolean)
      .join(", ");
    toast.success(`Atribuído a ${nomes}. Notificação enviada.`);
    setSelectedAssetId(null);
    setSelectedMecIds([]);
  };


  return (
    <div className="mx-auto max-w-6xl px-3 py-4 md:px-6 md:py-8">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold md:text-3xl">Painel do Supervisor</h1>
          <p className="text-sm text-muted-foreground">Capacidade da oficina e distribuição de trabalho.</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant={supervisorSig ? "outline" : "default"} size="sm" className="gap-1">
              <PenLine className="h-4 w-4" />
              {supervisorSig ? "Editar assinatura" : "Cadastrar assinatura"}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cadastrar / editar assinatura</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-muted-foreground">
              Sua assinatura fica salva e é usada automaticamente nas aprovações e liberações.
            </p>
            <SignaturePad storageKey="supervisor:global" label="Supervisor" />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Sem manutentor</div>
          <div className="font-display text-2xl font-bold">{semManutentorCount}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground"><Users className="h-3.5 w-3.5" /> Mecânicos ativos</div>
          <div className="font-display text-2xl font-bold">{ativos.length}/{mecanicosOrdenados.length}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground"><Wrench className="h-3.5 w-3.5" /> Downtime médio</div>
          <div className="font-display text-2xl font-bold">{downtime}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground"><TrendingUp className="h-3.5 w-3.5" /> Eficiência</div>
          <div className="font-display text-2xl font-bold">{eficiencia}</div>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="aprovacoes" className="mt-6">
        <TabsList>
          <TabsTrigger value="aprovacoes">Aprovações</TabsTrigger>
          <TabsTrigger value="checks-entrada" className="gap-1">
            Checks de inspeção
            {checksEntradaPendentes.length + checksSaidaPendentes.length > 0 && (
              <Badge variant="destructive" className="h-5 min-w-5 justify-center px-1 text-[10px]">
                {checksEntradaPendentes.length + checksSaidaPendentes.length}
              </Badge>
            )}
          </TabsTrigger>

          <TabsTrigger value="alocacao">Alocação da equipe</TabsTrigger>
          <TabsTrigger value="inspecao">Enviar para inspeção</TabsTrigger>
        </TabsList>

        <TabsContent value="aprovacoes">
      {/* 1º) OS aguardando aprovação/assinatura do supervisor */}

      <Card className="mt-6 border-primary/40">

        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            1º — Aprovações e assinaturas de OS ({aguardando.length})
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Revise e assine as OS antes de liberar o check de saída da máquina.
          </p>
        </CardHeader>
        <CardContent className="grid gap-2">
          {aguardando.length === 0 && (
            <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              Nenhuma OS aguardando. Quando um mecânico concluir e assinar, aparece aqui.
            </div>
          )}
          {aguardando.map((wo) => (
            <AguardandoRow key={wo.id} wo={wo} />
          ))}
        </CardContent>
      </Card>

      {/* 2º) Liberações de equipamentos aguardando assinatura do supervisor */}
      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            2º — Liberações aguardando minha assinatura ({liberacoesPendentes.length})
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Só libere depois de conferir e assinar as OS acima.
          </p>
        </CardHeader>
        <CardContent className="grid gap-2">
          {liberacoesPendentes.length === 0 && (
            <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              Nenhuma liberação pendente. Quando o inspetor concluir a inspeção de saída, aparece aqui. Ao assinar, o e-mail de liberação é enviado automaticamente.
            </div>
          )}
          {liberacoesPendentes.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{a.prefixo}</span>
                  <Badge variant="secondary" className="text-[10px] uppercase">{(a.horimetroAtual ?? 0) < 40 ? "Novo (< 40h)" : "Frota"}</Badge>
                  <Badge variant="outline" className="text-[10px]">{a.marca} {a.modelo}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  Assinado por {a.libNovoInspetorSig?.nome ?? "—"} ({a.libNovoInspetorSig?.cargo ?? "Inspetor"})
                  {a.libNovoInspetorEm && ` · ${new Date(a.libNovoInspetorEm).toLocaleString("pt-BR")}`}
                </div>
              </div>
              <RevisaoInspecaoDialog
                asset={a}
                trigger={
                  <Button size="sm" className="gap-1">
                    <Eye className="h-4 w-4" /> Revisar e assinar
                  </Button>
                }
              />
              {!supervisorSig && (
                <span className="text-[10px] text-warning-foreground">Cadastre sua assinatura no topo da tela</span>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

        </TabsContent>

        <TabsContent value="checks-entrada">
      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            Checks aguardando minha assinatura
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            O check assinado pelo inspetor precisa da sua assinatura para ficar registrado. Clique em “Checar e assinar” para conferir o check antes de assinar.
          </p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="entrada">
            <TabsList>
              <TabsTrigger value="entrada" className="gap-1">
                Check de entrada
                {checksEntradaPendentes.length > 0 && (
                  <Badge variant="destructive" className="h-5 min-w-5 justify-center px-1 text-[10px]">
                    {checksEntradaPendentes.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="saida" className="gap-1">
                Check de saída
                {checksSaidaPendentes.length > 0 && (
                  <Badge variant="destructive" className="h-5 min-w-5 justify-center px-1 text-[10px]">
                    {checksSaidaPendentes.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="entrada" className="mt-3 grid gap-2">
              {checksEntradaPendentes.length === 0 && (
                <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                  Nenhum check de entrada pendente de assinatura.
                </div>
              )}
              {checksEntradaPendentes.map((insp) => (
                <CheckEntradaRow key={insp.id} inspection={insp} label="Check de entrada" />
              ))}
            </TabsContent>
            <TabsContent value="saida" className="mt-3 grid gap-2">
              {checksSaidaPendentes.length === 0 && (
                <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                  Nenhum check de saída pendente de assinatura.
                </div>
              )}
              {checksSaidaPendentes.map((insp) => (
                <CheckEntradaRow key={insp.id} inspection={insp} label="Check de saída" />
              ))}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="h-5 w-5 text-muted-foreground" />
            Histórico de checks assinados ({checksAssinados.length})
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Registro dos checks liberados com a sua assinatura, com o tipo e a data da assinatura.
          </p>
        </CardHeader>
        <CardContent className="grid gap-2">
          {checksAssinados.length === 0 && (
            <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              Nenhum check assinado ainda.
            </div>
          )}
          {checksAssinados.map((i) => (
            <div
              key={i.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{i.prefixo}</span>
                  {i.tipoEntradaSaida ? (
                    <Badge variant="secondary" className="text-[10px]">ENTRADA E SAÍDA</Badge>
                  ) : (
                    <Badge
                      variant={i.tipo === "entrada" ? "secondary" : "default"}
                      className="text-[10px]"
                    >
                      {i.tipo === "entrada" ? "ENTRADA" : "SAÍDA"}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Inspetor: {i.inspetor || "—"}
                </p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <div>
                  Assinado por {i.supervisorSig?.nome || "supervisor"}
                </div>
                <div>
                  {new Date(i.supervisorSigEm ?? i.data).toLocaleString("pt-BR")}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

        </TabsContent>


        <TabsContent value="alocacao">
      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Alocação da equipe</CardTitle>
        </CardHeader>
        <CardContent>
          <AlocacaoBoard />
        </CardContent>
      </Card>


      <div className="mt-6 grid gap-4 lg:grid-cols-2">

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Alocação de manutentores ({alocaveis.length}) · {semManutentorCount} sem manutentor
            </CardTitle>
            <div className="relative mt-2">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por prefixo, modelo, OS, manutentor, tag…"
                className="pl-8"
              />
            </div>
          </CardHeader>
          <CardContent className="grid max-h-[520px] gap-2 overflow-y-auto">
            {alocaveisFiltradas.length === 0 && (
              <div className="text-sm text-muted-foreground">
                {search ? "Nenhuma máquina encontrada." : "Nenhuma máquina na oficina."}
              </div>
            )}
            {alocaveisFiltradas.map((a) => {
              const equipe = (a.mecanicoIds ?? (a.mecanicoId ? [a.mecanicoId] : []))
                .map((id) => mechanics.find((m) => m.id === id)?.nome)
                .filter(Boolean) as string[];
              return (
                <div key={a.id} className="flex items-center justify-between gap-2 rounded-md border p-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{a.prefixo}</span>
                      <ColumnBadge column={a.column} />
                      {a.sapOsCorretiva && (
                        <Badge variant="outline" className="text-[10px]">OS {a.sapOsCorretiva}</Badge>
                      )}
                      {a.temPreventiva && (
                        <Badge variant="secondary" className="text-[10px]">+ Prev. {a.preventivaLiberada ? a.sapOsPreventiva : "pendente"}</Badge>
                      )}
                      <PreventivaResumoBadges asset={a} />
                      {equipe.length > 0 ? (
                        <Badge className="text-[10px]">{equipe.join(", ")}</Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[10px]">Sem manutentor</Badge>
                      )}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{a.marca} {a.modelo} · {a.horimetroAtual}h</div>
                  </div>
                  <Button
                    size="sm"
                    variant={equipe.length > 0 ? "outline" : "default"}
                    className="tap-target shrink-0"
                    onClick={() => openAssign(a.id)}
                  >
                    {equipe.length > 0 ? "Gerenciar" : "Atribuir"}
                  </Button>
                </div>
              );
            })}

          </CardContent>
        </Card>

        <Dialog
          open={!!selectedAssetId}
          onOpenChange={(o) => {
            if (!o) {
              setSelectedAssetId(null);
              setSelectedMecIds([]);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Atribuir {assets.find((a) => a.id === selectedAssetId)?.prefixo} — selecione um ou mais manutentores
              </DialogTitle>
            </DialogHeader>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={mecSearch}
                onChange={(e) => setMecSearch(e.target.value)}
                placeholder="Pesquisar manutentor..."
                className="pl-8"
              />
            </div>
            <div className="grid max-h-[420px] gap-2 overflow-y-auto">
              {filtrarMec(mecanicosOrdenados.filter((m) => m.status !== "fora_turno"), mecSearch).map((m) => {

                const checked = selectedMecIds.includes(m.id);
                return (
                  <label
                    key={m.id}
                    className={cn(
                      "tap-target flex cursor-pointer items-center justify-between gap-2 rounded-md border p-3 transition-colors hover:border-primary/60",
                      checked && "border-primary bg-primary/5",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Checkbox checked={checked} onCheckedChange={() => toggleMec(m.id)} />
                      <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 font-bold text-primary">
                        {m.nome.split(" ").map((s) => s[0]).slice(0, 2).join("")}
                      </div>
                      <div>
                        <div className="font-semibold">{m.nome}</div>
                        <div className="text-xs text-muted-foreground">{m.especialidade} · {turnoLabel(m.turno)}</div>
                      </div>
                    </div>
                    <Badge variant={m.status === "livre" ? "secondary" : "default"}>{m.status.replace("_", " ")}</Badge>
                  </label>
                );
              })}
            </div>
            <DialogFooter>
              <div className="mr-auto text-xs text-muted-foreground">
                {selectedMecIds.length} selecionado{selectedMecIds.length === 1 ? "" : "s"}
              </div>
              <Button variant="outline" onClick={() => { setSelectedAssetId(null); setSelectedMecIds([]); }}>
                Cancelar
              </Button>
              <Button onClick={confirmAssign} variant={selectedMecIds.length === 0 ? "destructive" : "default"}>
                {selectedMecIds.length === 0 ? "Remover manutentores" : "Confirmar atribuição"}
              </Button>

            </DialogFooter>
          </DialogContent>
        </Dialog>


        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Capacidade da equipe</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={equipeSearch}
                onChange={(e) => setEquipeSearch(e.target.value)}
                placeholder="Pesquisar manutentor..."
                className="pl-8"
              />
            </div>
            {filtrarMec(mecanicosOrdenados, equipeSearch).map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 rounded-md border p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 font-bold text-primary">
                    {m.nome.split(" ").map((s) => s[0]).slice(0, 2).join("")}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="truncate font-semibold">{m.nome}</div>
                    </div>

                    <div className="text-xs text-muted-foreground">{m.especialidade} · {turnoLabel(m.turno)}</div>
                  </div>
                </div>

                <div className="text-right">
                  <div className={cn(
                    "text-[10px] font-bold uppercase",
                    m.status === "ativo" && "text-success",
                    m.status === "livre" && "text-info",
                    m.status === "fora_turno" && "text-muted-foreground",
                  )}>{m.status.replace("_", " ")}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

        </TabsContent>

        <TabsContent value="inspecao">
          <EnviarParaInspecaoSection />
        </TabsContent>
      </Tabs>


    </div>
  );
}

function AguardandoRow({ wo }: { wo: WorkOrder }) {
  const updateWorkOrder = useAppStore((s) => s.updateWorkOrder);
  const updateAsset = useAppStore((s) => s.updateAsset);
  const asset = useAppStore((s) => s.assets.find((a) => a.id === wo.assetId));
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");

  const devolver = () => {
    if (!motivo.trim()) {
      toast.error("Descreva o motivo da devolução.");
      return;
    }
    updateWorkOrder(wo.id, {
      status: "em_execucao",
      pendenciaSupervisor: motivo.trim(),
      pendenciaEm: new Date().toISOString(),
      pendenciaResolvidaEm: undefined,
      // limpa assinatura do mecânico para forçar re-assinatura ao resolver
      assinaturaTecnico: undefined,
      assinaturaTecnicoNome: undefined,
      assinaturaTecnicoCargo: undefined,
      assinaturaTecnicoEm: undefined,
    });
    if (asset) updateAsset(asset.id, { column: "manutencao" });
    toast.success(`OS devolvida ao mecânico com pendência.`);
    setOpen(false);
    setMotivo("");
  };

  const osHref = wo.tipo === "preventiva" ? "/os/preventiva/$id" : "/os/corretiva/$id";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{wo.prefixo}</span>
          <Badge variant="outline" className="text-[10px] uppercase">{wo.tipo}</Badge>
          <Badge variant="secondary" className="text-[10px]">OS {wo.numeroSAP}</Badge>
        </div>
        <div className="text-xs text-muted-foreground">
          Concluído por {wo.assinaturaTecnicoNome ?? "—"}
          {wo.assinaturaTecnicoEm && ` · ${new Date(wo.assinaturaTecnicoEm).toLocaleString("pt-BR")}`}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="default" asChild className="tap-target gap-1">
          <Link to={osHref} params={{ id: wo.id }}>
            <ExternalLink className="h-4 w-4" /> Revisar e assinar
          </Link>
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="tap-target gap-1 border-warning/60 text-warning-foreground hover:bg-warning/10">
              <Undo2 className="h-4 w-4" /> Devolver
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Devolver OS {wo.numeroSAP} ao mecânico</DialogTitle>
            </DialogHeader>
            <div className="grid gap-2">
              <Label>Motivo / pendência a resolver</Label>
              <Textarea
                rows={4}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: refazer aperto do parafuso X, refazer teste operacional…"
              />
              <p className="text-[11px] text-muted-foreground">
                A OS volta para o mecânico com este apontamento. Ele resolve, re-assina e envia de volta.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={devolver} className="gap-1">
                <Undo2 className="h-4 w-4" /> Devolver ao mecânico
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}


function CheckEntradaRow({ inspection, label = "Check de entrada" }: { inspection: Inspection; label?: string }) {
  const asset = useAppStore((s) => s.assets.find((a) => a.id === inspection.assetId));
  const supervisorSig = useAppStore((s) => s.signatures["supervisor:global"]);
  const updateInspection = useAppStore((s) => s.updateInspection);
  const updateAssetRow = useAppStore((s) => s.updateAsset);
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [devOpen, setDevOpen] = useState(false);
  const [motivo, setMotivo] = useState("");

  const devolver = () => {
    if (!motivo.trim()) {
      toast.error("Descreva o motivo da devolução.");
      return;
    }
    const now = new Date().toISOString();
    // A inspeção volta a ficar pendente para o inspetor (perde a assinatura dele)
    updateInspection(inspection.id, { inspetorSig: undefined, inspetorSigEm: undefined });
    if (asset) {
      updateAssetRow(asset.id, {
        column: inspection.tipo === "saida" ? "aguardando_saida" : "chegada",
        reinspecaoSolicitada: true,
        chatMessages: [
          ...(asset.chatMessages ?? []),
          {
            id: crypto.randomUUID(),
            autor: profile?.nome ?? "Supervisor",
            autorCargo: "Devolução",
            texto: `↩️ ${label} devolvido ao inspetor: ${motivo.trim()}`,
            createdAt: now,
          },
        ],
        descricao: `↩️ ${inspection.prefixo}: ${label.toLowerCase()} devolvido ao inspetor — ${motivo.trim()}`,
      });
    }
    toast.success(`${inspection.prefixo} devolvido ao inspetor.`);
    setMotivo("");
    setDevOpen(false);
  };


  const abrirPdf = async () => {
    if (!asset) return;
    setLoading(true);
    try {
      const { generateInspectionPdf } = await import("@/lib/inspection-pdf");
      const { dataUrl } = await generateInspectionPdf(asset, inspection);
      const bin = atob(dataUrl.split(",")[1]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      window.open(blobUrl, "_blank");
    } catch {
      toast.error("Não foi possível gerar o PDF.");
    } finally {
      setLoading(false);
    }
  };

  const assinar = () => {
    if (!supervisorSig) {
      toast.error("Cadastre sua assinatura no topo da tela.");
      return;
    }
    updateInspection(inspection.id, { supervisorSig, supervisorSigEm: new Date().toISOString() });
    setOpen(false);
    toast.success(`${label} da ${inspection.prefixo} assinado.`);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{inspection.prefixo}</span>
          <Badge variant="outline" className="text-[10px] uppercase">{label}</Badge>
          {inspection.falhas?.length > 0 && (
            <Badge variant="destructive" className="text-[10px]">{inspection.falhas.length} falha(s)</Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          Inspetor {inspection.inspetor || "—"} · {new Date(inspection.data).toLocaleString("pt-BR")}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
      <Dialog open={devOpen} onOpenChange={setDevOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" className="gap-1">
            <Undo2 className="h-4 w-4" /> Devolver ao inspetor
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Devolver {inspection.prefixo} ao inspetor</DialogTitle>
          </DialogHeader>
          <div>
            <Label className="text-xs">Motivo da devolução</Label>
            <Textarea
              rows={4}
              className="mt-1"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: inspeção enviada incompleta / falta foto do horímetro / item sem observação…"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              O check volta para o inspetor refazer e o motivo fica registrado no chat da máquina.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDevOpen(false)}>Cancelar</Button>
            <Button variant="destructive" className="gap-1" onClick={devolver}>
              <Undo2 className="h-4 w-4" /> Confirmar devolução
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={open} onOpenChange={setOpen}>

        <DialogTrigger asChild>
          <Button size="sm" className="gap-1">
            <Eye className="h-4 w-4" /> Checar e assinar
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{label} — {inspection.prefixo}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 text-sm">
            <div className="text-xs text-muted-foreground">
              Inspetor {inspection.inspetor || "—"} · {new Date(inspection.data).toLocaleString("pt-BR")}
            </div>
            {inspection.falhas?.length > 0 && (
              <div className="rounded-md border border-destructive/40 p-2 text-xs">
                {inspection.falhas.length} falha(s) apontada(s) no check.
              </div>
            )}
            <Button variant="outline" className="gap-1" onClick={abrirPdf} disabled={loading}>
              <Eye className="h-4 w-4" /> {loading ? "Gerando PDF…" : "Abrir PDF do check"}
            </Button>
            {!supervisorSig && (
              <span className="text-[11px] text-warning-foreground">Cadastre sua assinatura no topo da tela para poder assinar.</span>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button className="gap-1" onClick={assinar} disabled={!supervisorSig}>
              <PenLine className="h-4 w-4" /> Assinar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>

  );
}

