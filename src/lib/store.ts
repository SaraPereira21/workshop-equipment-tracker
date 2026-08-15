import { create } from "zustand";
import { mesmoPrefixo } from "./match-ativo";
import { supabase } from "@/integrations/supabase/client";
import { idbGet, idbSet } from "./offline-db";
import {
  enqueueOp,
  isNetworkFailure,
  isOnline,
  registerUrlRewriter,
  startOfflineSync,
} from "./offline-sync";

import type {
  Asset,
  Inspection,
  Mechanic,
  UserRole,
  WorkOrder,
  KanbanColumn,
  SavedSignature,
} from "./types";
import { TIPOS_EQUIPAMENTO, normalizeTipo } from "./tipo-equipamento";

const DEFAULT_TAGS = [
  "Escavadeira",
  "Retroescavadeira",
  "Pá Carregadeira",
  "Rolo Compactador",
  "Motoniveladora",
  "Caminhão",
  "Manutenção Elétrica",
  "Manutenção Hidráulica",
  "Motor",
  "Preventiva",
  "Corretiva",
  "Urgente",
];

// Nome do usuário logado (definido pelo AuthProvider) — usado na auditoria dos cards.
let _currentUserNome = "";
export function setCurrentUserNome(nome: string) {
  _currentUserNome = nome || "";
}
function currentUserNome() {
  return _currentUserNome || undefined;
}
function auditPatch() {
  return {
    ultimaAlteracaoPor: _currentUserNome || undefined,
    ultimaAlteracaoEm: new Date().toISOString(),
  };
}

interface AppState {
  role: UserRole;
  setRole: (r: UserRole) => void;
  hydrated: boolean;
  assets: Asset[];
  inspections: Inspection[];
  mechanics: Mechanic[];
  workOrders: WorkOrder[];
  tagCatalog: string[];
  tipoCatalog: string[];
  signatures: Record<string, SavedSignature>;

  upsertAsset: (a: Asset) => void;
  moveAsset: (assetId: string, column: KanbanColumn) => void;
  updateAsset: (assetId: string, patch: Partial<Asset>) => void;
  removeAsset: (assetId: string) => void;
  assignMechanic: (assetId: string, mecanicoIds: string | string[]) => void;

  addInspection: (i: Inspection) => void;
  updateInspection: (id: string, patch: Partial<Inspection>) => void;

  addWorkOrder: (w: WorkOrder) => void;
  updateWorkOrder: (id: string, patch: Partial<WorkOrder>) => void;
  removeWorkOrder: (id: string) => void;

  addTag: (tag: string) => void;
  removeTag: (tag: string) => void;

  addTipo: (tipo: string) => void;
  removeTipo: (tipo: string) => void;

  saveSignature: (key: string, sig: SavedSignature) => void;
  deleteSignature: (key: string) => void;

  resetAll: () => void;

  // Internal (Realtime sync)
  _hydrate: () => Promise<void>;
  _applyAssetRow: (id: string, data: Asset | null) => void;
  _applyInspRow: (id: string, data: Inspection | null) => void;
  _applyWORow: (id: string, data: WorkOrder | null) => void;
  _applyMechRow: (id: string, data: Mechanic | null) => void;
  _applyTagRow: (id: string, present: boolean) => void;
  _applySigRow: (id: string, data: SavedSignature | null) => void;
}

// ---------- DB helpers (com fila offline) ----------
function warn(scope: string, err: unknown) {
  // eslint-disable-next-line no-console
  console.warn(`[sync:${scope}]`, err);
}

async function writeRow(table: string, id: string, data: unknown, scope: string) {
  if (!isOnline()) {
    await enqueueOp({ kind: "upsert", table, rowId: id, data });
    return;
  }
  try {
    const payload = table === "app_tags" || table === "app_equipment_types" ? { id } : { id, data };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from(table as any) as any).upsert(payload);
    if (error) {
      // Qualquer falha (rede, timeout, payload grande) entra na fila de reenvio
      warn(scope, error);
      await enqueueOp({ kind: "upsert", table, rowId: id, data });
    }
  } catch (err) {
    warn(scope, err);
    await enqueueOp({ kind: "upsert", table, rowId: id, data });
  }
}

