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

/**
 * Is this a scheduled (cron) call? Two ways:
 *  - x-cron-token: sent by pg_cron inside the database; checked against the token in Vault
 *    (public.check_cron_token, migration 20261024190000_cron_scheduler.sql). No manual secret needed.
 *  - x-cron-secret: the GitHub Actions fallback, checked against REMINDERS_CRON_SECRET.
 */
export async function isCronRequest(req: Request, db: SupabaseClient): Promise<boolean> {
  if (cronAuthorized(req)) return true;
  const token = req.headers.get("x-cron-token") ?? "";
  if (token.length < 32) return false;
  const { data, error } = await db.rpc("check_cron_token", { _token: token });
  if (error) console.warn("check_cron_token failed", error.message);
  return data === true;
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
