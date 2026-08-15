import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listInspetores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const perms = await Promise.all(
      (["admin", "pcm", "supervisor"] as const).map((r) =>
        supabase.rpc("has_role", { _user_id: userId, _role: r }),
      ),
    );
    if (!perms.some((p) => p.data === true)) throw new Error("Forbidden");

    const { data: roleRows, error: roleErr } = await supabase.rpc("user_ids_by_roles", {
      _roles: ["inspetor"],
    });
    if (roleErr) throw new Error(roleErr.message);

    const ids = ((roleRows ?? []) as { user_id: string }[]).map((r) => r.user_id);
    if (!ids.length) return [] as { id: string; nome: string }[];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, nome, ativo")
      .in("id", ids);
    if (error) throw new Error(error.message);

    return ((data ?? []) as { id: string; nome: string | null; ativo: boolean }[])
      .filter((p) => p.ativo !== false)
      .map((p) => ({ id: p.id, nome: p.nome ?? "Inspetor" }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  });
