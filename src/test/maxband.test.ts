import { describe, expect, it } from "vitest";
import {
  bandFeatures, detectVitalAlerts, emergencyMessage, missedMedsMessage, sanitizeReadings, stressFromHrv, summarizeSleep, toAscii,
  DEFAULT_BAND_SETTINGS,
} from "../../supabase/functions/_shared/band";
import { computeWeeklyStats, fallbackReport, needsDoctor, statsToFacts, weekPeriod } from "../../supabase/functions/_shared/weekly-report";

const NOW = Date.parse("2026-10-18T10:00:00Z");
const iso = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString();

describe("bandFeatures", () => {
  it("keeps SOS on every plan and family features on Premium only", () => {
    expect(bandFeatures("free")).toMatchObject({ sos: true, sync: false, reminders: false, family: false });
    expect(bandFeatures("pro")).toMatchObject({ sos: true, sync: true, reminders: true, family: false, doctor_live: false });
    expect(bandFeatures("premium")).toMatchObject({ sync: true, family: true, doctor_live: true });
    expect(bandFeatures(undefined).sync).toBe(false);
  });
});

describe("sanitizeReadings", () => {
  const t = (minAgo: number) => Math.floor((NOW - minAgo * 60_000) / 1000);
  it("drops unknown kinds, impossible values, stale or future samples and duplicates", () => {
    const out = sanitizeReadings([
      { k: "hr", v: 72, t: t(1) },
      { k: "hr", v: 72, t: t(1) },            // duplicate
      { k: "hr", v: 400, t: t(1) },           // sensor error
      { k: "spo2", v: "97.46", t: t(2) },
      { k: "temp", v: 36.6, t: t(2) },        // unknown kind
      { k: "steps", v: 120, t: t(60 * 49) },  // older than 48 h
      { k: "sleep", v: 5, t: t(-10) },        // 10 min in the future
      { k: "hrv", v: 42, t: "x" },
    ], NOW);
    expect(out).toEqual([
      { kind: "hr", value: 72, measured_at: new Date(t(1) * 1000).toISOString() },
      { kind: "spo2", value: 97.5, measured_at: new Date(t(2) * 1000).toISOString() },
    ]);
  });
  it("returns nothing for bad input", () => {
    expect(sanitizeReadings(null, NOW)).toEqual([]);
    expect(sanitizeReadings({ k: "hr" }, NOW)).toEqual([]);
  });
});

describe("detectVitalAlerts", () => {
  const s = DEFAULT_BAND_SETTINGS;
  it("needs a sustained high pulse, not a single spike", () => {
    expect(detectVitalAlerts([{ kind: "hr", value: 150, measured_at: iso(1) }], s, NOW)).toEqual([]);
    expect(detectVitalAlerts([
      { kind: "hr", value: 80, measured_at: iso(3) },
      { kind: "hr", value: 150, measured_at: iso(1) },
    ], s, NOW)).toEqual([]);
    expect(detectVitalAlerts([
      { kind: "hr", value: 140, measured_at: iso(3) },
      { kind: "hr", value: 150, measured_at: iso(1) },
    ], s, NOW)).toEqual([{ kind: "hr_high", value: 150 }]);
  });
  it("ignores a high pulse while walking", () => {
    expect(detectVitalAlerts([
      { kind: "hr", value: 140, measured_at: iso(3) },
      { kind: "hr", value: 150, measured_at: iso(1) },
      { kind: "steps", value: 600, measured_at: iso(2) },
    ], s, NOW)).toEqual([]);
  });
  it("detects low pulse and low SpO2, ignores old samples", () => {
    expect(detectVitalAlerts([
      { kind: "hr", value: 38, measured_at: iso(6) },
      { kind: "hr", value: 36, measured_at: iso(1) },
      { kind: "spo2", value: 88, measured_at: iso(20) },
      { kind: "spo2", value: 87, measured_at: iso(2) },
    ], s, NOW)).toEqual([{ kind: "hr_low", value: 36 }, { kind: "spo2_low", value: 87 }]);
    expect(detectVitalAlerts([
      { kind: "spo2", value: 85, measured_at: iso(45) },
      { kind: "spo2", value: 87, measured_at: iso(2) },
    ], s, NOW)).toEqual([]);
  });
});

