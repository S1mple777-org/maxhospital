import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = "8401647175:AAE_YnBPMy75ZKRx3Cb_wQd5OZYn-fWYeEc";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const SITE_URL = "https://maxhospital.lovable.app";

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

async function sendMessage(chatId: number, text: string, options: any = {}) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      ...options,
    }),
  });
}

async function answerCallbackQuery(id: string, text?: string) {
  await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: id, text }),
  });
}

async function getLinkedProfile(supabase: any, chatId: number) {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("telegram_chat_id", chatId)
    .maybeSingle();
  return data;
}

async function handleMessage(message: any) {
  const chatId = message.chat.id;
  const text = (message.text || "").trim();
  const supabase = getSupabase();
  const profile = await getLinkedProfile(supabase, chatId);

  const mainKeyboard = {
    reply_markup: {
      keyboard: [
        [{ text: "📊 Status" }, { text: "📰 Yangiliklar" }],
        [{ text: "👨‍⚕️ Adminlar" }, { text: "🔗 Akkaunt ulash" }],
        [{ text: "🔑 Parol o'zgartirish" }, { text: "❓ Yordam" }],
      ],
      resize_keyboard: true,
    },
  };

  // /start
  if (text === "/start") {
    await sendMessage(
      chatId,
      `🏥 <b>Max Hospital Bot</b>ga xush kelibsiz!\n\n` +
        (profile
          ? `✅ Siz <b>${profile.full_name}</b> sifatida ulangansiz.`
          : `⚠️ Akkauntingiz ulanmagan. Profildan kodni oling va /link KODINGIZ buyrug'ini yuboring.`),
      mainKeyboard
    );
    return;
  }

  // 📊 Status
  if (text === "📊 Status" || text === "/status") {
    if (!profile) {
      await sendMessage(
        chatId,
        "⚠️ Avval akkauntingizni ulang. Profildan kodni oling va <code>/link KODINGIZ</code> yuboring."
      );
      return;
    }

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", profile.user_id);
    const roleNames = roles?.map((r: any) => r.role).join(", ") || "user";

    let statusText =
      `📊 <b>Sizning statusingiz:</b>\n\n` +
      `👤 <b>Ism:</b> ${profile.full_name}\n` +
      `💰 <b>Balans:</b> ${Number(profile.balance_uzs).toLocaleString()} UZS\n` +
      `🛡 <b>Rollar:</b> ${roleNames}\n` +
      `🔔 <b>Bildirishnomalar:</b> ${profile.telegram_notifications_enabled ? "✅ Yoqilgan" : "❌ O'chirilgan"}\n`;

    // Doctor info
    if (roles?.some((r: any) => r.role === "doctor")) {
      const { data: doctor } = await supabase
        .from("doctors")
        .select("*")
        .eq("user_id", profile.user_id)
        .maybeSingle();
      if (doctor) {
        statusText +=
          `\n👨‍⚕️ <b>Shifokor ma'lumotlari:</b>\n` +
          `📋 Lavozim: ${doctor.title || "-"}\n` +
          `⭐️ Reyting: ${doctor.rating}\n` +
          `👥 Bemorlar: ${doctor.patients_count}\n` +
          `📍 Ish joyi: ${doctor.workplace || "-"}\n`;

        const { data: activeConsults } = await supabase
          .from("consultations")
          .select("id")
          .eq("doctor_id", doctor.id)
          .in("status", ["active", "pending"]);
        statusText += `🔄 Faol konsultatsiyalar: ${activeConsults?.length || 0}\n`;
      }
    }

    // Patient consultations
    const { data: userConsults } = await supabase
      .from("consultations")
      .select("id, status")
      .eq("patient_id", profile.user_id);
    if (userConsults && userConsults.length > 0) {
      const active = userConsults.filter(
        (c: any) => c.status === "active" || c.status === "pending"
      ).length;
      statusText += `\n🏥 <b>Konsultatsiyalar:</b> Jami: ${userConsults.length}, Faol: ${active}`;
    }

    await sendMessage(chatId, statusText);
    return;
  }

  // 📰 Yangiliklar
  if (text === "📰 Yangiliklar" || text === "/news") {
    const { data: posts } = await supabase
      .from("posts")
      .select("*")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(5);

    if (!posts || posts.length === 0) {
      await sendMessage(chatId, "📰 Hozircha yangiliklar yo'q.");
      return;
    }

    let newsText = "📰 <b>So'nggi yangiliklar:</b>\n\n";
    for (const post of posts) {
      const date = new Date(post.created_at).toLocaleDateString("uz-UZ");
      newsText += `📌 <b>${post.title_uz}</b>\n📅 ${date}\n`;
      newsText += `${post.content_uz.substring(0, 100)}...\n`;
      newsText += `🔗 <a href="${SITE_URL}/news/${post.id}">Batafsil</a>\n\n`;
    }

    await sendMessage(chatId, newsText, { disable_web_page_preview: true });
    return;
  }

  // 👨‍⚕️ Adminlar
  if (text === "👨‍⚕️ Adminlar" || text === "/admins") {
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "owner"]);

    if (!adminRoles || adminRoles.length === 0) {
      await sendMessage(chatId, "👨‍⚕️ Adminlar topilmadi.");
      return;
    }

    const adminIds = adminRoles.map((r: any) => r.user_id);
    const { data: adminProfiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, telegram_chat_id")
      .in("user_id", adminIds);

    const { data: adminDoctors } = await supabase
      .from("doctors")
      .select("user_id, telegram_username")
      .in("user_id", adminIds);

    let adminsText = "👨‍⚕️ <b>Admin kontaktlari:</b>\n\n";
    for (const admin of adminProfiles || []) {
      const doc = adminDoctors?.find((d: any) => d.user_id === admin.user_id);
      adminsText += `👤 ${admin.full_name}`;
      if (doc?.telegram_username) {
        adminsText += ` — @${doc.telegram_username.replace("@", "")}`;
      }
      if (admin.telegram_chat_id) adminsText += " ✅";
      adminsText += "\n";
    }

    await sendMessage(chatId, adminsText);
    return;
  }

  // 🔗 Akkaunt ulash
  if (text === "🔗 Akkaunt ulash") {
    if (profile) {
      await sendMessage(
        chatId,
        `✅ Sizning akkauntingiz allaqachon ulangan: <b>${profile.full_name}</b>\n\n` +
          "Uzish uchun saytdagi profildan foydalaning."
      );
      return;
    }
    await sendMessage(
      chatId,
      "🔗 <b>Akkauntni ulash:</b>\n\n" +
        "1. Saytda profilingizga kiring\n" +
        '2. "Telegram bog\'lash" bo\'limidan kodni oling\n' +
        "3. <code>/link KODINGIZ</code> buyrug'ini yuboring\n\n" +
        "📌 Misol: <code>/link ABC123</code>"
    );
    return;
  }

  // /link CODE
  if (text.startsWith("/link ")) {
    const code = text.replace("/link ", "").trim().toUpperCase();
    if (!code) {
      await sendMessage(
        chatId,
        "⚠️ Kodni kiriting. Misol: <code>/link ABC123</code>"
      );
      return;
    }

    // Check if already linked
    if (profile) {
      await sendMessage(
        chatId,
        `⚠️ Siz allaqachon <b>${profile.full_name}</b> akkauntiga ulangansiz.\nAvval saytdan uzib, keyin qayta ulang.`
      );
      return;
    }

    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("*")
      .eq("telegram_link_code", code)
      .maybeSingle();

    if (!targetProfile) {
      await sendMessage(
        chatId,
        "❌ Noto'g'ri kod. Profilingizdan yangi kod oling."
      );
      return;
    }

    if (targetProfile.telegram_chat_id) {
      await sendMessage(
        chatId,
        "⚠️ Bu akkaunt allaqachon boshqa Telegram hisobiga ulangan."
      );
      return;
    }

    await supabase
      .from("profiles")
      .update({
        telegram_chat_id: chatId,
        telegram_link_code: null,
        telegram_notifications_enabled: true,
      })
      .eq("id", targetProfile.id);

    await sendMessage(
      chatId,
      `✅ <b>Muvaffaqiyatli ulandi!</b>\n\n` +
        `Akkaunt: <b>${targetProfile.full_name}</b>\n` +
        `Endi barcha bildirishnomalarni Telegram orqali olasiz.`,
      mainKeyboard
    );
    return;
  }

  // 🔑 Parol o'zgartirish
  if (text === "🔑 Parol o'zgartirish" || text === "/password") {
    if (!profile) {
      await sendMessage(chatId, "⚠️ Avval akkauntingizni ulang.");
      return;
    }
    await sendMessage(
      chatId,
      "🔑 <b>Parolni o'zgartirish</b>\n\n" +
        "Yangi parolni quyidagi formatda yuboring:\n" +
        "<code>/setpassword YANGI_PAROL</code>\n\n" +
        "⚠️ Parol kamida 6 belgidan iborat bo'lishi kerak."
    );
    return;
  }

  // /setpassword NEW_PASSWORD
  if (text.startsWith("/setpassword ")) {
    if (!profile) {
      await sendMessage(chatId, "⚠️ Avval akkauntingizni ulang.");
      return;
    }
    const newPassword = text.replace("/setpassword ", "").trim();
    if (newPassword.length < 6) {
      await sendMessage(
        chatId,
        "⚠️ Parol kamida 6 belgidan iborat bo'lishi kerak."
      );
      return;
    }

    const { error } = await supabase.auth.admin.updateUserById(
      profile.user_id,
      { password: newPassword }
    );
    if (error) {
      await sendMessage(chatId, `❌ Xatolik: ${error.message}`);
      return;
    }
    await sendMessage(chatId, "✅ Parolingiz muvaffaqiyatli o'zgartirildi!");
    return;
  }

  // /notifications toggle
  if (text === "/notifications") {
    if (!profile) {
      await sendMessage(chatId, "⚠️ Avval akkauntingizni ulang.");
      return;
    }
    const newState = !profile.telegram_notifications_enabled;
    await supabase
      .from("profiles")
      .update({ telegram_notifications_enabled: newState })
      .eq("id", profile.id);
    await sendMessage(
      chatId,
      `🔔 Bildirishnomalar ${newState ? "✅ yoqildi" : "❌ o'chirildi"}.`
    );
    return;
  }

  // ❓ Yordam
  if (text === "❓ Yordam" || text === "/help") {
    await sendMessage(
      chatId,
      "❓ <b>Buyruqlar ro'yxati:</b>\n\n" +
        "/start - Bosh menu\n" +
        "/link KOD - Akkauntni ulash\n" +
        "/status - Shaxsiy status\n" +
        "/news - Yangiliklar\n" +
        "/admins - Admin kontaktlari\n" +
        "/password - Parolni o'zgartirish\n" +
        "/setpassword PAROL - Yangi parol o'rnatish\n" +
        "/notifications - Bildirishnomalarni yoqish/o'chirish\n" +
        "/help - Yordam"
    );
    return;
  }

  // Unknown
  await sendMessage(
    chatId,
    "🤔 Tushunmadim. /help buyrug'ini yuboring."
  );
}

