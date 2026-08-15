import { supabase } from "@/integrations/supabase/client";
import { enqueueUpload, isOnline } from "./offline-sync";

const BUCKET = "oficina-uploads";

function extFromMime(mime: string): string {
  if (!mime) return "bin";
  const m = mime.split("/")[1] ?? "bin";
  return m.split("+")[0].toLowerCase();
}

function sanitizePrefix(prefix: string): string {
  return prefix
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9/_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function randomKey(prefix: string, ext: string): string {
  const uid = (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${sanitizePrefix(prefix)}/${uid}.${ext}`;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

/** Upload direto (sem fallback offline) — usado pela fila de sincronização. */
export async function uploadBlobDirect(prefix: string, blob: Blob, filename?: string): Promise<string> {
  const ext = filename ? filename.split(".").pop() || extFromMime(blob.type) : extFromMime(blob.type);
  const path = randomKey(prefix, ext);
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadDataUrlDirect(prefix: string, dataUrl: string, filename?: string): Promise<string> {
  if (/^https?:\/\//i.test(dataUrl)) return dataUrl;
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return uploadBlobDirect(prefix, blob, filename);
}

/**
 * Faz upload de um File/Blob e devolve a URL pública.
 * Sem rede (ou falha de rede), guarda o arquivo localmente e devolve uma URL
 * temporária (data:) que é trocada pela definitiva assim que a conexão voltar.
 */
export async function uploadBlob(prefix: string, blob: Blob, filename?: string): Promise<string> {
  if (isOnline()) {
    try {
      return await uploadBlobDirect(prefix, blob, filename);
    } catch (err) {
      const msg = String((err as { message?: string })?.message ?? err ?? "").toLowerCase();
      const offlineish =
        msg.includes("failed to fetch") || msg.includes("network") || msg.includes("load failed");
      if (!offlineish) throw err;
    }
  }
  const dataUrl = await blobToDataUrl(blob);
  return enqueueUpload(prefix, dataUrl, filename);
}

/** Converte dataURL base64 em Blob e faz upload. */
export async function uploadDataUrl(prefix: string, dataUrl: string, filename?: string): Promise<string> {
  // Se já é URL (http/https), retorna direto — idempotente
  if (/^https?:\/\//i.test(dataUrl)) return dataUrl;
  if (!isOnline()) return enqueueUpload(prefix, dataUrl, filename);
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return uploadBlob(prefix, blob, filename);
}

/** Aceita um File direto. */
export async function uploadFile(prefix: string, file: File): Promise<string> {
  return uploadBlob(prefix, file, file.name);
}
