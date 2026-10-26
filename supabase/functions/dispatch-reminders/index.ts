// Sends medication reminders whose time has come. Called every minute by
// pg_cron (or by the GitHub Actions fallback). Not callable by users.
//   web      -> user_notifications row (the site shows it in real time)
//   telegram -> bot message with "✅ Ichdim / ⏭ O'tkazib yubordim" buttons
//   sms      -> Eskiz.uz, only on plans with sms_enabled (Premium)
//   app      -> nothing here: the Android app schedules it on the phone itself
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { json, serviceClient } from "../_shared/http.ts";
import { escHtml, isCronRequest, telegramToUser } from "../_shared/notify.ts";
import { localTime, reminderBody, reminderSms, reminderTitle, smsPhone } from "../_shared/medication-plan.ts";

const siteUrl = () => (Deno.env.get("SITE_URL") ?? "https://max-hospital1.netlify.app").replace(/\/+$/, "");

interface DueReminder {
  reminder_id: string;
  user_id: string;
  scheduled_at: string;
  timezone: string;
  medicine_name: string;
  dose: string | null;
  instructions: string | null;
  channels: string[];
  plan: string;
  telegram_chat_id: number | null;
  telegram_enabled: boolean;
  phone: string | null;
}

function authorized(req: Request): boolean {
  const secret = Deno.env.get("REMINDERS_CRON_SECRET");
  if (!secret) return false;
  const given = req.headers.get("x-cron-secret") ?? "";
  if (given.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= given.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

// ---- Telegram ---------------------------------------------------------------
async function sendTelegram(chatId: number, r: DueReminder, time: string, nudge = false): Promise<boolean> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) return false;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const text = [
    nudge ? `⏰ <b>Eslatma: dorini ichdingizmi?</b> (soat ${time})` : `💊 <b>Dori ichish vaqti</b> — ${time}`,
    "",
    `<b>${esc(r.medicine_name)}</b>${r.dose ? ` — ${esc(r.dose)}` : ""}`,
    r.instructions ? `<i>${esc(r.instructions)}</i>` : "",
  ].filter((l, i) => l !== "" || i === 1).join("\n");
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ Ichdim", callback_data: `med:taken:${r.reminder_id}` },
          { text: "⏭ O'tkazib yubordim", callback_data: `med:skip:${r.reminder_id}` },
        ]],
      },
    }),
  });
  return res.ok;
}

// ---- Eskiz SMS ----------------------------------------------------------------
let eskizToken: string | null = null;

async function eskizLogin(): Promise<string | null> {
  const email = Deno.env.get("ESKIZ_EMAIL");
  const password = Deno.env.get("ESKIZ_PASSWORD");
  if (!email || !password) return null;
  const form = new FormData();
  form.set("email", email);
  form.set("password", password);
  const res = await fetch("https://notify.eskiz.uz/api/auth/login", { method: "POST", body: form });
  if (!res.ok) {
    console.error("Eskiz login failed", res.status);
    return null;
  }
  const data = await res.json().catch(() => null);
  return data?.data?.token ?? null;
}

async function sendSms(phone: string, message: string, retry = true): Promise<boolean> {
  eskizToken ??= await eskizLogin();
  if (!eskizToken) return false;
  const form = new FormData();
  form.set("mobile_phone", phone);
  form.set("message", message);
  form.set("from", Deno.env.get("ESKIZ_FROM") || "4546");
  const res = await fetch("https://notify.eskiz.uz/api/message/sms/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${eskizToken}` },
    body: form,
  });
  if (res.status === 401 && retry) {
    eskizToken = null; // token expired: log in again once
    return sendSms(phone, message, false);
  }
  if (!res.ok) console.error("Eskiz send failed", res.status, await res.text().catch(() => ""));
  return res.ok;
}

