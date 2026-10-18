// MaxBand smart wristband: devices, readings overview, guardians, activation codes and the simulator.
import { supabase } from "@/integrations/supabase/client";
import type { BandEventKind, BandSettings, Point } from "../../supabase/functions/_shared/band.ts";

export * from "../../supabase/functions/_shared/band.ts";

/** Retail price shown on the page (the box includes a 3-month Premium code). */
export const MAXBAND_PRICE_UZS = 349_000;
export const MAXBAND_PREMIUM_DAYS = 90;

export interface BandDevice {
  id: string;
  serial: string;
  owner_id: string;
  family_member_id: string | null;
  name: string;
  is_virtual: boolean;
  firmware: string | null;
  battery: number | null;
  settings: BandSettings;
  last_seen_at: string | null;
  last_location_at: string | null;
  claimed_at: string | null;
}

export interface BandEvent {
  id: string;
  kind: BandEventKind;
  status: "open" | "resolved";
  value: number | null;
  lat: number | null;
  lng: number | null;
  location_at: string | null;
  data: Record<string, unknown>;
  created_at: string;
  resolved_at: string | null;
}

export interface BandOverview {
  device: {
    id: string; name: string; serial: string; battery: number | null; last_seen_at: string | null; is_virtual: boolean;
    firmware: string | null; settings: BandSettings; family_member_id: string | null; owner_id: string; wearer: string | null; plan: string;
  };
  latest: Partial<Record<"hr" | "spo2" | "hrv", { v: number; t: string }>>;
  steps_7d: { day: string; steps: number }[];
  hr_24h: { t: string; avg: number; min: number; max: number }[];
  spo2_24h: { t: string; avg: number; min: number }[];
  night: { from: string; to: string; sleep: Point[]; hr: Point[] };
  hrv_14d: { day: string; avg: number }[];
  events: BandEvent[];
  meds_today: { total: number; taken: number; skipped: number; missed: number; upcoming: number };
}

export interface GuardianLink {
  id: string;
  wearer_id: string;
  guardian_id: string;
  status: "pending" | "accepted";
  created_at: string;
  accepted_at: string | null;
  other_name?: string | null;
}

const rpc = async <T,>(fn: string, args: Record<string, unknown> = {}): Promise<T> => {
  const { data, error } = await supabase.rpc(fn as any, args as any);
  if (error) throw new Error(error.message);
  return data as T;
};

export async function loadBands(): Promise<BandDevice[]> {
  const { data, error } = await supabase.from("band_devices" as any)
    .select("id, serial, owner_id, family_member_id, name, is_virtual, firmware, battery, settings, last_seen_at, last_location_at, claimed_at")
    .order("claimed_at", { ascending: true });
  if (error) return [];
  return (data as unknown as BandDevice[]) ?? [];
}

export const loadOverview = (deviceId: string) => rpc<BandOverview>("band_overview", { _device_id: deviceId });

export async function claimBand(code: string, familyMemberId: string | null, name?: string): Promise<string> {
  const r = await rpc<{ ok: boolean; error?: string; device_id?: string }>("claim_band", {
    _pair_code: code.replace(/\D/g, ""), _family_member_id: familyMemberId, _name: name || null,
  });
  if (!r.ok) throw new Error(r.error || "Ulab bo'lmadi");
  return r.device_id!;
}

export const removeBand = (deviceId: string) => rpc<void>("remove_band", { _device_id: deviceId });

export const updateBand = (deviceId: string, name: string, familyMemberId: string | null, settings: BandSettings) =>
  rpc<BandDevice>("update_band", { _device_id: deviceId, _name: name, _family_member_id: familyMemberId, _settings: settings });

export const redeemBandCode = (code: string) =>
  rpc<{ plan: string; period_end: string; days: number }>("redeem_band_code", { _code: code });

export const resolveBandEvent = (id: string) => rpc<void>("resolve_band_event", { _id: id });

export const reportLocation = (lat: number, lng: number) => rpc<number>("report_band_location", { _lat: lat, _lng: lng });

export const generateBandCodes = (count: number, days: number, batch: string) =>
  rpc<string[]>("generate_band_codes", { _count: count, _premium_days: days, _batch: batch || null });

export async function loadGuardianLinks(userId: string): Promise<{ mine: GuardianLink[]; watching: GuardianLink[] }> {
  const { data } = await supabase.from("band_guardians" as any).select("*").order("created_at");
  const rows = ((data ?? []) as unknown as GuardianLink[]);
  const otherIds = [...new Set(rows.map((r) => (r.wearer_id === userId ? r.guardian_id : r.wearer_id)))];
  const names = new Map<string, string>();
  if (otherIds.length) {
    const { data: ps } = await supabase.from("profiles").select("user_id, full_name").in("user_id", otherIds);
    for (const p of (ps ?? []) as any[]) names.set(p.user_id, p.full_name);
  }
  const withName = (r: GuardianLink) => ({ ...r, other_name: names.get(r.wearer_id === userId ? r.guardian_id : r.wearer_id) ?? null });
  return {
    mine: rows.filter((r) => r.wearer_id === userId).map(withName),
    watching: rows.filter((r) => r.guardian_id === userId).map(withName),
  };
}

