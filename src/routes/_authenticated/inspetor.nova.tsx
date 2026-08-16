import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Fuel, Save, Send, ExternalLink, ListPlus } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { CHECKLIST_GROUPS, createEmptyChecklist, mergeChecklist, PARTS_APP_URL } from "@/lib/checklist-items";
import { ChecklistItemRow } from "@/components/checklist-item-row";
import { InspectionPhotoField } from "@/components/inspection-photo-field";
import { FOTOS_EQUIPAMENTO } from "@/lib/fotos-equipamento";

import { useAppStore } from "@/lib/store";
import { useAuth } from "@/hooks/use-auth";
import type { ChecklistItem, Inspection } from "@/lib/types";
import { findFleetCandidates, findFleetExact, type FleetCandidate } from "@/lib/fleet-lookup";
import { mesclarTarefasDaInspecao } from "@/lib/tarefas-inspecao";
import { useAutosave, textoAutosave } from "@/hooks/use-autosave";

import { SignaturePad } from "@/components/signature-pad";

export const Route = createFileRoute("/_authenticated/inspetor/nova")({
  validateSearch: (search: Record<string, unknown>) => ({
    prefixo: typeof search.prefixo === "string" ? search.prefixo : "",
  }),
  head: () => ({
    meta: [{ title: "Nova Inspeção" }, { name: "description", content: "Checklist técnico de 120 itens." }],
  }),
  component: NovaInspecao,
});

