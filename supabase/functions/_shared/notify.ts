// Small helpers shared by server functions that notify a user.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Sends a Telegram message if the user linked Telegram and did not turn notifications off. */
export async function telegramToUser(db: SupabaseClient, userId: string, html: string): Promise<boolean> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) return false;
  const { data: p } = await db.from("profiles")
    .select("telegram_chat_id, telegram_notifications_enabled").eq("user_id", userId).maybeSingle();
  if (!p?.telegram_chat_id || p.telegram_notifications_enabled === false) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: p.telegram_chat_id, text: html.slice(0, 4000), parse_mode: "HTML" }),
    });
    return res.ok;
  } catch (e) {
    console.warn("telegram send failed", e);
    return false;
  }
}

/** Constant-time check of the x-cron-secret header against REMINDERS_CRON_SECRET. */
export function cronAuthorized(req: Request): boolean {
  const secret = Deno.env.get("REMINDERS_CRON_SECRET");
  if (!secret) return false;
  const given = req.headers.get("x-cron-secret") ?? "";
  if (given.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= given.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}
