import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ClipboardCheck, Plus, ChevronRight, Fuel, Sparkles, Mail, XCircle, Lock, Unlock, FileDown, FileUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ColumnBadge } from "@/components/status-badges";
import { useAppStore } from "@/lib/store";
import { useAuth } from "@/hooks/use-auth";
import { EnviarLiberacaoDialog } from "@/components/enviar-liberacao-dialog";
import { toast } from "sonner";
import type { Asset, Inspection } from "@/lib/types";
import { doAtivo, mesmoPrefixo, normPrefixo } from "@/lib/match-ativo";
import {
  aguardandoAlocacao,
  ehInspecaoSaida,
  filaInspecao,
  responsavelInspecao,
} from "@/lib/fila-inspecao";


export const Route = createFileRoute("/_authenticated/inspetor/")({
  head: () => ({
    meta: [{ title: "Inspeções — Planner Frota" }, { name: "description", content: "Lista de inspeções técnicas." }],
  }),
  component: InspectorList,
});

function InspectorList() {
  const { profile, roles } = useAuth();
  const meuId = profile?.id ?? "";
  const meuNome = profile?.nome ?? "Inspetor";
  const gestor = roles.some((r) => r === "admin" || r === "pcm" || r === "supervisor");
  // Só quem tem a função INSPETOR (ou admin) executa inspeções. Os demais perfis
  // (PCM, supervisor, gerência) continuam vendo as telas em modo leitura.
  const podeInspecionar = roles.some((r) => r === "inspetor" || r === "admin");

  const allInspections = useAppStore((s) => s.inspections);
  const assets = useAppStore((s) => s.assets);
  const updateAsset = useAppStore((s) => s.updateAsset);
  const prefixosAtivos = new Set(assets.map((a) => normPrefixo(a.prefixo)));
  // Inspetor "puro" vê só o histórico dele; gestão (admin/PCM/supervisor/gerência) vê tudo.
  const soMinhas = podeInspecionar && !gestor;
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  const inspections = allInspections.filter(
    (i) => prefixosAtivos.has(normPrefixo(i.prefixo)) && (!soMinhas || norm(i.inspetor ?? "") === norm(meuNome)),
  );
  // FONTE ÚNICA: mesma fila que o supervisor enxerga em "Enviar para inspeção".
  const fila = filaInspecao(assets);
  const responsavel = responsavelInspecao;
  const entradas = fila.filter((a) => !ehInspecaoSaida(a));
  const minhas = entradas.filter((a) => responsavel(a)?.id === meuId);
  const deOutros = entradas.filter((a) => {
    const r = responsavel(a);
    return !!r && r.id !== meuId;
  });
  // Devolvidas pelo supervisor sem inspetor alocado: precisam aparecer para todos,
  // senão a máquina devolvida some da tela do inspetor.
  const semResponsavel = entradas.filter((a) => !responsavel(a));
  const semAlocacao = aguardandoAlocacao(assets);
  const pendentes = [...minhas, ...deOutros, ...semResponsavel, ...semAlocacao];


  // Máquinas aguardando inspeção de saída — mesma fila, coluna aguardando_saida
  const aguardandoSaida = fila.filter((a) => ehInspecaoSaida(a));



  const prontosEnvio = assets.filter((a) => a.libNovoStatus === "pronto_envio");
  const rejeitadas = assets.filter((a) => a.libNovoStatus === "rejeitado");

  const [liberacaoAsset, setLiberacaoAsset] = useState<Asset | null>(null);
  const [prefixoAntigo, setPrefixoAntigo] = useState("");
  const [antigoAsset, setAntigoAsset] = useState<Asset | null>(null);

  return (
    <div className="mx-auto max-w-5xl px-3 py-4 md:px-6 md:py-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold md:text-3xl">Inspeções</h1>
          <p className="text-sm text-muted-foreground">{inspections.length} inspeção(ões) registrada(s)</p>
        </div>
        {podeInspecionar && (
          <Button asChild size="lg" className="tap-target gap-2">
            <Link to="/inspetor/nova" search={{ prefixo: "" }}>
              <Plus className="h-5 w-5" /> Nova
            </Link>
          </Button>
        )}
      </div>

      <Card className="mb-5 border-dashed">
        <CardContent className="flex flex-wrap items-end gap-3 p-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FileUp className="h-4 w-4 text-primary" /> Checklist antigo (feito antes do sistema)
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Escolha a máquina, anexe o PDF/foto do checklist em papel e envie o e-mail de liberação.
            </p>
            <input
              list="prefixos-checklist-antigo"
              value={prefixoAntigo}
              onChange={(e) => setPrefixoAntigo(e.target.value.toUpperCase())}
              placeholder="Digite o prefixo (ex.: EH 120)"
              className="mt-2 h-9 w-full max-w-xs rounded-md border bg-background px-3 text-sm"
            />
            <datalist id="prefixos-checklist-antigo">
              {assets.map((a) => (
                <option key={a.id} value={a.prefixo}>
                  {a.marca} {a.modelo}
                </option>
              ))}
            </datalist>
          </div>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              const alvo = assets.find((a) => mesmoPrefixo(a.prefixo, prefixoAntigo));
              if (!alvo) {
                toast.error("Máquina não encontrada — confira o prefixo");
                return;
              }
              setAntigoAsset(alvo);
            }}
          >
            <FileUp className="h-4 w-4" /> Anexar PDF e enviar liberação
          </Button>
        </CardContent>
      </Card>



      {/* Solicitações do supervisor entram nos grupos abaixo (fila única). */}



      {pendentes.length > 0 && (
        <div className="mb-5 grid gap-5">
          {([
            { key: "minhas", titulo: "Minhas inspeções", lista: minhas },
            { key: "outros", titulo: "De outros inspetores", lista: deOutros },
            { key: "espera", titulo: "Aguardando liberação do supervisor", lista: semAlocacao },
          ] as const)
            .filter((g) => g.lista.length > 0)
            .map((g) => (
              <div key={g.key}>
                <div
                  className={`mb-2 flex items-center gap-2 text-sm font-semibold ${
                    g.key === "minhas" ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {g.key === "minhas" ? <Sparkles className="h-4 w-4" /> : <Lock className="h-4 w-4" />}{" "}
                  {g.titulo} · {g.lista.length}
                </div>
                <div className="grid gap-2">
                  {g.lista.map((a) => {
                    const resp = responsavel(a);
                    const mine = g.key === "minhas";
                    const podeAgir = mine || gestor;
                    return (
                      <Card
                        key={a.id}
                        className={`border-2 transition-colors ${
                          mine
                            ? "border-dashed border-primary/40 bg-primary/5 hover:border-primary"
                            : "border-muted bg-muted/30 opacity-70"
                        }`}
                      >
                        <CardContent className="flex flex-wrap items-center gap-3 p-3">
                          <div
                            className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${
                              mine ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {mine ? <Sparkles className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-display font-bold">{a.prefixo}</div>
                            <div
                              className={`text-[11px] uppercase tracking-wide ${
                                mine ? "text-primary/80" : "text-muted-foreground"
                              }`}
                            >
                              {g.key === "minhas"
                                ? "Alocada para você"
                                : g.key === "outros"
                                  ? `Alocada para ${resp?.nome ?? "outro inspetor"}`
                                  : "Aguardando liberação do supervisor"}
                            </div>
                          </div>
                          {mine && a.inspetorLockId === meuId && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1"
                              onClick={() =>
                                updateAsset(a.id, {
                                  inspetorLockId: undefined,
                                  inspetorLockNome: undefined,
                                  inspetorLockEm: undefined,
                                })
                              }
                            >
                              <Unlock className="h-4 w-4" /> Liberar
                            </Button>
                          )}
                          {podeAgir && podeInspecionar ? (
                            <Button size="sm" asChild className="gap-1">
                              <Link to="/inspetor/nova" search={{ prefixo: a.prefixo }}>
                                <ClipboardCheck className="h-4 w-4" />{" "}
                                {a.inspectionDraft ? "Continuar" : "Inspecionar"}
                              </Link>
                            </Button>
                          ) : podeInspecionar ? (
                            <Button size="sm" disabled className="gap-1">
                              <Lock className="h-4 w-4" /> Bloqueada
                            </Button>
                          ) : null}

                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      )}


      {/* Rascunhos já aparecem nos grupos acima (fila única de inspeção). */}




      <div className="mb-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-success">
          <ClipboardCheck className="h-4 w-4" /> Equipamentos liberados pela manutenção para liberação · {aguardandoSaida.length}
        </div>
        {aguardandoSaida.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
            Nenhum equipamento aguardando inspeção de saída no momento. Quando o PCM encerrar as OSs, a máquina aparece aqui automaticamente.
          </div>
        ) : (
          <div className="grid gap-2">
            {aguardandoSaida.map((a) => {
              const travadaPor = a.inspetorLockId
                ? { id: a.inspetorLockId, nome: a.inspetorLockNome, em: a.inspetorLockEm }
                : null;
              const saidasRegistradas = allInspections.filter(
                (i) => doAtivo(a, i) && i.tipo === "saida",
              ).length;
              // Alerta: máquina caiu na fila de saída sem nenhum check de entrada no sistema.
              const semEntrada = !allInspections.some(
                (i) => doAtivo(a, i) && (i.tipo === "entrada" || i.tipoEntradaSaida),
              );
              const travadaOutro = !!travadaPor && travadaPor.id !== meuId;
              return (
              <Card key={a.id} className="border-2 border-success/40 bg-success/5">
                <CardContent className="grid gap-3 p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-success/15 text-success">
                      <ClipboardCheck className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-display font-bold">{a.prefixo} <span className="text-xs font-normal text-muted-foreground">— {a.marca} {a.modelo}</span></div>
                      <div className="text-[11px] uppercase tracking-wide text-success">Manutenção concluída · pronta para inspeção de saída</div>
                      {travadaPor && (
                        <div className="text-[11px] text-warning-foreground">
                          Em inspeção por {travadaPor.nome ?? "inspetor"}
                          {travadaPor.em && ` · desde ${new Date(travadaPor.em).toLocaleString("pt-BR")}`} —{" "}
                          {saidasRegistradas === 0
                            ? "nenhuma inspeção de saída enviada ainda"
                            : `${saidasRegistradas} inspeção(ões) de saída enviada(s)`}
                        </div>
                      )}
                      {!travadaPor && saidasRegistradas === 0 && (
                        <div className="text-[11px] text-muted-foreground">Nenhuma inspeção de saída registrada até agora.</div>
                      )}
                      {semEntrada && (
                        <div className="mt-0.5 text-[11px] font-semibold text-destructive">
                          Atenção: não existe inspeção de entrada registrada no sistema para esta máquina.
                        </div>
                      )}
                    </div>
                    {travadaPor && (gestor || travadaPor.id === meuId) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => {
                          updateAsset(a.id, {
                            inspetorLockId: undefined,
                            inspetorLockNome: undefined,
                            inspetorLockEm: undefined,
                          });
                          toast.success(`Trava de inspeção liberada em ${a.prefixo}.`);
                        }}
                      >
                        <Unlock className="h-4 w-4" /> Liberar trava
                      </Button>
                    )}
                    {podeInspecionar && (
                      <Button size="sm" asChild className="gap-1" disabled={travadaOutro}>
                        <Link to="/inspetor/nova" search={{ prefixo: a.prefixo }}>
                          <ClipboardCheck className="h-4 w-4" />{" "}
                          {a.inspectionDraft ? "Continuar inspeção" : "Inspeção de saída"}
                        </Link>
                      </Button>
                    )}
                  </div>
                  <OsDocsInspetor assetId={a.id} />
                </CardContent>
              </Card>
              );
            })}
          </div>
        )}
      </div>




      {prontosEnvio.length > 0 && (
        <div className="mb-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-success">
            <Mail className="h-4 w-4" /> Prontos para envio da liberação · {prontosEnvio.length}
          </div>
          <div className="grid gap-2">
            {prontosEnvio.map((a) => (
              <Card key={a.id} className="border-2 border-success/40 bg-success/5">
                <CardContent className="flex flex-wrap items-center gap-3 p-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-success/15 text-success">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-display font-bold">{a.prefixo} <span className="text-xs font-normal text-muted-foreground">— {a.marca} {a.modelo}</span></div>
                    <div className="text-[11px] text-muted-foreground">
                      Supervisor assinou: {a.libNovoSupervisorSig?.nome ?? "—"}
                      {a.libNovoSupervisorEm && ` · ${new Date(a.libNovoSupervisorEm).toLocaleString("pt-BR")}`}
                    </div>
                  </div>
                  <Button size="sm" className="gap-1" onClick={() => setLiberacaoAsset(a)}>
                    <Mail className="h-4 w-4" /> Enviar liberação
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
      {rejeitadas.length > 0 && (
        <div className="mb-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-destructive">
            <XCircle className="h-4 w-4" /> Liberações rejeitadas pelo supervisor · {rejeitadas.length}
          </div>
          <div className="grid gap-2">
            {rejeitadas.map((a) => (
              <Card key={a.id} className="border-2 border-destructive/40 bg-destructive/5">
                <CardContent className="flex flex-wrap items-center gap-3 p-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-destructive/15 text-destructive">
                    <XCircle className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-display font-bold">{a.prefixo} <span className="text-xs font-normal text-muted-foreground">— {a.marca} {a.modelo}</span></div>
                    <div className="text-[11px] text-destructive">
                      Motivo: {a.libNovoRejeicaoMotivo ?? "—"}
                    </div>
                    {a.libNovoRejeicaoEm && (
                      <div className="text-[10px] text-muted-foreground">{new Date(a.libNovoRejeicaoEm).toLocaleString("pt-BR")}</div>
                    )}
                  </div>
                  {podeInspecionar && (
                    <Button size="sm" asChild className="gap-1">
                      <Link to="/inspetor/nova" search={{ prefixo: a.prefixo }}>
                        <ClipboardCheck className="h-4 w-4" /> Refazer inspeção
                      </Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}




      <div className="grid gap-3">
        {inspections.map((i) => (
          <InspecaoHistoricoCard key={i.id} inspection={i} />
        ))}
      </div>


      {liberacaoAsset && (
        <EnviarLiberacaoDialog
          asset={liberacaoAsset}
          open={!!liberacaoAsset}
          onOpenChange={(v) => {
            if (!v) {
              updateAsset(liberacaoAsset.id, { libNovoStatus: "enviado" });
              setLiberacaoAsset(null);
            }
          }}
        />
      )}

      {antigoAsset && (
        <EnviarLiberacaoDialog
          asset={antigoAsset}
          open={!!antigoAsset}
          onOpenChange={(v) => {
            if (!v) setAntigoAsset(null);
          }}
        />
      )}

    </div>
  );
}

function InspecaoHistoricoCard({ inspection }: { inspection: Inspection }) {
  const assets = useAppStore((s) => s.assets);
  const [busy, setBusy] = useState(false);
  const nFalhas = inspection.items.filter((it) => it.status === "R").length;

  const baixarPdf = async () => {
    setBusy(true);
    try {
      const { generateInspectionPdf } = await import("@/lib/inspection-pdf");
      const asset =
        assets.find((a) => a.id === inspection.assetId) ??
        assets.find((a) => a.prefixo === inspection.prefixo);
      if (!asset) {
        toast.error("Equipamento não encontrado para gerar o PDF");
        return;
      }
      await generateInspectionPdf(asset, inspection, {
        observacoes: inspection.observacoesGerais ?? "",
        classificacao: inspection.classificacao,
        save: true,
      });
      toast.success("PDF da inspeção gerado");
    } catch (err) {
      console.error(err);
      toast.error("Falha ao gerar o PDF da inspeção");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="transition-colors hover:border-primary/60">
      <CardContent className="flex items-center gap-3 p-4">
        <Link
          to="/inspetor/$id"
          params={{ id: inspection.id }}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <ClipboardCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display font-semibold">{inspection.prefixo}</span>
              <Badge variant="outline" className="text-[10px] uppercase">
                {inspection.tipo}
              </Badge>
              <Badge
                variant={inspection.classificacao === "novo" ? "secondary" : "default"}
                className="text-[10px] uppercase"
              >
                {inspection.classificacao === "novo" ? "Novo (<40h)" : "Frota"}
              </Badge>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span>{new Date(inspection.data).toLocaleDateString("pt-BR")}</span>
              <span>{inspection.horimetro}h</span>
              <span className="inline-flex items-center gap-1">
                <Fuel className="h-3 w-3" />
                {inspection.combustivel}%
              </span>
              {nFalhas > 0 && <span className="font-semibold text-destructive">{nFalhas} falha(s)</span>}
            </div>
          </div>
        </Link>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 gap-1"
          disabled={busy}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void baixarPdf();
          }}
        >
          <FileDown className="h-4 w-4" /> PDF
        </Button>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
      </CardContent>
    </Card>
  );
}


function OsDocsInspetor({ assetId }: { assetId: string }) {
  const workOrders = useAppStore((s) => s.workOrders);
  const osList = workOrders.filter((w) => w.assetId === assetId);
  if (osList.length === 0) return null;
  return (
    <div className="rounded-md border bg-background/60 p-2">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Documentos das OSs
      </div>
      <div className="flex flex-wrap gap-2">
        {osList.map((w) => (
          <Button
            key={w.id}
            size="sm"
            variant="outline"
            className="gap-1 text-xs"
            onClick={async () => {
              const { generateOsPdf } = await import("@/lib/os-pdf");
              const a = useAppStore.getState().assets.find((x) => x.id === assetId);
              await generateOsPdf(w, a);
            }}
          >
            <FileDown className="h-3.5 w-3.5" />
            OS {w.numeroSAP || "—"} · {w.tipo}
          </Button>
        ))}
      </div>
    </div>
  );
}

