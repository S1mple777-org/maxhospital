// Pro / Premium: the patient records home readings (blood pressure, glucose, ...).
// Dangerous values trigger a site notification and a Telegram message right away.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, getUser, json, serviceClient } from "../_shared/http.ts";
import { METRIC_BY_KEY, type Lang } from "../_shared/medical-ai.ts";
import { alertMessage, alertsFor, sanitizeHomeItems } from "../_shared/home-alerts.ts";
import { normalizeStatus } from "../_shared/plan.ts";
import { escHtml, telegramToUser } from "../_shared/notify.ts";

const DAILY_LIMIT = 60;

const TEXT: Record<Lang, Record<string, string>> = {
  uz: { pro: "Uy o'lchovlari kundaligi Pro va Premium tariflarida ishlaydi.", bad: "Qiymatlarni tekshiring: ", empty: "Kamida bitta ko'rsatkich kiriting.", limit: "Bugun juda ko'p o'lchov kiritildi.", fail: "Saqlab bo'lmadi. Keyinroq urinib ko'ring." },
  ru: { pro: "Дневник домашних измерений доступен в Pro и Premium.", bad: "Проверьте значения: ", empty: "Введите хотя бы один показатель.", limit: "Сегодня внесено слишком много измерений.", fail: "Не удалось сохранить. Попробуйте позже." },
  en: { pro: "The home readings diary is part of Pro and Premium.", bad: "Check the values: ", empty: "Enter at least one reading.", limit: "Too many readings today.", fail: "Could not save. Please try later." },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const db = serviceClient();
  const user = await getUser(req, db);
  if (!user) return json({ error: "Avval tizimga kiring" }, 401);

  const body = await req.json().catch(() => ({}));
  const lang: Lang = ["uz", "ru", "en"].includes(body?.language) ? body.language : "uz";
  const t = TEXT[lang];

  const { data: rawStatus, error: statusError } = await db.rpc("plan_status", { _user_id: user.id });
  if (statusError) return json({ error: t.fail }, 503);
  const status = normalizeStatus(rawStatus);
  if (!(rawStatus as any)?.limits?.home_diary) return json({ error: t.pro, code: "pro_required", plan: status.plan }, 403);

  const { items, errors } = sanitizeHomeItems(body?.items);
  if (errors.length) {
    return json({ error: t.bad + errors.map((m) => METRIC_BY_KEY[m as keyof typeof METRIC_BY_KEY]?.label[lang] ?? m).join(", ") }, 400);
  }
  if (!items.length) return json({ error: t.empty }, 400);

  // Measurement time: now, or up to 7 days back (the patient may enter yesterday's reading).
  let measuredAt = new Date();
  if (typeof body?.measured_at === "string") {
    const d = new Date(body.measured_at);
    if (!Number.isNaN(d.getTime()) && d.getTime() <= Date.now() + 5 * 60_000 && d.getTime() >= Date.now() - 7 * 864e5) measuredAt = d;
  }
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 300) || null : null;

  const since = new Date(Date.now() - 864e5).toISOString();
  const { count } = await db.from("health_measurements").select("id", { count: "exact", head: true })
    .eq("patient_id", user.id).eq("source", "home").gte("created_at", since);
  if ((count ?? 0) + items.length > DAILY_LIMIT) return json({ error: t.limit }, 429);

  const { error } = await db.from("health_measurements").insert(items.map((i) => ({
    patient_id: user.id,
    metric: i.metric,
    value: i.value,
    unit: METRIC_BY_KEY[i.metric].unit,
    note,
    measured_at: measuredAt.toISOString(),
    created_by: user.id,
    source: "home",
  })));
  if (error) {
    console.error("insert failed", error);
    return json({ error: t.fail }, 500);
  }

  const alerts = alertsFor(items);
  let telegram = false;
  if (alerts.length) {
    const msg = alertMessage(lang, alerts);
    await db.from("user_notifications").insert({
      user_id: user.id, kind: "health_alert", title: msg.title, body: msg.body,
      data: { link: "/health", level: alerts[0].level },
    });
    telegram = await telegramToUser(db, user.id, `<b>${escHtml(msg.title)}</b>\n\n${escHtml(msg.body)}`);
  }

  return json({ saved: items.length, alerts, telegram });
});
