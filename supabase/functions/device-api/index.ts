// MaxBand <-> server. Called by the band (and by the simulator on the MaxBand page).
// The band authenticates with its own random token (x-device-token header, or "token" in the body);
// only the sha256 hash of it is stored. Users never call this with their login.
//
//   pair_start  {serial, token, firmware}            -> 6-digit code shown on the band screen
//   sync        {battery, firmware, readings, acks}  -> reminders, settings, QR link, live mode
//   event       {kind: sos|fall|consult_request, lat?, lng?}
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, serviceClient } from "../_shared/http.ts";
import { escHtml, telegramToUser } from "../_shared/notify.ts";
import {
  bandFeatures, DEFAULT_BAND_SETTINGS, detectVitalAlerts, emergencyMessage, EVENT_LABELS, missedMedsMessage,
  sanitizeReadings, toAscii, vitalAlertMessage, type BandAlertKind, type BandSettings,
} from "../_shared/band.ts";

const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://max-hospital1.netlify.app").replace(/\/+$/, "");
const TOKEN_RE = /^[0-9a-f]{64}$/;
const SERIAL_RE = /^[A-Za-z0-9_-]{4,64}$/;
const CORS = { ...corsHeaders, "Access-Control-Allow-Headers": `${corsHeaders["Access-Control-Allow-Headers"] ?? ""}, x-device-token` };

interface Device {
  id: string;
  owner_id: string | null;
  family_member_id: string | null;
  pair_code: string | null;
  pair_expires_at: string | null;
  settings: BandSettings | null;
  last_seen_at: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_location_at: string | null;
  is_virtual: boolean;
}

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const memberFilter = <T extends { eq: any; is: any }>(q: T, col: string, member: string | null): T =>
  member ? q.eq(col, member) : q.is(col, null);

async function planOf(db: SupabaseClient, userId: string): Promise<string> {
  const { data } = await db.rpc("plan_of_internal", { _user_id: userId });
  return typeof data === "string" ? data : "free";
}

async function wearerInfo(db: SupabaseClient, d: Device): Promise<{ name: string; phone: string | null }> {
  if (d.family_member_id) {
    const { data } = await db.from("family_members").select("full_name").eq("id", d.family_member_id).maybeSingle();
    return { name: data?.full_name ?? "Oila a'zosi", phone: null };
  }
  const { data } = await db.from("profiles").select("full_name, phone").eq("user_id", d.owner_id!).maybeSingle();
  return { name: data?.full_name || "Bilaguzuk egasi", phone: data?.phone ?? null };
}

async function emergencyCardUrl(db: SupabaseClient, d: Device): Promise<string | null> {
  const q = db.from("emergency_cards").select("token").eq("owner_id", d.owner_id!).eq("is_enabled", true);
  const { data } = await memberFilter(q, "family_member_id", d.family_member_id).maybeSingle();
  return data?.token ? `${SITE_URL}/e/${data.token}` : null;
}

/** Accepted guardians of a self-worn band (guardians follow an account, not a family member). */
async function guardianIds(db: SupabaseClient, d: Device): Promise<string[]> {
  if (d.family_member_id) return [];
  const { data } = await db.from("band_guardians").select("guardian_id").eq("wearer_id", d.owner_id!).eq("status", "accepted");
  return (data ?? []).map((g) => g.guardian_id as string);
}

/** Doctor of the wearer's active (or recent) consultation, for SOS / fall on Premium. */
async function doctorUserId(db: SupabaseClient, d: Device): Promise<string | null> {
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const q = db.from("consultations").select("status, created_at, doctors!inner(user_id)")
    .eq("patient_id", d.owner_id!).in("status", ["active", "completed"]).gte("created_at", since)
    .order("created_at", { ascending: false }).limit(5);
  const { data } = await memberFilter(q, "family_member_id", d.family_member_id);
  const rows = (data ?? []) as any[];
  const pick = rows.find((r) => r.status === "active") ?? rows[0];
  return pick?.doctors?.user_id ?? null;
}

