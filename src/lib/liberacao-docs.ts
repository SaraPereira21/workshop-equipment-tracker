import type { Asset, AssetDocument, Inspection, WorkOrder } from "./types";
import { generateInspectionPdf } from "./inspection-pdf";
import { generateOsPdfData } from "./os-pdf";
import { uploadDataUrl } from "./storage";
import { doAtivo } from "./match-ativo";

export interface LiberacaoDocumentoEmail {
  nome: string;
  tipo?: AssetDocument["tipo"] | "anexo";
  url: string;
}

function replaceGeneratedDocuments(existing: AssetDocument[], generated: AssetDocument[]) {
  // Mantém apenas os documentos gerados agora: qualquer checklist/OS antigo
  // do mesmo tipo é descartado para não acumular versões no card.
  // Exceção: checklists manuais (anexados à mão) nunca são descartados.
  const generatedTipos = new Set(generated.map((doc) => doc.tipo));
  return [
    ...existing.filter((doc) => doc.id.startsWith("doc-manual-") || !generatedTipos.has(doc.tipo)),
    ...generated,
  ];
}

export async function prepararDocumentosLiberacao({
  asset,
  inspection,
  workOrders,
}: {
  asset: Asset;
  inspection?: Inspection;
  workOrders: WorkOrder[];
}): Promise<{
  documentosAtualizados: AssetDocument[];
  anexosEmail: LiberacaoDocumentoEmail[];
  pdfInspecaoUrl?: string;
  pdfOsUrl?: string;
}> {
  const nowIso = new Date().toISOString();
  const generated: AssetDocument[] = [];

  if (inspection) {
    const pdf = await generateInspectionPdf(asset, inspection, { save: false });
    const url = await uploadDataUrl(`documentos/${asset.prefixo}/liberacao`, pdf.dataUrl, pdf.filename);
    generated.push({
      id: `doc-inspecao-${Date.now()}`,
      nome: pdf.filename,
      tipo: "checklist_entrada_saida",
      dataUrl: url,
      createdAt: nowIso,
      autor: inspection.inspetor,
    });
  }

  for (const wo of workOrders.filter((w) => doAtivo(asset, w))) {
    const pdf = await generateOsPdfData(wo, asset);
    const url = await uploadDataUrl(`documentos/${asset.prefixo}/os`, pdf.dataUrl, pdf.filename);
    generated.push({
      id: `doc-os-${wo.id}-${Date.now()}`,
      nome: pdf.filename,
      tipo: wo.tipo === "preventiva" ? "os_preventiva" : "os_corretiva",
      dataUrl: url,
      createdAt: nowIso,
      autor: wo.assinaturaSupervisorNome ?? wo.assinaturaTecnicoNome ?? "Sistema",
    });
  }

  const documentosAtualizados = replaceGeneratedDocuments(asset.documentos ?? [], generated);
  const anexosEmail = documentosAtualizados
    .filter((doc) => ["checklist_entrada_saida", "os_corretiva", "os_preventiva"].includes(doc.tipo))
    .map((doc) => ({ nome: doc.nome, tipo: doc.tipo, url: doc.dataUrl }));
  const anexosManuais: LiberacaoDocumentoEmail[] = (asset.anexos ?? [])
    .filter((anexo) => Boolean(anexo.dataUrl))
    .map((anexo) => ({ nome: anexo.nome, tipo: "anexo", url: anexo.dataUrl }));
  const todosAnexosEmail = [...anexosEmail, ...anexosManuais];
  const pdfInspecaoUrl = anexosEmail.find((doc) => doc.tipo === "checklist_entrada_saida")?.url;
  const pdfOsUrl = anexosEmail.find((doc) => doc.tipo === "os_corretiva" || doc.tipo === "os_preventiva")?.url;

  return { documentosAtualizados, anexosEmail: todosAnexosEmail, pdfInspecaoUrl, pdfOsUrl };
}