async function deleteRow(table: string, id: string, scope: string) {
  if (!isOnline()) {
    await enqueueOp({ kind: "delete", table, rowId: id });
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from(table as any) as any).delete().eq("id", id);
    if (error) {
      if (isNetworkFailure(error)) await enqueueOp({ kind: "delete", table, rowId: id });
      else warn(scope, error);
    }
  } catch (err) {
    if (isNetworkFailure(err)) await enqueueOp({ kind: "delete", table, rowId: id });
    else warn(scope, err);
  }
}

async function deleteBy(table: string, column: string, value: string, scope: string) {
  if (!isOnline()) {
    await enqueueOp({ kind: "deleteBy", table, column, value });
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from(table as any) as any).delete().eq(column, value);
    if (error) {
      if (isNetworkFailure(error)) await enqueueOp({ kind: "deleteBy", table, column, value });
      else warn(scope, error);
    }
  } catch (err) {
    if (isNetworkFailure(err)) await enqueueOp({ kind: "deleteBy", table, column, value });
    else warn(scope, err);
  }
}

async function pushAsset(a: Asset) {
  await writeRow("app_assets", a.id, a, "asset");
}

const assetPushQueues = new Map<string, Promise<void>>();
/** Máquinas excluídas nesta sessão — nenhuma escrita pode ressuscitá-las */
const deletedAssetIds = new Set<string>();

function queueAssetPush(a: Asset) {
  if (deletedAssetIds.has(a.id) && !a.deletedAt) return Promise.resolve();
  const previous = assetPushQueues.get(a.id) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => pushAsset(a))
    .finally(() => {
      if (assetPushQueues.get(a.id) === next) assetPushQueues.delete(a.id);
    });
  assetPushQueues.set(a.id, next);
  return next;
}

async function pushAssets(items: Asset[]) {
  for (const a of items) await queueAssetPush(a);
}
async function deleteAssetDb(a: Asset) {
  deletedAssetIds.add(a.id);
  // Tombstone: marca como excluída (UPDATE propaga por Realtime para todos os clientes)
  const tomb: Asset = { ...a, deletedAt: new Date().toISOString() };
  await (assetPushQueues.get(a.id) ?? Promise.resolve()).catch(() => undefined);
  await pushAsset(tomb);
}
async function pushInspection(i: Inspection) {
  await writeRow("app_inspections", i.id, i, "insp");
}
async function pushWO(w: WorkOrder) {
  await writeRow("app_work_orders", w.id, w, "wo");
}
async function pushMechs(items: Mechanic[]) {
  for (const m of items) await writeRow("app_mechanics", m.id, m, "mechs");
}
async function addTagDb(t: string) {
  await writeRow("app_tags", t, null, "tag+");
}
async function delTagDb(t: string) {
  await deleteRow("app_tags", t, "tag-");
}
async function addTipoDb(t: string) {
  await writeRow("app_equipment_types", t, null, "tipo+");
}
async function delTipoDb(t: string) {
  await deleteRow("app_equipment_types", t, "tipo-");
}
async function pushSig(key: string, sig: SavedSignature) {
  await writeRow("app_signatures", key, sig, "sig");
}
async function delSig(key: string) {
  await deleteRow("app_signatures", key, "sig-");
}


function replaceIn<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx < 0) return [item, ...list];
  const next = [...list];
  next[idx] = item;
  return next;
}