async function notifyUsers(db: SupabaseClient, userIds: string[], n: { kind: string; title: string; body: string; html: string; data: Record<string, unknown> }): Promise<number> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return 0;
  await db.from("user_notifications").insert(ids.map((user_id) => ({ user_id, kind: n.kind, title: n.title, body: n.body.slice(0, 1000), data: n.data })));
  let sent = 0;
  for (const id of ids) if (await telegramToUser(db, id, n.html)) sent++;
  return ids.length + sent;
}

// ---- sync -----------------------------------------------------------------------
async function handleSync(db: SupabaseClient, d: Device, body: any) {
  const now = Date.now();
  if (d.last_seen_at && now - Date.parse(d.last_seen_at) < 3000) return reply({ error: "too_fast", retry_s: 5 }, 429);
  const owner = d.owner_id!;
  const plan = await planOf(db, owner);
  const f = bandFeatures(plan);
  const settings = { ...DEFAULT_BAND_SETTINGS, ...(d.settings ?? {}) } as BandSettings;
  const battery = Number(body?.battery);
  await db.from("band_devices").update({
    last_seen_at: new Date(now).toISOString(),
    battery: Number.isFinite(battery) ? Math.min(100, Math.max(0, Math.round(battery))) : null,
    ...(typeof body?.firmware === "string" ? { firmware: body.firmware.slice(0, 40) } : {}),
  }).eq("id", d.id);
  const wearer = await wearerInfo(db, d);

  // 1. Readings
  let stored = 0;
  if (f.sync) {
    const rows = sanitizeReadings(body?.readings, now).map((r) => ({
      device_id: d.id, owner_id: owner, family_member_id: d.family_member_id, ...r,
    }));
    if (rows.length) {
      const { error } = await db.from("band_readings").upsert(rows, { onConflict: "device_id,kind,measured_at", ignoreDuplicates: true });
      if (error) console.error("readings insert failed", error);
      else stored = rows.length;
    }
  }

  // 2. "Taken / skipped" pressed on the band
  let acked = 0;
  if (f.reminders && Array.isArray(body?.acks)) {
    for (const a of body.acks.slice(0, 20)) {
      const status = a?.s === "skipped" || a?.status === "skipped" ? "skipped" : "taken";
      if (typeof a?.id !== "string" || !/^[0-9a-f-]{36}$/.test(a.id)) continue;
      const { data } = await db.from("medication_reminders").update({ status, responded_at: new Date(now).toISOString() })
        .eq("id", a.id).eq("user_id", owner).in("status", ["pending", "sent", "missed"])
        .lte("scheduled_at", new Date(now + 2 * 3600_000).toISOString()).select("id");
      acked += data?.length ?? 0;
    }
  }

  // 3. Dangerous pulse / SpO2 (sustained, deduplicated for 30 minutes per kind)
  const alerts: string[] = [];
  if (f.alerts && stored > 0) {
    const since = new Date(now - 30 * 60_000).toISOString();
    const q = db.from("band_readings").select("kind, value, measured_at")
      .eq("owner_id", owner).in("kind", ["hr", "spo2", "steps"]).gte("measured_at", since)
      .order("measured_at", { ascending: false }).limit(300);
    const { data: recent } = await memberFilter(q, "family_member_id", d.family_member_id);
    for (const a of detectVitalAlerts((recent ?? []) as any[], settings, now)) {
      const dq = db.from("band_events").select("id").eq("owner_id", owner).eq("kind", a.kind).gte("created_at", since).limit(1);
      const { data: dup } = await memberFilter(dq, "family_member_id", d.family_member_id);
      if (dup?.length) continue;
      const { data: ev } = await db.from("band_events").insert({
        device_id: d.id, owner_id: owner, family_member_id: d.family_member_id, kind: a.kind, value: a.value,
      }).select("id").single();
      const msg = vitalAlertMessage(a.kind as BandAlertKind, a.value, wearer.name);
      const to = [owner, ...(f.family ? await guardianIds(db, d) : [])];
      const count = await notifyUsers(db, to, {
        kind: "maxband_alert", title: msg.title, body: msg.body,
        html: `<b>⚠️ ${escHtml(msg.title)}</b>\n\n${escHtml(msg.body)}`,
        data: { link: "/maxband", event_id: ev?.id, kind: a.kind },
      });
      if (ev?.id) await db.from("band_events").update({ notified_count: count }).eq("id", ev.id);
      alerts.push(a.kind);
    }
  }

  // 4. Medicine not taken within 30 minutes -> family (Premium)
  if (f.family) {
    const { data: missed } = await db.rpc("claim_band_missed_reminders", { _owner: owner, _member: d.family_member_id });
    const list = (missed ?? []) as { medicine_name: string; dose: string | null; scheduled_at: string }[];
    if (list.length) {
      const to = d.family_member_id ? [owner] : await guardianIds(db, d);
      const msg = missedMedsMessage(wearer.name, list);
      const { data: ev } = await db.from("band_events").insert({
        device_id: d.id, owner_id: owner, family_member_id: d.family_member_id, kind: "med_missed", value: list.length,
        data: { medicines: list.map((m) => m.medicine_name) },
      }).select("id").single();
      const count = await notifyUsers(db, to, {
        kind: "maxband_alert", title: msg.title, body: msg.body,
        html: `<b>${escHtml(msg.title)}</b>\n\n${escHtml(msg.body)}`,
        data: { link: "/maxband", event_id: ev?.id, kind: "med_missed" },
      });
      if (ev?.id) await db.from("band_events").update({ notified_count: count }).eq("id", ev.id);
    }
  }

  // 5. What the band shows next
  let reminders: { id: string; at: number; name: string; dose: string }[] = [];
  if (f.reminders) {
    const q = db.from("medication_reminders")
      .select("id, scheduled_at, medication_schedules!inner(medicine_name, dose, family_member_id, is_active)")
      .eq("user_id", owner).in("status", ["pending", "sent"]).eq("medication_schedules.is_active", true)
      .gte("scheduled_at", new Date(now - 30 * 60_000).toISOString())
      .lte("scheduled_at", new Date(now + 24 * 3600_000).toISOString())
      .order("scheduled_at").limit(20);
    const { data } = await memberFilter(q, "medication_schedules.family_member_id", d.family_member_id);
    reminders = ((data ?? []) as any[]).map((r) => ({
      id: r.id,
      at: Math.floor(Date.parse(r.scheduled_at) / 1000),
      name: toAscii(r.medication_schedules?.medicine_name, 20),
      dose: toAscii(r.medication_schedules?.dose, 20),
    }));
  }

  let live = false;
  if (f.doctor_live) {
    const q = db.from("consultations").select("id").eq("patient_id", owner).eq("status", "active").limit(1);
    const { data } = await memberFilter(q, "family_member_id", d.family_member_id);
    live = (data?.length ?? 0) > 0;
  }

  return reply({
    claimed: true,
    server_time: Math.floor(now / 1000),
    tz_offset_min: 300,
    plan,
    features: f,
    wearer: toAscii(wearer.name, 20),
    settings,
    reminders,
    qr_url: f.qr ? await emergencyCardUrl(db, d) : null,
    live,
    next_sync_s: live ? 15 : 300,
    stored,
    acked,
    alerts,
  });
}

