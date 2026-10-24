// Pure, dependency-free logic for medication schedules. Shared by the edge
// functions (Deno) and the React app / unit tests (Vite + Vitest).

export type PlanLang = "uz" | "ru" | "en";

export interface PlanItem {
  medicine_name: string;
  dose: string;
  instructions: string;
  /** "HH:MM" in the user's time zone, sorted, unique, 1–8 items */
  times: string[];
  /** course length, 1–90 */
  days: number;
  /** "YYYY-MM-DD" or null = today */
  start_date: string | null;
  /** the AI was unsure (frequency / duration unclear) — the user must check it */
  needs_confirmation: boolean;
  note: string;
}

export const MAX_TIMES_PER_DAY = 8;
export const MAX_DAYS = 90;
export const DEFAULT_DAYS = 7;
export const MAX_ITEMS = 20;

/** "8", "8:0", "08.00", "8:30 " -> "08:00" / "08:30"; invalid -> null */
export function normalizeTime(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const m = String(value).trim().match(/^(\d{1,2})(?:[:.](\d{1,2}))?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
export const fromMinutes = (total: number) => {
  const t = ((Math.round(total) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

/** Sorted unique valid times, at most MAX_TIMES_PER_DAY. */
export function cleanTimes(values: unknown): string[] {
  const list = Array.isArray(values) ? values : [];
  const set = new Set<string>();
  for (const v of list) {
    const t = normalizeTime(v);
    if (t) set.add(t);
  }
  return [...set].sort((a, b) => toMinutes(a) - toMinutes(b)).slice(0, MAX_TIMES_PER_DAY);
}

/** `n` doses spread evenly over the waking hours (first at wake-up, last before sleep). */
export function spreadTimes(n: number, wake = "08:00", sleep = "22:00"): string[] {
  const count = Math.min(Math.max(Math.round(n), 1), MAX_TIMES_PER_DAY);
  const start = toMinutes(normalizeTime(wake) ?? "08:00");
  let end = toMinutes(normalizeTime(sleep) ?? "22:00");
  if (end <= start) end += 1440;
  if (count === 1) return [fromMinutes(start)];
  const step = (end - start) / (count - 1);
  // round to 5 minutes so the plan looks human
  return cleanTimes(Array.from({ length: count }, (_, i) => fromMinutes(Math.round((start + step * i) / 5) * 5)));
}

/** A sensible time for a newly added dose: 4 hours after the last one, never a duplicate. */
export function suggestNextTime(times: string[]): string {
  const valid = cleanTimes(times);
  let t = valid.length ? toMinutes(valid[valid.length - 1]) + 240 : 8 * 60;
  const taken = new Set(valid);
  for (let i = 0; i < 288 && taken.has(fromMinutes(t)); i++) t += 5;
  return fromMinutes(t);
}

/**
 * "Kuniga N marta": N=1 keeps the time the user already chose (it used to jump to the wake-up
 * time, 07:00 by default, which looked like the entered time was ignored); N>1 spreads the doses
 * from the first chosen time to bedtime.
 */
export function timesPerDay(n: number, current: string[], wake = "08:00", sleep = "22:00"): string[] {
  const first = cleanTimes(current)[0];
  if (Math.round(n) <= 1) return [first ?? normalizeTime(wake) ?? "08:00"];
  return spreadTimes(n, first ?? wake, sleep);
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[ʻʼ‘’`´']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Does an AI-returned medicine name refer to one of the prescribed medicines? */
export function matchesAllowedName(name: string, allowed: string[]): string | null {
  const n = normalizeName(name);
  if (!n) return null;
  for (const a of allowed) {
    const an = normalizeName(a);
    if (!an) continue;
    if (an === n || an.includes(n) || n.includes(an)) return a;
    // first word (brand name) match, e.g. "Amoxiclav 625" vs "Amoxiclav"
    const first = an.split(" ")[0];
    if (first.length >= 4 && n.split(" ")[0] === first) return a;
  }
  return null;
}

const isIsoDate = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

const clip = (s: unknown, max: number) => (typeof s === "string" ? s.trim().slice(0, max) : "");

/**
 * Validates and repairs what the language model returned. Never trusts it:
 * invalid times are dropped, unknown course length gets a default and a
 * confirmation flag, and (for a site prescription) medicines that are not on
 * the prescription are removed.
 */
export function sanitizePlan(
  raw: unknown,
  opts: { allowedNames?: string[]; prescribedDoses?: Record<string, string> } = {},
): { items: PlanItem[]; warnings: string[] } {
  const warnings: string[] = [];
  const input = (raw && typeof raw === "object" && Array.isArray((raw as any).items)) ? (raw as any).items : [];
  if (raw && typeof raw === "object" && Array.isArray((raw as any).warnings)) {
    for (const w of (raw as any).warnings) if (typeof w === "string" && w.trim()) warnings.push(w.trim().slice(0, 300));
  }

  const items: PlanItem[] = [];
  const seen = new Set<string>();
  for (const it of input.slice(0, MAX_ITEMS)) {
    if (!it || typeof it !== "object") continue;
    let name = clip(it.medicine_name, 200);
    if (!name) continue;

    if (opts.allowedNames?.length) {
      const match = matchesAllowedName(name, opts.allowedNames);
      if (!match) {
        warnings.push(`"${name}" retseptda yo'q, jadvalga qo'shilmadi.`);
        continue;
      }
      name = match;
    }
    if (seen.has(normalizeName(name))) continue;
    seen.add(normalizeName(name));

    let needs = it.needs_confirmation === true;
    const times = cleanTimes(it.times);
    if (times.length === 0) {
      warnings.push(`"${name}": qabul vaqtlari aniqlanmadi, qo'lda kiriting.`);
      needs = true;
    }

    let days = Number.isFinite(Number(it.days)) ? Math.round(Number(it.days)) : 0;
    if (days < 1) {
      days = DEFAULT_DAYS;
      needs = true;
    }
    if (days > MAX_DAYS) {
      days = MAX_DAYS;
      needs = true;
      warnings.push(`"${name}": kurs ${MAX_DAYS} kundan uzun — birinchi ${MAX_DAYS} kun rejalashtirildi.`);
    }

    // For a site prescription the dose always comes from the doctor, never from the model.
    const prescribed = opts.prescribedDoses?.[name];
    const dose = prescribed !== undefined ? prescribed.slice(0, 200) : clip(it.dose, 200);

    items.push({
      medicine_name: name,
      dose,
      instructions: clip(it.instructions, 500),
      times,
      days,
      start_date: isIsoDate(it.start_date) ? it.start_date : null,
      needs_confirmation: needs,
      note: clip(it.note, 300),
    });
  }
  return { items, warnings };
}

/** Ready-to-save check used by the UI before calling create_medication_schedules. */
export function planItemErrors(item: Pick<PlanItem, "medicine_name" | "times" | "days">): string[] {
  const errors: string[] = [];
  if (!item.medicine_name.trim()) errors.push("Dori nomi kerak");
  if (item.times.length < 1) errors.push("Kamida bitta vaqt kerak");
  if (item.times.length > MAX_TIMES_PER_DAY) errors.push(`Kuniga ${MAX_TIMES_PER_DAY} tadan ko'p emas`);
  if (item.times.some((t) => normalizeTime(t) !== t)) errors.push("Vaqt HH:MM ko'rinishida bo'lsin");
  if (!Number.isInteger(item.days) || item.days < 1 || item.days > MAX_DAYS) errors.push(`Kunlar 1–${MAX_DAYS}`);
  return errors;
}

// ---------------------------------------------------------------------------
// Reminder texts
// ---------------------------------------------------------------------------

export interface ReminderInfo {
  medicine_name: string;
  dose?: string | null;
  instructions?: string | null;
  time: string; // "HH:MM" local
}

export function reminderTitle(lang: PlanLang, info: ReminderInfo): string {
  if (lang === "ru") return `💊 Время принять: ${info.medicine_name}`;
  if (lang === "en") return `💊 Time to take: ${info.medicine_name}`;
  return `💊 Dori vaqti: ${info.medicine_name}`;
}

export function reminderBody(lang: PlanLang, info: ReminderInfo): string {
  const dose = info.dose ? ` — ${info.dose}` : "";
  const extra = info.instructions ? `\n${info.instructions}` : "";
  if (lang === "ru") return `${info.time}${dose}${extra}`;
  if (lang === "en") return `${info.time}${dose}${extra}`;
  return `${info.time}${dose}${extra}`;
}

/** Short Latin-only SMS text (Eskiz requires an approved template — see MEDICATIONS.md). */
export function reminderSms(info: ReminderInfo): string {
  const ascii = (s: string) => s.normalize("NFKD").replace(/[ʻʼ‘’`´]/g, "'").replace(/[^\x20-\x7E]/g, "");
  const dose = info.dose ? ` ${ascii(info.dose)}` : "";
  return `MaxHospital: soat ${info.time} - ${ascii(info.medicine_name)}${dose} ichish vaqti.`.slice(0, 160);
}

/** "HH:MM" of a timestamp in the given IANA time zone. */
export function localTime(iso: string, timeZone = "Asia/Tashkent"): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false })
    .format(new Date(iso));
}

/** Uzbek mobile number in Eskiz format (998XXXXXXXXX), or null. */
export function smsPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (/^998\d{9}$/.test(digits)) return digits;
  if (/^\d{9}$/.test(digits)) return `998${digits}`;
  return null;
}
