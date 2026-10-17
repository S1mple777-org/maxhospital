// Home measurements: validation and safety alerts.
// Thresholds are deliberately simple safety rules (like the emergency phrase filter):
// they never diagnose, they only tell the patient to contact a doctor or call 103.
import { METRIC_BY_KEY, type Lang, type MetricKey } from "./medical-ai.ts";

export type AlertLevel = "danger" | "warning";

export interface HomeItem {
  metric: MetricKey;
  value: number;
}

export interface HomeAlert extends HomeItem {
  level: AlertLevel;
}

/** [danger below, warning below, warning above, danger above]; null = no rule on that side. */
const RULES: Partial<Record<MetricKey, [number | null, number | null, number | null, number | null]>> = {
  bp_systolic: [80, 90, 160, 180],
  bp_diastolic: [null, 50, 100, 120],
  pulse: [40, 50, 110, 130],
  temperature: [35, null, 38.5, 39.5],
  spo2: [90, 94, null, null],
  glucose: [3.0, 3.9, 11.1, 16.7],
};

export function alertLevel(metric: MetricKey, value: number): AlertLevel | null {
  const r = RULES[metric];
  if (!r) return null;
  const [dLow, wLow, wHigh, dHigh] = r;
  if (dLow !== null && value < dLow) return "danger";
  if (dHigh !== null && value >= dHigh) return "danger";
  if (wLow !== null && value < wLow) return "warning";
  if (wHigh !== null && value >= wHigh) return "warning";
  return null;
}

export function alertsFor(items: HomeItem[]): HomeAlert[] {
  return items
    .map((i) => ({ ...i, level: alertLevel(i.metric, i.value) }))
    .filter((a): a is HomeAlert => a.level !== null)
    .sort((a, b) => (a.level === b.level ? 0 : a.level === "danger" ? -1 : 1));
}

/** Validates raw input: known metric, number inside the plausible range, at most 9 items. */
export function sanitizeHomeItems(raw: unknown): { items: HomeItem[]; errors: string[] } {
  const items: HomeItem[] = [];
  const errors: string[] = [];
  if (!Array.isArray(raw)) return { items, errors: ["items"] };
  for (const r of raw.slice(0, 9)) {
    const metric = (r as any)?.metric as MetricKey;
    const def = METRIC_BY_KEY[metric];
    const value = Number(String((r as any)?.value ?? "").replace(",", "."));
    if (!def) { errors.push(String(metric)); continue; }
    if (!Number.isFinite(value) || value < def.plausible[0] || value > def.plausible[1]) { errors.push(metric); continue; }
    if (items.some((i) => i.metric === metric)) continue;
    items.push({ metric, value: Math.round(value * 10) / 10 });
  }
  return { items, errors };
}

const TEXT: Record<Lang, { danger: string; warning: string; dangerAdvice: string; warningAdvice: string }> = {
  uz: {
    danger: "⚠️ Xavfli ko'rsatkich",
    warning: "Diqqat: ko'rsatkich me'yordan chiqdi",
    dangerAdvice: "O'zingizni yomon his qilsangiz, darhol 103 ga qo'ng'iroq qiling. Aks holda bugunoq shifokorga murojaat qiling.",
    warningAdvice: "O'lchovni 15–30 daqiqadan keyin takrorlang. Qiymat yana shunday bo'lsa, shifokor bilan maslahatlashing.",
  },
  ru: {
    danger: "⚠️ Опасный показатель",
    warning: "Внимание: показатель вне нормы",
    dangerAdvice: "Если чувствуете себя плохо, сразу звоните 103. Иначе обратитесь к врачу сегодня.",
    warningAdvice: "Повторите измерение через 15–30 минут. Если значение такое же, посоветуйтесь с врачом.",
  },
  en: {
    danger: "⚠️ Dangerous reading",
    warning: "Attention: reading out of range",
    dangerAdvice: "If you feel unwell, call 103 now. Otherwise contact a doctor today.",
    warningAdvice: "Measure again in 15–30 minutes. If it stays the same, talk to a doctor.",
  },
};

export function alertMessage(lang: Lang, alerts: HomeAlert[], who?: string | null): { title: string; body: string } {
  const t = TEXT[lang];
  const top = alerts[0]?.level ?? "warning";
  const lines = alerts.map((a) => {
    const def = METRIC_BY_KEY[a.metric];
    return `• ${def.label[lang]}: ${a.value} ${def.unit}`;
  });
  return {
    title: `${top === "danger" ? t.danger : t.warning}${who ? ` — ${who}` : ""}`,
    body: [...lines, "", top === "danger" ? t.dangerAdvice : t.warningAdvice].join("\n"),
  };
}
