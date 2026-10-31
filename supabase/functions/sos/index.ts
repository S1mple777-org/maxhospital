// SOS — favqulodda rejim (ilova tugmasi va MaxBand).
//   { action: "trigger", kind: "sos", lat?, lng?, accuracy? }  — foydalanuvchi (JWT)
//   { action: "safe", event_id }                               — «Men xavfsizman» (JWT)
//   { action: "band", event_id }                               — MaxBand SOS/yiqilish uchun SMS (pg trigger, x-cron-token)
// Kimga: qabul qilingan yaqinlar (band_guardians) — Telegram + ilova; sos_contacts raqamlari — SMS (pullik).
// 103 ga avtomatik qo'ng'iroq qilinmaydi.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, getUser, json, serviceClient } from "../_shared/http.ts";
import { isCronRequest, telegramToUser } from "../_shared/notify.ts";
import { SMS_PRICE_UZS, normalizePhone, smsSegments, sosMessage, sosSms, type SosContext, type SosKind } from "../_shared/sos.ts";
import { sendSms } from "../_shared/sms.ts";

const SITE = (Deno.env.get("SITE_URL") ?? "https://max-hospital1.netlify.app").replace(/\/+$/, "");
const price = () => Number(Deno.env.get("SOS_SMS_PRICE_UZS")) || SMS_PRICE_UZS;

async function person(db: SupabaseClient, userId: string) {
  const [{ data: p }, { data: card }] = await Promise.all([
    db.from("profiles").select("full_name, phone").eq("user_id", userId).maybeSingle(),
    db.from("emergency_cards").select("token").eq("owner_id", userId).is("family_member_id", null).eq("is_enabled", true).maybeSingle(),
  ]);
  return {
    name: (p?.full_name as string) || "Yaqiningiz",
    phone: normalizePhone(p?.phone as string | null),
    cardUrl: card?.token ? `${SITE}/e/${card.token}` : null,
  };
}

async function guardians(db: SupabaseClient, userId: string): Promise<string[]> {
  const { data } = await db.from("band_guardians").select("guardian_id").eq("wearer_id", userId).eq("status", "accepted");
  return [...new Set((data ?? []).map((g) => g.guardian_id as string))];
}

/** Ilova + Telegram (yaqinlar akkauntlari). */
async function notifyAccounts(db: SupabaseClient, ids: string[], kind: SosKind, ctx: SosContext, eventId: string) {
  if (!ids.length) return { app: 0, telegram: 0 };
  const m = sosMessage(kind, ctx);
  await db.from("user_notifications").insert(ids.map((user_id) => ({
    user_id, kind: kind === "safe" ? "sos_safe" : "sos", title: m.title, body: m.plain.slice(0, 1000),
    data: { event_id: eventId, url: ctx.lat != null ? `https://maps.google.com/?q=${ctx.lat},${ctx.lng}` : null },
  })));
  let telegram = 0;
  await Promise.all(ids.map(async (id) => { if (await telegramToUser(db, id, m.html)) telegram++; }));
  return { app: ids.length, telegram };
}

