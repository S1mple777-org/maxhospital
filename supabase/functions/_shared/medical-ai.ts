// Pure, dependency-free logic shared by the edge functions (Deno) and the
// React app / unit tests (Vite + Vitest). Do not import Deno or npm modules here.

export type Lang = "uz" | "ru" | "en";
export type Triage = "emergency" | "doctor" | "self_care";

// ---------------------------------------------------------------------------
// Health metrics catalog
// ---------------------------------------------------------------------------

export type MetricKey =
  | "bp_systolic"
  | "bp_diastolic"
  | "pulse"
  | "temperature"
  | "spo2"
  | "glucose"
  | "weight"
  | "cholesterol"
  | "hemoglobin";

export interface MetricDef {
  key: MetricKey;
  unit: string;
  label: Record<Lang, string>;
  /** Reference range for adults. null = no single normal range (e.g. weight). */
  normal: [number, number] | null;
  /** Values outside this range are rejected as typos. */
  plausible: [number, number];
  step: number;
}

export const METRICS: MetricDef[] = [
  { key: "bp_systolic", unit: "mmHg", label: { uz: "Arterial bosim (yuqori)", ru: "Давление (систолическое)", en: "Blood pressure (systolic)" }, normal: [90, 129], plausible: [50, 260], step: 1 },
  { key: "bp_diastolic", unit: "mmHg", label: { uz: "Arterial bosim (pastki)", ru: "Давление (диастолическое)", en: "Blood pressure (diastolic)" }, normal: [60, 84], plausible: [30, 160], step: 1 },
  { key: "pulse", unit: "1/min", label: { uz: "Puls", ru: "Пульс", en: "Pulse" }, normal: [60, 100], plausible: [25, 250], step: 1 },
  { key: "temperature", unit: "°C", label: { uz: "Tana harorati", ru: "Температура тела", en: "Body temperature" }, normal: [36.1, 37.2], plausible: [30, 43], step: 0.1 },
  { key: "spo2", unit: "%", label: { uz: "Kislorod (SpO₂)", ru: "Сатурация (SpO₂)", en: "Oxygen saturation (SpO₂)" }, normal: [95, 100], plausible: [50, 100], step: 1 },
  { key: "glucose", unit: "mmol/L", label: { uz: "Qondagi qand (och qoringa)", ru: "Глюкоза (натощак)", en: "Fasting glucose" }, normal: [3.9, 5.5], plausible: [1, 40], step: 0.1 },
  { key: "weight", unit: "kg", label: { uz: "Vazn", ru: "Вес", en: "Weight" }, normal: null, plausible: [1, 350], step: 0.1 },
  { key: "cholesterol", unit: "mmol/L", label: { uz: "Umumiy xolesterin", ru: "Общий холестерин", en: "Total cholesterol" }, normal: [0, 5.2], plausible: [1, 20], step: 0.1 },
  { key: "hemoglobin", unit: "g/L", label: { uz: "Gemoglobin", ru: "Гемоглобин", en: "Hemoglobin" }, normal: [120, 160], plausible: [30, 250], step: 1 },
];

export const METRIC_BY_KEY: Record<MetricKey, MetricDef> = Object.fromEntries(
  METRICS.map((m) => [m.key, m]),
) as Record<MetricKey, MetricDef>;

export function isPlausible(metric: MetricKey, value: number): boolean {
  const def = METRIC_BY_KEY[metric];
  return !!def && Number.isFinite(value) && value >= def.plausible[0] && value <= def.plausible[1];
}

// ---------------------------------------------------------------------------
// Trend analysis (deterministic — the AI only explains these numbers)
// ---------------------------------------------------------------------------

export interface MeasurementRow {
  metric: string;
  value: number | string;
  measured_at: string;
}

export type Direction = "up" | "down" | "stable";
export type RangeStatus = "low" | "normal" | "high" | "unknown";

export interface MetricTrend {
  metric: MetricKey;
  unit: string;
  count: number;
  latest: number;
  latestAt: string;
  previous: number | null;
  previousAt: string | null;
  change: number | null;
  changePercent: number | null;
  direction: Direction | null;
  status: RangeStatus;
  /** true = moved toward the normal range, false = moved away, null = n/a */
  improving: boolean | null;
  history: { value: number; at: string }[];
}

