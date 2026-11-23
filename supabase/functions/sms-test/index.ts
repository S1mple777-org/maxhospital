// Eskiz ulanishini sinash (faqat owner/admin). Faqat Eskiz test rejimi ruxsat bergan matn yuboriladi:
// "Bu Eskiz dan test". Hech kimdan pul yechilmaydi va foydalanuvchilarga xabar bormaydi.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, getUser, isStaff, json, serviceClient } from "../_shared/http.ts";
import { sendSms, smsConfigured } from "../_shared/sms.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const db = serviceClient();
  const user = await getUser(req, db);
  if (!user || !(await isStaff(db, user.id))) return json({ error: "Ruxsat yo'q" }, 403);

  if (!smsConfigured()) return json({ configured: false, ok: false, error: "ESKIZ_EMAIL va ESKIZ_PASSWORD Supabase Secrets'da yo'q" });
  const { phone } = await req.json().catch(() => ({}));
  const p = String(phone ?? "").replace(/\D/g, "");
  if (!/^998\d{9}$/.test(p)) return json({ error: "Raqam 998901234567 ko'rinishida bo'lsin" }, 400);

  const ok = await sendSms(p, "Bu Eskiz dan test");
  return json({ configured: true, ok });
});
