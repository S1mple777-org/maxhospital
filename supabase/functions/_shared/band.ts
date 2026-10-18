// MaxBand: validation, tariff features and health analytics shared by the device-api
// function, the weekly report and the web app. Every number here is computed in code;
// nothing is diagnosed — alerts only tell people to check on the wearer or call 103.

export type BandKind = "hr" | "spo2" | "hrv" | "steps" | "sleep";
export type BandAlertKind = "hr_high" | "hr_low" | "spo2_low";
export type BandEventKind = "sos" | "fall" | "consult_request" | BandAlertKind | "med_missed";
export type PlanId = "free" | "pro" | "premium";

export interface BandSettings {
  hr_high: number;
  hr_low: number;
  spo2_low: number;
  fall_detection: boolean;
  water_interval_min: number;
  sedentary_min: number;
  steps_goal: number;
  quiet_from: string;
  quiet_to: string;
}

export const DEFAULT_BAND_SETTINGS: BandSettings = {
  hr_high: 130, hr_low: 40, spo2_low: 90, fall_detection: true,
  water_interval_min: 120, sedentary_min: 60, steps_goal: 6000, quiet_from: "22:00", quiet_to: "07:00",
};

/** Plausible ranges for one stored sample. Anything outside is a sensor error and is dropped. */
export const READING_RANGES: Record<BandKind, [number, number]> = {
  hr: [25, 250],       // beats per minute
  spo2: [70, 100],     // %
  hrv: [1, 300],       // RMSSD, ms
  steps: [0, 5000],    // steps in one interval (device sends every 1–5 minutes)
  sleep: [0, 60],      // minutes asleep in one interval
};

export interface BandFeatures {
  /** readings are stored and shown on the site */
  sync: boolean;
  /** medication reminders on the band, "taken" button */
  reminders: boolean;
  /** dangerous pulse / SpO2 alerts to the wearer (and the account owner) */
  alerts: boolean;
  /** QR emergency card on the band screen */
  qr: boolean;
  /** "contact a doctor" button */
  consult: boolean;
  /** guardians see readings, get alerts and missed-medicine messages */
  family: boolean;
  /** the doctor sees pulse and SpO2 live during a consultation */
  doctor_live: boolean;
  /** SOS and fall alerts: always on — safety is never behind a paywall */
  sos: true;
}

export function bandFeatures(plan: string | null | undefined): BandFeatures {
  const paid = plan === "pro" || plan === "premium";
  const premium = plan === "premium";
  return {
    sync: paid, reminders: paid, alerts: paid, qr: paid, consult: paid,
    family: premium, doctor_live: premium, sos: true,
  };
}

export interface CleanReading {
  kind: BandKind;
  value: number;
  measured_at: string;
}

/**
 * Validates readings sent by the band: {k, v, t} with t in unix seconds.
 * Keeps samples from the last 48 hours (the band buffers while offline) and drops duplicates.
 */
