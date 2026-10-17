// Lab result reading: the model only extracts what is printed on the report.
// Whether a value is low / high is decided here, in code, from the report's own reference range.

export type LabFlag = "low" | "high" | "normal" | "unknown";

export interface LabItem {
  name: string;
  value: string;
  unit: string | null;
  reference_range: string | null;
  flag: LabFlag;
}

export const MAX_LAB_ITEMS = 60;

const num = (s: string): number | null => {
  const m = s.replace(/\s+/g, "").replace(",", ".").match(/^[-+]?\d*\.?\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
};

/** First number in a value like "5,4", "12.1 g/dL", "<0.5", "135 H". */
export function parseValue(value: string): number | null {
  const m = String(value ?? "").replace(",", ".").match(/[-+]?\d*\.?\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Reference ranges as printed on lab reports:
 * "3.5-5.0", "3,5 – 5,0", "120 - 140", "< 5.2", "<=5", "> 40", "до 5,2", "up to 10", "0.0 ... 1.2".
 */
export function parseRange(range: string | null | undefined): { min: number | null; max: number | null } | null {
  if (!range) return null;
  const r = String(range).trim().toLowerCase().replace(/,/g, ".");
  let m = r.match(/^(?:<|≤|<=|до|up to|less than|менее)\s*(\d*\.?\d+)/);
  if (m) return { min: null, max: Number(m[1]) };
  m = r.match(/^(?:>|≥|>=|от|более|more than|over)\s*(\d*\.?\d+)\s*$/);
  if (m) return { min: Number(m[1]), max: null };
  m = r.match(/(\d*\.?\d+)\s*(?:-|–|—|\.\.\.|…|to)\s*(\d*\.?\d+)/);
  if (m) {
    const a = num(m[1]);
    const b = num(m[2]);
    if (a === null || b === null || a > b) return null;
    return { min: a, max: b };
  }
  return null;
}

export function flagFromRange(value: string, range: string | null): LabFlag | null {
  const v = parseValue(value);
  const r = parseRange(range);
  if (v === null || !r) return null;
  if (r.min !== null && v < r.min) return "low";
  if (r.max !== null && v > r.max) return "high";
  return "normal";
}

const clip = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n);

/** Cleans the model output; the code-computed flag wins over the model's when the range can be parsed. */
export function sanitizeLabItems(raw: unknown): LabItem[] {
  if (!Array.isArray(raw)) return [];
  const out: LabItem[] = [];
  for (const it of raw) {
    const name = clip((it as any)?.name, 120);
    const value = clip((it as any)?.value, 60);
    if (!name || !value) continue;
    const unit = clip((it as any)?.unit, 30) || null;
    const reference_range = clip((it as any)?.reference_range, 60) || null;
    const modelFlag = (it as any)?.flag;
    const computed = flagFromRange(value, reference_range);
    const flag: LabFlag = computed ?? (["low", "high", "normal"].includes(modelFlag) ? modelFlag : "unknown");
    out.push({ name, value, unit, reference_range, flag });
    if (out.length >= MAX_LAB_ITEMS) break;
  }
  return out;
}

export const abnormal = (items: LabItem[]) => items.filter((i) => i.flag === "low" || i.flag === "high");

export function labItemsToPrompt(items: LabItem[]): string {
  return items
    .map((i) => `- ${i.name}: ${i.value}${i.unit ? ` ${i.unit}` : ""} | reference: ${i.reference_range ?? "not printed"} | ${i.flag.toUpperCase()}`)
    .join("\n");
}

export const LAB_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

/** Decoded size of a base64 string, in bytes. */
export const base64Bytes = (b64: string) => Math.floor((b64.replace(/=+$/, "").length * 3) / 4);