export const inviteGuardian = (email: string) => rpc<{ id: string }>("invite_band_guardian", { _email: email.trim() });
export const acceptGuardian = (id: string) => rpc<void>("accept_band_guardian", { _id: id });
export async function removeGuardianLink(id: string): Promise<void> {
  const { error } = await supabase.from("band_guardians" as any).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export interface LiveData {
  available: boolean;
  reason?: "not_active" | "plan";
  device?: { name: string; battery: number | null; last_seen_at: string | null; is_virtual: boolean } | null;
  readings?: { k: "hr" | "spo2"; v: number; t: string }[];
  events?: { kind: BandEventKind; value: number | null; created_at: string }[];
}

export const loadConsultationLive = (consultationId: string, minutes = 60) =>
  rpc<LiveData>("consultation_band_live", { _consultation_id: consultationId, _minutes: minutes });

/** "Online" if the band synced in the last 10 minutes (it syncs every 5 minutes, 15 s in live mode). */
export const isOnline = (lastSeen: string | null) => !!lastSeen && Date.now() - Date.parse(lastSeen) < 10 * 60_000;

export const STRESS_LABEL = { low: "Past", medium: "O'rtacha", high: "Yuqori" } as const;

export const fmtTime = (iso: string | number) =>
  new Intl.DateTimeFormat("uz-UZ", { timeZone: "Asia/Tashkent", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

export const fmtDuration = (min: number) => `${Math.floor(min / 60)} soat ${Math.round(min % 60)} daq`;

export function timeAgo(iso: string | null): string {
  if (!iso) return "hali ulanmagan";
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return "hozirgina";
  if (s < 3600) return `${Math.floor(s / 60)} daq oldin`;
  if (s < 86400) return `${Math.floor(s / 3600)} soat oldin`;
  return `${Math.floor(s / 86400)} kun oldin`;
}

// ---- Device protocol (used by the simulator exactly as the real band uses it) --------------

export interface SyncReply {
  claimed: boolean;
  pair_code?: string | null;
  expired?: boolean;
  server_time?: number;
  plan?: string;
  features?: Record<string, boolean>;
  wearer?: string;
  settings?: BandSettings;
  reminders?: { id: string; at: number; name: string; dose: string }[];
  qr_url?: string | null;
  live?: boolean;
  next_sync_s?: number;
  stored?: number;
  acked?: number;
  alerts?: string[];
  error?: string;
}

async function deviceCall<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("device-api", { body });
  if (error) {
    let msg = error.message;
    try {
      const b = await (error as any)?.context?.json?.();
      if (b?.message || b?.error) msg = b.message || b.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return data as T;
}

export const devicePairStart = (token: string, serial: string) =>
  deviceCall<{ claimed: boolean; pair_code?: string; device_id?: string; error?: string }>({ action: "pair_start", token, serial, firmware: "sim-1.0" });

export const deviceSync = (token: string, payload: { battery: number; readings: { k: string; v: number; t: number }[]; acks?: { id: string; s: "taken" | "skipped" }[] }) =>
  deviceCall<SyncReply>({ action: "sync", token, firmware: "sim-1.0", ...payload });

export const deviceEvent = (token: string, kind: "sos" | "fall" | "consult_request", lat?: number | null, lng?: number | null) =>
  deviceCall<{ ok: boolean; event_id: string; notified: number; duplicate?: boolean }>({ action: "event", token, kind, lat: lat ?? null, lng: lng ?? null });

const SIM_KEY = "maxband-sim";

/** The simulator's own identity, like the secret a real band keeps in its flash memory. */
export function simIdentity(): { token: string; serial: string } {
  try {
    const saved = JSON.parse(localStorage.getItem(SIM_KEY) || "null");
    if (saved?.token && /^[0-9a-f]{64}$/.test(saved.token) && saved?.serial) return saved;
  } catch { /* storage unavailable */ }
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const serial = `SIM-${token.slice(0, 12).toUpperCase()}`;
  try { localStorage.setItem(SIM_KEY, JSON.stringify({ token, serial })); } catch { /* ignore */ }
  return { token, serial };
}

export function resetSimIdentity() {
  try { localStorage.removeItem(SIM_KEY); } catch { /* ignore */ }
}

/**
 * Demo history for the simulator: 7 days of steps, pulse, SpO2, HRV and last night's sleep.
 * Generated on the client and sent through the same device API as live data.
 */
export function demoHistory(nowMs = Date.now()): { k: string; v: number; t: number }[] {
  const out: { k: string; v: number; t: number }[] = [];
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const sec = (ms: number) => Math.floor(ms / 1000);
  // The server keeps the last 48 hours of buffered data: fill 47 hours, every 5 minutes.
  const from = nowMs - 47 * 3600_000;
  for (let t = from; t < nowMs - 60_000; t += 5 * 60_000) {
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", hour: "2-digit", hour12: false }).format(t));
    const night = hour >= 23 || hour < 7;
    const awakeBlip = night && hour === 3 && new Date(t).getUTCMinutes() < 15; // one short awakening
    out.push({ k: "hr", v: Math.round(night ? rnd(54, 62) : rnd(66, 84)), t: sec(t) });
    out.push({ k: "steps", v: night ? 0 : Math.round(rnd(0, 1) < 0.35 ? rnd(150, 520) : rnd(0, 60)), t: sec(t) });
    if (night) out.push({ k: "sleep", v: awakeBlip ? 0 : 5, t: sec(t) });
    if (new Date(t).getUTCMinutes() < 5 && hour % 2 === 0) out.push({ k: "spo2", v: Math.round(rnd(95, 99)), t: sec(t) });
    if (new Date(t).getUTCMinutes() < 5 && hour % 3 === 0) out.push({ k: "hrv", v: Math.round(rnd(35, 55)), t: sec(t) });
  }
  return out;
}