function NovaInspecao() {
  const navigate = useNavigate();
  const { prefixo: prefixoParam } = Route.useSearch();
  const { profile, roles } = useAuth();
  const souInspetor = roles.includes("inspetor");
  // Somente quem tem a função INSPETOR (ou admin) executa/assina inspeções.
  // PCM, supervisor e gerência continuam navegando pelas telas em modo leitura.
  const podeInspecionar = souInspetor || roles.includes("admin");

  const meuId = profile?.id ?? "";
  const meuNome = profile?.nome ?? "Inspetor";
  const addInspection = useAppStore((s) => s.addInspection);
  const updateAsset = useAppStore((s) => s.updateAsset);
  const updateWorkOrder = useAppStore((s) => s.updateWorkOrder);
  const upsertAsset = useAppStore((s) => s.upsertAsset);
  const assets = useAppStore((s) => s.assets);
  const inspections = useAppStore((s) => s.inspections);


  const [header, setHeader] = useState({
    prefixo: "",
    marca: "",
    modelo: "",
    tipoObjeto: "",
    inventario: "",
    serie: "",
    codigoAtivo: "",
    horimetro: "",
    horimetroUltimoPMP: "",
    proximoAlvoPMP: "500",
  });
  const [cadastroStatus, setCadastroStatus] = useState<"idle" | "buscando" | "encontrado" | "nao_encontrado">("idle");
  const [candidatos, setCandidatos] = useState<FleetCandidate[]>([]);
  const inspetorSig = useAppStore((s) => s.signatures["inspetor:global"]);

  const aplicarCadastro = (p: string, data: FleetCandidate) => {
    setHeader((h) => ({
      ...h,
      prefixo: p,
      marca: data.marca ?? h.marca,
      modelo: data.modelo ?? h.modelo,
      tipoObjeto: data.tipo_objeto ?? h.tipoObjeto,
      inventario: data.numero_inventario ?? h.inventario,
      serie: data.numero_serie ?? h.serie,
      codigoAtivo: data.codigo_Ativo,
    }));
    setCandidatos([]);
    setCadastroStatus("encontrado");
  };

  // Busca no cadastro (fleet_assets) por prefixo/Ativo/inventário/série,
  // com fallback pelo número do prefixo (ex.: CVW 092 -> CM00092).
  const lookupCadastro = async (prefixo: string) => {
    const p = prefixo.trim().toUpperCase();
    if (!p) return;
    setCadastroStatus("buscando");
    setCandidatos([]);
    const exato = await findFleetExact(p);
    if (exato) {
      aplicarCadastro(p, exato);
      toast.success(`Cadastro SAP encontrado: ${exato.codigo_Ativo}`);
      return;
    }
    const cands = await findFleetCandidates(p);
    if (cands.length === 1) {
      aplicarCadastro(p, cands[0]);
      toast.success(`Cadastro SAP vinculado: ${cands[0].codigo_Ativo}`);
      return;
    }
    if (cands.length > 1) {
      setCandidatos(cands);
      setCadastroStatus("idle");
      toast.info(`${cands.length} equipamentos do SAP com o número ${p}. Selecione o correto.`);
      return;
    }
    // fallback local (equipamentos criados manualmente na demo)
    const existing = assets.find((a) => a.prefixo === p);
    if (existing) {
      setHeader((h) => ({
        ...h,
        prefixo: p,
        marca: existing.marca !== "—" ? existing.marca : h.marca,
        modelo: existing.modelo !== "—" ? existing.modelo : h.modelo,
        horimetroUltimoPMP: existing.horimetroUltimoPMP ? String(existing.horimetroUltimoPMP) : h.horimetroUltimoPMP,
      }));
      setCadastroStatus("encontrado");
    } else {
      setCadastroStatus("nao_encontrado");
      toast.warning(`Prefixo ${p} não está no cadastro SAP. PCM será notificado para providenciar.`);
    }
  };

  // Prefill from ?prefixo= (vindo do card "Nova Solicitação" do Frota)
  useEffect(() => {
    if (!prefixoParam) return;
    lookupCadastro(prefixoParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefixoParam]);

  // Trava a máquina apenas para quem tem o cargo de inspetor
  useEffect(() => {
    if (!prefixoParam || !meuId || !souInspetor) return;
    const asset = assets.find((a) => a.prefixo === prefixoParam.toUpperCase());
    if (!asset) return;
    if (asset.inspetorLockId && asset.inspetorLockId !== meuId) {
      toast.error(`${asset.prefixo} já está em inspeção por ${asset.inspetorLockNome}.`);
      navigate({ to: "/inspetor" });
      return;
    }
    if (!asset.inspetorLockId) {
      updateAsset(asset.id, {
        inspetorLockId: meuId,
        inspetorLockNome: meuNome,
        inspetorLockEm: new Date().toISOString(),
      });
      toast.success(`Inspeção reservada para ${meuNome}.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefixoParam, meuId, souInspetor, assets.length]);

  const [combustivel, setCombustivel] = useState(60);
  const [fotoChassi, setFotoChassi] = useState<string | undefined>(undefined);
  const [fotoHorimetro, setFotoHorimetro] = useState<string | undefined>(undefined);
  const [fotosEquip, setFotosEquip] = useState<Record<string, string>>({});
  const [items, setItems] = useState<ChecklistItem[]>(() => createEmptyChecklist());
  const [obsGerais, setObsGerais] = useState("");
  const [draftLoadedAssetId, setDraftLoadedAssetId] = useState<string | null>(null);

  const assetAtual = assets.find((a) => a.prefixo === (prefixoParam || header.prefixo || "").toUpperCase());
  const posManutencao = assetAtual?.column === "aguardando_saida";
  const preselectSaida = !!prefixoParam && posManutencao;
  const [tiposSel, setTiposSel] = useState<{ entrada: boolean; saida: boolean }>({ entrada: false, saida: preselectSaida });
  const tipo: "entrada" | "saida" = posManutencao || tiposSel.saida ? "saida" : "entrada";
  const ambos = tiposSel.entrada && tiposSel.saida;
  const [decisao, setDecisao] = useState<"aprovado" | "corretiva" | null>(null);

  // Equipamento liberado pela manutenção: inspeção é sempre de SAÍDA (pré-setada e travada)
  useEffect(() => {
    if (posManutencao) setTiposSel((atual) => ({ entrada: atual.entrada, saida: true }));
  }, [posManutencao]);

  useEffect(() => {
    if (!assetAtual || draftLoadedAssetId === assetAtual.id) return;
    const draft = assetAtual.inspectionDraft;
    if (draft) {
      setHeader((h) => ({ ...h, ...(draft.header ?? {}), prefixo: assetAtual.prefixo }));
      setCombustivel(draft.combustivel);
      setFotoChassi(draft.fotoChassi);
      setFotoHorimetro(draft.fotoHorimetro);
      setFotosEquip(draft.fotosEquipamento ?? {});
      setItems(mergeChecklist(draft.items));
      setObsGerais(draft.observacoesGerais ?? "");
      setDecisao(draft.decisao ?? null);
      setTiposSel({ entrada: draft.tipo === "entrada" || !!draft.tipoEntradaSaida, saida: draft.tipo === "saida" || !!draft.tipoEntradaSaida });
      setDraftLoadedAssetId(assetAtual.id);
      toast.info("Rascunho da inspeção carregado.");
      return;
    }
    // Sem rascunho: recupera a última inspeção enviada deste ativo (devolução do supervisor/PCM)
    const anterior = inspections
      .filter((i) => i.assetId === assetAtual.id || i.prefixo === assetAtual.prefixo)
      .sort((a, b) => (a.data < b.data ? 1 : -1))[0];
    if (!anterior) return;
    setCombustivel(anterior.combustivel ?? 60);
    setFotoChassi(anterior.fotoChassi);
    setFotoHorimetro(anterior.fotoHorimetro);
    setFotosEquip(anterior.fotosEquipamento ?? {});
    setItems(mergeChecklist(anterior.items));
    setObsGerais(anterior.observacoesGerais ?? "");
    setHeader((h) => ({ ...h, prefixo: assetAtual.prefixo, horimetro: anterior.horimetro ? String(anterior.horimetro) : h.horimetro }));
    setTiposSel({ entrada: anterior.tipo === "entrada" || !!anterior.tipoEntradaSaida, saida: anterior.tipo === "saida" || !!anterior.tipoEntradaSaida });
    setDraftLoadedAssetId(assetAtual.id);
    toast.info("Inspeção anterior restaurada — ajuste apenas o que faltava.");
  }, [assetAtual, draftLoadedAssetId, inspections]);




  const stats = useMemo(() => {
    const filled = items.filter((i) => i.status !== null).length;
    const falhas = items.filter((i) => i.status === "R").length;
    const restr = items.filter((i) => i.status === "AR").length;
    return { filled, total: items.length, falhas, restr };
  }, [items]);

  const horimetroNum = Number(header.horimetro || "0");
  const classificacao = horimetroNum < 40 ? "novo" : "frota";

  const patchItem = (id: number, patch: Partial<ChecklistItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  // Comparação de prefixo à prova de espaços/acentuação — evita cards duplicados
  const normPrefixo = (p?: string) =>
    (p ?? "").trim().toUpperCase().replace(/\s+/g, " ");

  const saveDraft = (silencioso = false) => {
    const prefixo = normPrefixo(header.prefixo || prefixoParam);
    if (!prefixo) {
      if (!silencioso) toast.error("Informe o prefixo para salvar o rascunho.");
      return;
    }
    const existing = assets.find((a) => normPrefixo(a.prefixo) === prefixo);
    const assetId = existing?.id ?? `a-${Date.now()}`;
    const draft = {
      tipo,
      tipoEntradaSaida: ambos,
      inspetorId: meuId,
      inspetorNome: meuNome,
      updatedAt: new Date().toISOString(),
      header: { ...header, prefixo },
      combustivel,
      fotoChassi,
      fotoHorimetro,
      fotosEquipamento: fotosEquip,
      items,
      observacoesGerais: obsGerais,
      decisao,
    };
    // Fotos ainda não enviadas (data:) não vão para o banco — o rascunho ficaria
    // com vários MB e derrubaria o carregamento do planner.
    const draftLeve = JSON.parse(
      JSON.stringify(draft, (_k, v) => (typeof v === "string" && v.startsWith("data:") ? "" : v)),
    );
    if (existing) {
      updateAsset(assetId, {
        inspectionDraft: draftLeve,

        inspetorLockId: souInspetor ? meuId || existing.inspetorLockId : existing.inspetorLockId,
        inspetorLockNome: souInspetor ? meuNome || existing.inspetorLockNome : existing.inspetorLockNome,
        inspetorLockEm: souInspetor ? new Date().toISOString() : existing.inspetorLockEm,
        horimetroAtual: horimetroNum || existing.horimetroAtual,
        hasFotos: items.some((i) => (i.photos?.length ?? 0) > 0) || !!fotoChassi || !!fotoHorimetro,
      });
    } else {
      upsertAsset({
        id: assetId,
        prefixo,
        marca: header.marca || "—",
        modelo: header.modelo || "—",
        tipo: header.tipoObjeto || "Equipamento",
        horimetroAtual: horimetroNum,
        dataUltimaPreventiva: new Date().toISOString(),
        horimetroUltimoPMP: Number(header.horimetroUltimoPMP || "0"),
        proximoAlvoPMP: Number(header.proximoAlvoPMP) as 100 | 250 | 500 | 1000 | 2000 | 4000,
        status: "em_inspecao",
        column: "chegada",
        priority: stats.falhas > 3 ? "alta" : "media",
        hasFotos: items.some((i) => (i.photos?.length ?? 0) > 0) || !!fotoChassi || !!fotoHorimetro,
        inspetorLockId: souInspetor ? meuId : undefined,
        inspetorLockNome: souInspetor ? meuNome : undefined,
        inspetorLockEm: souInspetor ? new Date().toISOString() : undefined,
        inspectionDraft: draftLeve,
      });
    }
    if (!silencioso) toast.success("Rascunho da inspeção salvo.");
  };

  // Salvamento automático do rascunho — o inspetor não perde o que digitou.
  const { salvoEm, pendente } = useAutosave(
    { header, combustivel, fotoChassi, fotoHorimetro, fotosEquip, items, obsGerais, decisao, tiposSel },
    () => saveDraft(true),
    { delay: 2000, enabled: podeInspecionar },
  );

  const handleSubmit = () => {
    if (!podeInspecionar) {
      toast.error("Apenas usuários cadastrados com a função Inspetor podem enviar inspeções.");
      return;
    }

    if (!header.prefixo || !header.horimetro) {
      toast.error("Preencha ao menos prefixo e horímetro.");
      return;
    }
    if (!tiposSel.entrada && !tiposSel.saida) {
      toast.error("Marque se a inspeção é de ENTRADA, SAÍDA ou ambas antes de finalizar.");
      return;
    }
    if (!fotoChassi || !fotoHorimetro) {
      toast.error(
        !fotoChassi && !fotoHorimetro
          ? "Anexe a foto da plaqueta do chassi e a foto do horímetro antes de enviar."
          : !fotoChassi
            ? "Anexe a foto da plaqueta do chassi antes de enviar."
            : "Anexe a foto do horímetro antes de enviar.",
      );
      return;
    }
    if (tipo === "saida" && !decisao) {
      toast.error("Antes de enviar, escolha: 'Aprovado' ou 'Encaminhar para corretiva'.");
      return;
    }
    if (!inspetorSig) {
      toast.error("Cadastre e aplique sua assinatura padrão de inspetor antes de enviar a inspeção.");
      return;
    }


    const prefixoFinal = normPrefixo(header.prefixo);
    // Find or create asset (trava de duplicidade por prefixo normalizado)
    const existing = assets.find((a) => normPrefixo(a.prefixo) === prefixoFinal);
    const assetId = existing?.id ?? `a-${Date.now()}`;

    const faltaCadastro = cadastroStatus === "nao_encontrado";
    const baseAsset = existing ?? {
      id: assetId,
      prefixo: prefixoFinal,
      marca: header.marca || "—",
      modelo: header.modelo || "—",
      tipo: header.tipoObjeto || "Equipamento",
      inventario: header.inventario || undefined,
      codigoAtivo: header.codigoAtivo || undefined,
      numeroSerie: header.serie || undefined,
      horimetroAtual: horimetroNum,
      dataUltimaPreventiva: new Date().toISOString(),
      horimetroUltimoPMP: Number(header.horimetroUltimoPMP || "0"),
      proximoAlvoPMP: Number(header.proximoAlvoPMP) as 100 | 250 | 500 | 1000 | 2000 | 4000,
      status: "em_inspecao" as const,
      column: tipo === "entrada" ? "pcm" : "aguardando_saida",
      priority: stats.falhas > 3 ? "alta" as const : "media" as const,
      faltaDocPCM: faltaCadastro || undefined,
      descricao: faltaCadastro ? `⚠ Prefixo ${prefixoFinal} sem cadastro SAP — PCM providenciar.` : undefined,
    };
    const assetComDados = {
      ...baseAsset,
      prefixo: prefixoFinal,
      marca: header.marca || baseAsset.marca || "—",
      modelo: header.modelo || baseAsset.modelo || "—",
      tipo: header.tipoObjeto || baseAsset.tipo || "Equipamento",
      inventario: header.inventario || baseAsset.inventario,
      codigoAtivo: header.codigoAtivo || baseAsset.codigoAtivo,
      numeroSerie: header.serie || baseAsset.numeroSerie,
      horimetroAtual: horimetroNum,
      horimetroUltimoPMP: Number(header.horimetroUltimoPMP || baseAsset.horimetroUltimoPMP || "0"),
      proximoAlvoPMP: Number(header.proximoAlvoPMP) as 100 | 250 | 500 | 1000 | 2000 | 4000,
      hasFotos: items.some((i) => (i.photos?.length ?? 0) > 0) || !!fotoChassi || !!fotoHorimetro,
      faltaDocPCM: faltaCadastro ? true : baseAsset.faltaDocPCM,
      // Apontamentos do checklist viram tarefas do card (visão dos gestores)
      pendingTasks: mesclarTarefasDaInspecao(items, baseAsset.pendingTasks ?? []),
      inspectionDraft: undefined,

    };

    const inspection: Inspection = {
      id: `insp-${Date.now()}`,
      assetId,
      prefixo: prefixoFinal,
      tipo,
      tipoEntradaSaida: ambos,
      inspetor: meuNome,
      data: new Date().toISOString(),
      horimetro: horimetroNum,
      combustivel,
      items,
      fotoChassi,
      fotoHorimetro,
      fotosEquipamento: fotosEquip,
      observacoesGerais: obsGerais,
      inspetorSig,
      inspetorSigEm: new Date().toISOString(),



      falhas: items
        .filter((i) => i.status === "R" || i.status === "AR")
        .map((i) => `${i.status === "AR" ? "[Restrição] " : ""}#${i.id} — ${i.description}${i.observation ? ` — ${i.observation}` : ""}`),
      classificacao,
      liberado: false,
    };


    addInspection(inspection);


    if (tipo === "entrada") {
      upsertAsset({
        ...assetComDados,
        column: "pcm",
        status: "em_inspecao",
        libNovoInspetorSig: inspetorSig,
        libNovoInspetorEm: new Date().toISOString(),
        libNovoInspectionId: inspection.id,
        inspetorLockId: undefined,
        inspetorLockNome: undefined,
        inspetorLockEm: undefined,
        inspetorAlocadoId: undefined,
        inspetorAlocadoNome: undefined,
        inspetorAlocadoEm: undefined,
      });
      toast.success(`Inspeção finalizada e assinada. ${prefixoFinal} enviado para a Fila PCM (criação da OS SAP).`);
      navigate({ to: "/planner" });
      return;
    }


    // SAÍDA: sempre aplica assinatura do inspetor e registra a decisão
    const nowIso = new Date().toISOString();

    if (decisao === "corretiva" && !existing?.reinspecaoSolicitada) {
      const equipe = existing?.mecanicoIds ?? (existing?.mecanicoId ? [existing.mecanicoId] : []);
      if (posManutencao && equipe.length > 0) {
        // Pós-manutenção reprovada: devolve para o(s) mesmo(s) manutentor(es) que encerraram a OS
        const osDoAtivo = useAppStore
          .getState()
          .workOrders.filter((w) => w.assetId === assetId && w.status !== "fechada");
        const alvo = osDoAtivo.find((w) => w.tipo === "corretiva") ?? osDoAtivo[0];
        if (alvo) updateWorkOrder(alvo.id, { status: "aberta" });
        upsertAsset({
          ...assetComDados,
          column: "atribu_do",
          status: "em_manutencao",
          inspetorDecisao: "corretiva",
          libNovoStatus: undefined,
          libNovoInspetorSig: inspetorSig,
          libNovoInspetorEm: nowIso,
          libNovoInspectionId: inspection.id,
          descricao: `↩️ ${prefixoFinal}: inspeção de saída reprovada — devolvido ao manutentor.`,
          inspetorLockId: undefined,
          inspetorLockNome: undefined,
          inspetorLockEm: undefined,
        });
        toast.warning(`Devolvido ao manutentor responsável por ${prefixoFinal}.`);
        navigate({ to: "/planner" });
        return;
      }
      // Encaminha para PCM abrir OS de corretiva (fluxo tradicional)
      upsertAsset({
        ...assetComDados,
        column: "pcm",
        status: "em_inspecao",
        inspetorDecisao: "corretiva",
        faltaDocPCM: classificacao === "frota" ? true : undefined,
        libNovoInspetorSig: inspetorSig,
        libNovoInspetorEm: nowIso,
        libNovoInspectionId: inspection.id,
        descricao: `⚠ ${prefixoFinal}: inspetor encaminhou para corretiva — PCM abrir OS SAP.`,
        inspetorLockId: undefined,
        inspetorLockNome: undefined,
        inspetorLockEm: undefined,
        inspetorAlocadoId: undefined,
        inspetorAlocadoNome: undefined,
        inspetorAlocadoEm: undefined,
      });
      toast.warning(`Enviado ao PCM para abertura de OS Corretiva de ${prefixoFinal}.`);
      navigate({ to: "/planner" });
      return;
    }

    // Reinspeção solicitada pelo PCM e REPROVADA: volta para a manutenção com as OS abertas
    if (existing?.reinspecaoSolicitada && decisao === "corretiva") {
      upsertAsset({
        ...assetComDados,
        column: (existing.reinspecaoOrigemColumn ?? "atribu_do") as typeof assetComDados.column,
        status: "em_manutencao",
        inspetorDecisao: decisao === "corretiva" ? "corretiva" : "aprovado",
        reinspecaoSolicitada: undefined,
        reinspecaoOrigemColumn: undefined,
        reinspecaoMotivo: undefined,
        libNovoInspetorSig: inspetorSig,
        libNovoInspetorEm: nowIso,
        libNovoInspectionId: inspection.id,
        inspetorLockId: undefined,
        inspetorLockNome: undefined,
        inspetorLockEm: undefined,
        inspetorAlocadoId: undefined,
        inspetorAlocadoNome: undefined,
        inspetorAlocadoEm: undefined,
      });
      toast.success("Inspeção registrada e assinada. Máquina devolvida à manutenção — o mecânico encerra as OS quando necessário.");
      navigate({ to: "/planner" });
      return;
    }

    // decisao === "aprovado": inspeção de saída sempre vai ao Supervisor assinar a liberação
    upsertAsset({
      ...assetComDados,
      column: "teste",
      status: "em_inspecao",
      inspetorDecisao: "aprovado",
      libNovoStatus: "aguardando_supervisor",
      libNovoInspetorSig: inspetorSig,
      libNovoInspetorEm: nowIso,
      libNovoInspectionId: inspection.id,
      libNovoRejeicaoMotivo: undefined,
      libNovoRejeicaoEm: undefined,
      reinspecaoSolicitada: undefined,
      reinspecaoOrigemColumn: undefined,
      reinspecaoMotivo: undefined,
      inspetorLockId: undefined,
      inspetorLockNome: undefined,
      inspetorLockEm: undefined,
      inspetorAlocadoId: undefined,
      inspetorAlocadoNome: undefined,
      inspetorAlocadoEm: undefined,
    });
    toast.success("Inspeção aprovada e assinada. Enviado ao Supervisor para assinar a liberação.");

    navigate({ to: "/planner" });
  };

  return (
    <div className="mx-auto max-w-4xl px-3 py-4 pb-32 md:px-6 md:py-8">
      <div className="mb-4">
        <h1 className="font-display text-2xl font-bold md:text-3xl">Checklist de Inspeção</h1>
        <p className="text-sm text-muted-foreground">Checklist técnico de 120 itens — Entrada / Saída de frota</p>
      </div>

      {/* Header card */}
      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-3">
          <div className="md:col-span-3">
            <Label htmlFor="pref">Prefixo / Inventário / Código Ativo</Label>
            <div className="flex gap-2">
              <Input
                id="pref"
                className="h-12 text-base"
                placeholder="Ex.: EQ-0001 ou 100XXXX"
                value={header.prefixo}
                onChange={(e) => setHeader({ ...header, prefixo: e.target.value.toUpperCase() })}
                onBlur={(e) => e.target.value && lookupCadastro(e.target.value)}
              />
              <Button type="button" variant="secondary" className="h-12" onClick={() => lookupCadastro(header.prefixo)}>
                Buscar
              </Button>
            </div>
            {cadastroStatus === "buscando" && <p className="mt-1 text-xs text-muted-foreground">Consultando cadastro SAP…</p>}
            {cadastroStatus === "encontrado" && (
              <div className="mt-1 flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary">Ativo: {header.codigoAtivo || "—"}</Badge>
                {header.inventario && <Badge variant="outline">Inv.: {header.inventario}</Badge>}
                {header.serie && <Badge variant="outline">Nº Série: {header.serie}</Badge>}
                {header.tipoObjeto && <Badge variant="outline">{header.tipoObjeto}</Badge>}
              </div>
            )}
            {cadastroStatus === "nao_encontrado" && (
              <p className="mt-1 rounded-md border border-warning bg-warning/10 px-2 py-1 text-xs text-warning-foreground">
                ⚠ Sem cadastro SAP — o vínculo só ocorre com correspondência de 100% no Nº inventário ou Cód. Ativo.
                Preencha modelo/série manualmente; o PCM foi avisado para providenciar o cadastro.
              </p>
            )}

            {candidatos.length > 0 && (
              <div className="mt-2 rounded-md border bg-muted/30 p-2">
                <p className="mb-1 text-xs font-semibold">
                  O prefixo da oficina não é o código Ativo. Selecione o equipamento correspondente no SAP:
                </p>
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  {candidatos.map((c) => (
                    <button
                      key={c.codigo_Ativo}
                      type="button"
                      onClick={() => aplicarCadastro(header.prefixo.trim().toUpperCase(), c)}
                      className="w-full rounded-md border bg-background p-2 text-left text-xs hover:bg-muted"
                    >
                      <span className="font-mono font-semibold">{c.codigo_Ativo}</span> — {c.modelo}
                      <span className="block text-muted-foreground">
                        {c.tipo_objeto} {c.numero_serie ? `· Série ${c.numero_serie}` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div>
            <Label htmlFor="marca">Marca</Label>
            <Input id="marca" className="h-12 text-base" value={header.marca} onChange={(e) => setHeader({ ...header, marca: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="modelo">Modelo</Label>
            <Input id="modelo" className="h-12 text-base" value={header.modelo} onChange={(e) => setHeader({ ...header, modelo: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="hor">Horímetro atual</Label>
            <Input id="hor" type="number" className="h-12 text-base" value={header.horimetro} onChange={(e) => setHeader({ ...header, horimetro: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="hpmp">Horímetro último PMP</Label>
            <Input id="hpmp" type="number" className="h-12 text-base" value={header.horimetroUltimoPMP} onChange={(e) => setHeader({ ...header, horimetroUltimoPMP: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="alvo">Próximo alvo PMP</Label>
            <select
              id="alvo"
              value={header.proximoAlvoPMP}
              onChange={(e) => setHeader({ ...header, proximoAlvoPMP: e.target.value })}
              className="mt-1 flex h-12 w-full rounded-md border border-input bg-background px-3 text-base"
            >
              {[100, 250, 500, 1000, 2000, 4000].map((v) => (
                <option key={v} value={v}>{v}h</option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3">
            <Label className="flex items-center gap-2"><Fuel className="h-4 w-4" /> Nível de combustível: <span className="font-display font-bold">{combustivel}%</span></Label>
            <div className="mt-2 flex items-center gap-3">
              <span className="text-xs font-semibold text-muted-foreground">E</span>
              <Slider value={[combustivel]} onValueChange={(v) => setCombustivel(v[0])} max={100} step={5} className="flex-1" />
              <span className="text-xs font-semibold text-muted-foreground">F</span>
            </div>
          </div>

          <div className="md:col-span-3 grid gap-3 sm:grid-cols-2">
            <InspectionPhotoField
              label="Foto da plaqueta do chassi"
              hint="Obrigatória para o PCM conferir o número de série/chassi."
              prefix={`inspecao/${header.prefixo || "sem-prefixo"}/chassi`}
              value={fotoChassi}
              onChange={setFotoChassi}
            />
            <InspectionPhotoField
              label="Foto do horímetro"
              hint="Usada pelo PCM para lançar o horímetro no outro sistema."
              prefix={`inspecao/${header.prefixo || "sem-prefixo"}/horimetro`}
              value={fotoHorimetro}
              onChange={setFotoHorimetro}
            />
          </div>

          {(tipo === "saida" || ambos) && (
            <div className="md:col-span-3">
              <div className="mb-2 flex items-center justify-between">
                <Label className="text-sm font-semibold">Fotos do equipamento (inspeção de saída)</Label>
                <span className="text-xs text-muted-foreground">
                  {Object.values(fotosEquip).filter(Boolean).length}/{FOTOS_EQUIPAMENTO.length}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {FOTOS_EQUIPAMENTO.map((f) => (
                  <InspectionPhotoField
                    key={f.key}
                    label={f.label}
                    hint={f.hint}
                    prefix={`inspecao/${header.prefixo || "sem-prefixo"}/${f.key}`}
                    value={fotosEquip[f.key]}
                    onChange={(url) =>
                      setFotosEquip((prev) => {
                        const next = { ...prev };
                        if (url) next[f.key] = url;
                        else delete next[f.key];
                        return next;
                      })
                    }
                  />
                ))}
              </div>
            </div>
          )}




          <div className="md:col-span-3 flex flex-wrap items-center gap-2 pt-2">
            <span className="text-sm text-muted-foreground">Tipo de inspeção:</span>
            <Button type="button" size="sm" variant={tiposSel.entrada ? "default" : "outline"} onClick={() => setTiposSel((t) => ({ ...t, entrada: !t.entrada }))}>Entrada</Button>
            <Button type="button" size="sm" disabled={posManutencao} variant={tiposSel.saida ? "default" : "outline"} onClick={() => setTiposSel((t) => ({ ...t, saida: !t.saida || !t.entrada }))}>Saída</Button>
            {posManutencao && (
              <Badge variant="secondary" className="uppercase">Saída (pré-definida — liberado pela manutenção)</Badge>
            )}
            {ambos && (
              <Badge variant="secondary" className="uppercase">Entrada + Saída</Badge>
            )}

            {horimetroNum > 0 && (
              <Badge variant={classificacao === "novo" ? "secondary" : "default"} className="ml-2 uppercase">
                {classificacao === "novo" ? "Equipamento novo (<40h)" : "Equipamento da frota"}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Progress bar */}
      <div className="sticky top-14 z-10 mt-4 rounded-lg border bg-background/95 p-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="font-semibold">Progresso: {stats.filled}/{stats.total}</span>
          <span className="rounded bg-destructive/15 px-2 py-0.5 font-semibold text-destructive">Reprovado: {stats.falhas}</span>
          <span className="rounded bg-warning/25 px-2 py-0.5 font-semibold text-warning-foreground">Com restrição: {stats.restr}</span>
          <div className="ml-auto h-2 flex-1 min-w-[80px] overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${(stats.filled / stats.total) * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Groups */}
      <Accordion type="multiple" defaultValue={CHECKLIST_GROUPS.map((g) => g.key)} className="mt-4 space-y-2">
        {CHECKLIST_GROUPS.map((g) => {
          const groupItems = items.filter((i) => g.items.some((gi) => gi.id === i.id));
          const groupFalhas = groupItems.filter((i) => i.status === "R").length;
          const groupFilled = groupItems.filter((i) => i.status !== null).length;
          return (
            <AccordionItem key={g.key} value={g.key} className="rounded-lg border bg-card px-3 data-[state=open]:pb-2">
              <AccordionTrigger className="tap-target py-3 hover:no-underline">
                <div className="flex flex-1 items-center justify-between gap-2 pr-2 text-left">
                  <span className="font-display font-semibold">{g.title}</span>
                  <div className="flex items-center gap-2 text-xs">
                    {groupFalhas > 0 && (
                      <span className="rounded bg-destructive/15 px-1.5 py-0.5 font-semibold text-destructive">{groupFalhas} R</span>
                    )}
                    <span className="text-muted-foreground">{groupFilled}/{groupItems.length}</span>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="grid gap-2 pb-3 pt-1">
                {groupItems.map((it) => (
                  <ChecklistItemRow
                    key={it.id}
                    id={it.id}
                    description={it.description}
                    status={it.status}
                    observation={it.observation}
                    photos={it.photos}
                    onChange={(p) => patchItem(it.id, p)}
                  />
                ))}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      <div className="mt-4 rounded-lg border bg-card p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="obs" className="text-sm font-semibold">
            Observações gerais <span className="font-normal text-muted-foreground">— um problema por linha</span>
          </Label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => {
                const falhas = items.filter((i) => i.status === "R" || i.status === "AR");
                if (falhas.length === 0) {
                  toast.info("Nenhum item marcado como R ou AR ainda.");
                  return;
                }
                const linhas = falhas.map(
                  (i) =>
                    `- #${i.id} [${i.status}] ${i.description}${i.observation ? ` — ${i.observation}` : ""}`,
                );
                const base = obsGerais.trim();
                setObsGerais((base ? base + "\n" : "") + linhas.join("\n"));
                toast.success(`${falhas.length} problema(s) adicionados às observações.`);
              }}
            >
              <ListPlus className="h-4 w-4" /> Preencher com falhas
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              asChild
            >
              <a href={PARTS_APP_URL} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" /> Solicitar peças
              </a>
            </Button>
          </div>
        </div>
        <Textarea
          id="obs"
          rows={5}
          value={obsGerais}
          onChange={(e) => setObsGerais(e.target.value)}
          placeholder={"Ex.:\n- Vazamento no cilindro de direção\n- Farol dianteiro direito queimado\n- Palheta do limpador ressecada"}
          className="font-mono text-sm"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          Cada linha vira um item na OS de manutenção gerada para o PCM.
        </p>
      </div>

      {tipo === "saida" && (
        <div className="mt-4 grid gap-3">
          {/* Decisão do inspetor */}
          <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3">
            <div className="mb-2 text-sm font-semibold text-primary">
              Decisão do inspetor · obrigatória antes de enviar
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              {stats.falhas > 0
                ? `Você marcou ${stats.falhas} item(ns) como Reprovado. Confirme se é para encaminhar como corretiva.`
                : stats.restr > 0
                  ? `Você marcou ${stats.restr} item(ns) como Aprovado com restrição e nenhum Reprovado. Ao aprovar, a inspeção segue como "Aprovada com restrição" — as restrições ficam registradas e o Supervisor decide na assinatura.`
                  : "Sem falhas marcadas. Confirme se está aprovando ou se ainda precisa de corretiva."}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setDecisao("aprovado")}
                className={`rounded-md border-2 p-3 text-left transition ${
                  decisao === "aprovado"
                    ? stats.restr > 0
                      ? "border-warning bg-warning/10"
                      : "border-success bg-success/10"
                    : stats.restr > 0
                      ? "border-border bg-background hover:border-warning/60"
                      : "border-border bg-background hover:border-success/60"
                }`}
              >
                <div className="text-sm font-bold">
                  {stats.restr > 0 ? "⚠️ Aprovado com restrição" : "✅ Aprovado"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {stats.restr > 0
                    ? `${stats.restr} restrição(ões) registrada(s) — sem corretiva. `
                    : "Sem corretiva. "}
                  {classificacao === "frota"
                    ? "PCM só anexará a última preventiva antes do Supervisor."
                    : "Segue direto para o Supervisor assinar a liberação."}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setDecisao("corretiva")}
                className={`rounded-md border-2 p-3 text-left transition ${
                  decisao === "corretiva"
                    ? "border-destructive bg-destructive/10"
                    : "border-border bg-background hover:border-destructive/60"
                }`}
              >
                <div className="text-sm font-bold">🛠 Encaminhar para Corretiva</div>
                <div className="text-[11px] text-muted-foreground">
                  Há falhas — PCM abrirá OS SAP de corretiva.
                </div>
              </button>
            </div>
          </div>
        </div>
      )}



      {/* Assinatura obrigatória em TODA inspeção (entrada e saída) */}
      <div className="mt-4 rounded-lg border-2 border-primary/40 bg-primary/5 p-3">
        <div className="mb-2 text-sm font-semibold text-primary">
          Assinatura do Inspetor — obrigatória em toda inspeção
        </div>
        <p className="mb-2 text-xs text-muted-foreground">
          {tipo === "entrada"
            ? "Assine antes de enviar a inspeção de entrada para o PCM."
            : <>Depois de enviada, a inspeção segue para o <b>Supervisor assinar</b>{decisao === "aprovado" && classificacao === "frota" ? " (após o PCM anexar a última preventiva)" : ""}.</>}
        </p>
        <SignaturePad storageKey="inspetor:global" label="Inspetor" compact />
      </div>


      {/* Sticky footer submit */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-background/95 p-3 backdrop-blur md:bottom-0 md:left-60">
        <div className="mx-auto flex max-w-4xl items-center gap-2">
          <div className="hidden text-xs text-muted-foreground md:block">
            {podeInspecionar
              ? `${stats.filled}/${stats.total} itens · ${stats.falhas} falha(s)`
              : "Somente usuários com a função Inspetor podem executar e assinar inspeções."}
          </div>
          <div className="hidden text-[11px] text-muted-foreground md:block">
            {textoAutosave(salvoEm, pendente)}
          </div>
          <Button
            variant="outline"
            size="lg"
            className="tap-target flex-1 gap-2 md:flex-none"
            onClick={() => saveDraft()}
            disabled={!podeInspecionar}
          >
            <Save className="h-4 w-4" /> Salvar rascunho
          </Button>
          <Button
            onClick={handleSubmit}
            size="lg"
            className="tap-target flex-1 gap-2 md:flex-none"
            disabled={!podeInspecionar}
          >
            <Send className="h-4 w-4" /> Enviar
          </Button>
        </div>
      </div>

    </div>
  );
}
