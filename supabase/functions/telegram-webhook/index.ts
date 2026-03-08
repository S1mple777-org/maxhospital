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

async function checkForcedSubscriptions(supabase: any, chatId: number): Promise<{ allJoined: boolean; notJoined: any[] }> {
  const { data: subs } = await supabase.from("forced_subscriptions").select("*");
  if (!subs || subs.length === 0) return { allJoined: true, notJoined: [] };

  const notJoined: any[] = [];
  for (const sub of subs) {
    try {
      const res = await fetch(`${TELEGRAM_API}/getChatMember`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: sub.channel_id, user_id: chatId }),
      });
      const data = await res.json();
      const status = data?.result?.status;
      if (!status || status === "left" || status === "kicked") {
        notJoined.push(sub);
      }
    } catch {
      notJoined.push(sub);
    }
  }
  return { allJoined: notJoined.length === 0, notJoined };
}

async function sendSubscriptionMessage(chatId: number, notJoined: any[]) {
  let text = "📢 <b>Majburiy obuna!</b>\n\nBotdan foydalanish uchun quyidagi kanallarga obuna bo'ling:\n\n";
  const buttons: any[] = [];
  for (const sub of notJoined) {
    const name = sub.channel_name || sub.channel_username;
    text += `❌ <b>${name}</b>\n`;
    buttons.push([{ text: `📢 ${name}`, url: `https://t.me/${sub.channel_username.replace("@", "")}` }]);
  }
  buttons.push([{ text: "✅ Tekshirish", callback_data: "check_subscription" }]);
  text += "\nObuna bo'lgandan so'ng \"✅ Tekshirish\" tugmasini bosing.";
  await sendMessage(chatId, text, {
    reply_markup: { inline_keyboard: buttons },
  });
}

async function getUserRoles(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  return data?.map((r: any) => r.role) || [];
}

async function isAdmin(supabase: any, userId: string) {
  const roles = await getUserRoles(supabase, userId);
  return roles.includes("admin") || roles.includes("owner");
}

const mainKeyboard = {
  reply_markup: {
    keyboard: [
      [{ text: "📊 Status" }, { text: "📰 Yangiliklar" }],
      [{ text: "👨‍⚕️ Adminlar" }, { text: "🔗 Akkaunt ulash" }],
      [{ text: "🔑 Parol o'zgartirish" }, { text: "🔐 2FA" }],
      [{ text: "❓ Yordam" }],
    ],
    resize_keyboard: true,
  },
};

function getAdminKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: "📊 Status" }, { text: "📰 Yangiliklar" }],
        [{ text: "👨‍⚕️ Adminlar" }, { text: "🔗 Akkaunt ulash" }],
        [{ text: "🔑 Parol o'zgartirish" }, { text: "🔐 2FA" }],
        [{ text: "❓ Yordam" }, { text: "⚙️ Admin panel" }],
      ],
      resize_keyboard: true,
    },
  };
}

