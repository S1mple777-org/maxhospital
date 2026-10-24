// Sends medication reminders whose time has come. Called every minute by
// pg_cron (or by the GitHub Actions fallback). Not callable by users.
//   web      -> user_notifications row (the site shows it in real time)
//   telegram -> bot message with "✅ Ichdim / ⏭ O'tkazib yubordim" buttons
//   sms      -> Eskiz.uz, only on plans with sms_enabled (Premium)
//   app      -> nothing here: the Android app schedules it on the phone itself
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { json, serviceClient } from "../_shared/http.ts";
import { isCronRequest } from "../_shared/notify.ts";
import { localTime, reminderBody, reminderSms, reminderTitle, smsPhone } from "../_shared/medication-plan.ts";

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
async function sendTelegram(chatId: number, r: DueReminder, time: string): Promise<boolean> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) return false;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const text = [
    `💊 <b>Dori ichish vaqti</b> — ${time}`,
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

  return json(stats);
});
