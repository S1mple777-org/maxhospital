import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = "8401647175:AAE_YnBPMy75ZKRx3Cb_wQd5OZYn-fWYeEc";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const getAdminSupabase = () =>
  createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { action, ...params } = await req.json();
    const supabase = getAdminSupabase();

    switch (action) {
      // Request Telegram auth (login/register)
      case "request_auth": {
        const { email, type = "login" } = params;
        if (!email) return jsonResponse({ error: "Email kiritilmagan" }, 400);

        // Find user by email via DB function
        const { data: userId } = await supabase.rpc("get_user_id_by_email", {
          email_input: email,
        });

        if (!userId) {
          return jsonResponse(
            { error: "Bu email bilan foydalanuvchi topilmadi" },
            404
          );
        }

        // Get profile with telegram
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, telegram_chat_id, telegram_notifications_enabled")
          .eq("user_id", userId)
          .maybeSingle();

        if (!profile?.telegram_chat_id) {
          return jsonResponse(
            {
              error:
                "Telegram bog'lanmagan. Avval profildan Telegramni ulang.",
            },
            400
          );
        }

        // Create auth request
        const { data: request, error: reqErr } = await supabase
          .from("telegram_auth_requests")
          .insert({
            user_id: userId,
            email,
            request_type: type,
          })
          .select()
          .single();

        if (reqErr) return jsonResponse({ error: reqErr.message }, 500);

        // Send Telegram message
        const typeText =
          type === "login" ? "kirish" : "ro'yxatdan o'tish";
        await fetch(`${TELEGRAM_API}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: profile.telegram_chat_id,
            text:
              `🔐 <b>${profile.full_name}</b> hisobidan <b>${typeText}</b> so'rovi yuborildi.\n\nQabul qilinsinmi?`,
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "✅ Qabul qilish",
                    callback_data: `approve_auth_${request.id}`,
                  },
                  {
                    text: "❌ Rad etish",
                    callback_data: `reject_auth_${request.id}`,
                  },
                ],
              ],
            },
          }),
        });

        return jsonResponse({ request_id: request.id });
      }

      // Check auth request status
      case "check_auth": {
        const { request_id } = params;
        if (!request_id)
          return jsonResponse({ error: "request_id kerak" }, 400);

        const { data: request } = await supabase
          .from("telegram_auth_requests")
          .select("status, action_link, expires_at")
          .eq("id", request_id)
          .maybeSingle();

        if (!request) return jsonResponse({ error: "So'rov topilmadi" }, 404);

        // Check expiry
        if (
          request.status === "pending" &&
          new Date(request.expires_at) < new Date()
        ) {
          await supabase
            .from("telegram_auth_requests")
            .update({ status: "expired" })
            .eq("id", request_id);
          return jsonResponse({ status: "expired" });
        }

        return jsonResponse({
          status: request.status,
          action_link:
            request.status === "approved" ? request.action_link : null,
        });
      }

      // Generate link code (requires auth)
      case "generate_code": {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);

        const authClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } }
        );
        const {
          data: { user },
        } = await authClient.auth.getUser();
        if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        await supabase
          .from("profiles")
          .update({ telegram_link_code: code })
          .eq("user_id", user.id);

        return jsonResponse({ code });
      }

      // Unlink Telegram (requires auth)
      case "unlink": {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);

        const authClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } }
        );
        const {
          data: { user },
        } = await authClient.auth.getUser();
        if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

        await supabase
          .from("profiles")
          .update({
            telegram_chat_id: null,
            telegram_link_code: null,
            telegram_notifications_enabled: false,
          })
          .eq("user_id", user.id);

        return jsonResponse({ success: true });
      }

      // Toggle notifications (requires auth)
      case "toggle_notifications": {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);

        const authClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } }
        );
        const {
          data: { user },
        } = await authClient.auth.getUser();
        if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

        const { enabled } = params;
        await supabase
          .from("profiles")
          .update({ telegram_notifications_enabled: !!enabled })
          .eq("user_id", user.id);

        return jsonResponse({ success: true });
      }

      // Toggle 2FA (requires auth)
      case "toggle_2fa": {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);

        const authClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } }
        );
        const {
          data: { user },
        } = await authClient.auth.getUser();
        if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

        // Check telegram linked
        const { data: prof } = await supabase
          .from("profiles")
          .select("telegram_chat_id, two_fa_enabled")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!prof?.telegram_chat_id) {
          return jsonResponse({ error: "Avval Telegramni ulang" }, 400);
        }

        const newState = !prof.two_fa_enabled;
        await supabase
          .from("profiles")
          .update({ two_fa_enabled: newState })
          .eq("user_id", user.id);

        return jsonResponse({ enabled: newState });
      }

      // Check if 2FA is required for email (no auth needed)
      case "check_2fa": {
        const { email } = params;
        if (!email) return jsonResponse({ error: "Email kerak" }, 400);

        const { data: userId } = await supabase.rpc("get_user_id_by_email", {
          email_input: email,
        });

        if (!userId) return jsonResponse({ two_fa: false });

        const { data: prof } = await supabase
          .from("profiles")
          .select("two_fa_enabled, telegram_chat_id")
          .eq("user_id", userId)
          .maybeSingle();

        return jsonResponse({
          two_fa: !!(prof?.two_fa_enabled && prof?.telegram_chat_id),
        });
      }

      default:
        return jsonResponse({ error: "Unknown action" }, 400);
    }
  } catch (err) {
    console.error("Auth error:", err);
    return jsonResponse({ error: err.message }, 500);
  }
});