export const useAppStore = create<AppState>()((set, get) => ({
  role: "supervisor",
  setRole: (r) => set({ role: r }),
  hydrated: false,
  assets: [],
  inspections: [],
  mechanics: [],
  workOrders: [],
  tagCatalog: DEFAULT_TAGS,
  tipoCatalog: [],
  signatures: {},

  saveSignature: (key, sig) => {
    set((s) => ({ signatures: { ...s.signatures, [key]: sig } }));
    void pushSig(key, sig);
  },
  deleteSignature: (key) => {
    set((s) => {
      const next = { ...s.signatures };
      delete next[key];
      return { signatures: next };
    });
    void delSig(key);
  },

  addTag: (tag) => {
    const t = tag.trim();
    if (!t) return;
    const s = get();
    if (s.tagCatalog.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    set({ tagCatalog: [...s.tagCatalog, t] });
    void addTagDb(t);
  },
  removeTag: (tag) => {
    set((s) => ({ tagCatalog: s.tagCatalog.filter((t) => t !== tag) }));
    void delTagDb(tag);
  },

  addTipo: (tipo) => {
    const t = normalizeTipo(tipo);
    if (!t) return;
    const s = get();
    if ([...TIPOS_EQUIPAMENTO, ...s.tipoCatalog].some((x) => x.toLowerCase() === t.toLowerCase())) return;
    set({ tipoCatalog: [...s.tipoCatalog, t] });
    void addTipoDb(t);
  },
  removeTipo: (tipo) => {
    set((s) => ({ tipoCatalog: s.tipoCatalog.filter((t) => t !== tipo) }));
    void delTipoDb(tipo);
  },

  upsertAsset: (a) => {
    const carimbado: Asset = {
      ...a,
      criadoPor: a.criadoPor ?? currentUserNome(),
      criadoEm: a.criadoEm ?? new Date().toISOString(),
      ...auditPatch(),
    };
    set((s) => {
      const idx = s.assets.findIndex((x) => x.id === carimbado.id);
      const next = [...s.assets];
      if (idx >= 0) next[idx] = carimbado;
      else next.push(carimbado);
      return { assets: next };
    });
    void queueAssetPush(carimbado);
  },

  moveAsset: (assetId, column) => {
    const s = get();
    const current = s.assets.find((a) => a.id === assetId);
    if (!current) return;
    const updated: Asset = {
      ...current,
      column,
      dataLiberacao: column === "liberado" ? current.dataLiberacao ?? new Date().toISOString() : current.dataLiberacao,
      ...auditPatch(),
    };
    set({ assets: s.assets.map((a) => (a.id === assetId ? updated : a)) });
    void queueAssetPush(updated);
  },

  updateAsset: (assetId, patch) => {
    const s = get();
    const current = s.assets.find((a) => a.id === assetId);
    if (!current) return;
    const updated = { ...current, ...patch, ...auditPatch() };
    set({ assets: s.assets.map((a) => (a.id === assetId ? updated : a)) });
    void queueAssetPush(updated);
  },


  removeAsset: (assetId) => {
    const s = get();
    const alvo = s.assets.find((a) => a.id === assetId);
    const prefixo = alvo?.prefixo;
    const matchInsp = (i: Inspection) =>
      (i as { assetId?: string }).assetId === assetId || (!!prefixo && mesmoPrefixo(i.prefixo, prefixo));
    const matchWo = (w: WorkOrder) =>
      w.assetId === assetId || (!!prefixo && mesmoPrefixo(w.prefixo, prefixo));
    set({
      assets: s.assets.filter((a) => a.id !== assetId),
      inspections: s.inspections.filter((i) => !matchInsp(i)),
      workOrders: s.workOrders.filter((w) => !matchWo(w)),
    });
    if (alvo) void deleteAssetDb(alvo);
    else void deleteRow("app_assets", assetId, "asset:del");
    // Cascata: por assetId (fonte da verdade) e por prefixo (registros legados)
    void deleteBy("app_inspections", "data->>assetId", assetId, "insp:del");
    void deleteBy("app_work_orders", "data->>assetId", assetId, "wo:del");
    if (prefixo) {
      void deleteBy("app_inspections", "data->>prefixo", prefixo, "insp:del");
      void deleteBy("app_work_orders", "data->>prefixo", prefixo, "wo:del");
    }
  },


  assignMechanic: (assetId, mecanicoIdsInput) => {
    const s = get();
    const ids = Array.isArray(mecanicoIdsInput) ? mecanicoIdsInput : [mecanicoIdsInput];
    const uniqIds = Array.from(new Set(ids.filter(Boolean)));
    const primaryId = uniqIds[0];
    
    // Um mesmo mecânico pode estar alocado em várias máquinas ao mesmo tempo:
    // nenhuma realocação automática é feita aqui.
    const changedAssets: Asset[] = [];
    const nextAssets = s.assets.map((a) => {
      if (a.id === assetId) {
        const upd: Asset = {
          ...a,
          mecanicoId: primaryId,
          mecanicoIds: uniqIds.length ? uniqIds : undefined,
          column: "atribu_do" as KanbanColumn,
        };
        changedAssets.push(upd);
        return upd;
      }
      return a;
    });

    const changedMechs: Mechanic[] = [];
    const nextMechs = s.mechanics.map((m) => {
      if (uniqIds.includes(m.id)) {
        const upd = { ...m, status: "ativo" as const, cargaHoras: m.cargaHoras + 2 };
        changedMechs.push(upd);
        return upd;
      }
      return m;
    });

    set({ assets: nextAssets, mechanics: nextMechs });
    void pushAssets(changedAssets);
    void pushMechs(changedMechs);
  },

  addInspection: (i) => {
    set((s) => ({ inspections: [i, ...s.inspections] }));
    void pushInspection(i);
  },
  updateInspection: (id, patch) => {
    const s = get();
    const current = s.inspections.find((x) => x.id === id);
    if (!current) return;
    const updated = { ...current, ...patch };
    set({ inspections: s.inspections.map((x) => (x.id === id ? updated : x)) });
    void pushInspection(updated);
  },

  addWorkOrder: (w) => {
    set((s) => ({ workOrders: [w, ...s.workOrders] }));
    void pushWO(w);
  },
  updateWorkOrder: (id, patch) => {
    const s = get();
    const current = s.workOrders.find((x) => x.id === id);
    if (!current) return;
    const updated = { ...current, ...patch };
    set({ workOrders: s.workOrders.map((x) => (x.id === id ? updated : x)) });
    void pushWO(updated);
  },

  removeWorkOrder: (id) => {
    set((s) => ({ workOrders: s.workOrders.filter((w) => w.id !== id) }));
    void deleteRow("app_work_orders", id, "wo:del");
  },


  resetAll: () => {
    // Realtime-shared: não permitir wipe local.
    // eslint-disable-next-line no-console
    console.warn("resetAll() desativado — dados são compartilhados em tempo real.");
  },

  // ---------- Realtime application ----------
  _applyAssetRow: (id, data) =>
    set((s) => ({
      assets: data && !data.deletedAt ? replaceIn(s.assets, data) : s.assets.filter((x) => x.id !== id),
    })),
  _applyInspRow: (id, data) =>
    set((s) => ({
      inspections: data ? replaceIn(s.inspections, data) : s.inspections.filter((x) => x.id !== id),
    })),
  _applyWORow: (id, data) =>
    set((s) => ({
      workOrders: data ? replaceIn(s.workOrders, data) : s.workOrders.filter((x) => x.id !== id),
    })),
  _applyMechRow: (id, data) =>
    set((s) => ({
      mechanics: data ? replaceIn(s.mechanics, data) : s.mechanics.filter((x) => x.id !== id),
    })),
  _applyTagRow: (id, present) =>
    set((s) => {
      const exists = s.tagCatalog.includes(id);
      if (present && !exists) return { tagCatalog: [...s.tagCatalog, id] };
      if (!present && exists) return { tagCatalog: s.tagCatalog.filter((t) => t !== id) };
      return {};
    }),
  _applySigRow: (id, data) =>
    set((s) => {
      const next = { ...s.signatures };
      if (data) next[id] = data;
      else delete next[id];
      return { signatures: next };
    }),

  _hydrate: async () => {
    if (get().hydrated) return;

    // 1) Cache local (IndexedDB) — abre instantâneo e funciona sem rede
    const cached = await idbGet<CachedSnapshot>("cache", "snapshot");
    if (cached) {
      set({
        assets: (cached.assets ?? []).filter((a) => !a.deletedAt),
        inspections: cached.inspections ?? [],
        workOrders: cached.workOrders ?? [],
        mechanics: cached.mechanics ?? [],
        tagCatalog: cached.tagCatalog?.length ? cached.tagCatalog : DEFAULT_TAGS,
        tipoCatalog: cached.tipoCatalog ?? [],
        signatures: cached.signatures ?? {},
        hydrated: true,
      });
    }

    if (!isOnline()) {
      set({ hydrated: true });
      return;
    }

    // Busca as máquinas em páginas — evita uma única resposta gigante (cards com fotos)
    // que estoura o tempo limite e deixa o planner "vazio".
    const fetchAssetsPaged = async (): Promise<{ id: string; data: unknown }[]> => {
      const PAGE = 20;
      const all: { id: string; data: unknown }[] = [];
      for (let from = 0; ; from += PAGE) {
        let page: { id: string; data: unknown }[] | null = null;
        for (let tentativa = 0; tentativa < 3 && !page; tentativa++) {
          const res = await supabase.from("app_assets").select("id,data").range(from, from + PAGE - 1);
          if (res.error) {
            if (tentativa === 2) throw res.error;
            await new Promise((r) => setTimeout(r, 400 * (tentativa + 1)));
            continue;
          }
          page = (res.data ?? []) as { id: string; data: unknown }[];
        }
        all.push(...(page ?? []));
        if (!page || page.length < PAGE) break;
      }
      return all;
    };

    let aRows: { id: string; data: unknown }[];
    let iRes, wRes, mRes, tRes, sRes, tpRes;
    try {
      [aRows, iRes, wRes, mRes, tRes, sRes, tpRes] = await Promise.all([
        fetchAssetsPaged(),
        supabase.from("app_inspections").select("id,data"),
        supabase.from("app_work_orders").select("id,data"),
        supabase.from("app_mechanics").select("id,data"),
        supabase.from("app_tags").select("id"),
        supabase.from("app_signatures").select("id,data"),
        supabase.from("app_equipment_types").select("id"),
      ]);
    } catch (e) {
      console.warn("[sync] hidratação online falhou, usando cache local", e);
      set({ hydrated: true });
      return;
    }

    // Nunca esvazia a tela por causa de uma leitura que falhou parcialmente
    if (aRows.length === 0 && get().assets.length > 0) {
      console.warn("[sync] leitura de máquinas voltou vazia — mantendo dados em cache");
      set({ hydrated: true });
      return;
    }

    const assets = aRows
      .map((r) => r.data as unknown as Asset)
      .filter((a) => a && !a.deletedAt && !deletedAssetIds.has(a.id));

    const assetIds = new Set(assets.map((a) => a.id));
    const assetPrefixos = new Set(assets.map((a) => a.prefixo));
    const pertence = (r: { assetId?: string; prefixo?: string }) =>
      (r.assetId ? assetIds.has(r.assetId) : false) || (r.prefixo ? assetPrefixos.has(r.prefixo) : false);
    // Máquinas excluídas não devem reaparecer via inspeções/OS órfãs
    const inspections = (iRes.data ?? [])
      .map((r) => r.data as unknown as Inspection)
      .filter((i) => pertence(i as unknown as { assetId?: string; prefixo?: string }));
    const workOrders = (wRes.data ?? [])
      .map((r) => r.data as unknown as WorkOrder)
      .filter((w) => pertence(w as unknown as { assetId?: string; prefixo?: string }));

    let mechanics = (mRes.data ?? []).map((r) => r.data as unknown as Mechanic);

    // Nome normalizado: mesma pessoa cadastrada com ids diferentes (seed antigo x profile)
    const normNome = (n: string) =>
      n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");

    // Auto-sync: qualquer profile com role=mecanico que ainda não estiver em app_mechanics
    try {
      const { data: allRoles } = await supabase.rpc("user_ids_by_roles", {
        _roles: ["pcm", "supervisor", "admin", "mecanico"],
      });
      const rows = (allRoles ?? []) as { user_id: string; role: string }[];
      // Quem é pcm/supervisor/admin nunca entra na lista de manutentores alocáveis
      const gestores = new Set(
        rows.filter((r) => ["pcm", "supervisor", "admin"].includes(r.role)).map((r) => r.user_id),
      );
      // Também bloqueia por nome (mesma pessoa cadastrada manualmente com outro id)
      const gestorNomes = new Set<string>();
      if (gestores.size) {
        const { data: gp } = await supabase.from("profiles").select("id, nome").in("id", [...gestores]);
        for (const p of (gp ?? []) as { nome: string | null }[]) if (p.nome) gestorNomes.add(normNome(p.nome));
      }
      mechanics = mechanics.filter((m) => !gestores.has(m.id) && !gestorNomes.has(normNome(m.nome ?? "")));


      const ids = rows.filter((r) => r.role === "mecanico" && !gestores.has(r.user_id)).map((r) => r.user_id);
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, nome, turno, especialidade, ativo").in("id", ids);

        const existing = new Set(mechanics.map((m) => m.id));
        const missing: Mechanic[] = ((profs ?? []) as any[])
          .filter((p) => !existing.has(p.id))
          .map((p) => ({
            id: p.id,
            nome: p.nome ?? "Mecânico",
            turno: (p.turno as any) ?? "manha",
            especialidade: p.especialidade ?? "",
            status: p.ativo === false ? "fora_turno" : "livre",
            cargaHoras: 0,
            entradaHora: "07:45",
            saidaHora: "17:30",
            utilPct: 70,
          }));
        if (missing.length) {
          await supabase.from("app_mechanics").upsert(missing.map((m) => ({ id: m.id, data: m as any })));
          mechanics.push(...missing);
        }
      }
    } catch (e) {
      console.warn("mechanic auto-sync falhou", e);
    }

    // Mesma pessoa com dois cadastros (id antigo "meq-*" + id do perfil): mantém um só
    // e migra as máquinas alocadas ao id legado, senão o card mostra o nome de um
    // manutentor que a tela de alocação já considera removido.
    const canonPorNome = new Map<string, Mechanic>();
    const aliasMec = new Map<string, string>();
    for (const m of mechanics) {
      const k = normNome(m.nome ?? "");
      const prev = canonPorNome.get(k);
      if (!prev) {
        canonPorNome.set(k, m);
        continue;
      }
      const canon = prev.id.startsWith("meq-") ? m : prev;
      const dup = canon === prev ? m : prev;
      canonPorNome.set(k, canon);
      aliasMec.set(dup.id, canon.id);
    }
    if (aliasMec.size) {
      mechanics = mechanics.filter((m) => !aliasMec.has(m.id));
      for (const a of assets) {
        const atuais = a.mecanicoIds ?? (a.mecanicoId ? [a.mecanicoId] : []);
        if (!atuais.some((id) => aliasMec.has(id))) continue;
        const novos = Array.from(new Set(atuais.map((id) => aliasMec.get(id) ?? id)));
        a.mecanicoIds = novos.length ? novos : undefined;
        a.mecanicoId = novos[0];
        void queueAssetPush(a);
      }
    }


    const tagsFromDb = (tRes.data ?? []).map((r) => r.id as string);
    const tagCatalog = tagsFromDb.length ? tagsFromDb : DEFAULT_TAGS;
    const signatures: Record<string, SavedSignature> = {};
    for (const r of sRes.data ?? []) signatures[r.id as string] = r.data as unknown as SavedSignature;
    const tipoCatalog = (tpRes?.data ?? []).map((r) => r.id as string);
    set({ assets, inspections, workOrders, mechanics, tagCatalog, tipoCatalog, signatures, hydrated: true });
  },

}));