export function sanitizeReadings(raw: unknown, nowMs: number, max = 600): CleanReading[] {
  if (!Array.isArray(raw)) return [];
  const out: CleanReading[] = [];
  const seen = new Set<string>();
  for (const r of raw.slice(0, max)) {
    const kind = (r as any)?.k ?? (r as any)?.kind;
    if (!(kind in READING_RANGES)) continue;
    const value = Number((r as any)?.v ?? (r as any)?.value);
    const [lo, hi] = READING_RANGES[kind as BandKind];
    if (!Number.isFinite(value) || value < lo || value > hi) continue;
    const tSec = Number((r as any)?.t);
    if (!Number.isFinite(tSec)) continue;
    const ms = Math.round(tSec) * 1000;
    if (ms > nowMs + 5 * 60_000 || ms < nowMs - 48 * 3600_000) continue;
    const key = `${kind}:${ms}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind, value: Math.round(value * 10) / 10, measured_at: new Date(ms).toISOString() });
  }
  return out;
}

export interface TimedValue {
  kind: string;
  value: number;
  measured_at: string;
}

/**
 * Sustained dangerous readings. Pulse: the latest 2–3 samples of the last 10 minutes are all
 * above (or below) the limit — unless the wearer is walking (many steps), when a high pulse is normal.
 * SpO2: the two latest samples within 30 minutes are both under the limit.
 */
export function detectVitalAlerts(recent: TimedValue[], s: Pick<BandSettings, "hr_high" | "hr_low" | "spo2_low">, nowMs: number):
  { kind: BandAlertKind; value: number }[] {
  const within = (r: TimedValue, min: number) => {
    const t = Date.parse(r.measured_at);
    return t <= nowMs + 60_000 && t >= nowMs - min * 60_000;
  };
  const byTimeDesc = (a: TimedValue, b: TimedValue) => Date.parse(b.measured_at) - Date.parse(a.measured_at);
  const alerts: { kind: BandAlertKind; value: number }[] = [];

  const hr = recent.filter((r) => r.kind === "hr" && within(r, 10)).sort(byTimeDesc).slice(0, 3);
  const steps10 = recent.filter((r) => r.kind === "steps" && within(r, 10)).reduce((sum, r) => sum + r.value, 0);
  if (hr.length >= 2) {
    if (hr.every((r) => r.value >= s.hr_high) && steps10 < 400) alerts.push({ kind: "hr_high", value: Math.max(...hr.map((r) => r.value)) });
    else if (hr.every((r) => r.value <= s.hr_low)) alerts.push({ kind: "hr_low", value: Math.min(...hr.map((r) => r.value)) });
  }
  const spo2 = recent.filter((r) => r.kind === "spo2" && within(r, 30)).sort(byTimeDesc).slice(0, 2);
  if (spo2.length === 2 && spo2.every((r) => r.value < s.spo2_low)) {
    alerts.push({ kind: "spo2_low", value: Math.min(...spo2.map((r) => r.value)) });
  }
  return alerts;
}

export interface Point {
  t: string;
  v: number;
}

export interface SleepSummary {
  /** minutes actually asleep */
  asleepMin: number;
  start: string;
  end: string;
  /** awake periods of 10+ minutes inside the night */
  awakenings: number;
  /** 0–100: duration (7–9 h is best) and continuity */
  score: number;
  avgHr: number | null;
}

/**
 * One night from the band's sleep samples (minutes asleep per interval, usually 5 minutes).
 * Returns null when there is less than an hour of sleep (band not worn, or the day only).
 */
export function summarizeSleep(samples: Point[], hr: Point[] = [], windowMin = 5): SleepSummary | null {
  const pts = samples
    .map((p) => ({ t: Date.parse(p.t), v: Number(p.v) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
    .sort((a, b) => a.t - b.t);
  const asleep = (v: number) => v >= windowMin / 2;
  const first = pts.findIndex((p) => asleep(p.v));
  if (first < 0) return null;
  let last = pts.length - 1;
  while (last > first && !asleep(pts[last].v)) last--;
  const night = pts.slice(first, last + 1);
  const asleepMin = Math.round(night.reduce((s, p) => s + Math.min(p.v, windowMin), 0));
  if (asleepMin < 60) return null;

  // Awake periods inside the night: non-asleep windows plus gaps with no data, 10+ minutes in a row.
  let awakenings = 0;
  let awakeMs = 0;
  for (let i = 1; i < night.length; i++) {
    const gap = night[i].t - night[i - 1].t - windowMin * 60_000;
    if (gap >= 10 * 60_000) awakeMs += gap;
    if (!asleep(night[i].v)) {
      awakeMs += windowMin * 60_000;
      continue;
    }
    if (awakeMs >= 10 * 60_000) awakenings++;
    awakeMs = 0;
  }

  const startMs = night[0].t - windowMin * 60_000;
  const endMs = night[night.length - 1].t;
  const hours = asleepMin / 60;
  const duration = hours < 7 ? (60 * hours) / 7 : hours <= 9 ? 60 : Math.max(30, 60 - (hours - 9) * 15);
  const continuity = Math.max(0, 40 - awakenings * 8);
  const nightHr = hr
    .map((p) => ({ t: Date.parse(p.t), v: Number(p.v) }))
    .filter((p) => p.t >= startMs && p.t <= endMs && Number.isFinite(p.v));
  return {
    asleepMin,
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
    awakenings,
    score: Math.round(Math.min(100, Math.max(0, duration + continuity))),
    avgHr: nightHr.length ? Math.round(nightHr.reduce((s, p) => s + p.v, 0) / nightHr.length) : null,
  };
}

export type StressLevel = "low" | "medium" | "high";

export interface StressResult {
  score: number;
  level: StressLevel;
  /** the wearer's usual HRV (median of earlier days), null while it is being learned */
  baseline: number | null;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Stress estimate from heart-rate variability (RMSSD). Lower HRV than the wearer's own
 * usual level means more stress. With fewer than 3 earlier days, general ranges are used.
 */
export function stressFromHrv(today: number | null | undefined, earlierDays: number[]): StressResult | null {
  if (today === null || today === undefined || !Number.isFinite(today) || today <= 0) return null;
  const hist = earlierDays.filter((v) => Number.isFinite(v) && v > 0);
  let score: number;
  let baseline: number | null = null;
  if (hist.length >= 3) {
    baseline = Math.round(median(hist) * 10) / 10;
    score = 50 - ((today / baseline) - 1) * 100;
  } else {
    score = today >= 60 ? 20 : today >= 40 ? 40 : today >= 25 ? 60 : 80;
  }
  score = Math.round(Math.min(100, Math.max(0, score)));
  return { score, baseline, level: score < 40 ? "low" : score < 65 ? "medium" : "high" };
}

// ---- Texts (Uzbek; the band itself shows ASCII only) ------------------------------

export const EVENT_LABELS: Record<BandEventKind, string> = {
  sos: "SOS tugmasi",
  fall: "Yiqilish aniqlandi",
  hr_high: "Puls juda yuqori",
  hr_low: "Puls juda past",
  spo2_low: "Qonda kislorod past",
  med_missed: "Dori ichilmadi",
  consult_request: "Shifokorga murojaat",
};

const tashkentTime = (iso: string | number | Date) =>
  new Intl.DateTimeFormat("uz-UZ", { timeZone: "Asia/Tashkent", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

export interface EmergencyContext {
  wearer: string;
  at: string;
  lat?: number | null;
  lng?: number | null;
  locationAt?: string | null;
  phone?: string | null;
  cardUrl?: string | null;
}

/** Text for SOS / fall. `html` for Telegram, `plain` for the site notification. */
export function emergencyMessage(kind: "sos" | "fall", c: EmergencyContext): { title: string; plain: string; html: string } {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const title = `${kind === "sos" ? "🆘 SOS" : "⚠️ Yiqilish"} — ${c.wearer}`;
  const what = kind === "sos"
    ? "MaxBand favqulodda tugmasi bosildi."
    : "MaxBand yiqilishni aniqladi va 30 soniya ichida bekor qilinmadi.";
  const lines = [what, `Vaqt: ${tashkentTime(c.at)} (Toshkent)`];
  const htmlLines = [esc(what), `🕐 ${tashkentTime(c.at)} (Toshkent)`];
  if (c.lat !== null && c.lat !== undefined && c.lng !== null && c.lng !== undefined) {
    const url = `https://maps.google.com/?q=${c.lat.toFixed(6)},${c.lng.toFixed(6)}`;
    const when = c.locationAt ? ` (oxirgi ma'lum joy, ${tashkentTime(c.locationAt)})` : "";
    lines.push(`Joylashuv: ${url}${when}`);
    htmlLines.push(`📍 <a href="${url}">Xaritada ochish</a>${esc(when)}`);
  } else {
    lines.push("Joylashuv noma'lum.");
    htmlLines.push("📍 Joylashuv noma'lum");
  }
  if (c.phone) {
    lines.push(`Telefon: ${c.phone}`);
    htmlLines.push(`📞 ${esc(c.phone)}`);
  }
  if (c.cardUrl) {
    lines.push(`Favqulodda karta: ${c.cardUrl}`);
    htmlLines.push(`🩺 <a href="${c.cardUrl}">Favqulodda tibbiy karta</a>`);
  }
  const tail = "Darhol bog'laning. Ahvoli og'ir bo'lsa 103 ga qo'ng'iroq qiling.";
  lines.push("", tail);
  htmlLines.push("", `<b>${esc(tail)}</b>`);
  return { title, plain: lines.join("\n"), html: `<b>${esc(title)}</b>\n\n${htmlLines.join("\n")}` };
}