async function handleCallbackQuery(callbackQuery: any) {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  const supabase = getSupabase();

  await answerCallbackQuery(callbackQuery.id);

  if (data.startsWith("approve_auth_")) {
    const requestId = data.replace("approve_auth_", "");

    const { data: request } = await supabase
      .from("telegram_auth_requests")
      .select("*")
      .eq("id", requestId)
      .eq("status", "pending")
      .maybeSingle();

    if (!request) {
      await sendMessage(chatId, "⚠️ Bu so'rov topilmadi yoki muddati o'tgan.");
      return;
    }

    // Check expiry
    if (new Date(request.expires_at) < new Date()) {
      await supabase
        .from("telegram_auth_requests")
        .update({ status: "expired" })
        .eq("id", requestId);
      await sendMessage(chatId, "⏰ Bu so'rovning muddati o'tgan.");
      return;
    }

    // Generate magic link
    const { data: linkData, error } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: request.email,
    });

    if (error || !linkData) {
      await sendMessage(chatId, `❌ Xatolik: ${error?.message}`);
      return;
    }

    await supabase
      .from("telegram_auth_requests")
      .update({
        status: "approved",
        action_link: linkData.properties?.action_link,
      })
      .eq("id", requestId);

    // Edit original message
    await fetch(`${TELEGRAM_API}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: callbackQuery.message.message_id,
        text: `✅ <b>Tasdiqlandi!</b>\n\nKirish ruxsat etildi.`,
        parse_mode: "HTML",
      }),
    });
    return;
  }

  if (data.startsWith("reject_auth_")) {
    const requestId = data.replace("reject_auth_", "");

    await supabase
      .from("telegram_auth_requests")
      .update({ status: "rejected" })
      .eq("id", requestId);

    await fetch(`${TELEGRAM_API}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: callbackQuery.message.message_id,
        text: `❌ <b>Rad etildi!</b>\n\nKirish rad etildi.`,
        parse_mode: "HTML",
      }),
    });
    return;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);

    // Setup webhook endpoint
    if (url.searchParams.get("action") === "setup") {
      const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/telegram-webhook`;
      const res = await fetch(`${TELEGRAM_API}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrl }),
      });
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    if (body.message) await handleMessage(body.message);
    if (body.callback_query) await handleCallbackQuery(body.callback_query);

    return new Response("OK", { headers: corsHeaders });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("OK", { headers: corsHeaders });
  }
});
