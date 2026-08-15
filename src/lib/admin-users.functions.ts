import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const AppRole = z.enum(["admin", "pcm", "supervisor", "frota", "inspetor", "mecanico", "visitante"]);

function onlyDigits(s: string) {
  return s.replace(/\D/g, "");
}

function isValidCpf(cpfRaw: string): boolean {
  const cpf = onlyDigits(cpfRaw);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  const calc = (base: string, factor: number) => {
    let sum = 0;
    for (const c of base) {
      sum += parseInt(c, 10) * factor;
      factor--;
    }
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = calc(cpf.slice(0, 9), 10);
  const d2 = calc(cpf.slice(0, 10), 11);
  return d1 === parseInt(cpf[9], 10) && d2 === parseInt(cpf[10], 10);
}

function cpfToSyntheticEmail(cpf: string): string {
  return `${onlyDigits(cpf)}@oficinamatriz.local`;
}

function randomPassword(len = 10): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  return out;
}

const CreateInput = z.object({
  cpf: z.string().optional().default(""),
  email: z.string().email().optional().or(z.literal("")).default(""),
  nome: z.string().min(1),
  cargo: z.string().optional().default(""),
  especialidade: z.string().optional().default(""),
  turno: z.string().optional().default("manha"),
  telefone: z.string().optional().default(""),
  roles: z.array(AppRole).default([]),
});

export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CreateInput.parse(data))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Apenas administradores podem cadastrar usuários");

    const hasCpf = !!data.cpf && onlyDigits(data.cpf).length > 0;
    const hasEmail = !!data.email && data.email.includes("@");
    if (!hasCpf && !hasEmail) throw new Error("Informe CPF ou E-mail");

    let cpfDigits = "";
    let email = "";
    if (hasCpf) {
      if (!isValidCpf(data.cpf)) throw new Error("CPF inválido");
      cpfDigits = onlyDigits(data.cpf);
      email = hasEmail ? data.email : cpfToSyntheticEmail(cpfDigits);
    } else {
      email = data.email;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (cpfDigits) {
      const { data: existing } = await supabaseAdmin
        .from("profiles").select("id").eq("cpf", cpfDigits).maybeSingle();
      if (existing) throw new Error("Já existe um usuário com este CPF");
    }
    {
      const { data: existingE } = await supabaseAdmin
        .from("profiles").select("id").eq("email", email).maybeSingle();
      if (existingE) throw new Error("Já existe um usuário com este e-mail");
    }

    const password = randomPassword(10);

    const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        nome: data.nome,
        cpf: cpfDigits,
        cargo: data.cargo,
        must_change_password: true,
      },
    });
    if (cErr || !created.user) throw new Error(cErr?.message ?? "Falha ao criar usuário");

    const userId = created.user.id;

    const { error: pErr } = await supabaseAdmin.from("profiles").update({
      nome: data.nome,
      cpf: cpfDigits || null,
      email,
      cargo: data.cargo,
      especialidade: data.especialidade,
      turno: data.turno,
      telefone: data.telefone,
      must_change_password: true,
    }).eq("id", userId);
    if (pErr) throw new Error(pErr.message);

    if (data.roles.length) {
      const { error: rErr } = await supabaseAdmin
        .from("user_roles")
        .insert(data.roles.map((r) => ({ user_id: userId, role: r })));
      if (rErr) throw new Error(rErr.message);
    }

    return { userId, cpf: cpfDigits, email, password };
  });

export const adminSetActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ userId: z.string().uuid(), ativo: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Apenas administradores");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ ativo: data.ativo })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);

    await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.ativo ? "none" : "876000h",
    });

    return { ok: true };
  });

export const adminResetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Apenas administradores");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const password = randomPassword(10);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("profiles").update({ must_change_password: true }).eq("id", data.userId);
    return { password };
  });