const STABLE_PERCENT = 2;

export function rangeStatus(metric: MetricKey, value: number): RangeStatus {
  const def = METRIC_BY_KEY[metric];
  if (!def?.normal) return "unknown";
  if (value < def.normal[0]) return "low";
  if (value > def.normal[1]) return "high";
  return "normal";
}

function distanceFromNormal(metric: MetricKey, value: number): number | null {
  const n = METRIC_BY_KEY[metric]?.normal;
  if (!n) return null;
  if (value < n[0]) return n[0] - value;
  if (value > n[1]) return value - n[1];
  return 0;
}

const round = (n: number, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;

export function analyzeTrends(rows: MeasurementRow[]): MetricTrend[] {
  const groups = new Map<MetricKey, { value: number; at: string }[]>();
  for (const r of rows) {
    if (!(r.metric in METRIC_BY_KEY)) continue;
    const value = Number(r.value);
    if (!Number.isFinite(value)) continue;
    const key = r.metric as MetricKey;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ value, at: r.measured_at });
  }

  const result: MetricTrend[] = [];
  for (const def of METRICS) {
    const list = groups.get(def.key);
    if (!list?.length) continue;
    list.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    const last = list[list.length - 1];
    const prev = list.length > 1 ? list[list.length - 2] : null;

    let change: number | null = null;
    let changePercent: number | null = null;
    let direction: Direction | null = null;
    let improving: boolean | null = null;

    if (prev) {
      change = round(last.value - prev.value, 2);
      changePercent = prev.value !== 0 ? round((change / prev.value) * 100, 1) : null;
      const pct = changePercent ?? 0;
      direction = Math.abs(pct) < STABLE_PERCENT ? "stable" : change > 0 ? "up" : "down";
      const dPrev = distanceFromNormal(def.key, prev.value);
      const dLast = distanceFromNormal(def.key, last.value);
      if (dPrev !== null && dLast !== null && direction !== "stable") {
        improving = dLast < dPrev ? true : dLast > dPrev ? false : null;
      }
    }

    result.push({
      metric: def.key,
      unit: def.unit,
      count: list.length,
      latest: last.value,
      latestAt: last.at,
      previous: prev?.value ?? null,
      previousAt: prev?.at ?? null,
      change,
      changePercent,
      direction,
      status: rangeStatus(def.key, last.value),
      improving,
      history: list,
    });
  }
  return result;
}

