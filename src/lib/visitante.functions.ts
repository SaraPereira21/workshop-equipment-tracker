import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const DOMINIOS_VISITANTE = ["fornecedoraengelog.com.br", "armac.com.br"];

export function isDominioVisitante(email: string): boolean {
  const dom = email.trim().toLowerCase().split("@")[1];
  return !!dom && DOMINIOS_VISITANTE.includes(dom);
}

/**
 * Concede o perfil "visitante" (somente visualização) para usuários que se
 * cadastraram com e-mail corporativo verificado e ainda não possuem função.
 */
export const ensureVisitanteRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: userRes } = await context.supabase.auth.getUser();
    const u = userRes?.user;
    if (!u?.email || !u.email_confirmed_at) return { granted: false as const };
    if (!isDominioVisitante(u.email)) return { granted: false as const };

    const { data: existing } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (existing && existing.length > 0) return { granted: false as const };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "visitante" });
    if (error) return { granted: false as const };
    return { granted: true as const };
  });
