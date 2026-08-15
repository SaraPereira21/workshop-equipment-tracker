import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface LiberacaoPayload {
  prefixo: string;
  inventario?: string;
  codigo_armac?: string;
  tipo_objeto?: string;
  modelo?: string;
  marca?: string;
  numero_serie?: string;
  horimetro?: number;
  classificacao?: "novo" | "frota" | string;
  cliente?: string;
  contrato?: string;
  observacoes?: string;
  responsavel_pcm?: string;
  destinatarios: string[];
  pdf_os_url?: string;
  pdf_inspecao_url?: string;
  card_url?: string;
  anexos?: { nome: string; tipo?: string; url: string }[];
}

type LiberacaoEmailResult =
  | { ok: true; assunto: string; destinatarios: string[] }
  | { ok: false; assunto: string; destinatarios: string[]; status: string; message: string };

function buildAssunto(p: LiberacaoPayload) {
  const modelo = [p.marca, p.modelo].filter(Boolean).join(" ").trim();
  return `Liberação de Equipamento ${p.prefixo}${modelo ? " - " + modelo : ""}`;
}

function escapeHtml(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeTerm(term: string) {
  return term.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function prefixNumber(term: string): string | null {
  const match = term.match(/(\d{1,6})\s*$/);
  return match ? match[1] : null;
}

function preferredFleetCodePrefix(prefixo: string): string | null {
  const p = normalizeTerm(prefixo);
  if (p.startsWith("CVW")) return "CM";
  if (p.startsWith("CDT")) return "CT";
  const letters = p.match(/^[A-Z]+/)?.[0] ?? "";
  if (letters.length >= 2) return letters.slice(0, 2);
  return null;
}

function buildCorpoHtml(p: LiberacaoPayload) {
  const linha = (l: string, v?: string | number) =>
    v !== undefined && v !== null && String(v).trim() !== ""
      ? `<tr><td style="padding:6px 12px;background:#f4f6f8;font-weight:600;border:1px solid #e2e8f0">${escapeHtml(l)}</td><td style="padding:6px 12px;border:1px solid #e2e8f0">${escapeHtml(v)}</td></tr>`
      : "";
  const classif = p.classificacao === "novo" ? "Equipamento novo (liberação automática)" : "Equipamento de frota";
  const links = [
    ...(p.card_url ? [{ nome: "Abrir card da máquina no Planner", url: p.card_url }] : []),
    ...(p.anexos ?? []).filter((anexo) => anexo.url),
  ];
  const linksHtml = links.length > 0
    ? `<div style="margin-top:16px"><div style="font-size:13px;font-weight:700;margin-bottom:6px">Links e anexos</div><ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.6">${links.map((link) => `<li><a href="${escapeHtml(link.url)}" style="color:#0b3b82">${escapeHtml(link.nome)}</a></li>`).join("")}</ul></div>`
    : "";
  return `<!DOCTYPE html><html><body style="font-family:Segoe UI,Arial,sans-serif;color:#0f172a;margin:0;padding:16px;background:#fff">
    <div style="max-width:640px;margin:0 auto;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
      <div style="background:#0b3b82;color:#fff;padding:14px 18px">
        <div style="font-size:12px;opacity:.85;letter-spacing:.06em">PLANNER MATRIZ — ENGELOG</div>
        <div style="font-size:20px;font-weight:700;margin-top:2px">Liberação de Equipamento</div>
      </div>
      <div style="padding:16px 18px">
        <p style="margin:0 0 12px">Prezados, informamos a <b>liberação do equipamento ${escapeHtml(p.prefixo)}</b> conforme dados abaixo.</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          ${linha("Prefixo / Inventário", [p.prefixo, p.inventario].filter(Boolean).join(" / "))}
          ${linha("Código ARMAC", p.codigo_armac)}
          ${linha("Tipo do Objeto", p.tipo_objeto)}
          ${linha("Marca / Modelo", [p.marca, p.modelo].filter(Boolean).join(" "))}
          ${linha("Nº de Série / Chassi", p.numero_serie)}
          ${linha("Horímetro", p.horimetro)}
          ${linha("Classificação", classif)}
          ${linha("Cliente", p.cliente)}
          ${linha("Contrato", p.contrato)}
          
          ${linha("Observações", p.observacoes)}
        </table>
        ${linksHtml}
        <p style="margin:16px 0 4px;font-size:12px;color:#475569">Este e-mail foi gerado automaticamente pelo sistema <b>Planner Matriz — Fluxo de Máquinas</b>.</p>
      </div>
    </div>
  </body></html>`;
}

export const sendLiberacaoEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: LiberacaoPayload) => data)
  .handler(async ({ data, context }): Promise<LiberacaoEmailResult> => {
    const url = process.env.POWER_AUTOMATE_LIBERACAO_URL;
    let payloadData = data;

    if (!payloadData.numero_serie || !payloadData.codigo_armac || !payloadData.inventario) {
      const normalizedPrefix = normalizeTerm(payloadData.prefixo ?? "");
      const number = prefixNumber(payloadData.prefixo ?? "");
      const plain = number ? number.replace(/^0+/, "") || "0" : "";
      const padded = plain ? plain.padStart(5, "0") : "";
      const filters = payloadData.codigo_armac
        ? `codigo_armac.eq.${normalizeTerm(payloadData.codigo_armac)}`
        : [
          normalizedPrefix ? `codigo_armac.eq.${normalizedPrefix}` : "",
          normalizedPrefix ? `numero_inventario.eq.${normalizedPrefix}` : "",
          normalizedPrefix ? `numero_serie.eq.${normalizedPrefix}` : "",
          padded ? `codigo_armac.ilike.%${padded}` : "",
          plain ? `codigo_armac.ilike.%${plain}` : "",
        ].filter(Boolean).join(",");

      if (filters) {
        const { data: fleetRows } = await context.supabase
          .from("fleet_assets")
          .select("codigo_armac, numero_inventario, numero_serie, marca, modelo, tipo_objeto")
          .or(filters)
          .eq("ativo", true)
          .order("codigo_armac")
          .limit(20);

        const rows = fleetRows ?? [];
        const preferredPrefix = preferredFleetCodePrefix(payloadData.prefixo ?? "");
        const fleet = rows.find((row) => preferredPrefix && String(row.codigo_armac ?? "").startsWith(preferredPrefix)) ?? rows[0];

        if (fleet) {
          payloadData = {
            ...payloadData,
            codigo_armac: payloadData.codigo_armac || String(fleet.codigo_armac ?? ""),
            inventario: payloadData.inventario || String(fleet.numero_inventario ?? ""),
            numero_serie: payloadData.numero_serie || String(fleet.numero_serie ?? ""),
            marca: payloadData.marca || String(fleet.marca ?? ""),
            modelo: payloadData.modelo || String(fleet.modelo ?? ""),
            tipo_objeto: payloadData.tipo_objeto || String(fleet.tipo_objeto ?? ""),
          };
        }
      }
    }

    const assunto = buildAssunto(payloadData);
    const corpoHtml = buildCorpoHtml(payloadData);

    if (!url) {
      return { ok: false, assunto, destinatarios: payloadData.destinatarios ?? [], status: "missing_config", message: "Webhook de liberação não configurado." };
    }
    if (!payloadData.destinatarios?.length) {
      return { ok: false, assunto, destinatarios: [], status: "missing_recipients", message: "Nenhum destinatário informado." };
    }

    // Power Automate: schema espera todos os campos como String.
    // Serializamos números/arrays para evitar TriggerInputSchemaMismatch.
    const destinatariosStr = payloadData.destinatarios.join(";");
    const anexos = payloadData.anexos ?? [];
    const anexosLinks = anexos.map((a) => `${a.nome}: ${a.url}`).join("\n");
    const osUrls = anexos
      .filter((a) => a.tipo === "os_corretiva" || a.tipo === "os_preventiva")
      .map((a) => a.url)
      .join(";");
    const body = {
      evento: "liberacao_equipamento",
      assunto: String(assunto),
      corpoHtml: String(corpoHtml),
      destinatarios: destinatariosStr,
      destinatariosLista: payloadData.destinatarios,
      prefixo: String(payloadData.prefixo ?? ""),
      inventario: String(payloadData.inventario ?? ""),
      codigo_armac: String(payloadData.codigo_armac ?? ""),
      tipo_objeto: String(payloadData.tipo_objeto ?? ""),
      modelo: String(payloadData.modelo ?? ""),
      marca: String(payloadData.marca ?? ""),
      numero_serie: String(payloadData.numero_serie ?? ""),
      horimetro: String(payloadData.horimetro ?? ""),
      classificacao: String(payloadData.classificacao ?? ""),
      cliente: String(payloadData.cliente ?? ""),
      contrato: String(payloadData.contrato ?? ""),
      data_liberacao: new Date().toISOString(),
      responsavel_pcm: String(payloadData.responsavel_pcm ?? ""),
      observacoes: String(payloadData.observacoes ?? ""),
      pdf_os_url: String(payloadData.pdf_os_url ?? ""),
      pdf_inspecao_url: String(payloadData.pdf_inspecao_url ?? ""),
      pdfs_os_urls: String(osUrls),
      card_url: String(payloadData.card_url ?? ""),
      link_card: String(payloadData.card_url ?? ""),
      link_equipamento: String(payloadData.card_url ?? ""),
      anexos: String(anexosLinks),
      anexos_links: String(anexosLinks),
      links_anexos: String(anexosLinks),
      anexos_json: JSON.stringify(anexos),
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
        evento: "liberacao_equipamento",
        prefixo: payloadData.prefixo,
        assunto,
        destinatarios: payloadData.destinatarios,
        status,
        response: (err?.message ?? "").slice(0, 500),
        payload: body,
        sent_by: context.userId,
      });
      const rawMessage = String(err?.message ?? "Falha ao enviar e-mail");
      const message = rawMessage.includes("WorkflowTriggerIsNotEnabled") || rawMessage.includes("trigger is not enabled")
        ? "Fluxo do Power Automate está desativado. Ative o fluxo e tente novamente."
        : rawMessage;

      return {
        ok: false,
        assunto,
        destinatarios: payloadData.destinatarios,
        status,
        message,
      };
    }

    await context.supabase.from("email_logs").insert({
      evento: "liberacao_equipamento",
      prefixo: payloadData.prefixo,
      assunto,
      destinatarios: payloadData.destinatarios,
      status,
      response: responseText.slice(0, 500),
      payload: body,
      sent_by: context.userId,
    });

    return { ok: true, assunto, destinatarios: payloadData.destinatarios };
  });
