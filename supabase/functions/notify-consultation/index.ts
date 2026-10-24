// Doctor accepted a consultation -> Telegram message to the patient ("Shifokor sizni kutmoqda").
// Called from the doctor's browser right after accepting. The site notice comes from a DB trigger
// (notify_consultation_started), so this only adds Telegram.
// Checks: the caller is this consultation's doctor, it is active and started less than 10 minutes ago.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, getUser, json, serviceClient } from "../_shared/http.ts";
import { escHtml, telegramToUser } from "../_shared/notify.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const db = serviceClient();
  const user = await getUser(req, db);
  if (!user) return json({ error: "Avval tizimga kiring" }, 401);

  const { consultation_id } = await req.json().catch(() => ({}));
  if (typeof consultation_id !== "string") return json({ error: "consultation_id kerak" }, 400);

  const { data: c } = await db.from("consultations")
    .select("id, patient_id, doctor_id, status, started_at").eq("id", consultation_id).maybeSingle();
  if (!c) return json({ error: "Topilmadi" }, 404);

  const { data: doctor } = await db.from("doctors").select("user_id").eq("id", c.doctor_id).maybeSingle();
  if (doctor?.user_id !== user.id) return json({ error: "Ruxsat yo'q" }, 403);
  if (c.status !== "active" || !c.started_at || Date.now() - Date.parse(c.started_at) > 10 * 60_000) {
    return json({ sent: false, reason: "not_just_started" });
  }

  const { data: p } = await db.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle();
  const site = (Deno.env.get("SITE_URL") ?? "https://max-hospital1.netlify.app").replace(/\/+$/, "");
  const html = [
    "👨‍⚕️ <b>Shifokor sizni kutmoqda</b>",
    "",
    `${escHtml(p?.full_name ?? "Shifokor")} konsultatsiyani boshladi.`,
    `<a href="${site}/consultation/${c.id}">Konsultatsiyani ochish</a>`,
  ].join("\n");
  const sent = await telegramToUser(db, c.patient_id, html);
  return json({ sent });
});
