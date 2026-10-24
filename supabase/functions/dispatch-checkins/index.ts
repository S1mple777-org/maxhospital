// Davolanish kuzatuvi: vaqti kelgan "Ahvolingiz qanday?" so'rovlarini bemorga yuboradi
// va "yomonlashdi" javoblarini shifokorga Telegram orqali yetkazadi.
// Cron chaqiradi (GitHub Actions: .github/workflows/checkins-cron.yml). Foydalanuvchilar chaqira olmaydi.
//   web      -> user_notifications qatori (sayt real vaqtda ko'rsatadi)
//   telegram -> 3 ta havola-tugma: 😀 Yaxshilandi / 😐 O'zgarmadi / 😟 Yomonlashdi (/c/<token> sahifasi)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { json, serviceClient } from "../_shared/http.ts";
import { cronAuthorized, escHtml, telegramToUser } from "../_shared/notify.ts";

const siteUrl = () => (Deno.env.get("SITE_URL") ?? "https://max-hospital1.netlify.app").replace(/\/+$/, "");

interface DueCheckin {
  id: string; token: string; seq: number; patient_id: string; doctor_name: string;
  days: number; telegram_chat_id: number | null; telegram_enabled: boolean;
}

async function sendCheckinTelegram(c: DueCheckin): Promise<boolean> {
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!botToken || !c.telegram_chat_id || !c.telegram_enabled) return false;
  const link = `${siteUrl()}/c/${c.token}`;
  const text = [
    "🩺 <b>Davolanish kuzatuvi</b>",
    "",
    `Retseptingizga ${c.days} kun bo'ldi (shifokor: ${escHtml(c.doctor_name)}).`,
    c.seq >= 2 ? "Davolanish kursi tugashiga yaqin. Ahvolingiz qanday?" : "Ahvolingiz qanday? Bir bosishda javob bering, shifokor ko'radi.",
  ].join("\n");
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: c.telegram_chat_id,
        text,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[
            { text: "😀 Yaxshilandi", url: `${link}?a=better` },
            { text: "😐 O'zgarmadi", url: `${link}?a=same` },
          ], [
            { text: "😟 Yomonlashdi", url: `${link}?a=worse` },
          ]],
        },
      }),
    });
    if (!res.ok) console.warn("dispatch-checkins: telegram failed", res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.warn("dispatch-checkins: telegram error", e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!cronAuthorized(req)) return json({ error: "Unauthorized" }, 401);

  const db = serviceClient();
  let sent = 0, telegram = 0, doctorAlerts = 0;

  // 1) Bemorlarga so'rovlar
  const { data: due, error } = await db.rpc("claim_due_checkins", { _limit: 50 });
  if (error) {
    console.error("dispatch-checkins: claim_due_checkins", error.message);
    return json({ error: error.message }, 500);
  }
  for (const c of (due ?? []) as DueCheckin[]) {
    sent++;
    const { error: nErr } = await db.from("user_notifications").insert({
      user_id: c.patient_id,
      kind: "treatment_checkin",
      title: "Ahvolingiz qanday?",
      body: `Retseptingizga ${c.days} kun bo'ldi. Bir bosishda javob bering, shifokor ko'radi.`,
      data: { url: `/c/${c.token}`, checkin_id: c.id },
    });
    if (nErr) console.warn("dispatch-checkins: notification", nErr.message);
    if (await sendCheckinTelegram(c)) telegram++;
  }

  // 2) "Yomonlashdi" javoblari: shifokorga Telegram
  const { data: worse } = await db.rpc("claim_worse_checkins");
  for (const w of (worse ?? []) as { doctor_user_id: string | null; prescription_id: string; patient_name: string; diagnosis: string; note: string | null }[]) {
    if (!w.doctor_user_id) continue;
    const html = [
      "⚠️ <b>Bemor ahvoli yomonlashdi</b>",
      "",
      `👤 ${escHtml(w.patient_name)}`,
      `Tashxis: ${escHtml(w.diagnosis)}`,
      w.note ? `Izoh: ${escHtml(w.note)}` : "",
      "",
      `<a href="${siteUrl()}/prescription/${w.prescription_id}">Retseptni ochish</a>`,
    ].filter((l) => l !== "").join("\n");
    if (await telegramToUser(db, w.doctor_user_id, html)) doctorAlerts++;
  }

  return json({ checkins: sent, telegram, doctorAlerts });
});
