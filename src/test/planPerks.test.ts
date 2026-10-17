import { describe, expect, it } from "vitest";
import { emergencyQuote, normalizeStatus, remaining, FALLBACK_STATUS } from "../../supabase/functions/_shared/plan";
import { abnormal, base64Bytes, flagFromRange, parseRange, parseValue, sanitizeLabItems } from "../../supabase/functions/_shared/lab-report";
import { isLatinPrintable, pdfSafe } from "@/lib/healthReportPdf";

describe("remaining", () => {
  it("counts down and never goes negative", () => {
    expect(remaining(5, 0)).toBe(5);
    expect(remaining(5, 4)).toBe(1);
    expect(remaining(5, 9)).toBe(0);
  });
  it("null limit means unlimited", () => {
    expect(remaining(null, 1000)).toBeNull();
    expect(remaining(undefined, 3)).toBeNull();
  });
});

describe("emergencyQuote", () => {
  it("uses the balance first, the rest is credit", () => {
    expect(emergencyQuote({ price: 60000, balance: 20000, creditLimit: 50000, debt: 0 }))
      .toEqual({ status: "ok", fromBalance: 20000, credit: 40000 });
  });
  it("enough balance needs no credit", () => {
    expect(emergencyQuote({ price: 60000, balance: 70000, creditLimit: 50000, debt: 0 }).status).toBe("enough");
  });
  it("shortfall above the limit is refused", () => {
    expect(emergencyQuote({ price: 300000, balance: 20000, creditLimit: 50000, debt: 0 }))
      .toMatchObject({ status: "limit", credit: 280000 });
  });
  it("an unpaid debt blocks everything", () => {
    expect(emergencyQuote({ price: 10, balance: 1000, creditLimit: 50000, debt: 1 }).status).toBe("debt");
  });
  it("negative balance counts as zero", () => {
    expect(emergencyQuote({ price: 30000, balance: -5000, creditLimit: 50000, debt: 0 }))
      .toEqual({ status: "ok", fromBalance: 0, credit: 30000 });
  });
});

describe("normalizeStatus", () => {
  it("parses the RPC payload", () => {
    const s = normalizeStatus({
      plan: "premium",
      limits: { ai_daily_questions: null, video_free_minutes: 30, health_ai: true, lab_reads_monthly: 20, emergency_credit_uzs: 150000 },
      usage: { ai_today: 3, lab_month: 1 },
      debt_uzs: 0,
      credit: null,
    });
    expect(s.plan).toBe("premium");
    expect(s.limits.ai_daily_questions).toBeNull();
    expect(s.limits.video_free_minutes).toBe(30);
  });
  it("falls back safely", () => {
    expect(normalizeStatus(null)).toEqual(FALLBACK_STATUS);
    expect(normalizeStatus({ plan: "hacker" }).plan).toBe("free");
  });
});

describe("lab ranges", () => {
  it("parses common reference formats", () => {
    expect(parseRange("3.5-5.0")).toEqual({ min: 3.5, max: 5 });
    expect(parseRange("3,5 – 5,0")).toEqual({ min: 3.5, max: 5 });
    expect(parseRange("120 - 140")).toEqual({ min: 120, max: 140 });
    expect(parseRange("< 5.2")).toEqual({ min: null, max: 5.2 });
    expect(parseRange("до 5,2")).toEqual({ min: null, max: 5.2 });
    expect(parseRange("> 40")).toEqual({ min: 40, max: null });
    expect(parseRange("0.0 ... 1.2")).toEqual({ min: 0, max: 1.2 });
    expect(parseRange("negative")).toBeNull();
    expect(parseRange("10-2")).toBeNull();
    expect(parseRange(null)).toBeNull();
  });
  it("parses values", () => {
    expect(parseValue("5,4")).toBe(5.4);
    expect(parseValue("135 H")).toBe(135);
    expect(parseValue("negative")).toBeNull();
  });
  it("flags from the printed range", () => {
    expect(flagFromRange("3.1", "3.5-5.0")).toBe("low");
    expect(flagFromRange("6", "3.5-5.0")).toBe("high");
    expect(flagFromRange("4.2", "3.5-5.0")).toBe("normal");
    expect(flagFromRange("6.1", "<5.2")).toBe("high");
    expect(flagFromRange("negative", "negative")).toBeNull();
  });
});

describe("sanitizeLabItems", () => {
  it("code flag overrides the model, model flag kept when the range is unreadable", () => {
    const items = sanitizeLabItems([
      { name: "Hemoglobin", value: "98", unit: "g/L", reference_range: "120-160", flag: "normal" },
      { name: "Protein (urine)", value: "positive", unit: null, reference_range: "negative", flag: "high" },
      { name: "Glucose", value: "5.1", unit: "mmol/L", reference_range: "3.9-6.1", flag: "high" },
      { name: "", value: "1" },
      { name: "X", value: "1", flag: "weird" },
    ]);
    expect(items.map((i) => i.flag)).toEqual(["low", "high", "normal", "unknown"]);
    expect(abnormal(items).map((i) => i.name)).toEqual(["Hemoglobin", "Protein (urine)"]);
  });
  it("rejects non-arrays and caps the list", () => {
    expect(sanitizeLabItems("x")).toEqual([]);
    const many = Array.from({ length: 100 }, (_, i) => ({ name: `T${i}`, value: "1" }));
    expect(sanitizeLabItems(many)).toHaveLength(60);
  });
  it("estimates base64 size", () => {
    expect(base64Bytes(btoa("hello world"))).toBe(11);
  });
});

describe("health report PDF text", () => {
  it("normalises Uzbek apostrophes", () => {
    expect(pdfSafe("Ko‘rsatkich – oʻzgarish")).toBe("Ko'rsatkich - o'zgarish");
    expect(isLatinPrintable("Qon bosimi 120 mmHg, °C")).toBe(true);
    expect(isLatinPrintable("Давление")).toBe(false);
  });
});
