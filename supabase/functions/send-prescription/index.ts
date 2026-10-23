// Sends an electronic prescription to the patient's Telegram: the full text as a message
// and the PDF (generated in the browser with the same generator as the "Download" button)
// as a document. Only the prescribing doctor or the patient may send it, and only to the
// patient's own linked Telegram chat.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, getUser, json, serviceClient } from "../_shared/http.ts";

const MAX_PDF_BYTES = 3 * 1024 * 1024;

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

interface Medicine { name?: string; dose?: string; frequency?: string; duration?: string }

function prescriptionText(rx: any, siteUrl: string): string {
  const meds = ((rx.medicines ?? []) as Medicine[])
    .map((m, i) => `${i + 1}. <b>${esc(m.name)}</b>${[m.dose, m.frequency, m.duration].filter(Boolean).map((x) => ` — ${esc(x)}`).join("")}`)
    .join("\n");
  const date = new Date(rx.created_at).toLocaleDateString("uz-UZ", { timeZone: "Asia/Tashkent" });
  const parts = [
    "💊 <b>Elektron retsept</b>",
    "",
    `👤 Bemor: ${esc(rx.patient_name)}`,
    `🩺 Shifokor: ${esc(rx.doctor_name)}${rx.doctor_title ? `, ${esc(rx.doctor_title)}` : ""}`,
    rx.department_name ? `🏥 Bo'lim: ${esc(rx.department_name)}` : "",
    `📅 Sana: ${esc(date)}`,
    "",
    `<b>Tashxis:</b> ${esc(rx.diagnosis)}`,
    "",
    "<b>Dorilar:</b>",
    meds || "—",
    rx.notes ? `\n<b>Shifokor izohi:</b> ${esc(rx.notes)}` : "",
    "",
    `🔗 <a href="${siteUrl}/prescription/${rx.id}">Saytda ochish</a>`,
  ].filter((x) => x !== "");
  const text = parts.join("\n");
  // Telegram message limit is 4096 characters.
  return text.length > 4000 ? `${text.slice(0, 3990)}…` : text;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!botToken) return json({ error: "Telegram bot sozlanmagan" }, 500);
  const siteUrl = (Deno.env.get("SITE_URL") ?? "https://max-hospital1.netlify.app").replace(/\/+$/, "");
  const tg = (method: string, init: RequestInit) => fetch(`https://api.telegram.org/bot${botToken}/${method}`, init);

  const db = serviceClient();
  const user = await getUser(req, db);
  if (!user) return json({ error: "Avval tizimga kiring" }, 401);

  const { prescription_id, pdf_base64 } = await req.json().catch(() => ({}));
  if (typeof prescription_id !== "string") return json({ error: "prescription_id kerak" }, 400);

  const { data: rx } = await db.from("prescriptions").select("*").eq("id", prescription_id).maybeSingle();
  if (!rx) return json({ error: "Retsept topilmadi" }, 404);

  const { data: doctor } = await db.from("doctors").select("user_id").eq("id", rx.doctor_id).maybeSingle();
  if (user.id !== rx.patient_id && user.id !== doctor?.user_id) {
    return json({ error: "Bu retseptni yuborishga ruxsat yo'q" }, 403);
  }

  const { data: profile } = await db.from("profiles")
    .select("telegram_chat_id, telegram_notifications_enabled")
    .eq("user_id", rx.patient_id).maybeSingle();
  if (!profile?.telegram_chat_id) return json({ sent: false, reason: "not_linked" });
  // The doctor's automatic send respects the patient's setting; the patient pressing the button always gets it.
  if (user.id !== rx.patient_id && !profile.telegram_notifications_enabled) {
    return json({ sent: false, reason: "disabled" });
  }
  const chatId = profile.telegram_chat_id;

  const msg = await tg("sendMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: prescriptionText(rx, siteUrl), parse_mode: "HTML", disable_web_page_preview: true }),
  });
  if (!msg.ok) {
    console.error("send-prescription: sendMessage failed", msg.status, await msg.text());
    return json({ sent: false, reason: "telegram_error" }, 502);
  }

  let pdfSent = false;
  if (typeof pdf_base64 === "string" && pdf_base64.length > 0) {
    try {
      const bytes = Uint8Array.from(atob(pdf_base64), (c) => c.charCodeAt(0));
      const isPdf = bytes.length > 4 && String.fromCharCode(...bytes.slice(0, 4)) === "%PDF";
      if (isPdf && bytes.length <= MAX_PDF_BYTES) {
        const form = new FormData();
        form.append("chat_id", String(chatId));
        form.append("caption", "📄 Retsept (PDF)");
        form.append("document", new Blob([bytes], { type: "application/pdf" }), `retsept-${String(rx.id).slice(0, 8)}.pdf`);
        const doc = await tg("sendDocument", { method: "POST", body: form });
        pdfSent = doc.ok;
        if (!doc.ok) console.error("send-prescription: sendDocument failed", doc.status, await doc.text());
      }
    } catch (e) {
      console.error("send-prescription: bad pdf", e);
    }
  }

  return json({ sent: true, pdf: pdfSent });
});
