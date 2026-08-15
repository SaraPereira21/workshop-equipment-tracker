import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface MencaoPayload {
  prefixo: string;
  autor: string;
  autorCargo?: string;
  texto: string;
  mencionados: string[]; // user ids
  link?: string;         // deep link to the machine card
}

type MencaoResult =
  | { ok: true; destinatarios: string[] }
  | { ok: false; status: string; message: string; destinatarios?: string[] };

export const sendMencaoEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: MencaoPayload) => data)
  .handler(async ({ data, context }): Promise<MencaoResult> => {
    const url = process.env.POWER_AUTOMATE_MENCAO_URL;
    if (!url) {
      return { ok: false, status: "missing_config", message: "Webhook de menção não configurado." };
    }
    if (!data.mencionados?.length) {
      return { ok: false, status: "no_mentions", message: "Sem menções." };
    }

    // Resolve emails dos mencionados a partir do profiles
    const { data: profs } = await context.supabase
      .from("profiles")
      .select("id,email,nome")
      .in("id", data.mencionados);

    const destinatarios = (profs ?? [])
      .map((p) => p.email)
      .filter((e): e is string => !!e);

    if (!destinatarios.length) {
      return { ok: false, status: "no_emails", message: "Mencionados não possuem e-mail cadastrado." };
    }

    const assunto = `[Planner Matriz] ${data.autor} te mencionou em ${data.prefixo}`;
    const corpoHtml = `<!DOCTYPE html><html><body style="font-family:Segoe UI,Arial,sans-serif;color:#0f172a;margin:0;padding:16px;background:#fff">
      <div style="max-width:640px;margin:0 auto;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
        <div style="background:#0b3b82;color:#fff;padding:14px 18px">
          <div style="font-size:12px;opacity:.85;letter-spacing:.06em">PLANNER MATRIZ — ENGELOG</div>
          <div style="font-size:18px;font-weight:700;margin-top:2px">Você foi mencionado(a)</div>
        </div>
        <div style="padding:16px 18px;font-size:14px">
          <p style="margin:0 0 8px"><b>${data.autor}</b>${data.autorCargo ? ` — <span style="color:#475569">${data.autorCargo}</span>` : ""}
             mencionou você no card <b>${data.prefixo}</b>:</p>
          <blockquote style="margin:12px 0;padding:10px 14px;border-left:3px solid #f59e0b;background:#fff7ed;color:#0f172a;white-space:pre-wrap">${escapeHtml(data.texto)}</blockquote>
          ${data.link ? `<p style="margin:16px 0 4px"><a href="${data.link}" style="background:#0b3b82;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600">Abrir card ${data.prefixo}</a></p>` : ""}
          <p style="margin:16px 0 0;font-size:12px;color:#64748b">Este e-mail foi gerado automaticamente pelo sistema Planner Matriz — Fluxo de Máquinas.</p>
        </div>
      </div>
    </body></html>`;

    const body = {
      evento: "mencao_chat",
      assunto: String(assunto),
      corpoHtml: String(corpoHtml),
      destinatarios: destinatarios.join(";"),
      destinatariosLista: destinatarios,
      prefixo: String(data.prefixo),
      autor: String(data.autor),
      autorCargo: String(data.autorCargo ?? ""),
      texto: String(data.texto),
      link: String(data.link ?? ""),
      data_evento: new Date().toISOString(),
    };

    let status = "ok";
    let responseText = "";
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      responseText = await res.text().catch(() => "");
      if (!res.ok) {
        status = `http_${res.status}`;
        throw new Error(`Power Automate respondeu ${res.status}: ${responseText.slice(0, 200)}`);
      }
    } catch (err: any) {
      status = status === "ok" ? "error" : status;
      await context.supabase.from("email_logs").insert({
        evento: "mencao_chat",
        prefixo: data.prefixo,
        assunto,
        destinatarios,
        status,
        response: (err?.message ?? "").slice(0, 500),
        payload: body,
        sent_by: context.userId,
      });
      return { ok: false, status, message: String(err?.message ?? "Falha ao enviar e-mail"), destinatarios };
    }

    await context.supabase.from("email_logs").insert({
      evento: "mencao_chat",
      prefixo: data.prefixo,
      assunto,
      destinatarios,
      status,
      response: responseText.slice(0, 500),
      payload: body,
      sent_by: context.userId,
    });

    return { ok: true, destinatarios };
  });

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
