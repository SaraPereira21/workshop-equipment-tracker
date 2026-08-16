import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Plus,
  Search,
  Sparkles,
  Tag as TagIcon,
  X,
  CheckSquare,
  Square,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAppStore } from "@/lib/store";
import { findFleetCandidates, findFleetExact, searchFleet, type FleetCandidate } from "@/lib/fleet-lookup";
import type { Asset, PendingTask, Priority } from "@/lib/types";
import { TIPOS_EQUIPAMENTO, normalizeTipo, geraPreventiva } from "@/lib/tipo-equipamento";


interface Props {
  triggerLabel?: string;
  triggerSize?: "default" | "sm" | "lg";
  triggerClassName?: string;
  navigateAfter?: boolean;
}




const URGENCIA_OPTS: { value: Priority; label: string; className: string }[] = [
  { value: "baixa", label: "Baixa", className: "bg-muted text-foreground" },
  { value: "media", label: "Média", className: "bg-info/15 text-info" },
  { value: "alta", label: "Alta", className: "bg-warning/20 text-warning-foreground" },
  { value: "critica", label: "Crítica", className: "bg-destructive/15 text-destructive" },
];

export function NovaSolicitacaoDialog({
  triggerLabel = "Nova Solicitação",
  triggerSize = "lg",
  triggerClassName = "tap-target gap-2",
  navigateAfter = false,
}: Props) {
  const assets = useAppStore((s) => s.assets);
  const upsertAsset = useAppStore((s) => s.upsertAsset);
  const updateAsset = useAppStore((s) => s.updateAsset);
  const tagCatalog = useAppStore((s) => s.tagCatalog);
  const tipoCatalog = useAppStore((s) => s.tipoCatalog);
  const addTipoCatalog = useAppStore((s) => s.addTipo);
  const addTagToCatalog = useAppStore((s) => s.addTag);
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [existingId, setExistingId] = useState<string | null>(null);

  // Form fields
  const [prefixo, setPrefixo] = useState("");
  const [tipoEquipamento, setTipoEquipamento] = useState<string>("");
  const [contrato, setContrato] = useState("");
  const [descricao, setDescricao] = useState("");
  const [urgencia, setUrgencia] = useState<Priority>("media");
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [tasks, setTasks] = useState<PendingTask[]>([]);
  const [newTask, setNewTask] = useState("");
  const [horimetro, setHorimetro] = useState("");
  const [novoTipo, setNovoTipo] = useState("");
  const [saving, setSaving] = useState(false);


  // Cadastro SAP (fleet_assets)
  const [fleet, setFleet] = useState<FleetCandidate | null>(null);
  const [fleetCands, setFleetCands] = useState<FleetCandidate[]>([]);
  const [buscandoFleet, setBuscandoFleet] = useState(false);
  const [cadastroConsultado, setCadastroConsultado] = useState(false);
  const [buscaLivre, setBuscaLivre] = useState("");
  const [buscaResultados, setBuscaResultados] = useState<FleetCandidate[]>([]);

  useEffect(() => {
    const t = buscaLivre.trim();
    if (t.length < 2) { setBuscaResultados([]); return; }
    let cancel = false;
    const id = setTimeout(() => {
      void searchFleet(t).then((r) => { if (!cancel) setBuscaResultados(r); });
    }, 300);
    return () => { cancel = true; clearTimeout(id); };
  }, [buscaLivre]);


  const tipoOptions = useMemo(
    () =>
      Array.from(
        new Set([...TIPOS_EQUIPAMENTO, ...tipoCatalog, normalizeTipo(tipoEquipamento)].filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [tipoCatalog, tipoEquipamento],
  );

  const cadastrarTipo = () => {
    const t = normalizeTipo(novoTipo);
    if (!t) return;
    addTipoCatalog(t);
    setTipoEquipamento(t);
    setNovoTipo("");
    toast.success(`Tipo "${t}" cadastrado.`);
  };


  const aplicarFleet = (c: FleetCandidate) => {
    setFleet(c);
    setFleetCands([]);
    if (c.tipo_objeto) setTipoEquipamento(normalizeTipo(c.tipo_objeto));
  };

  const buscarCadastro = async (termo: string) => {
    const p = termo.trim();
    setFleet(null);
    setFleetCands([]);
    setCadastroConsultado(false);
    if (!p) return;
    setBuscandoFleet(true);
    try {
      const exato = await findFleetExact(p);
      if (exato) {
        aplicarFleet(exato);
        return;
      }
      const cands = await findFleetCandidates(p);
      if (cands.length === 1) aplicarFleet(cands[0]);
      else setFleetCands(cands);
    } catch (err) {
      console.error(err);
      toast.error("Falha ao consultar o cadastro SAP.");
    } finally {
      setBuscandoFleet(false);
      setCadastroConsultado(true);
    }
  };

  const atualizarPrefixo = (valor: string) => {
    setPrefixo(valor.toUpperCase());
    setFleet(null);
    setFleetCands([]);
    setCadastroConsultado(false);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as Asset[];
    return assets
      .filter(
        (a) =>
          a.prefixo.toLowerCase().includes(q) ||
          a.marca.toLowerCase().includes(q) ||
          a.modelo.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [assets, query]);

  // ---- Trava anti-duplicidade -------------------------------------------
  const normKey = (v?: string | null) =>
    (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

  const findDuplicate = (pref: string): Asset | undefined => {
    const key = normKey(pref);
    const Ativo = normKey(fleet?.codigo_Ativo);
    const inv = normKey(fleet?.numero_inventario);
    return assets.find((a) => {
      if (existingId && a.id === existingId) return false;
      if (key && normKey(a.prefixo) === key) return true;
      if (Ativo && normKey(a.codigoAtivo) === Ativo) return true;
      if (inv && normKey(a.inventario) === inv) return true;
      return false;
    });
  };

  const duplicado = useMemo(
    () => (prefixo.trim() ? findDuplicate(prefixo) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assets, prefixo, fleet, existingId],
  );


  const reset = () => {
    setQuery("");
    setExistingId(null);
    setPrefixo("");
    setTipoEquipamento("");
    setContrato("");
    setDescricao("");
    setUrgencia("media");
    setTags([]);
    setNewTag("");
    setTasks([]);
    setNewTask("");
    setHorimetro("");
    setFleet(null);
    setFleetCands([]);
    setCadastroConsultado(false);
    setSaving(false);

  };


  const close = () => {
    setOpen(false);
    reset();
  };

  const selecionarExistente = (asset: Asset) => {
    setExistingId(asset.id);
    setPrefixo(asset.prefixo);
    setTipoEquipamento(asset.tipo || "");
    setContrato(asset.contrato || "");
    setDescricao(asset.descricao || "");
    setUrgencia(asset.priority || "media");
    setTags(asset.tags || []);
    setTasks(asset.pendingTasks || []);
    setQuery("");
    void buscarCadastro(asset.prefixo);
  };

  const toggleTag = (t: string) => {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const criarTag = () => {
    const t = newTag.trim();
    if (!t) return;
    addTagToCatalog(t);
    if (!tags.includes(t)) setTags((prev) => [...prev, t]);
    setNewTag("");
  };

  const addTask = () => {
    const text = newTask.trim();
    if (!text) return;
    setTasks((prev) => [
      ...prev,
      { id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text, done: false },
    ]);
    setNewTask("");
  };

  const toggleTask = (id: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  const removeTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const salvar = () => {
    if (saving) return;
    const pref = prefixo.trim().toUpperCase();
    if (!pref) {
      toast.error("Informe o nome / prefixo do equipamento.");
      return;
    }

    const dup = findDuplicate(pref);
    if (dup) {
      toast.error(
        `Já existe um card para ${dup.prefixo}. Use "Usar este card" para reaproveitar o equipamento em vez de duplicar.`,
      );
      return;
    }

    setSaving(true);
    const horNum = horimetro.trim() === "" ? undefined : Number(horimetro);

    if (existingId) {
      const existing = assets.find((a) => a.id === existingId);
      updateAsset(existingId, {
        prefixo: pref,
        column: "chegada",
        status: "em_inspecao",
        tipo: normalizeTipo(tipoEquipamento) || existing?.tipo || "Outro",
        marca: fleet?.marca || existing?.marca || "—",
        modelo: fleet?.modelo || existing?.modelo || "—",
        codigoAtivo: fleet?.codigo_Ativo ?? existing?.codigoAtivo,
        numeroSerie: fleet?.numero_serie ?? existing?.numeroSerie,
        inventario: fleet?.numero_inventario ?? existing?.inventario,
        horimetroAtual: (horNum ?? existing?.horimetroAtual) as never,
        contrato: contrato.trim() || undefined,
        descricao: descricao.trim() || undefined,
        priority: urgencia,
        tags,
        pendingTasks: tasks,
        dataEntrada: existing?.dataEntrada ?? new Date().toISOString(),
      });
      toast.success(`${pref} enviado para "Nova Solicitação".`);
    } else {
      const novo: Asset = {
        id: `a-${Date.now()}`,
        prefixo: pref,
        marca: fleet?.marca || "—",
        modelo: fleet?.modelo || "—",
        tipo: normalizeTipo(tipoEquipamento) || normalizeTipo(fleet?.tipo_objeto) || "Outro",
        codigoAtivo: fleet?.codigo_Ativo,
        numeroSerie: fleet?.numero_serie ?? undefined,
        inventario: fleet?.numero_inventario ?? undefined,
        horimetroAtual: horNum as never,
        dataUltimaPreventiva: new Date().toISOString(),
        horimetroUltimoPMP: undefined as never,
        proximoAlvoPMP: 500,
        status: "em_inspecao",
        column: "chegada",
        priority: urgencia,
        contrato: contrato.trim() || undefined,
        descricao: descricao.trim() || undefined,
        tags,
        pendingTasks: tasks,
        dataEntrada: new Date().toISOString(),
      };
      upsertAsset(novo);
      toast.success(`Nova solicitação criada para ${pref}.`);
    }


    close();
    if (navigateAfter) navigate({ to: "/planner" });
  };


  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogTrigger asChild>
        <Button size={triggerSize} className={triggerClassName}>
          <Plus className="h-5 w-5" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Nova Solicitação
          </DialogTitle>
          <DialogDescription>
            Cadastre o equipamento com tags, contrato, urgência e as manutenções que precisam ser feitas. O card entra no Planner e alimenta a OS do mecânico.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Busca existente */}
          {!existingId && (
            <div>
              <Label htmlFor="q" className="text-sm">Buscar equipamento já cadastrado</Label>
              <div className="relative mt-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="q"
                  placeholder="Prefixo, marca ou modelo…"
                  className="h-10 pl-9"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              {query && filtered.length > 0 && (
                <div className="mt-1 max-h-40 overflow-y-auto rounded-md border">
                  {filtered.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => selecionarExistente(a)}
                      className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted"
                    >
                      <div className="min-w-0">
                        <div className="font-display text-sm font-semibold">{a.prefixo}</div>
                        <div className="truncate text-xs text-muted-foreground">{a.marca} {a.modelo}</div>
                      </div>
                      <span className="text-[10px] uppercase text-primary">usar</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {existingId && (
            <div className="flex items-center justify-between rounded-md border bg-primary/5 px-3 py-2 text-xs">
              <span>Editando equipamento existente: <b>{prefixo}</b></span>
              <button
                onClick={() => { setExistingId(null); reset(); }}
                className="text-primary underline"
              >
                trocar
              </button>
            </div>
          )}

          {/* Prefixo + tipo */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="pref" className="text-sm">Nome / Prefixo *</Label>
              <Input
                id="pref"
                placeholder="Ex.: CVW 092"
                className="h-10"
                value={prefixo}
                onChange={(e) => atualizarPrefixo(e.target.value)}
                onBlur={(e) => void buscarCadastro(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void buscarCadastro(prefixo);
                  }
                }}
              />
              {buscandoFleet && (
                <p className="mt-1 text-[11px] text-muted-foreground">Buscando no cadastro SAP…</p>
              )}
              {fleet && (
                <p className="mt-1 text-[11px] text-success">
                  Cadastro: {fleet.codigo_Ativo} · {fleet.marca ?? "—"} {fleet.modelo}
                  {fleet.numero_serie ? ` · SN ${fleet.numero_serie}` : ""}
                </p>
              )}
              {!fleet && fleetCands.length > 0 && (
                <div className="mt-1 max-h-40 overflow-y-auto rounded-md border">
                  <div className="border-b bg-muted/50 px-2 py-1 text-[10px] uppercase text-muted-foreground">
                    Escolha o equipamento no cadastro
                  </div>
                  {fleetCands.map((c) => (
                    <button
                      key={c.codigo_Ativo}
                      type="button"
                      onClick={() => aplicarFleet(c)}
                      className="block w-full border-b px-2 py-1.5 text-left text-xs last:border-b-0 hover:bg-muted"
                    >
                      <b>{c.codigo_Ativo}</b> · {c.marca ?? "—"} {c.modelo}
                      {c.numero_serie ? ` · SN ${c.numero_serie}` : ""}
                    </button>
                  ))}
                </div>
              )}
              {!buscandoFleet && cadastroConsultado && !fleet && fleetCands.length === 0 && prefixo.trim() && (
                <p className="mt-1 rounded-md border border-warning bg-warning/10 px-2 py-1 text-[11px] text-warning-foreground">
                  Sem cadastro SAP para <b>{prefixo.trim()}</b> — o vínculo exige correspondência de 100% no Nº inventário
                  ou no Cód. Ativo. Pesquise abaixo ou preencha modelo/série manualmente.
                </p>
              )}
              {duplicado && (
                <div className="mt-1 rounded-md border border-destructive bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
                  Já existe um card para <b>{duplicado.prefixo}</b> — não é permitido duplicar máquina.
                  <button
                    type="button"
                    onClick={() => selecionarExistente(duplicado)}
                    className="ml-1 font-semibold underline"
                  >
                    Usar este card
                  </button>
                </div>
              )}


              {!fleet && (
                <div className="mt-2">
                  <Input
                    className="h-9"
                    placeholder="Pesquisar cadastro SAP (prefixo, Ativo, modelo, série…)"
                    value={buscaLivre}
                    onChange={(e) => setBuscaLivre(e.target.value)}
                  />
                  {buscaResultados.length > 0 && (
                    <div className="mt-1 max-h-40 overflow-y-auto rounded-md border">
                      {buscaResultados.map((c) => (
                        <button
                          key={c.codigo_Ativo}
                          type="button"
                          onClick={() => { aplicarFleet(c); setBuscaLivre(""); setCadastroConsultado(true); }}
                          className="block w-full border-b px-2 py-1.5 text-left text-xs last:border-b-0 hover:bg-muted"
                        >
                          <b>{c.codigo_Ativo}</b>
                          {c.numero_inventario ? ` · ${c.numero_inventario}` : ""} · {c.marca ?? "—"} {c.modelo}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>

            <div>
              <Label htmlFor="tipo" className="text-sm">Tipo de equipamento</Label>
              <Select value={tipoEquipamento} onValueChange={setTipoEquipamento}>
                <SelectTrigger id="tipo" className="h-10">
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {tipoOptions.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="mt-2 flex gap-2">
                <Input
                  className="h-9"
                  placeholder="Cadastrar novo tipo (ex.: Implemento)"
                  value={novoTipo}
                  onChange={(e) => setNovoTipo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); cadastrarTipo(); }
                  }}
                />
                <Button type="button" variant="outline" size="sm" className="h-9 shrink-0 gap-1" onClick={cadastrarTipo}>
                  <Plus className="h-4 w-4" /> Tipo
                </Button>
              </div>
              {tipoEquipamento && !geraPreventiva(tipoEquipamento) && (
                <p className="mt-1 text-xs text-warning-foreground">
                  Este tipo não gera preventiva — apenas corretiva.
                </p>
              )}
            </div>
          </div>

          {/* Contrato + urgência */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="contrato" className="text-sm">Contrato / Obra</Label>
              <Input
                id="contrato"
                placeholder="Ex.: CT-2024-018"
                className="h-10"
                value={contrato}
                onChange={(e) => setContrato(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-sm">Nível de urgência</Label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {URGENCIA_OPTS.map((u) => (
                  <button
                    key={u.value}
                    type="button"
                    onClick={() => setUrgencia(u.value)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                      urgencia === u.value
                        ? `${u.className} border-current`
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {u.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Horímetro (opcional) */}
          <div className="sm:w-1/2">
            <Label htmlFor="hor" className="text-sm">Horímetro (opcional)</Label>
            <Input
              id="hor"
              inputMode="numeric"
              placeholder="Deixe em branco se não souber"
              className="h-10"
              value={horimetro}
              onChange={(e) => setHorimetro(e.target.value.replace(/[^\d]/g, ""))}
            />
          </div>



          {/* Descrição */}
          <div>
            <Label htmlFor="desc" className="flex items-center gap-1.5 text-sm">
              <FileText className="h-3.5 w-3.5" /> Informações relevantes
            </Label>
            <Textarea
              id="desc"
              placeholder="Contexto da chegada, sintomas, quem trouxe, etc."
              className="min-h-[70px]"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>

          {/* Tags */}
          <div>
            <Label className="flex items-center gap-1.5 text-sm">
              <TagIcon className="h-3.5 w-3.5" /> Tags
            </Label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {tagCatalog.map((t) => {
                const active = tags.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTag(t)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition ${
                      active
                        ? "border-primary bg-primary/15 text-primary font-medium"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                placeholder="Criar nova tag…"
                className="h-9"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); criarTag(); }
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={criarTag} className="gap-1">
                <Plus className="h-3.5 w-3.5" /> Tag
              </Button>
            </div>
          </div>

          {/* Manutenções / Tasks */}
          <div>
            <Label className="flex items-center gap-1.5 text-sm">
              <CheckSquare className="h-3.5 w-3.5" /> Manutenções a executar
            </Label>
            <p className="text-[11px] text-muted-foreground">
              Cada item vira uma operação na OS do mecânico.
            </p>
            <div className="mt-2 flex gap-2">
              <Input
                placeholder="Ex.: Trocar filtro hidráulico"
                className="h-9"
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addTask(); }
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={addTask} className="gap-1">
                <Plus className="h-3.5 w-3.5" /> Item
              </Button>
            </div>
            {tasks.length > 0 && (
              <ul className="mt-2 divide-y rounded-md border">
                {tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => toggleTask(t.id)}
                      className="text-primary"
                      aria-label="toggle"
                    >
                      {t.done ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                    </button>
                    <span className={`flex-1 text-sm ${t.done ? "line-through text-muted-foreground" : ""}`}>
                      {t.text}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeTask(t.id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="remover"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={close}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving || !!duplicado} className="gap-2">
            <Plus className="h-4 w-4" /> {duplicado ? "Equipamento já cadastrado" : "Criar solicitação"}
          </Button>

        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