/** Compact plain-text summary that is given to the language model. */
export function trendsToPrompt(trends: MetricTrend[], lang: Lang): string {
  if (!trends.length) return "NO_MEASUREMENTS";
  return trends
    .map((t) => {
      const def = METRIC_BY_KEY[t.metric];
      const range = def.normal ? `${def.normal[0]}–${def.normal[1]}` : "n/a";
      const prev = t.previous !== null
        ? `previous=${t.previous} (${t.previousAt?.slice(0, 10)}), change=${t.change} (${t.changePercent ?? "?"}%), direction=${t.direction}, improving=${t.improving}`
        : "previous=none";
      return `- ${def.label[lang]} [${t.metric}]: latest=${t.latest} ${t.unit} (${t.latestAt.slice(0, 10)}), ${prev}, normal=${range}, status=${t.status}, measurements=${t.count}`;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Emergency red flags — checked BEFORE the model is called, so an emergency is
// never missed because of a model mistake. Deliberately conservative.
// ---------------------------------------------------------------------------

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ʻʼ‘’`´]/g, "'")
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

interface RedFlag {
  id: string;
  patterns: RegExp[];
}

const RED_FLAGS: RedFlag[] = [
  {
    id: "chest_pain",
    patterns: [
      /ko'kra[gk]\w*\s+(qattiq\s+)?(og'ri|siqil|sanch|bosil)/, /ko'krak\s+qafas\w*\s+(\w+\s+)?(og'ri|siqil)/, /yura?g\w*\s+(qattiq\s+)?(og'ri|sanch|siqil)/,
      /кукра\w*\s+огри/, /бол\w*\s+(в|за)\s+груд/, /груд\w*\s+бол/, /давит\s+в\s+груди/,
      /chest\s+(pain|tightness|pressure)/, /heart\s+attack/, /инфаркт/, /infarkt/,
    ],
  },
  {
    id: "breathing",
    patterns: [
      /nafas\s+(ol(a|o)\s*olma|qis|yetishma|bo'g'il)/, /nafas\w*\s+qiyin/, /bo'g'il(ib|yap)/, /nafas\s+ololmay/,
      /задыха/, /не\s+могу\s+дышать/, /нечем\s+дышать/, /удушь/,
      /can'?t\s+breathe/, /cannot\s+breathe/, /short(ness)?\s+of\s+breath/, /choking/,
    ],
  },
  {
    id: "unconscious",
    patterns: [
      /hush\w*\s+(yo'qot|ketd|ketib)/, /behush/, /es\w*\s+(yo'qot|og'ib)/, /o'zidan\s+ketd/,
      /без\s+сознания/, /потерял\w*\s+сознани/, /обморок/,
      /unconscious/, /passed\s+out/, /fainted/, /not\s+responding/,
    ],
  },
  {
    id: "stroke",
    patterns: [
      /yuz\w*\s+qiyshay/, /og'z\w*\s+qiyshay/, /gapir(a|o)\s*olma/, /tili\s+(tutil|aylanma)/, /qo'l\w*\s+(oyog'\w*\s+)?(ishlamay|uvush\w*\s+qold)/, /insult/,
      /инсульт/, /перекосил/, /не\s+может\s+говорить/, /онемел\w*\s+(рук|половин)/,
      /stroke/, /face\s+droop/, /slurred\s+speech/,
    ],
  },
  {
    id: "bleeding",
    patterns: [
      /qon\s+(ketishi\s+)?to'xtama/, /ko'p\s+qon\s+ket/, /qon\s+qus/, /qon\s+aralash\s+qus/,
      /сильное\s+кровотечени/, /кровь\s+не\s+останавлива/, /рвота\s+кров/,
      /bleeding\s+(heavily|a\s+lot|won'?t\s+stop)/, /vomiting\s+blood/, /severe\s+bleeding/,
    ],
  },
  {
    id: "seizure",
    patterns: [/tutqanoq/, /talvasa/, /qaltirab\s+yiqil/, /судорог/, /припадок/, /seizure/, /convulsion/],
  },
  {
    id: "anaphylaxis",
    patterns: [
      /tomog'\w*\s+shish/, /til\w*\s+shish/, /anafilak/, /yuz\w*\s+shishib\s+nafas/,
      /отек\w*\s+(горла|языка|квинке)/, /анафилак/,
      /throat\s+(swelling|closing)/, /anaphyla/,
    ],
  },
  {
    id: "poisoning",
    patterns: [/zaharlan/, /ko'p\s+dori\s+ichib/, /отравлени/, /отравил/, /передозир/, /poison(ed|ing)/, /overdose/],
  },
  {
    id: "self_harm",
    patterns: [
      /o'z\s+joni\w*\s+qasd/, /o'zimni\s+o'ldir/, /yashagim\s+kelmay/, /o'lgim\s+kel/,
      /суицид/, /покончить\s+с\s+собой/, /убить\s+себя/, /не\s+хочу\s+жить/,
      /suicid/, /kill\s+myself/, /end\s+my\s+life/, /want\s+to\s+die/,
    ],
  },
  {
    id: "high_fever",
    patterns: [/(harorat|temperatura|температур\w*|fever|temperature)\D{0,15}(4[0-3])([.,]\d)?/, /\b(4[0-3])([.,]\d)?\s*(°|gradus|градус)/],
  },
  {
    id: "pregnancy_bleeding",
    patterns: [/homilador\w*.{0,40}qon/, /беремен\w*.{0,40}кров/, /pregnan\w*.{0,40}bleed/],
  },
];

// `\w` in the patterns above means "any letter" — including Cyrillic letters and
// the Uzbek apostrophe — so the patterns are recompiled with the unicode flag.
const COMPILED_FLAGS = RED_FLAGS.map((f) => ({
  id: f.id,
  patterns: f.patterns.map((p) => new RegExp(p.source.replace(/\\w/g, "[\\p{L}']").replace(/\\b/g, "(?<![\\p{L}\\d])"), "u")),
}));

export function detectEmergency(text: string): string | null {
  const t = normalizeText(text);
  for (const flag of COMPILED_FLAGS) {
    if (flag.patterns.some((p) => p.test(t))) return flag.id;
  }
  return null;
}

export const EMERGENCY_PHONE = "103";

export function emergencyMessage(lang: Lang, rule: string): string {
  const selfHarm = rule === "self_harm";
  if (lang === "ru") {
    return selfHarm
      ? `Мне очень жаль, что вам сейчас так тяжело. Пожалуйста, прямо сейчас позвоните в скорую помощь ${EMERGENCY_PHONE} или попросите близкого человека побыть рядом с вами. Вы не одни, и помощь доступна.`
      : `Описанные признаки могут указывать на опасное для жизни состояние. Немедленно позвоните в скорую помощь ${EMERGENCY_PHONE}. Не ждите онлайн-ответа и не принимайте лекарства на свой выбор. Если рядом есть люди, попросите их помочь.`;
  }
  if (lang === "en") {
    return selfHarm
      ? `I'm really sorry you're going through this. Please call emergency services at ${EMERGENCY_PHONE} right now, or ask someone you trust to stay with you. You are not alone, and help is available.`
      : `These signs may point to a life-threatening condition. Call an ambulance at ${EMERGENCY_PHONE} immediately. Do not wait for an online answer and do not take medicines on your own. If someone is nearby, ask them to help.`;
  }
  return selfHarm
    ? `Hozir sizga og'ir ekanidan juda afsusdaman. Iltimos, darhol tez yordam ${EMERGENCY_PHONE} raqamiga qo'ng'iroq qiling yoki ishongan odamingizdan yoningizda bo'lishini so'rang. Siz yolg'iz emassiz, yordam bor.`
    : `Siz yozgan belgilar hayot uchun xavfli holatni bildirishi mumkin. Darhol tez tibbiy yordam ${EMERGENCY_PHONE} raqamiga qo'ng'iroq qiling. Onlayn javobni kutmang va o'zingizcha dori ichmang. Yoningizda kimdir bo'lsa, yordam so'rang.`;
}

// ---------------------------------------------------------------------------
// Book processing helpers
// ---------------------------------------------------------------------------

export interface TextChunk {
  page: number;
  content: string;
}

/**
 * Splits page texts into overlapping chunks, preferring sentence boundaries.
 * `pages[i]` is the text of page i+1.
 */
export function chunkPages(pages: string[], size = 1200, overlap = 200): TextChunk[] {
  const chunks: TextChunk[] = [];
  pages.forEach((raw, i) => {
    const text = raw.replace(/-\n(\p{L})/gu, "$1").replace(/\s+/g, " ").trim();
    if (text.length < 40) return; // empty / image-only page
    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + size, text.length);
      if (end < text.length) {
        const window = text.slice(start, end);
        const cut = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "));
        if (cut > size * 0.5) end = start + cut + 1;
        else {
          const space = window.lastIndexOf(" ");
          if (space > size * 0.5) end = start + space;
        }
      }
      const content = text.slice(start, end).trim();
      if (content.length >= 40) chunks.push({ page: i + 1, content });
      if (end >= text.length) break;
      start = Math.max(end - overlap, start + 1);
      // move to the start of a word
      const nextSpace = text.indexOf(" ", start);
      if (nextSpace !== -1 && nextSpace - start < 30) start = nextSpace + 1;
    }
  });
  return chunks;
}

export function normalizeVector(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norm > 0 ? v.map((x) => x / norm) : v;
}

/** Returns the distinct [n] citation numbers that appear in the answer. */
export function extractCitations(answer: string, maxIndex: number): number[] {
  const found = new Set<number>();
  for (const m of answer.matchAll(/\[(\d{1,2})\]/g)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= maxIndex) found.add(n);
  }
  return [...found].sort((a, b) => a - b);
}

/** Removes citation markers that do not point to a real source. */
export function stripInvalidCitations(answer: string, maxIndex: number): string {
  return answer.replace(/\[(\d{1,2})\]/g, (full, n) => (Number(n) >= 1 && Number(n) <= maxIndex ? full : ""));
}