// ---- event (SOS, fall, "contact a doctor") ------------------------------------------
async function handleEvent(db: SupabaseClient, d: Device, body: any) {
  const kind = body?.kind;
  if (!["sos", "fall", "consult_request"].includes(kind)) return reply({ error: "bad_kind" }, 400);
  const owner = d.owner_id!;
  const plan = await planOf(db, owner);
  const f = bandFeatures(plan);
  if (kind === "consult_request" && !f.consult) return reply({ error: "plan", plan }, 403);

  const since = new Date(Date.now() - 60_000).toISOString();
  const { data: dup } = await db.from("band_events").select("id").eq("device_id", d.id).eq("kind", kind).gte("created_at", since).limit(1);
  if (dup?.length) return reply({ ok: true, event_id: dup[0].id, duplicate: true });

  // Location: sent with the event (simulator / phone), or the last one the wearer's phone shared (3 h).
  let lat: number | null = null, lng: number | null = null, locationAt: string | null = null, stored = false;
  const bl = Number(body?.lat), bg = Number(body?.lng);
  if (Number.isFinite(bl) && Number.isFinite(bg) && Math.abs(bl) <= 90 && Math.abs(bg) <= 180 && body?.lat !== null && body?.lng !== null) {
    lat = bl; lng = bg; locationAt = new Date().toISOString();
  } else if (d.last_lat !== null && d.last_lng !== null && d.last_location_at && Date.now() - Date.parse(d.last_location_at) < 3 * 3600_000) {
    lat = d.last_lat; lng = d.last_lng; locationAt = d.last_location_at; stored = true;
  }

  const { data: ev, error } = await db.from("band_events").insert({
    device_id: d.id, owner_id: owner, family_member_id: d.family_member_id, kind, lat, lng, location_at: locationAt,
  }).select("id, created_at").single();
  if (error || !ev) {
    console.error("event insert failed", error);
    return reply({ error: "save_failed" }, 500);
  }
  const wearer = await wearerInfo(db, d);

  let notified = 0;
  if (kind === "sos" || kind === "fall") {
    const msg = emergencyMessage(kind, {
      wearer: wearer.name, at: ev.created_at, lat, lng, locationAt: stored ? locationAt : null,
      phone: wearer.phone, cardUrl: await emergencyCardUrl(db, d),
    });
    const to = [owner, ...(await guardianIds(db, d))];
    if (f.family) {
      const doc = await doctorUserId(db, d);
      if (doc) to.push(doc);
    }
    notified = await notifyUsers(db, to, {
      kind: "maxband_sos", title: msg.title, body: msg.plain, html: msg.html,
      data: { link: "/maxband", event_id: ev.id, kind },
    });
  } else {
    const title = `🩺 ${EVENT_LABELS.consult_request} — ${wearer.name}`;
    const text = "Bilaguzukdagi tugma bosildi: shifokor bilan bog'lanish so'raldi. Saytda shifokorni tanlab, konsultatsiyani boshlang.";
    const to = [owner, ...(f.family ? await guardianIds(db, d) : [])];
    notified = await notifyUsers(db, to, {
      kind: "maxband_consult", title, body: text,
      html: `<b>${escHtml(title)}</b>\n\n${escHtml(text)}\n${SITE_URL}/start-consultation`,
      data: { link: "/start-consultation", event_id: ev.id, kind, family_member_id: d.family_member_id },
    });
  }
  await db.from("band_events").update({ notified_count: notified }).eq("id", ev.id);
  return reply({ ok: true, event_id: ev.id, notified });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return reply({ error: "bad_json" }, 400);
  const db = serviceClient();
  const token = String(req.headers.get("x-device-token") ?? body.token ?? "").toLowerCase();
  if (!TOKEN_RE.test(token)) return reply({ error: "bad_token" }, 401);
  const tokenHash = await sha256Hex(token);

  if (body.action === "pair_start") {
    const serial = String(body.serial ?? "");
    if (!SERIAL_RE.test(serial)) return reply({ error: "bad_serial" }, 400);
    const { data, error } = await db.rpc("band_pair_start", {
      _serial: serial, _token_hash: tokenHash, _firmware: typeof body.firmware === "string" ? body.firmware : null,
    });
    if (error) {
      console.error("pair_start failed", error);
      return reply({ error: "pair_failed" }, 500);
    }
    if ((data as any)?.error === "claimed_elsewhere") {
      return reply({ error: "claimed_elsewhere", message: "Avval saytda bilaguzukni akkauntdan olib tashlang" }, 409);
    }
    return reply(data);
  }

  const { data: device } = await db.from("band_devices")
    .select("id, owner_id, family_member_id, pair_code, pair_expires_at, settings, last_seen_at, last_lat, last_lng, last_location_at, is_virtual")
    .eq("token_hash", tokenHash).maybeSingle();
  if (!device) return reply({ error: "unknown_device" }, 401);
  const d = device as Device;
  if (!d.owner_id) {
    const expired = !d.pair_expires_at || Date.parse(d.pair_expires_at) < Date.now();
    return reply({ claimed: false, pair_code: expired ? null : d.pair_code, expired });
  }

  try {
    if (body.action === "sync") return await handleSync(db, d, body);
    if (body.action === "event") return await handleEvent(db, d, body);
  } catch (e) {
    console.error("device-api failed", e);
    return reply({ error: "server_error" }, 500);
  }
  return reply({ error: "unknown_action" }, 400);
});
