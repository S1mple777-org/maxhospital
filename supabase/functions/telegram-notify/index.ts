import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://maxhospital.lovable.app").replace(/\/+$/, "");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const getSupabase = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

async function sendTelegramMessage(chatId: number, text: string) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { type, user_id, data: eventData } = await req.json();
    const supabase = getSupabase();

    // For broadcast, send to all linked users
    if (type === "broadcast") {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("telegram_chat_id")
        .not("telegram_chat_id", "is", null)
        .eq("telegram_notifications_enabled", true);

      let sent = 0;
      for (const p of profiles || []) {
        if (p.telegram_chat_id) {
          await sendTelegramMessage(
            p.telegram_chat_id,
            `📢 <b>Admin xabari:</b>\n\n${eventData?.message || ""}`
          );
          sent++;
        }
      }
      return jsonRes({ sent });
    }

    // For new_post, also broadcast
    if (type === "new_post") {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("telegram_chat_id")
        .not("telegram_chat_id", "is", null)
        .eq("telegram_notifications_enabled", true);

      let sent = 0;
      for (const p of profiles || []) {
        if (p.telegram_chat_id) {
          await sendTelegramMessage(
            p.telegram_chat_id,
            `📰 News panelidan sizga yangi xabar keldi.\n\n🔗 <a href="${SITE_URL}/news">Yangiliklar</a>`
          );
          sent++;
        }
      }
      return jsonRes({ sent });
    }

    // Individual notifications
    if (!user_id) return jsonRes({ error: "user_id required" }, 400);

    const { data: profile } = await supabase
      .from("profiles")
      .select("telegram_chat_id, telegram_notifications_enabled, full_name")
      .eq("user_id", user_id)
      .maybeSingle();

    if (
      !profile?.telegram_chat_id ||
      !profile.telegram_notifications_enabled
    ) {
      return jsonRes({ skipped: true });
    }

    const chatId = profile.telegram_chat_id;
    const messages: Record<string, string> = {
      new_consultation_request: `🏥 <b>Yangi konsultatsiya so'rovi!</b>\n\nBemor sizga murojaat qildi.\n🔗 <a href="${SITE_URL}/doctor-dashboard">Dashboard</a>`,
      balance_topped_up: `💰 <b>Hisobingiz to'ldirildi!</b>\n\nMiqdor: ${(eventData?.amount || 0).toLocaleString()} UZS\nYangi balans: ${(eventData?.new_balance || 0).toLocaleString()} UZS`,
      consultation_accepted: `✅ <b>Konsultatsiya so'rovingiz qabul qilindi!</b>\n\n🔗 <a href="${SITE_URL}/consultation/${eventData?.consultation_id}">Konsultatsiyaga o'tish</a>`,
      consultation_reminder: `⏰ <b>Eslatma!</b>\n\nKonsultatsiya muddati tugashiga 1 kun qoldi.\n🔗 <a href="${SITE_URL}/consultation/${eventData?.consultation_id}">Konsultatsiya</a>`,
      consultation_expired: `⌛️ <b>Konsultatsiya muddati tugadi.</b>\n\nKonsultatsiya yakunlandi.`,
      doctor_message: `💬 <b>Shifokordan yangi xabar!</b>\n\n🔗 <a href="${SITE_URL}/consultation/${eventData?.consultation_id}">Xabarni ko'rish</a>`,
      patient_message: `💬 <b>Bemordan yangi xabar!</b>\n\n🔗 <a href="${SITE_URL}/consultation/${eventData?.consultation_id}">Xabarni ko'rish</a>`,
      account_login: `🔐 <b>Hisobingizga kirildi</b>\n\n⏰ ${new Date().toLocaleString("uz-UZ")}`,
      prescription_created: `💊 <b>Shifokor sizga retsept yozdi!</b>\n\nDr. ${eventData?.doctor_name || ""}\n\n🔗 <a href="${SITE_URL}/prescription/${eventData?.prescription_id}">Retseptni ko'rish</a>\n📥 Retseptni PDF formatida yuklab olishingiz mumkin.`,
    };

    const msg = messages[type] || `🔔 ${eventData?.message || "Yangi bildirishnoma"}`;
    await sendTelegramMessage(chatId, msg);

    return jsonRes({ sent: true });
  } catch (err) {
    console.error("Notify error:", err);
    return jsonRes({ error: err.message }, 500);
  }
});

function jsonRes(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