export function vitalAlertMessage(kind: BandAlertKind, value: number, wearer: string): { title: string; body: string } {
  const what = kind === "hr_high" ? `Puls ${Math.round(value)} zarba/daq — bir necha o'lchovda yuqori.`
    : kind === "hr_low" ? `Puls ${Math.round(value)} zarba/daq — bir necha o'lchovda past.`
    : `Qonda kislorod (SpO₂) ${value}% — ikki o'lchovda past.`;
  return {
    title: `${EVENT_LABELS[kind]} — ${wearer}`,
    body: `${what}\nAhvolini so'rang. Nafas qisishi, ko'krak og'rig'i yoki hushdan ketish bo'lsa — darhol 103. ` +
      "Bilaguzuk tibbiy asbob emas: shubha bo'lsa o'lchovni tonometr yoki pulsoksimetr bilan takrorlang.",
  };
}

export function missedMedsMessage(wearer: string, meds: { medicine_name: string; dose: string | null; scheduled_at: string }[]): { title: string; body: string } {
  const list = meds.slice(0, 5).map((m) => `• ${tashkentTime(m.scheduled_at)} — ${m.medicine_name}${m.dose ? `, ${m.dose}` : ""}`);
  return {
    title: `💊 Dori ichilmadi — ${wearer}`,
    body: `30 daqiqa ichida bilaguzukda "Ichdim" bosilmadi:\n${list.join("\n")}\nIltimos, eslatib qo'ying.`,
  };
}

const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts", ч: "ch", ш: "sh", щ: "sh",
  ъ: "'", ы: "i", ь: "", э: "e", ю: "yu", я: "ya", ў: "o'", қ: "q", ғ: "g'", ҳ: "h",
};

/** The band's OLED font is ASCII only: "Oʻgʻil — 500 mg" -> "O'g'il - 500 mg", "Анна" -> "Anna". */
export function toAscii(s: string | null | undefined, max = 24): string {
  if (!s) return "";
  return s
    .replace(/[\u0400-\u04FF]/g, (ch) => {
      const lower = ch.toLowerCase();
      const lat = CYRILLIC[lower] ?? "";
      return ch !== lower && lat ? lat[0].toUpperCase() + lat.slice(1) : lat;
    })
    .replace(/[ʻʼ‘’`´]/g, "'")
    .replace(/[–—]/g, "-")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}