// ---- Main -------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const db = serviceClient();
  if (!authorized(req) && !(await isCronRequest(req, db))) return json({ error: "Forbidden" }, 403);

  // Muddati tugagan obunalarni uzaytirish (pg_cron bo'lmasa ham shu chaqiruv orqali ishlaydi).
  const { data: renewed, error: renewError } = await db.rpc("renew_subscriptions");
  if (renewError) console.error("renew_subscriptions failed", renewError);

  const { data, error } = await db.rpc("claim_due_medication_reminders", { _limit: 300 });
  if (error) {
    console.error("claim failed", error);
    return json({ error: error.message }, 500);
  }

  const due = (data ?? []) as DueReminder[];
  const { data: smsPlans } = await db.from("subscription_plans").select("id").eq("sms_enabled", true);
  const smsPlanIds = new Set((smsPlans ?? []).map((p) => p.id));

  const stats = { claimed: due.length, web: 0, telegram: 0, sms: 0, renewed: Number(renewed ?? 0) };
  const webRows: Record<string, unknown>[] = [];

  await Promise.all(due.map(async (r) => {
    const time = localTime(r.scheduled_at, r.timezone);
    const info = { medicine_name: r.medicine_name, dose: r.dose, instructions: r.instructions, time };
    const sent: string[] = [];

    if (r.channels.includes("web")) {
      webRows.push({
        user_id: r.user_id,
        kind: "medication",
        title: reminderTitle("uz", info),
        body: reminderBody("uz", info),
        data: { reminder_id: r.reminder_id },
      });
      sent.push("web");
    }

    if (r.channels.includes("telegram") && r.telegram_chat_id && r.telegram_enabled) {
      try {
        if (await sendTelegram(r.telegram_chat_id, r, time)) sent.push("telegram");
      } catch (e) {
        console.error("telegram failed", r.reminder_id, e);
      }
    }

    const phone = smsPhone(r.phone);
    if (r.channels.includes("sms") && smsPlanIds.has(r.plan) && phone) {
      try {
        if (await sendSms(phone, reminderSms(info))) sent.push("sms");
      } catch (e) {
        console.error("sms failed", r.reminder_id, e);
      }
    }

    if (sent.length) {
      await db.from("medication_reminders").update({ sent_channels: sent }).eq("id", r.reminder_id);
    }
    for (const c of sent) if (c in stats) (stats as any)[c]++;
  }));

  if (webRows.length) {
    const { error: insertError } = await db.from("user_notifications").insert(webRows);
    if (insertError) console.error("web notifications failed", insertError);
  }

  // ---- 10 daqiqada "Ichdim" bosilmadi: qayta eslatma ----------------------------
  const extra = { nudged: 0, family: 0, lowStock: 0 };
  const { data: nudges, error: nErr } = await db.rpc("claim_medication_nudges", { _limit: 300 });
  if (nErr) console.error("claim_medication_nudges failed", nErr.message);
  const nudgeRows: Record<string, unknown>[] = [];
  for (const r of (nudges ?? []) as DueReminder[]) {
    const time = localTime(r.scheduled_at, r.timezone);
    const info = { medicine_name: r.medicine_name, dose: r.dose, instructions: r.instructions, time };
    if (r.channels.includes("web")) {
      nudgeRows.push({
        user_id: r.user_id, kind: "medication",
        title: `⏰ Ichdingizmi? ${r.medicine_name}`, body: reminderBody("uz", info),
        data: { reminder_id: r.reminder_id },
      });
    }
    if (r.channels.includes("telegram") && r.telegram_chat_id && r.telegram_enabled) {
      try { if (await sendTelegram(r.telegram_chat_id, r, time, true)) extra.nudged++; } catch (e) { console.error("nudge telegram failed", e); }
    }
  }
  if (nudgeRows.length) await db.from("user_notifications").insert(nudgeRows);

  // ---- 30 daqiqa: yaqinlarga xabar -----------------------------------------------
  const { data: missed, error: mErr } = await db.rpc("claim_missed_for_family", { _limit: 300 });
  if (mErr) console.error("claim_missed_for_family failed", mErr.message);
  for (const m of (missed ?? []) as { reminder_id: string; patient_name: string; medicine_name: string; dose: string | null; scheduled_at: string; timezone: string; guardian_ids: string[] }[]) {
    if (!m.guardian_ids?.length) continue;
    const time = localTime(m.scheduled_at, m.timezone);
    const text = `${m.patient_name} soat ${time} dagi dorini ichmadi: ${m.medicine_name}${m.dose ? ` (${m.dose})` : ""}. 30 daqiqa o'tdi.`;
    await db.from("user_notifications").insert(m.guardian_ids.map((g) => ({
      user_id: g, kind: "medication_missed", title: "⚠️ Dori ichilmadi", body: text, data: { reminder_id: m.reminder_id },
    })));
    for (const g of m.guardian_ids) {
      const html = `⚠️ <b>Dori ichilmadi</b>\n\n${escHtml(text)}\n\nQo'ng'iroq qilib, eslatib qo'ying.`;
      if (await telegramToUser(db, g, html)) extra.family++;
    }
  }

  // ---- Dori tugayapti -------------------------------------------------------------
  const { data: low, error: lErr } = await db.rpc("claim_low_stock_alerts");
  if (lErr) console.error("claim_low_stock_alerts failed", lErr.message);
  for (const l of (low ?? []) as { user_id: string; medicine_name: string; stock_count: number; days_left: number; telegram_chat_id: number | null; telegram_enabled: boolean }[]) {
    const days = Math.max(0, Math.floor(Number(l.days_left)));
    const body = `Qoldi: ${Number(l.stock_count)} ta (~${days} kunga yetadi). Dorixonadan oldindan sotib oling.`;
    await db.from("user_notifications").insert({
      user_id: l.user_id, kind: "medication_low_stock", title: `💊 Dori tugayapti: ${l.medicine_name}`, body, data: { url: "/medications" },
    });
    if (l.telegram_chat_id && l.telegram_enabled) {
      if (await telegramToUser(db, l.user_id, `💊 <b>Dori tugayapti: ${escHtml(l.medicine_name)}</b>\n\n${escHtml(body)}`)) extra.lowStock++;
    }
  }

  // ---- Fitness: bugungi mashq eslatmasi va shifokor/bemor xabarlari ---------------
  const fitness = { reminders: 0, alerts: 0 };
  const { data: fit, error: fErr } = await db.rpc("claim_fitness_reminders", { _limit: 300 });
  if (fErr) console.warn("claim_fitness_reminders", fErr.message);
  for (const f of (fit ?? []) as { plan_id: string; user_id: string; label: string; week: number }[]) {
    fitness.reminders++;
    await db.from("user_notifications").insert({
      user_id: f.user_id, kind: "fitness", title: `🏃 Bugun mashq kuni: ${f.label}`,
      body: `${f.week}-hafta. Bajarib bo'lgach, qanchalik qiyin bo'lganini belgilang — reja sizga moslashadi.`,
      data: { url: "/fitness", plan_id: f.plan_id },
    });
    await telegramToUser(db, f.user_id,
      `🏃 <b>Bugun mashq kuni</b>\n\n${escHtml(f.label)} · ${f.week}-hafta\n<a href="${siteUrl()}/fitness">Bugungi mashqni ochish</a>`);
  }
  const { data: fa, error: faErr } = await db.rpc("claim_fitness_alerts", { _limit: 100 });
  if (faErr) console.warn("claim_fitness_alerts", faErr.message);
  for (const a of (fa ?? []) as { user_id: string; html: string }[]) {
    if (await telegramToUser(db, a.user_id, a.html)) fitness.alerts++;
  }

  return json({ ...stats, ...extra, fitness });
});
