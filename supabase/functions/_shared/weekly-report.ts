// Weekly health summary: every number is computed here, in code.
// The model (if available) only rephrases these facts in friendly words.
import { METRIC_BY_KEY, type Lang, type MetricKey } from "./medical-ai.ts";

export interface MetricWeek {
  metric: MetricKey;
  count: number;
  avg: number;
  min: number;
  max: number;
  outOfRange: number;
  prevAvg: number | null;
}

export interface WeeklyStats {
  periodStart: string; // YYYY-MM-DD (Tashkent)
  periodEnd: string;
  metrics: MetricWeek[];
  meds: { planned: number; taken: number; skipped: number; missed: number; adherence: number | null };
  homeEntries: number;
  /** MaxBand week (self-worn band only); null when the user has no band data */
  band?: BandWeek | null;
}

export interface BandWeek {
  days: number;
  steps_avg: number | null;
  sleep_avg_min: number | null;
  hr_avg: number | null;
  hr_max: number | null;
  spo2_min: number | null;
  alerts: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Last 7 days ending today, as Tashkent calendar dates. */
export function weekPeriod(now = new Date()): { start: string; end: string; startIso: string; endIso: string; prevStartIso: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit" });
  const end = fmt.format(now);
  const endDate = new Date(`${end}T00:00:00+05:00`);
  const startDate = new Date(endDate.getTime() - 6 * 864e5);
  const prevStart = new Date(startDate.getTime() - 7 * 864e5);
  return {
    start: fmt.format(startDate),
    end,
    startIso: startDate.toISOString(),
    endIso: new Date(endDate.getTime() + 864e5).toISOString(),
    prevStartIso: prevStart.toISOString(),
  };
}

export function computeWeeklyStats(params: {
  period: { start: string; end: string; startIso: string; endIso: string };
  measurements: { metric: string; value: number; measured_at: string; source?: string | null }[];
  reminders: { status: string; scheduled_at: string }[];
  band?: BandWeek | null;
}): WeeklyStats {
  const { period } = params;
  const inWeek = (iso: string) => iso >= period.startIso && iso < period.endIso;
  const byMetric = new Map<MetricKey, { week: number[]; prev: number[] }>();
  let homeEntries = 0;
  for (const m of params.measurements) {
    const def = METRIC_BY_KEY[m.metric as MetricKey];
    if (!def) continue;
    const slot = byMetric.get(def.key) ?? { week: [], prev: [] };
    if (inWeek(m.measured_at)) {
      slot.week.push(Number(m.value));
      if (m.source === "home") homeEntries++;
    } else if (m.measured_at < period.startIso) {
      slot.prev.push(Number(m.value));
    }
    byMetric.set(def.key, slot);
  }

  const metrics: MetricWeek[] = [];
  for (const [metric, { week, prev }] of byMetric) {
    if (week.length === 0) continue;
    const def = METRIC_BY_KEY[metric];
    const avg = week.reduce((s, v) => s + v, 0) / week.length;
    metrics.push({
      metric,
      count: week.length,
      avg: round1(avg),
      min: Math.min(...week),
      max: Math.max(...week),
      outOfRange: def.normal ? week.filter((v) => v < def.normal![0] || v > def.normal![1]).length : 0,
      prevAvg: prev.length ? round1(prev.reduce((s, v) => s + v, 0) / prev.length) : null,
    });
  }
  metrics.sort((a, b) => b.outOfRange - a.outOfRange || b.count - a.count);

  const due = params.reminders.filter((r) => inWeek(r.scheduled_at) && r.status !== "pending");
  const taken = due.filter((r) => r.status === "taken").length;
  const skipped = due.filter((r) => r.status === "skipped").length;
  const missed = due.filter((r) => r.status === "missed" || r.status === "sent").length;
  const planned = taken + skipped + missed;

  return {
    periodStart: period.start,
    periodEnd: period.end,
    metrics,
    meds: { planned, taken, skipped, missed, adherence: planned ? Math.round((taken / planned) * 100) : null },
    homeEntries,
    band: params.band && params.band.days > 0 ? params.band : null,
  };
}

export const hasData = (s: WeeklyStats) => s.metrics.length > 0 || s.meds.planned > 0 || !!s.band;

const hm = (min: number) => `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`;

/** Facts for the model prompt (and the code fallback). */
export function statsToFacts(s: WeeklyStats, lang: Lang): string[] {
  const facts: string[] = [];
  for (const m of s.metrics) {
    const def = METRIC_BY_KEY[m.metric];
    const range = def.normal ? ` (normal ${def.normal[0]}–${def.normal[1]})` : "";
    const trend = m.prevAvg === null ? "" : `; previous week average ${m.prevAvg}`;
    facts.push(`${def.label[lang]}: ${m.count} readings, average ${m.avg} ${def.unit}, min ${m.min}, max ${m.max}${range}, out of range ${m.outOfRange} times${trend}`);
  }
  if (s.meds.planned) {
    facts.push(`Medicines: ${s.meds.planned} planned doses, taken ${s.meds.taken}, skipped ${s.meds.skipped}, missed ${s.meds.missed}, adherence ${s.meds.adherence}%`);
  }
  if (s.band) {
    const b = s.band;
    const parts = [`MaxBand wristband worn ${b.days} days`];
    if (b.steps_avg !== null) parts.push(`average ${b.steps_avg} steps per day`);
    if (b.sleep_avg_min !== null) parts.push(`average sleep ${hm(b.sleep_avg_min)}`);
    if (b.hr_avg !== null) parts.push(`average pulse ${b.hr_avg} bpm (max ${b.hr_max})`);
    if (b.spo2_min !== null) parts.push(`lowest SpO2 ${b.spo2_min}%`);
    parts.push(`${b.alerts} safety alerts (SOS, fall, dangerous pulse or SpO2)`);
    facts.push(parts.join(", "));
  }
  return facts;
}

const T: Record<Lang, Record<string, string>> = {
  uz: {
    title: "📊 Haftalik salomatlik hisoboti",
    noData: "Bu hafta o'lchov yoki dori eslatmalari bo'lmadi. Uy o'lchovlarini \"Salomatligim\" sahifasida kiriting.",
    readings: "ta o'lchov, o'rtacha",
    out: "me'yordan tashqari",
    meds: "Dorilar",
    band: "MaxBand",
    steps: "qadam/kun",
    sleep: "uyqu",
    pulse: "puls",
    alerts: "ogohlantirish",
    adherence: "o'z vaqtida ichildi",
    doctor: "Me'yordan chiqqan ko'rsatkichlar bor — shifokor bilan maslahatlashing.",
    good: "Ko'rsatkichlar me'yorda. Shunday davom eting!",
  },
  ru: {
    title: "📊 Еженедельный отчёт о здоровье",
    noData: "На этой неделе не было измерений или напоминаний. Вносите домашние измерения на странице «Моё здоровье».",
    readings: "измерений, в среднем",
    out: "вне нормы",
    meds: "Лекарства",
    band: "MaxBand",
    steps: "шагов/день",
    sleep: "сон",
    pulse: "пульс",
    alerts: "оповещений",
    adherence: "принято вовремя",
    doctor: "Есть показатели вне нормы — посоветуйтесь с врачом.",
    good: "Показатели в норме. Так держать!",
  },
  en: {
    title: "📊 Weekly health report",
    noData: "No measurements or medication reminders this week. Add home readings on the \"My health\" page.",
    readings: "readings, average",
    out: "out of range",
    meds: "Medicines",
    band: "MaxBand",
    steps: "steps/day",
    sleep: "sleep",
    pulse: "pulse",
    alerts: "alerts",
    adherence: "taken on time",
    doctor: "Some readings were out of range — talk to a doctor.",
    good: "Your readings are in range. Keep it up!",
  },
};

export const needsDoctor = (s: WeeklyStats) =>
  s.metrics.some((m) => m.outOfRange > 0) || (s.meds.adherence !== null && s.meds.adherence < 60) || (s.band?.alerts ?? 0) > 0;

/** Plain code-written report, used when the AI is unavailable. */
export function fallbackReport(s: WeeklyStats, lang: Lang): string {
  const t = T[lang];
  if (!hasData(s)) return t.noData;
  const lines: string[] = [];
  for (const m of s.metrics) {
    const def = METRIC_BY_KEY[m.metric];
    lines.push(`• ${def.label[lang]}: ${m.count} ${t.readings} ${m.avg} ${def.unit}${m.outOfRange ? ` (${m.outOfRange} ${t.out})` : ""}`);
  }
  if (s.meds.planned) lines.push(`• ${t.meds}: ${s.meds.taken}/${s.meds.planned} ${t.adherence} (${s.meds.adherence}%)`);
  if (s.band) {
    const b = s.band;
    const parts: string[] = [];
    if (b.steps_avg !== null) parts.push(`${b.steps_avg} ${t.steps}`);
    if (b.sleep_avg_min !== null) parts.push(`${t.sleep} ${hm(b.sleep_avg_min)}`);
    if (b.hr_avg !== null) parts.push(`${t.pulse} ${b.hr_avg}`);
    if (b.alerts) parts.push(`${b.alerts} ${t.alerts}`);
    if (parts.length) lines.push(`• ${t.band}: ${parts.join(", ")}`);
  }
  lines.push("", needsDoctor(s) ? t.doctor : t.good);
  return lines.join("\n");
}

export const reportTitle = (lang: Lang) => T[lang].title;
