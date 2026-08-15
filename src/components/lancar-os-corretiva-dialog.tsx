import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, Copy, PackagePlus, Plus, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAppStore } from "@/lib/store";
import { useAuth } from "@/hooks/use-auth";
import { canEditCards } from "@/lib/can-edit-card";
import { mesclarTarefasDaInspecao } from "@/lib/tarefas-inspecao";
import { AssetDataGrid } from "@/components/asset-data-grid";
import { MaterialSapPicker } from "@/components/material-sap-picker";


import { cn } from "@/lib/utils";

import type {
  Asset,
  KanbanColumn,
  WorkOrderMaterial,
  WorkOrderOperation,
} from "@/lib/types";

/** Colunas em que a máquina ainda não entrou no fluxo de manutenção. */
const COLUNAS_INICIAIS: KanbanColumn[] = ["chegada", "pcm", "triagem", "aguardando_pcm"];

/**
 * Permite que PCM/Admin/Supervisor lancem a OS corretiva do SAP em qualquer
 * máquina — inclusive nas que nunca passaram pela fila de inspeção — gerando
 * a Ordem de Serviço para o mecânico executar.
 */
export function LancarOsCorretivaDialog({
  asset,
  size = "sm",
  variant = "outline",
  label,
}: {
  asset: Asset;
  size?: "sm" | "default" | "lg";
  variant?: "outline" | "default" | "secondary";
  label?: string;
}) {
  const navigate = useNavigate();
  const { roles } = useAuth();
  const updateAsset = useAppStore((s) => s.updateAsset);
  const addWorkOrder = useAppStore((s) => s.addWorkOrder);
  const updateWorkOrder = useAppStore((s) => s.updateWorkOrder);
  const inspections = useAppStore((s) => s.inspections);
  const existente = useAppStore((s) =>
    s.workOrders.find((w) => w.assetId === asset.id && w.tipo === "corretiva"),
  );

  const [open, setOpen] = useState(false);
  const [numero, setNumero] = useState(asset.sapOsCorretiva ?? existente?.numeroSAP ?? "");
  const [obs, setObs] = useState(asset.pcmObs ?? "");
  const [temPrev, setTemPrev] = useState<boolean>(asset.temPreventiva ?? false);
  const [materiais, setMateriais] = useState<WorkOrderMaterial[]>(existente?.materiais ?? []);
  const [operacoes, setOperacoes] = useState<WorkOrderOperation[]>(existente?.operations ?? []);

  // Ao abrir, sincroniza com a OS existente (evita editar dados desatualizados).
  useEffect(() => {
    if (open) {
      setMateriais(existente?.materiais ?? []);
      setOperacoes(existente?.operations ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existente?.id]);

  const addMaterial = () =>
    setMateriais((m) => [
      ...m,
      { id: crypto.randomUUID(), codigoOTM: "", descricao: "", quantidade: 1, reserva: "" },
    ]);
  const patchMaterial = (i: number, p: Partial<WorkOrderMaterial>) =>
    setMateriais((m) => m.map((x, idx) => (idx === i ? { ...x, ...p } : x)));
  const removeMaterial = (id: string) => setMateriais((m) => m.filter((x) => x.id !== id));

  const addOperacao = () =>
    setOperacoes((o) => [
      ...o,
      { id: crypto.randomUUID(), problema: "", causa: "", solucao: "", corrigido: false },
    ]);
  const patchOperacao = (i: number, p: Partial<WorkOrderOperation>) =>
    setOperacoes((o) => o.map((x, idx) => (idx === i ? { ...x, ...p } : x)));
  const removeOperacao = (id: string) => setOperacoes((o) => o.filter((x) => x.id !== id));



  const inspecao = useMemo(
    () =>
      inspections
        .filter((i) => i.assetId === asset.id || i.prefixo === asset.prefixo)
        .sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""))[0],
    [asset.id, asset.prefixo, inspections],
  );

  /** Apontamentos detalhados do checklist (R e AR) com a observação do inspetor. */
  const apontamentos = useMemo(() => {
    const itens = (inspecao?.items ?? []).filter((i) => i.status === "R" || i.status === "AR");
    return itens.map((i) => ({
      chave: `item-${i.id}`,
      titulo: `${i.status === "R" ? "[Reprovado]" : "[Ressalva]"} #${i.id} — ${i.group} — ${i.description}`,
      observacao: i.observation?.trim() || "",
      fotos: i.photos?.length ?? 0,
      status: i.status,
    }));
  }, [inspecao]);

  const falhas = useMemo(() => {
    const detalhadas = apontamentos.map((a) =>
      a.observacao ? `${a.titulo} — ${a.observacao}` : a.titulo,
    );
    const doChecklist = detalhadas.length > 0 ? detalhadas : (inspecao?.falhas ?? []);
    const tarefas = (asset.pendingTasks ?? []).filter((t) => !t.done).map((t) => t.text);
    return Array.from(new Set([...doChecklist, ...tarefas]));
  }, [apontamentos, asset.pendingTasks, inspecao]);

  const textoSap = useMemo(
    () =>
      [
        `Equipamento: ${asset.prefixo} — ${asset.marca ?? ""} ${asset.modelo ?? ""}`.trim(),
        inspecao?.inspetor ? `Inspetor: ${inspecao.inspetor}` : "",
        inspecao?.horimetro ? `Horímetro: ${inspecao.horimetro}h` : "",
        "",
        ...falhas.map((f, i) => `${i + 1}. ${f}`),
        inspecao?.observacoesGerais ? `\nObs. do inspetor: ${inspecao.observacoesGerais}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    [asset.marca, asset.modelo, asset.prefixo, falhas, inspecao],
  );

  if (!canEditCards(roles)) return null;

  const salvar = (abrirOs: boolean) => {
    const num = numero.trim();
    if (!num) {
      // Sem número de OS ainda: permite ao menos marcar/desmarcar a preventiva
      if (temPrev !== (asset.temPreventiva ?? false)) {
        updateAsset(asset.id, { temPreventiva: temPrev });
        toast.success(
          temPrev
            ? `${asset.prefixo} marcada para verificar preventiva.`
            : `${asset.prefixo} desmarcada da fila de preventiva.`,
        );
        setOpen(false);
        return;
      }
      toast.error("Informe o número da OS corretiva do SAP.");
      return;
    }

    const herdadas = falhas.map((descricao) => ({ descricao, corrigido: false }));
    let osId = existente?.id ?? "";

    if (existente) {
      const existentes = existente.falhasHerdadas ?? [];
      const jaTem = new Set(existentes.map((f) => f.descricao));
      updateWorkOrder(existente.id, {
        numeroSAP: num,
        observacoes: obs,
        materiais,
        operations: operacoes,
        falhasHerdadas: [...existentes, ...herdadas.filter((h) => !jaTem.has(h.descricao))],
      });
    } else {
      osId = `wo-corr-${asset.id}-${Date.now()}`;
      addWorkOrder({
        id: osId,
        numeroSAP: num,
        tipo: "corretiva",
        assetId: asset.id,
        prefixo: asset.prefixo,
        filial: "Matriz",
        solicitante: "PCM",
        setorExecutante: "Manutenção",
        centroCusto: "",
        tiposManutencao: ["Corretiva"],
        operations: operacoes,
        falhasHerdadas: herdadas,
        materiais,
        executores: [],
        observacoes: obs,
        status: "aberta",
        createdAt: new Date().toISOString(),
      });
    }

    const moverParaMdo = COLUNAS_INICIAIS.includes(asset.column);
    updateAsset(asset.id, {
      sapOsCorretiva: num,
      corretivaLiberada: true,
      temPreventiva: temPrev,
      pcmObs: obs,
      pcmDecididoEm: new Date().toISOString(),
      pendingTasks: mesclarTarefasDaInspecao(inspecao?.items ?? [], asset.pendingTasks ?? []),
      ...(moverParaMdo
        ? { column: "mdo" as KanbanColumn, status: "em_manutencao" as const }
        : {}),
    });


    toast.success(
      moverParaMdo
        ? `OS ${num} lançada. ${asset.prefixo} foi para Aguardando MO.`
        : `OS ${num} lançada em ${asset.prefixo}.`,
    );
    setOpen(false);
    if (abrirOs && osId) navigate({ to: "/os/corretiva/$id", params: { id: osId } });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={size} variant={variant} className="tap-target shrink-0 gap-1">
          <Wrench className="h-4 w-4" />
          {label ?? (asset.sapOsCorretiva ? "Editar OS corretiva" : "Lançar OS corretiva")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>OS Corretiva — {asset.prefixo}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <AssetDataGrid asset={asset} />


          <div className="grid gap-1">
            <Label>Número da OS no SAP *</Label>
            <Input
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="Ex.: 200141650"
              inputMode="numeric"
            />
          </div>
          <div className="grid gap-1">
            <Label>Observações para o mecânico</Label>
            <Textarea
              rows={3}
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Serviço a executar, prioridade, cuidados…"
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md border bg-card p-3">
            <div>
              <div className="text-sm font-semibold">
                Deixar na fila do PCM para verificar preventiva?
              </div>
              <div className="text-xs text-muted-foreground">
                Alvo atual: {asset.proximoAlvoPMP}h · Último PMP: {asset.horimetroUltimoPMP}h
              </div>
            </div>
            <Switch checked={temPrev} onCheckedChange={setTemPrev} />
          </div>


          {inspecao?.observacoesGerais && (
            <div className="rounded-md border bg-muted/30 p-2 text-xs">
              <div className="mb-1 font-semibold">Observações gerais do inspetor</div>
              <p className="whitespace-pre-line text-muted-foreground">
                {inspecao.observacoesGerais}
              </p>
            </div>
          )}

          {apontamentos.length > 0 && (
            <div className="rounded-md border bg-muted/30 p-2 text-xs">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-semibold">
                  Apontamentos do checklist ({apontamentos.length})
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-[11px]"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(textoSap);
                      toast.success("Apontamentos copiados para colar no SAP.");
                    } catch {
                      toast.error("Não foi possível copiar. Selecione o texto manualmente.");
                    }
                  }}
                >
                  <Copy className="h-3.5 w-3.5" /> Copiar para o SAP
                </Button>
              </div>
              <ul className="grid max-h-64 gap-1.5 overflow-y-auto pr-1">
                {apontamentos.map((a) => (
                  <li key={a.chave} className="rounded border bg-background p-1.5">
                    <div
                      className={
                        a.status === "R" ? "font-medium text-destructive" : "font-medium"
                      }
                    >
                      {a.titulo}
                    </div>
                    {a.observacao && (
                      <div className="mt-0.5 whitespace-pre-line text-muted-foreground">
                        {a.observacao}
                      </div>
                    )}
                    {a.fotos > 0 && (
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {a.fotos} foto(s) anexada(s) na inspeção
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {falhas.length > 0 && (
            <div className="rounded-md border bg-muted/30 p-2 text-xs">
              <div className="mb-1 font-semibold">
                Serão herdadas para a OS ({falhas.length})
              </div>
              <ul className="grid max-h-48 gap-0.5 overflow-y-auto pr-1 text-muted-foreground">
                {falhas.map((f, i) => (
                  <li key={i}>• {f}</li>
                ))}
              </ul>
            </div>
          )}
          {/* Material requisitado — gerenciado pelo PCM */}
          <div className="rounded-md border bg-card p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold">
                Material requisitado ({materiais.length})
                {materiais.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {materiais.filter((m) => m.liberado).length} liberado(s) no almox
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <MaterialSapPicker
                  onSelect={(m) =>
                    setMateriais((atual) => [
                      ...atual,
                      {
                        id: crypto.randomUUID(),
                        codigoOTM: m.codigo,
                        descricao: m.descricao,
                        quantidade: 1,
                        reserva: "",
                      },
                    ])
                  }
                />
                <Button type="button" size="sm" variant="outline" className="gap-1" onClick={addMaterial}>
                  <Plus className="h-4 w-4" /> Item
                </Button>
              </div>
            </div>
            {materiais.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhum material requisitado.</p>
            )}
            <div className="grid gap-2">
              {materiais.map((m, i) => (
                <div key={m.id} className="grid gap-2 rounded-md border p-2">
                  <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_4.5rem_minmax(0,1fr)]">
                    <Input
                      className="h-10"
                      placeholder="Código OTM"
                      value={m.codigoOTM}
                      onChange={(e) => patchMaterial(i, { codigoOTM: e.target.value })}
                    />
                    <Input
                      className="h-10"
                      placeholder="Descrição do material"
                      value={m.descricao}
                      onChange={(e) => patchMaterial(i, { descricao: e.target.value })}
                    />
                    <Input
                      className="h-10"
                      type="number"
                      min={0}
                      value={m.quantidade}
                      onChange={(e) => patchMaterial(i, { quantidade: Number(e.target.value) })}
                    />
                    <Input
                      className="h-10"
                      placeholder="Nº da reserva"
                      value={m.reserva ?? ""}
                      onChange={(e) => patchMaterial(i, { reserva: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className={cn(
                        "gap-2 font-semibold",
                        m.liberado
                          ? "bg-success text-success-foreground hover:bg-success/90"
                          : "bg-warning text-warning-foreground hover:bg-warning/90",
                      )}
                      onClick={() =>
                        patchMaterial(i, {
                          liberado: !m.liberado,
                          liberadoEm: !m.liberado ? new Date().toISOString() : undefined,
                        })
                      }
                    >
                      {m.liberado ? <Check className="h-4 w-4" /> : <PackagePlus className="h-4 w-4" />}
                      {m.liberado ? "Liberado para retirar no almox" : "Aguardando liberação do almox"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="ml-auto text-destructive"
                      onClick={() => removeMaterial(m.id)}
                    >
                      <Trash2 className="mr-1 h-4 w-4" /> Remover
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Operações da OS */}
          <div className="rounded-md border bg-card p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold">Operações ({operacoes.length})</div>
              <Button type="button" size="sm" variant="outline" className="gap-1" onClick={addOperacao}>
                <Plus className="h-4 w-4" /> Operação
              </Button>
            </div>
            {operacoes.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nenhuma operação lançada. Descreva problema, causa e solução prevista.
              </p>
            )}
            <div className="grid gap-2">
              {operacoes.map((o, i) => (
                <div key={o.id} className="grid gap-2 rounded-md border p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">
                      Operação {i + 1}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => removeOperacao(o.id)}
                    >
                      <Trash2 className="mr-1 h-4 w-4" /> Remover
                    </Button>
                  </div>
                  <div className="grid gap-2 md:grid-cols-3">
                    <Textarea
                      rows={2}
                      placeholder="Problema"
                      value={o.problema}
                      onChange={(e) => patchOperacao(i, { problema: e.target.value })}
                    />
                    <Textarea
                      rows={2}
                      placeholder="Causa"
                      value={o.causa}
                      onChange={(e) => patchOperacao(i, { causa: e.target.value })}
                    />
                    <Textarea
                      rows={2}
                      placeholder="Solução"
                      value={o.solucao}
                      onChange={(e) => patchOperacao(i, { solucao: e.target.value })}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">

            A OS fica disponível para o supervisor alocar o manutentor e para o mecânico executar.
            A preventiva continua só aparecendo depois da liberação do PCM.
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => salvar(false)}>
            Salvar
          </Button>
          <Button onClick={() => salvar(true)} className="gap-1">
            <Wrench className="h-4 w-4" /> Salvar e abrir OS
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