describe("summarizeSleep", () => {
  // 23:00 -> 06:00 local (18:00 -> 01:00 UTC), 5-minute windows
  const start = Date.parse("2026-10-17T18:00:00Z");
  const night = (awakeFrom?: number, awakeTo?: number) => Array.from({ length: 84 }, (_, i) => ({
    t: new Date(start + (i + 1) * 5 * 60_000).toISOString(),
    v: awakeFrom !== undefined && i >= awakeFrom && i < awakeTo! ? 0 : 5,
  }));
  it("scores a full night without awakenings", () => {
    const r = summarizeSleep(night())!;
    expect(r.asleepMin).toBe(420);
    expect(r.awakenings).toBe(0);
    expect(r.score).toBe(100);
    expect(r.start).toBe("2026-10-17T18:00:00.000Z");
  });
  it("counts a 20-minute awakening and lowers the score", () => {
    const r = summarizeSleep(night(40, 44), [{ t: "2026-10-17T20:00:00Z", v: 58 }, { t: "2026-10-17T22:00:00Z", v: 62 }])!;
    expect(r.asleepMin).toBe(400);
    expect(r.awakenings).toBe(1);
    expect(r.score).toBeLessThan(100);
    expect(r.avgHr).toBe(60);
  });
  it("treats a gap in data as awake time", () => {
    const pts = night().filter((_, i) => i < 30 || i > 36);
    expect(summarizeSleep(pts)!.awakenings).toBe(1);
  });
  it("returns null when there is less than an hour of sleep", () => {
    expect(summarizeSleep(night().slice(0, 10))).toBeNull();
    expect(summarizeSleep([])).toBeNull();
  });
});

describe("stressFromHrv", () => {
  it("compares with the wearer's own baseline", () => {
    expect(stressFromHrv(40, [40, 42, 38])).toMatchObject({ score: 50, baseline: 40, level: "medium" });
    expect(stressFromHrv(60, [40, 40, 40])!.level).toBe("low");
    expect(stressFromHrv(24, [40, 40, 40])!.level).toBe("high");
  });
  it("uses general ranges while learning", () => {
    expect(stressFromHrv(70, [])).toMatchObject({ level: "low", baseline: null });
    expect(stressFromHrv(20, [30])!.level).toBe("high");
    expect(stressFromHrv(null, [40, 40, 40])).toBeNull();
  });
});

describe("texts", () => {
  it("SOS message has a map link, card link and 103", () => {
    const m = emergencyMessage("sos", {
      wearer: "Karimova <Malika>", at: "2026-10-18T05:30:00Z", lat: 41.311081, lng: 69.240562,
      locationAt: "2026-10-18T05:20:00Z", phone: "+998901234567", cardUrl: "https://x.uz/e/abc",
    });
    expect(m.plain).toContain("https://maps.google.com/?q=41.311081,69.240562");
    expect(m.plain).toContain("10:30");
    expect(m.plain).toContain("103");
    expect(m.html).toContain("&lt;Malika&gt;");
    expect(emergencyMessage("fall", { wearer: "A", at: "2026-10-18T05:30:00Z" }).plain).toContain("Joylashuv noma'lum");
  });
  it("missed medicines message lists the doses", () => {
    const m = missedMedsMessage("Onam", [{ medicine_name: "Amlodipin", dose: "5 mg", scheduled_at: "2026-10-18T03:00:00Z" }]);
    expect(m.body).toContain("08:00 — Amlodipin, 5 mg");
  });
  it("toAscii keeps the band screen readable", () => {
    expect(toAscii("Oʻgʻil — 500 mg")).toBe("O'g'il - 500 mg");
    expect(toAscii("Анна Ўлмас")).toBe("Anna O'lmas");
    expect(toAscii("Paracetamol 500 mg tabletka", 12)).toBe("Paracetamol");
  });
});

describe("weekly report with MaxBand", () => {
  it("adds band facts and asks to see a doctor after safety alerts", () => {
    const period = weekPeriod(new Date("2026-10-18T10:00:00Z"));
    const stats = computeWeeklyStats({
      period, measurements: [], reminders: [],
      band: { days: 6, steps_avg: 5400, sleep_avg_min: 410, hr_avg: 71, hr_max: 128, spo2_min: 95, alerts: 1 },
    });
    expect(stats.band?.steps_avg).toBe(5400);
    expect(statsToFacts(stats, "en").join(" ")).toContain("average sleep 6h 50m");
    expect(fallbackReport(stats, "uz")).toContain("MaxBand: 5400 qadam/kun");
    expect(needsDoctor(stats)).toBe(true);
  });
  it("ignores an empty band summary", () => {
    const period = weekPeriod(new Date("2026-10-18T10:00:00Z"));
    expect(computeWeeklyStats({ period, measurements: [], reminders: [], band: null }).band).toBeNull();
  });
});