async function handleMessage(message: any) {
  const chatId = message.chat.id;
  const text = (message.text || "").trim();
  const supabase = getSupabase();
  const profile = await getLinkedProfile(supabase, chatId);

  const userIsAdmin = profile ? await isAdmin(supabase, profile.user_id) : false;
  const keyboard = userIsAdmin ? getAdminKeyboard() : mainKeyboard;

  // /start
  if (text === "/start") {
    // Check forced subscriptions
    const { allJoined, notJoined } = await checkForcedSubscriptions(supabase, chatId);
    if (!allJoined) {
      await sendSubscriptionMessage(chatId, notJoined);
      return;
    }

    await sendMessage(
      chatId,
      `🏥 <b>Max Hospital Bot</b>ga xush kelibsiz!\n\n` +
        (profile
          ? `✅ Siz <b>${profile.full_name}</b> sifatida ulangansiz.`
          : `⚠️ Akkauntingiz ulanmagan. Profildan kodni oling va /link KODINGIZ buyrug'ini yuboring.`),
      keyboard
    );
    return;
  }

  // 📊 Status
  if (text === "📊 Status" || text === "/status") {
    if (!profile) {
      await sendMessage(chatId, "⚠️ Avval akkauntingizni ulang. <code>/link KODINGIZ</code>");
      return;
    }

    const roles = await getUserRoles(supabase, profile.user_id);
    const roleNames = roles.join(", ") || "user";

    let statusText =
      `📊 <b>Sizning statusingiz:</b>\n\n` +
      `👤 <b>Ism:</b> ${profile.full_name}\n` +
      `📱 <b>Telefon:</b> ${profile.phone || "Ko'rsatilmagan"}\n` +
      `💰 <b>Balans:</b> ${Number(profile.balance_uzs).toLocaleString()} UZS\n` +
      `🛡 <b>Rollar:</b> ${roleNames}\n` +
      `🔔 <b>Bildirishnomalar:</b> ${profile.telegram_notifications_enabled ? "✅ Yoqilgan" : "❌ O'chirilgan"}\n` +
      `📅 <b>Ro'yxatdan o'tgan:</b> ${new Date(profile.created_at).toLocaleDateString("uz-UZ")}\n`;

    // Doctor info
    if (roles.includes("doctor")) {
      const { data: doctor } = await supabase
        .from("doctors")
        .select("*")
        .eq("user_id", profile.user_id)
        .maybeSingle();
      if (doctor) {
        const { data: dept } = doctor.department_id
          ? await supabase.from("departments").select("name_uz").eq("id", doctor.department_id).maybeSingle()
          : { data: null };
        statusText +=
          `\n👨‍⚕️ <b>Shifokor ma'lumotlari:</b>\n` +
          `📋 Lavozim: ${doctor.title || "-"}\n` +
          `🏥 Bo'lim: ${dept?.name_uz || "-"}\n` +
          `⭐️ Reyting: ${doctor.rating}\n` +
          `👥 Bemorlar: ${doctor.patients_count}\n` +
          `📍 Ish joyi: ${doctor.workplace || "-"}\n` +
          `🕐 Tajriba: ${doctor.experience_years} yil\n`;

        const { data: activeConsults } = await supabase
          .from("consultations")
          .select("id")
          .eq("doctor_id", doctor.id)
          .in("status", ["active", "pending"]);
        statusText += `🔄 Faol konsultatsiyalar: ${activeConsults?.length || 0}\n`;
      }
    }

    // Admin info
    if (roles.includes("admin")) {
      const { data: adminSettings } = await supabase
        .from("admin_settings")
        .select("*")
        .eq("user_id", profile.user_id)
        .maybeSingle();
      if (adminSettings) {
        const typeLabels: Record<string, string> = {
          financial: "Moliyaviy admin",
          dept_head: "Bo'lim boshlig'i",
          journalist: "Jurnalist",
        };
        statusText += `\n⚙️ <b>Admin ma'lumotlari:</b>\n`;
        statusText += `📌 Turi: ${typeLabels[adminSettings.admin_type] || adminSettings.admin_type}\n`;
        if (adminSettings.admin_type === "financial") {
          statusText += `💳 Oylik limit: ${Number(adminSettings.month_spent).toLocaleString()}/${Number(adminSettings.monthly_limit).toLocaleString()} UZS\n`;
        }
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
      newsText += `${(post.content_uz || "").substring(0, 100)}...\n`;
      newsText += `🔗 <a href="${SITE_URL}/news/${post.id}">Batafsil</a>\n\n`;
    }

    await sendMessage(chatId, newsText, { disable_web_page_preview: true });
    return;
  }

  // 👨‍⚕️ Adminlar - enhanced with full info
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
      .select("user_id, full_name, phone, telegram_chat_id")
      .in("user_id", adminIds);

    const { data: adminDoctors } = await supabase
      .from("doctors")
      .select("user_id, telegram_username, title")
      .in("user_id", adminIds);

    const { data: adminSettings } = await supabase
      .from("admin_settings")
      .select("user_id, admin_type")
      .in("user_id", adminIds);

    const { data: ownerRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "owner");
    const ownerIds = ownerRoles?.map((r: any) => r.user_id) || [];

    const typeLabels: Record<string, string> = {
      financial: "💰 Moliyaviy",
      dept_head: "🏥 Bo'lim boshlig'i",
      journalist: "📰 Jurnalist",
    };

    let adminsText = "👨‍⚕️ <b>Admin va boshqaruvchilar:</b>\n\n";
    for (const admin of adminProfiles || []) {
      const doc = adminDoctors?.find((d: any) => d.user_id === admin.user_id);
      const settings = adminSettings?.find((s: any) => s.user_id === admin.user_id);
      const isOwnerUser = ownerIds.includes(admin.user_id);

      adminsText += `👤 <b>${admin.full_name || "Noma'lum"}</b>`;
      if (isOwnerUser) adminsText += " 👑";
      adminsText += "\n";

      // Role/title
      if (isOwnerUser) {
        adminsText += `   🛡 Owner\n`;
      } else if (settings) {
        adminsText += `   🛡 ${typeLabels[settings.admin_type] || settings.admin_type}\n`;
      }

      // Doctor title
      if (doc?.title) {
        adminsText += `   📋 Unvon: ${doc.title}\n`;
      }

      // Phone
      if (admin.phone) {
        adminsText += `   📱 Tel: ${admin.phone}\n`;
      }

      // Telegram
      if (doc?.telegram_username) {
        adminsText += `   ✈️ Telegram: @${doc.telegram_username.replace("@", "")}\n`;
      }

      if (admin.telegram_chat_id) adminsText += "   ✅ Telegram ulangan\n";
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
        `✅ Sizning akkauntingiz allaqachon ulangan: <b>${profile.full_name}</b>\n\nUzish uchun saytdagi profildan foydalaning.`
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
      await sendMessage(chatId, "⚠️ Kodni kiriting. Misol: <code>/link ABC123</code>");
      return;
    }

    if (profile) {
      await sendMessage(chatId, `⚠️ Siz allaqachon <b>${profile.full_name}</b> akkauntiga ulangansiz.`);
      return;
    }

    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("*")
      .eq("telegram_link_code", code)
      .maybeSingle();

    if (!targetProfile) {
      await sendMessage(chatId, "❌ Noto'g'ri kod. Profilingizdan yangi kod oling.");
      return;
    }

    if (targetProfile.telegram_chat_id) {
      await sendMessage(chatId, "⚠️ Bu akkaunt allaqachon boshqa Telegram hisobiga ulangan.");
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

    const newUserIsAdmin = await isAdmin(supabase, targetProfile.user_id);
    await sendMessage(
      chatId,
      `✅ <b>Muvaffaqiyatli ulandi!</b>\n\nAkkaunt: <b>${targetProfile.full_name}</b>\nEndi barcha bildirishnomalarni Telegram orqali olasiz.`,
      newUserIsAdmin ? getAdminKeyboard() : mainKeyboard
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
      "🔑 <b>Parolni o'zgartirish</b>\n\nYangi parolni quyidagi formatda yuboring:\n<code>/setpassword YANGI_PAROL</code>\n\n⚠️ Parol kamida 6 belgidan iborat bo'lishi kerak."
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
      await sendMessage(chatId, "⚠️ Parol kamida 6 belgidan iborat bo'lishi kerak.");
      return;
    }

    const { error } = await supabase.auth.admin.updateUserById(profile.user_id, { password: newPassword });
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
    await sendMessage(chatId, `🔔 Bildirishnomalar ${newState ? "✅ yoqildi" : "❌ o'chirildi"}.`);
    return;
  }

  // /2fa toggle
  if (text === "/2fa" || text === "🔐 2FA") {
    if (!profile) {
      await sendMessage(chatId, "⚠️ Avval akkauntingizni ulang.");
      return;
    }
    const newState = !profile.two_fa_enabled;
    await supabase
      .from("profiles")
      .update({ two_fa_enabled: newState })
      .eq("id", profile.id);
    await sendMessage(
      chatId,
      newState
        ? "🔐 <b>2FA yoqildi!</b>\n\nEndi hisobingizga kirishda Telegram orqali tasdiqlash talab qilinadi."
        : "🔓 <b>2FA o'chirildi!</b>\n\nEndi oddiy parol bilan kirishingiz mumkin."
    );
    return;
  }

  // ⚙️ Admin panel
  if (text === "⚙️ Admin panel" || text === "/admin") {
    if (!profile) {
      await sendMessage(chatId, "⚠️ Avval akkauntingizni ulang.");
      return;
    }
    if (!userIsAdmin) {
      await sendMessage(chatId, "⛔️ Sizda admin huquqlari yo'q.");
      return;
    }

    const roles = await getUserRoles(supabase, profile.user_id);
    const isOwnerUser = roles.includes("owner");

    const { data: adminSettings } = await supabase
      .from("admin_settings")
      .select("*")
      .eq("user_id", profile.user_id)
      .maybeSingle();

    let adminText = "⚙️ <b>Admin boshqaruv paneli</b>\n\n";
    adminText += "Quyidagi buyruqlardan foydalanishingiz mumkin:\n\n";

    // Balance top-up (for financial admins and owners)
    if (isOwnerUser || adminSettings?.admin_type === "financial") {
      adminText += "💰 <b>Balans qo'shish:</b>\n";
      adminText += "<code>/topup EMAIL SUMMA</code>\n";
      adminText += "Misol: <code>/topup user@mail.com 50000</code>\n";
      if (adminSettings?.admin_type === "financial" && adminSettings.monthly_limit > 0) {
        adminText += `📊 Oylik limit: ${Number(adminSettings.month_spent).toLocaleString()}/${Number(adminSettings.monthly_limit).toLocaleString()} UZS\n`;
      }
      adminText += "\n";
    }

    // Broadcast
    adminText += "📢 <b>Ommaviy xabar:</b>\n";
    adminText += "<code>/broadcast XABAR_MATNI</code>\n\n";

    // User info
    adminText += "🔍 <b>Foydalanuvchi qidirish:</b>\n";
    adminText += "<code>/userinfo EMAIL</code>\n\n";

    // Stats
    adminText += "📈 <b>Tizim statistikasi:</b>\n";
    adminText += "<code>/stats</code>\n\n";

    // Ban/unban
    adminText += "🚫 <b>Bloklash/ochish:</b>\n";
    adminText += "<code>/ban EMAIL</code>\n";
    adminText += "<code>/unban EMAIL</code>\n\n";

    if (isOwnerUser) {
      adminText += "👑 <b>Owner buyruqlari:</b>\n";
      adminText += "<code>/setlimit EMAIL SUMMA</code> - Admin oylik limitini o'zgartirish\n";
    }

    await sendMessage(chatId, adminText);
    return;
  }

  // /topup EMAIL AMOUNT - admin balance top-up
  if (text.startsWith("/topup ")) {
    if (!profile) { await sendMessage(chatId, "⚠️ Avval akkauntingizni ulang."); return; }
    if (!userIsAdmin) { await sendMessage(chatId, "⛔️ Sizda admin huquqlari yo'q."); return; }

    const parts = text.replace("/topup ", "").trim().split(/\s+/);
    if (parts.length < 2) {
      await sendMessage(chatId, "⚠️ Format: <code>/topup EMAIL SUMMA</code>");
      return;
    }

    const email = parts[0];
    const amount = Number(parts[1]);
    if (!amount || amount <= 0) {
      await sendMessage(chatId, "⚠️ Noto'g'ri summa.");
      return;
    }

    // Check admin settings & limit
    const roles = await getUserRoles(supabase, profile.user_id);
    const isOwnerUser = roles.includes("owner");

    if (!isOwnerUser) {
      const { data: adminSettings } = await supabase
        .from("admin_settings")
        .select("*")
        .eq("user_id", profile.user_id)
        .maybeSingle();

      if (!adminSettings || adminSettings.admin_type !== "financial") {
        await sendMessage(chatId, "⛔️ Sizda balans qo'shish huquqi yo'q. Faqat moliyaviy adminlar qo'sha oladi.");
        return;
      }

      // Check monthly limit
      if (adminSettings.monthly_limit > 0) {
        const remaining = adminSettings.monthly_limit - adminSettings.month_spent;
        if (amount > remaining) {
          await sendMessage(chatId, `⚠️ Oylik limitingiz yetarli emas.\n\n💳 Qolgan limit: ${remaining.toLocaleString()} UZS\n📊 Sarflangan: ${Number(adminSettings.month_spent).toLocaleString()}/${Number(adminSettings.monthly_limit).toLocaleString()} UZS`);
          return;
        }
      }
    }

    // Find user
    const { data: targetUserId } = await supabase.rpc("get_user_id_by_email", { email_input: email });
    if (!targetUserId) {
      await sendMessage(chatId, "❌ Foydalanuvchi topilmadi.");
      return;
    }

    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (!targetProfile) {
      await sendMessage(chatId, "❌ Foydalanuvchi profili topilmadi.");
      return;
    }

    // Update balance
    const newBalance = Number(targetProfile.balance_uzs) + amount;
    const { error: balanceError } = await supabase
      .from("profiles")
      .update({ balance_uzs: newBalance })
      .eq("user_id", targetUserId);

    if (balanceError) {
      await sendMessage(chatId, `❌ Xatolik: ${balanceError.message}`);
      return;
    }

    // Update admin monthly spent (if not owner)
    if (!isOwnerUser) {
      const { data: currentSettings } = await supabase
        .from("admin_settings")
        .select("month_spent")
        .eq("user_id", profile.user_id)
        .maybeSingle();
      if (currentSettings) {
        await supabase
          .from("admin_settings")
          .update({ month_spent: Number(currentSettings.month_spent) + amount })
          .eq("user_id", profile.user_id);
      }
    }

    // Notify user
    if (targetProfile.telegram_chat_id && targetProfile.telegram_notifications_enabled) {
      await sendMessage(
        targetProfile.telegram_chat_id,
        `💰 <b>Hisobingiz to'ldirildi!</b>\n\nMiqdor: ${amount.toLocaleString()} UZS\nYangi balans: ${newBalance.toLocaleString()} UZS\n\n👤 Admin: ${profile.full_name}`
      );
    }

    await sendMessage(chatId, `✅ <b>Balans qo'shildi!</b>\n\n👤 ${targetProfile.full_name}\n💰 +${amount.toLocaleString()} UZS\n💳 Yangi balans: ${newBalance.toLocaleString()} UZS`);
    return;
  }

  // /broadcast MESSAGE
  if (text.startsWith("/broadcast ")) {
    if (!profile) { await sendMessage(chatId, "⚠️ Avval akkauntingizni ulang."); return; }
    if (!userIsAdmin) { await sendMessage(chatId, "⛔️ Sizda admin huquqlari yo'q."); return; }

    const msg = text.replace("/broadcast ", "").trim();
    if (!msg) { await sendMessage(chatId, "⚠️ Xabar matnini kiriting."); return; }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("telegram_chat_id")
      .not("telegram_chat_id", "is", null)
      .eq("telegram_notifications_enabled", true);

    let sent = 0;
    for (const p of profiles || []) {
      if (p.telegram_chat_id) {
        await sendMessage(p.telegram_chat_id, `📢 <b>Admin xabari (${profile.full_name}):</b>\n\n${msg}`);
        sent++;
      }
    }
    await sendMessage(chatId, `✅ Xabar ${sent} ta foydalanuvchiga yuborildi.`);
    return;
  }

  // /userinfo EMAIL
  if (text.startsWith("/userinfo ")) {
    if (!profile) { await sendMessage(chatId, "⚠️ Avval akkauntingizni ulang."); return; }
    if (!userIsAdmin) { await sendMessage(chatId, "⛔️ Sizda admin huquqlari yo'q."); return; }

    const email = text.replace("/userinfo ", "").trim();
    const { data: userId } = await supabase.rpc("get_user_id_by_email", { email_input: email });
    if (!userId) { await sendMessage(chatId, "❌ Foydalanuvchi topilmadi."); return; }

    const { data: userProfile } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();
    if (!userProfile) { await sendMessage(chatId, "❌ Profil topilmadi."); return; }

    const userRoles = await getUserRoles(supabase, userId);

    let info = `🔍 <b>Foydalanuvchi ma'lumotlari:</b>\n\n`;
    info += `👤 <b>Ism:</b> ${userProfile.full_name}\n`;
    info += `📧 <b>Email:</b> ${email}\n`;
    info += `📱 <b>Telefon:</b> ${userProfile.phone || "-"}\n`;
    info += `💰 <b>Balans:</b> ${Number(userProfile.balance_uzs).toLocaleString()} UZS\n`;
    info += `🛡 <b>Rollar:</b> ${userRoles.join(", ") || "user"}\n`;
    info += `🚫 <b>Bloklangan:</b> ${userProfile.is_banned ? `Ha (${userProfile.ban_reason || ""})` : "Yo'q"}\n`;
    info += `✈️ <b>Telegram:</b> ${userProfile.telegram_chat_id ? "✅ Ulangan" : "❌ Ulanmagan"}\n`;
    info += `📅 <b>Ro'yxatdan:</b> ${new Date(userProfile.created_at).toLocaleDateString("uz-UZ")}\n`;

    // Consultations
    const { data: consults } = await supabase.from("consultations").select("id, status").eq("patient_id", userId);
    if (consults && consults.length > 0) {
      const active = consults.filter((c: any) => c.status === "active" || c.status === "pending").length;
      info += `\n🏥 <b>Konsultatsiyalar:</b> Jami: ${consults.length}, Faol: ${active}`;
    }

    await sendMessage(chatId, info);
    return;
  }

  // /stats
  if (text === "/stats") {
    if (!profile) { await sendMessage(chatId, "⚠️ Avval akkauntingizni ulang."); return; }
    if (!userIsAdmin) { await sendMessage(chatId, "⛔️ Sizda admin huquqlari yo'q."); return; }

    const [usersRes, doctorsRes, consultsRes, postsRes] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("doctors").select("id", { count: "exact", head: true }),
      supabase.from("consultations").select("id, status"),
      supabase.from("posts").select("id", { count: "exact", head: true }),
    ]);

    const activeConsults = consultsRes.data?.filter((c: any) => c.status === "active" || c.status === "pending").length || 0;
    const telegramLinked = await supabase.from("profiles").select("id", { count: "exact", head: true }).not("telegram_chat_id", "is", null);

    let statsText = `📈 <b>Tizim statistikasi:</b>\n\n`;
    statsText += `👥 Foydalanuvchilar: ${usersRes.count || 0}\n`;
    statsText += `👨‍⚕️ Shifokorlar: ${doctorsRes.count || 0}\n`;
    statsText += `🏥 Konsultatsiyalar: ${consultsRes.data?.length || 0} (Faol: ${activeConsults})\n`;
    statsText += `📰 Postlar: ${postsRes.count || 0}\n`;
    statsText += `✈️ Telegram ulangan: ${telegramLinked.count || 0}\n`;

    await sendMessage(chatId, statsText);
    return;
  }

  // /ban EMAIL
  if (text.startsWith("/ban ")) {
    if (!profile) { await sendMessage(chatId, "⚠️ Avval akkauntingizni ulang."); return; }
    if (!userIsAdmin) { await sendMessage(chatId, "⛔️ Sizda admin huquqlari yo'q."); return; }

    const email = text.replace("/ban ", "").trim();
    const { data: userId } = await supabase.rpc("get_user_id_by_email", { email_input: email });
    if (!userId) { await sendMessage(chatId, "❌ Foydalanuvchi topilmadi."); return; }

    await supabase.from("profiles").update({ is_banned: true, ban_reason: `Telegram orqali bloklangan (${profile.full_name})` }).eq("user_id", userId);
    await sendMessage(chatId, `✅ Foydalanuvchi bloklandi.`);
    return;
  }

  // /unban EMAIL
  if (text.startsWith("/unban ")) {
    if (!profile) { await sendMessage(chatId, "⚠️ Avval akkauntingizni ulang."); return; }
    if (!userIsAdmin) { await sendMessage(chatId, "⛔️ Sizda admin huquqlari yo'q."); return; }

    const email = text.replace("/unban ", "").trim();
    const { data: userId } = await supabase.rpc("get_user_id_by_email", { email_input: email });
    if (!userId) { await sendMessage(chatId, "❌ Foydalanuvchi topilmadi."); return; }

    await supabase.from("profiles").update({ is_banned: false, ban_reason: null }).eq("user_id", userId);
    await sendMessage(chatId, `✅ Foydalanuvchi blokdan chiqarildi.`);
    return;
  }

  // /setlimit EMAIL AMOUNT (owner only)
  if (text.startsWith("/setlimit ")) {
    if (!profile) { await sendMessage(chatId, "⚠️ Avval akkauntingizni ulang."); return; }
    const roles = await getUserRoles(supabase, profile.user_id);
    if (!roles.includes("owner")) { await sendMessage(chatId, "⛔️ Bu buyruq faqat owner uchun."); return; }

    const parts = text.replace("/setlimit ", "").trim().split(/\s+/);
    if (parts.length < 2) {
      await sendMessage(chatId, "⚠️ Format: <code>/setlimit EMAIL SUMMA</code>");
      return;
    }

    const email = parts[0];
    const limit = Number(parts[1]);
    if (!limit || limit < 0) { await sendMessage(chatId, "⚠️ Noto'g'ri summa."); return; }

    const { data: userId } = await supabase.rpc("get_user_id_by_email", { email_input: email });
    if (!userId) { await sendMessage(chatId, "❌ Foydalanuvchi topilmadi."); return; }

    const { error } = await supabase
      .from("admin_settings")
      .update({ monthly_limit: limit })
      .eq("user_id", userId);

    if (error) { await sendMessage(chatId, `❌ Xatolik: ${error.message}`); return; }
    await sendMessage(chatId, `✅ Admin oylik limiti ${limit.toLocaleString()} UZS ga o'zgartirildi.`);
    return;
  }

  // ❓ Yordam
  if (text === "❓ Yordam" || text === "/help") {
    let helpText = "❓ <b>Buyruqlar ro'yxati:</b>\n\n";
    helpText += "📋 <b>Asosiy buyruqlar:</b>\n";
    helpText += "/start - Bosh menu\n";
    helpText += "/link KOD - Akkauntni ulash\n";
    helpText += "/status - Shaxsiy status\n";
    helpText += "/news - Yangiliklar\n";
    helpText += "/admins - Admin kontaktlari\n";
    helpText += "/password - Parolni o'zgartirish\n";
    helpText += "/setpassword PAROL - Yangi parol o'rnatish\n";
    helpText += "/notifications - Bildirishnomalarni yoqish/o'chirish\n";
    helpText += "/help - Yordam\n";

    if (userIsAdmin) {
      helpText += "\n⚙️ <b>Admin buyruqlari:</b>\n";
      helpText += "/admin - Admin panel\n";
      helpText += "/topup EMAIL SUMMA - Balans qo'shish\n";
      helpText += "/broadcast XABAR - Ommaviy xabar\n";
      helpText += "/userinfo EMAIL - Foydalanuvchi ma'lumotlari\n";
      helpText += "/stats - Tizim statistikasi\n";
      helpText += "/ban EMAIL - Bloklash\n";
      helpText += "/unban EMAIL - Blokdan chiqarish\n";
    }

    await sendMessage(chatId, helpText);
    return;
  }

  // /addsub @channel_username Channel Name (owner only)
  if (text.startsWith("/addsub ")) {
    if (!profile) { await sendMessage(chatId, "⚠️ Avval akkauntingizni ulang."); return; }
    const roles = await getUserRoles(supabase, profile.user_id);
    if (!roles.includes("owner")) { await sendMessage(chatId, "⛔️ Bu buyruq faqat owner uchun."); return; }

    const parts = text.replace("/addsub ", "").trim().split(/\s+/);
    if (parts.length < 1) { await sendMessage(chatId, "⚠️ Format: <code>/addsub @username Kanal nomi</code>"); return; }

    const channelUsername = parts[0].replace("@", "");
    const channelName = parts.slice(1).join(" ") || channelUsername;

    // Try to get channel info to get numeric ID
    try {
      const chatRes = await fetch(`${TELEGRAM_API}/getChat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: `@${channelUsername}` }),
      });
      const chatData = await chatRes.json();
      if (!chatData.ok) {
        await sendMessage(chatId, `❌ Kanal topilmadi. Bot kanalga admin sifatida qo'shilganligini tekshiring.\n\nXato: ${chatData.description || "Unknown"}`);
        return;
      }
      const channelId = String(chatData.result.id);
      const resolvedName = chatData.result.title || channelName;

      const { error } = await supabase.from("forced_subscriptions").insert({
        channel_id: channelId,
        channel_username: channelUsername,
        channel_name: resolvedName,
        created_by: profile.user_id,
      });
      if (error) {
        if (error.code === "23505") await sendMessage(chatId, "⚠️ Bu kanal allaqachon qo'shilgan.");
        else await sendMessage(chatId, `❌ Xatolik: ${error.message}`);
        return;
      }
      await sendMessage(chatId, `✅ Majburiy obuna qo'shildi:\n\n📢 <b>${resolvedName}</b>\n@${channelUsername}`);
    } catch (e: any) {
      await sendMessage(chatId, `❌ Xatolik: ${e.message}`);
    }
    return;
  }

  // /removesub @channel_username (owner only)
  if (text.startsWith("/removesub ")) {
    if (!profile) { await sendMessage(chatId, "⚠️ Avval akkauntingizni ulang."); return; }
    const roles = await getUserRoles(supabase, profile.user_id);
    if (!roles.includes("owner")) { await sendMessage(chatId, "⛔️ Bu buyruq faqat owner uchun."); return; }

    const channelUsername = text.replace("/removesub ", "").trim().replace("@", "");
    const { error } = await supabase.from("forced_subscriptions").delete().eq("channel_username", channelUsername);
    if (error) { await sendMessage(chatId, `❌ Xatolik: ${error.message}`); return; }
    await sendMessage(chatId, `✅ Majburiy obuna o'chirildi: @${channelUsername}`);
    return;
  }

  // /subs - list forced subscriptions (owner only)
  if (text === "/subs") {
    if (!profile) { await sendMessage(chatId, "⚠️ Avval akkauntingizni ulang."); return; }
    const roles = await getUserRoles(supabase, profile.user_id);
    if (!roles.includes("owner")) { await sendMessage(chatId, "⛔️ Bu buyruq faqat owner uchun."); return; }

    const { data: subs } = await supabase.from("forced_subscriptions").select("*").order("created_at");
    if (!subs || subs.length === 0) {
      await sendMessage(chatId, "📢 Hozircha majburiy obunalar yo'q.\n\nQo'shish: <code>/addsub @username Kanal nomi</code>");
      return;
    }
    let text2 = "📢 <b>Majburiy obunalar:</b>\n\n";
    for (const sub of subs) {
      text2 += `📌 <b>${sub.channel_name}</b> (@${sub.channel_username})\n`;
    }
    text2 += `\nO'chirish: <code>/removesub @username</code>`;
    await sendMessage(chatId, text2);
    return;
  }

  // Unknown
  await sendMessage(chatId, "🤔 Tushunmadim. /help buyrug'ini yuboring.");
}

