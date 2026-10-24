// Davolanish kuzatuvi: vaqti kelgan "Ahvolingiz qanday?" so'rovlarini bemorga yuboradi
// va "yomonlashdi" javoblarini shifokorga Telegram orqali yetkazadi.
// Cron chaqiradi (pg_cron: migration 20261024190000_cron_scheduler.sql; zaxira: GitHub Actions). Foydalanuvchilar chaqira olmaydi.
//   web      -> user_notifications qatori (sayt real vaqtda ko'rsatadi)
//   telegram -> 3 ta havola-tugma: 😀 Yaxshilandi / 😐 O'zgarmadi / 😟 Yomonlashdi (/c/<token> sahifasi)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { json, serviceClient } from "../_shared/http.ts";
import { escHtml, isCronRequest, telegramToUser } from "../_shared/notify.ts";

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
  const db = serviceClient();
  if (!(await isCronRequest(req, db))) return json({ error: "Unauthorized" }, 401);
  let sent = 0, telegram = 0, doctorAlerts = 0;

  // 1) Bemorlarga so'rovlar
  const { data: due, error } = await db.rpc("claim_due_checkins", { _limit: 50 });
  // Bir qism xato bersa ham qolganlari (bron eslatmasi) ishlayveradi.
  if (error) console.error("dispatch-checkins: claim_due_checkins", error.message);
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

  // 3) Bron eslatmasi: qabulga 1 soat qolganda bemorga va shifokorga (bir marta).
  let bookingReminders = 0;
  const { data: soon, error: bErr } = await db.rpc("claim_booking_reminders", { _limit: 100 });
  if (bErr) console.warn("dispatch-checkins: claim_booking_reminders", bErr.message);
  for (const b of (soon ?? []) as { consultation_id: string; scheduled_at: string; patient_id: string; doctor_user_id: string | null; patient_name: string; doctor_name: string }[]) {
    bookingReminders++;
    const time = new Date(b.scheduled_at).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tashkent" });
    const link = `${siteUrl()}/consultation/${b.consultation_id}`;
    await db.from("user_notifications").insert({
      user_id: b.patient_id, kind: "booking_reminder", title: `Qabul soat ${time} da`,
      body: `${b.doctor_name} bilan konsultatsiya. 15 daqiqa oldin navbatning boshiga o'tasiz.`,
      data: { url: `/consultation/${b.consultation_id}` },
    });
    await telegramToUser(db, b.patient_id,
      `⏰ <b>Qabul soat ${time} da</b>\n\nShifokor: ${escHtml(b.doctor_name)}\n<a href="${link}">Konsultatsiyani ochish</a>`);
    if (b.doctor_user_id) {
      await telegramToUser(db, b.doctor_user_id,
        `⏰ <b>Soat ${time} da yozuv</b>\n\nBemor: ${escHtml(b.patient_name)}\n<a href="${siteUrl()}/doctor-dashboard">Shifokor kabineti</a>`);
    }
  }

  return json({ checkins: sent, telegram, doctorAlerts, bookingReminders });
});
