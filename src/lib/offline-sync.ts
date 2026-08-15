import { supabase } from "@/integrations/supabase/client";
import { idbGet, idbSet } from "./offline-db";

export type PendingOp =
  | { id: string; kind: "upsert"; table: string; rowId: string; data: unknown }
  | { id: string; kind: "delete"; table: string; rowId: string }
  | { id: string; kind: "deleteBy"; table: string; column: string; value: string };

export type PendingUpload = {
  id: string;
  prefix: string;
  filename?: string;
  dataUrl: string; // também é o "token" usado dentro dos registros até subir
};

const BUCKET = "oficina-uploads";

let ops: PendingOp[] = [];
let uploads: PendingUpload[] = [];
let loaded = false;
let flushing = false;
let started = false;

type Listener = () => void;
const listeners = new Set<Listener>();

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

export function getOfflineState() {
  return { online: isOnline(), pending: ops.length + uploads.length };
}

export function subscribeOffline(cb: Listener) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notify() {
  for (const cb of listeners) cb();
}

async function persist() {
  await Promise.all([idbSet("outbox", "ops", ops), idbSet("uploads", "files", uploads)]);
  notify();
}

async function load() {
  if (loaded) return;
  loaded = true;
  ops = (await idbGet<PendingOp[]>("outbox", "ops")) ?? [];
  uploads = (await idbGet<PendingUpload[]>("uploads", "files")) ?? [];
  notify();
}

/** O store registra aqui como substituir uma URL provisória pela definitiva. */
let urlRewriter: ((from: string, to: string) => void) | null = null;
export function registerUrlRewriter(fn: (from: string, to: string) => void) {
  urlRewriter = fn;
}

export function isOfflineUrl(url: string | undefined | null): boolean {
  return typeof url === "string" && url.startsWith("data:");
}

export type NewOp = PendingOp extends infer T ? (T extends { id: string } ? Omit<T, "id"> : never) : never;

export async function enqueueOp(op: NewOp) {
  await load();
  const full = { ...op, id: uid() } as PendingOp;
  // colapsa gravações repetidas da mesma linha (última vence)
  if (full.kind === "upsert" || full.kind === "delete") {
    ops = ops.filter(
      (o) =>
        !(
          (o.kind === "upsert" || o.kind === "delete") &&
          o.table === full.table &&
          o.rowId === (full as { rowId: string }).rowId
        ),
    );
  }
  ops.push(full);
  await persist();
}

export async function enqueueUpload(prefix: string, dataUrl: string, filename?: string) {
  await load();
  uploads.push({ id: uid(), prefix, dataUrl, filename });
  await persist();
  return dataUrl;
}

export function isNetworkFailure(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? err ?? "").toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("load failed") ||
    msg.includes("network request failed") ||
    msg.includes("timeout")
  );
}

async function runUpload(item: PendingUpload): Promise<boolean> {
  const { uploadDataUrlDirect } = await import("./storage");
  try {
    const url = await uploadDataUrlDirect(item.prefix, item.dataUrl, item.filename);
    urlRewriter?.(item.dataUrl, url);
    return true;
  } catch (err) {
    if (isNetworkFailure(err)) return false;
    console.warn("[offline] upload descartado", err);
    return true; // erro definitivo: não retentar eternamente
  }
}

async function runOp(op: PendingOp): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = supabase.from(op.table as any);
    let error: unknown = null;
    if (op.kind === "upsert") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ error } = await (table as any).upsert(
        op.table === "app_tags" ? { id: op.rowId } : { id: op.rowId, data: op.data },
      ));
    } else if (op.kind === "delete") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ error } = await (table as any).delete().eq("id", op.rowId));
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ error } = await (table as any).delete().eq(op.column, op.value));
    }
    if (error) {
      if (isNetworkFailure(error)) return false;
      console.warn("[offline] operação descartada", op.table, error);
    }
    return true;
  } catch (err) {
    if (isNetworkFailure(err)) return false;
    console.warn("[offline] operação descartada", op.table, err);
    return true;
  }
}

/** Sobe tudo que ficou pendente: primeiro os arquivos, depois os registros. */
export async function flushOutbox(): Promise<void> {
  await load();
  if (flushing || !isOnline()) return;
  if (!ops.length && !uploads.length) return;
  flushing = true;
  try {
    void BUCKET;
    while (uploads.length) {
      const item = uploads[0];
      const ok = await runUpload(item);
      if (!ok) return;
      uploads = uploads.filter((u) => u.id !== item.id);
      await persist();
    }
    while (ops.length) {
      const op = ops[0];
      const ok = await runOp(op);
      if (!ok) return;
      ops = ops.filter((o) => o.id !== op.id);
      await persist();
    }
  } finally {
    flushing = false;
    notify();
  }
}

export function startOfflineSync() {
  if (started || typeof window === "undefined") return;
  started = true;
  void load().then(() => void flushOutbox());
  window.addEventListener("online", () => {
    notify();
    void flushOutbox();
  });
  window.addEventListener("offline", notify);
  window.setInterval(() => void flushOutbox(), 30_000);
}