/** SMS sos_contacts raqamlariga; yuborilganlari uchun pul (balans, yetmasa qarz). */
async function smsContacts(db: SupabaseClient, userId: string, kind: SosKind, ctx: SosContext) {
  const { data } = await db.from("sos_contacts").select("phone").eq("user_id", userId).limit(5);
  const phones = [...new Set((data ?? []).map((c) => c.phone as string))];
  if (!phones.length) return { sent: 0, failed: 0, cost: 0, debt: 0 };
  const text = sosSms(kind, ctx);
  const results = await Promise.all(phones.map((p) => sendSms(p, text).catch(() => false)));
  const sent = results.filter(Boolean).length;
  const cost = sent * smsSegments(text) * price();
  let debt = 0;
  if (cost > 0) {
    const { data: ch, error } = await db.rpc("sos_charge", { _user: userId, _cost: cost });
    if (error) console.error("sos_charge", error.message);
    debt = Number((ch as any)?.debt ?? 0);
  }
  return { sent, failed: phones.length - sent, cost, debt };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const body = await req.json().catch(() => ({}));
  const db = serviceClient();

  // ---- MaxBand: faqat SMS (Telegram/ilovani device-api yuborgan) ----
  if (body?.action === "band") {
    if (!(await isCronRequest(req, db))) return json({ error: "Forbidden" }, 403);
    const { data: ev } = await db.from("band_events").select("id, owner_id, family_member_id, kind, lat, lng, created_at")
      .eq("id", body.event_id).maybeSingle();
    if (!ev || ev.family_member_id || !["sos", "fall"].includes(ev.kind)) return json({ skipped: true });
    const { data: row, error } = await db.from("sos_events").insert({
      user_id: ev.owner_id, kind: ev.kind, source: "band", band_event_id: ev.id, lat: ev.lat, lng: ev.lng, created_at: ev.created_at,
    }).select("id").single();
    if (error) return json({ skipped: true, reason: error.message });   // takroriy chaqiruv
    const p = await person(db, ev.owner_id);
    const ctx: SosContext = { ...p, at: ev.created_at, lat: ev.lat, lng: ev.lng, source: "band" };
    const s = await smsContacts(db, ev.owner_id, ev.kind, ctx);
    await db.from("sos_events").update({ sms_sent: s.sent, sms_failed: s.failed, sms_cost_uzs: s.cost, debt_added_uzs: s.debt }).eq("id", row.id);
    return json({ ok: true, ...s });
  }

  const user = await getUser(req, db);
  if (!user) return json({ error: "Avval tizimga kiring" }, 401);

  if (body?.action === "trigger") {
    // Bir daqiqada bir marta (tasodifiy ikki marta bosish)
    const { data: recent } = await db.from("sos_events").select("id").eq("user_id", user.id).eq("source", "app")
      .gte("created_at", new Date(Date.now() - 60_000).toISOString()).limit(1);
    if (recent?.length) return json({ error: "SOS bir daqiqa oldin yuborilgan", event_id: recent[0].id }, 429);

    const num = (v: unknown, lim: number) => (typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= lim ? v : null);
    const lat = num(body.lat, 90), lng = num(body.lng, 180);
    const accuracy = typeof body.accuracy === "number" && body.accuracy > 0 && body.accuracy < 100_000 ? body.accuracy : null;
    const { data: row, error } = await db.from("sos_events").insert({
      user_id: user.id, kind: "sos", source: "app", lat: lat !== null && lng !== null ? lat : null,
      lng: lat !== null && lng !== null ? lng : null, accuracy,
    }).select("id, created_at, lat, lng").single();
    if (error || !row) return json({ error: "Saqlab bo'lmadi" }, 500);

    const p = await person(db, user.id);
    const ctx: SosContext = { ...p, at: row.created_at, lat: row.lat, lng: row.lng, accuracy, source: "app" };
    const [acc, sms] = await Promise.all([
      notifyAccounts(db, await guardians(db, user.id), "sos", ctx, row.id),
      smsContacts(db, user.id, "sos", ctx),
    ]);
    await db.from("sos_events").update({
      notified_app: acc.app, notified_telegram: acc.telegram, sms_sent: sms.sent, sms_failed: sms.failed,
      sms_cost_uzs: sms.cost, debt_added_uzs: sms.debt,
    }).eq("id", row.id);
    return json({ ok: true, event_id: row.id, app: acc.app, telegram: acc.telegram, sms: sms.sent, sms_failed: sms.failed, cost: sms.cost, debt: sms.debt, location: row.lat !== null });
  }

  if (body?.action === "safe") {
    const { data: ev } = await db.from("sos_events").select("id, safe_at, kind, source").eq("id", body.event_id).eq("user_id", user.id).maybeSingle();
    if (!ev) return json({ error: "Topilmadi" }, 404);
    if (ev.safe_at) return json({ ok: true, already: true });
    const now = new Date().toISOString();
    await db.from("sos_events").update({ safe_at: now }).eq("id", ev.id);
    const p = await person(db, user.id);
    const ctx: SosContext = { ...p, at: now, source: ev.source };
    const [acc, sms] = await Promise.all([
      notifyAccounts(db, await guardians(db, user.id), "safe", ctx, ev.id),
      smsContacts(db, user.id, "safe", ctx),
    ]);
    return json({ ok: true, app: acc.app, telegram: acc.telegram, sms: sms.sent, cost: sms.cost, debt: sms.debt });
  }

  return json({ error: "Unknown action" }, 400);
});