async function handleCallbackQuery(callbackQuery: any) {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  const supabase = getSupabase();

  await answerCallbackQuery(callbackQuery.id);

  if (data === "check_subscription") {
    const { allJoined, notJoined } = await checkForcedSubscriptions(supabase, chatId);
    if (allJoined) {
      await fetch(`${TELEGRAM_API}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: callbackQuery.message.message_id,
          text: "✅ <b>Barcha kanallarga obuna bo'lgansiz!</b>\n\nBotdan foydalanishingiz mumkin.",
          parse_mode: "HTML",
        }),
      });
      // Send welcome
      const profile = await getLinkedProfile(supabase, chatId);
      const userIsAdmin = profile ? await isAdmin(supabase, profile.user_id) : false;
      const keyboard = userIsAdmin ? getAdminKeyboard() : mainKeyboard;
      await sendMessage(
        chatId,
        `🏥 <b>Max Hospital Bot</b>ga xush kelibsiz!\n\n` +
          (profile
            ? `✅ Siz <b>${profile.full_name}</b> sifatida ulangansiz.`
            : `⚠️ Akkauntingiz ulanmagan. Profildan kodni oling va /link KODINGIZ buyrug'ini yuboring.`),
        keyboard
      );
    } else {
      await answerCallbackQuery(callbackQuery.id, "❌ Hali barcha kanallarga obuna bo'lmadingiz!");
      await sendSubscriptionMessage(chatId, notJoined);
    }
    return;
  }

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

    if (new Date(request.expires_at) < new Date()) {
      await supabase.from("telegram_auth_requests").update({ status: "expired" }).eq("id", requestId);
      await sendMessage(chatId, "⏰ Bu so'rovning muddati o'tgan.");
      return;
    }

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
      .update({ status: "approved", action_link: linkData.properties?.action_link })
      .eq("id", requestId);

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
    await supabase.from("telegram_auth_requests").update({ status: "rejected" }).eq("id", requestId);

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