// ---------- Cache local (offline) ----------
type CachedSnapshot = {
  assets: Asset[];
  inspections: Inspection[];
  workOrders: WorkOrder[];
  mechanics: Mechanic[];
  tagCatalog: string[];
  tipoCatalog: string[];
  signatures: Record<string, SavedSignature>;
};

let cacheTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleCache() {
  if (typeof window === "undefined") return;
  if (cacheTimer) clearTimeout(cacheTimer);
  cacheTimer = setTimeout(() => {
    const s = useAppStore.getState();
    // Não sobrescreve o cache offline com uma lista vazia (falha de leitura)
    if (!s.assets.length) return;
    const snap: CachedSnapshot = {
      assets: s.assets,
      inspections: s.inspections,
      workOrders: s.workOrders,
      mechanics: s.mechanics,
      tagCatalog: s.tagCatalog,
      tipoCatalog: s.tipoCatalog,
      signatures: s.signatures,
    };
    void idbSet("cache", "snapshot", snap);
  }, 800);
}

if (typeof window !== "undefined") {
  useAppStore.subscribe(scheduleCache);

  // Troca as URLs provisórias (data:) pelas definitivas depois que o arquivo sobe,
  // e reenvia os registros afetados.
  registerUrlRewriter((from, to) => {
    const s = useAppStore.getState();
    const swap = <T,>(item: T): { item: T; changed: boolean } => {
      const raw = JSON.stringify(item);
      if (!raw.includes(from)) return { item, changed: false };
      return { item: JSON.parse(raw.split(from).join(to)) as T, changed: true };
    };

    const assets: Asset[] = [];
    const changedAssets: Asset[] = [];
    for (const a of s.assets) {
      const r = swap(a);
      assets.push(r.item);
      if (r.changed) changedAssets.push(r.item);
    }
    const inspections: Inspection[] = [];
    const changedInsp: Inspection[] = [];
    for (const i of s.inspections) {
      const r = swap(i);
      inspections.push(r.item);
      if (r.changed) changedInsp.push(r.item);
    }
    const workOrders: WorkOrder[] = [];
    const changedWO: WorkOrder[] = [];
    for (const w of s.workOrders) {
      const r = swap(w);
      workOrders.push(r.item);
      if (r.changed) changedWO.push(r.item);
    }
    const signatures: Record<string, SavedSignature> = {};
    const changedSigs: [string, SavedSignature][] = [];
    for (const [k, v] of Object.entries(s.signatures)) {
      const r = swap(v);
      signatures[k] = r.item;
      if (r.changed) changedSigs.push([k, r.item]);
    }

    if (!changedAssets.length && !changedInsp.length && !changedWO.length && !changedSigs.length) return;
    useAppStore.setState({ assets, inspections, workOrders, signatures });
    for (const a of changedAssets) void writeRow("app_assets", a.id, a, "asset");
    for (const i of changedInsp) void writeRow("app_inspections", i.id, i, "insp");
    for (const w of changedWO) void writeRow("app_work_orders", w.id, w, "wo");
    for (const [k, v] of changedSigs) void writeRow("app_signatures", k, v, "sig");
  });

  startOfflineSync();
}



export const KANBAN_COLUMNS: { key: KanbanColumn; title: string; short: string }[] = [
  { key: "chegada",            title: "INSERIR",             short: "INSERIR" },
  { key: "pcm",                title: "Fila PCM (OS SAP)",   short: "PCM" },
  { key: "aguardando_rc",      title: "Aguardando RC",       short: "Aguard. RC" },
  { key: "aguardando_pedido",  title: "Aguardando Pedido",   short: "Aguard. Pedido" },
  { key: "aguardando_pcm",     title: "Aguardando Material", short: "Aguard. Material" },
  { key: "execucao_liberada",  title: "Execução Liberada",   short: "Exec. Liberada" },

  { key: "mdo",                title: "Aguardando MO",       short: "Aguard. MO" },
  { key: "atribu_do",          title: "Manutentor Alocado",  short: "Alocado" },
  { key: "manutencao",         title: "Em Execução",         short: "Em Execução" },
  { key: "melhoria",           title: "Melhoria",            short: "Melhoria" },
  { key: "aguardando_saida",   title: "Aguardando Inspeção Saída", short: "Aguard. Saída" },
  { key: "liberado",           title: "Liberado",            short: "Liberado" },
];
