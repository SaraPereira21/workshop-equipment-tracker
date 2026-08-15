import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { setCurrentUserNome } from "@/lib/store";

export type AppRole = "admin" | "pcm" | "supervisor" | "frota" | "inspetor" | "mecanico" | "visitante";

export interface Profile {
  id: string;
  nome: string;
  email: string | null;
  cpf: string | null;
  cargo: string | null;
  especialidade: string | null;
  turno: string | null;
  telefone: string | null;
  assinatura_url: string | null;
  ativo: boolean;
  must_change_password: boolean | null;
}

interface AuthCtx {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: AppRole[];
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadProfile(userId: string) {
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    setProfile(p as Profile | null);
    setCurrentUserNome((p as Profile | null)?.nome ?? "");
    let list = ((r ?? []) as { role: AppRole }[]).map((x) => x.role);
    if (list.length === 0) {
      // Cadastro corporativo (domínios liberados): concede visualização.
      try {
        const { ensureVisitanteRole } = await import("@/lib/visitante.functions");
        const res = await ensureVisitanteRole();
        if (res?.granted) list = ["visitante"];
      } catch {
        /* ignora */
      }
    }
    setRoles(list);
  }

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => loadProfile(s.user.id), 0);
      } else {
        setProfile(null);
        setRoles([]);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) loadProfile(data.session.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value: AuthCtx = {
    user: session?.user ?? null,
    session,
    profile,
    roles,
    loading,
    refresh: async () => {
      if (session?.user) await loadProfile(session.user.id);
    },
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

export function hasRole(roles: AppRole[], r: AppRole | AppRole[]) {
  const arr = Array.isArray(r) ? r : [r];
  return arr.some((x) => roles.includes(x));
}
