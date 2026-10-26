import { describe, expect, it } from "vitest";
import {
  adaptFactor,
  bmi,
  conditionsFromText,
  generatePlan,
  nextTrainingDay,
  pickDays,
  planDayInfo,
  riskReasons,
  type FitnessAnswers,
} from "../../supabase/functions/_shared/fitness.ts";

const base: FitnessAnswers = {
  age: 35, sex: "male", height_cm: 175, weight_kg: 72,
  level: "light", goal: "health", days_per_week: 3, minutes_per_session: 30,
  place: "outdoor", conditions: [], red_flags: [], beta_blocker: false,
};

const allItems = (p: ReturnType<typeof generatePlan>) => p.weeks.flatMap((w) => w.sessions.flatMap((s) => s.items));

describe("fitness plan generator", () => {
  it("spreads training days across the week", () => {
    expect(pickDays(3)).toEqual(["mon", "wed", "fri"]);
    expect(pickDays(1)).toHaveLength(2);
    expect(pickDays(9)).toHaveLength(6);
  });

  it("builds 4 weeks with warm-up first and stretch last, ≥2 strength days", () => {
    const p = generatePlan(base);
    expect(p.weeks).toHaveLength(4);
    for (const w of p.weeks) {
      expect(w.sessions).toHaveLength(3);
      expect(w.sessions.filter((s) => s.type === "strength").length).toBeGreaterThanOrEqual(2);
      for (const s of w.sessions) {
        expect(s.items[0].kind).toBe("warmup");
        expect(s.items[s.items.length - 1].kind).toBe("stretch");
      }
    }
    expect(p.needs_doctor).toBe(false);
    expect(p.intensity.hr).not.toBeNull();
  });

  it("increases load over weeks 1–3 and eases off in week 4", () => {
    const p = generatePlan({ ...base, days_per_week: 5, minutes_per_session: 45 });
    const m = p.weeks.map((w) => w.aerobic_minutes_week);
    expect(m[1]).toBeGreaterThanOrEqual(m[0]);
    expect(m[2]).toBeGreaterThanOrEqual(m[1]);
    expect(m[3]).toBeLessThanOrEqual(m[2]);
  });

  it("starts low for inactive people and never exceeds the session length by much", () => {
    const p = generatePlan({ ...base, level: "none", minutes_per_session: 15 });
    for (const s of p.weeks[0].sessions) expect(s.total_minutes).toBeLessThanOrEqual(30);
    expect(p.weeks[0].aerobic_minutes_week).toBeLessThan(150);
  });

  it("says how to reach the WHO 150 minutes when the chosen time is short", () => {
    expect(generatePlan(base).who_note).toMatch(/150/);
    expect(generatePlan({ ...base, level: "active", days_per_week: 5, minutes_per_session: 60 }).who_note).toBeNull();
  });

  it("flags PAR-Q red flags for a doctor", () => {
    const p = generatePlan({ ...base, red_flags: ["chest_pain"] });
    expect(p.needs_doctor).toBe(true);
    expect(p.risk_reasons[0]).toMatch(/ko'krak/i);
    expect(riskReasons({ ...base, conditions: ["heart"] })).toContain("Yurak kasalligi");
  });

  it("hypertension: no long static holds, RPE cap, BP warning", () => {
    const p = generatePlan({ ...base, conditions: ["hypertension"] });
    expect(p.intensity.rpe[1]).toBe(5);
    expect(allItems(p).some((i) => i.id === "bird_dog")).toBe(true);
    expect(p.precautions.join(" ")).toMatch(/180\/110/);
  });

  it("diabetes adds blood sugar rules", () => {
    const p = generatePlan({ ...base, conditions: ["diabetes"] });
    expect(p.precautions.join(" ")).toMatch(/5,6/);
  });

  it("beta-blocker or heart disease: no pulse zone, use feelings", () => {
    expect(generatePlan({ ...base, beta_blocker: true }).intensity.hr).toBeNull();
    expect(generatePlan({ ...base, conditions: ["heart"] }).intensity.hr).toBeNull();
  });

  it("65+: balance exercises in every week", () => {
    const p = generatePlan({ ...base, age: 70 });
    for (const w of p.weeks) {
      const balanceDays = w.sessions.filter((s) => s.items.some((i) => i.kind === "balance")).length;
      expect(balanceDays).toBeGreaterThanOrEqual(3);
    }
  });

  it("pregnancy: no lying-on-back bridge, needs doctor", () => {
    const p = generatePlan({ ...base, sex: "female", conditions: ["pregnancy"] });
    expect(allItems(p).some((i) => i.id === "bridge")).toBe(false);
    expect(p.needs_doctor).toBe(true);
  });

  it("knee pain avoids squats", () => {
    const p = generatePlan({ ...base, conditions: ["joint_pain"] });
    expect(allItems(p).some((i) => i.id === "chair_squat")).toBe(false);
  });

  it("reads Passport text", () => {
    const r = conditionsFromText("Gipertoniya, qandli diabet 2-tur", "Bisoprolol 5 mg");
    expect(r.conditions).toEqual(expect.arrayContaining(["hypertension", "diabetes"]));
    expect(r.beta_blocker).toBe(true);
    expect(conditionsFromText(null, null).conditions).toEqual([]);
  });

  it("computes BMI", () => {
    expect(bmi({ height_cm: 170, weight_kg: 89 })).toBeCloseTo(30.8, 1);
    expect(bmi({ height_cm: null, weight_kg: 80 })).toBeNull();
  });

  it("adapts the load from feedback", () => {
    expect(adaptFactor(1, { planned: 3, done: 3, avgRpe: 6, pain: true })).toBe(0.85);
    expect(adaptFactor(1, { planned: 3, done: 3, avgRpe: 9, pain: false })).toBe(0.9);
    expect(adaptFactor(1, { planned: 3, done: 3, avgRpe: 3, pain: false })).toBe(1.1);
    expect(adaptFactor(1, { planned: 3, done: 1, avgRpe: 3, pain: false })).toBe(1);
    expect(adaptFactor(0.5, { planned: 3, done: 3, avgRpe: 9, pain: true })).toBe(0.5);
    // lower factor -> smaller plan
    const big = { ...base, days_per_week: 5, minutes_per_session: 45 };
    const lo = generatePlan(big, 0.7).weeks[0].aerobic_minutes_week;
    expect(lo).toBeLessThan(generatePlan(big, 1).weeks[0].aerobic_minutes_week);
  });

  it("finds the next training day", () => {
    expect(nextTrainingDay(["mon", "wed", "fri"], "tue")).toBe("wed");
    expect(nextTrainingDay(["mon", "wed", "fri"], "sat")).toBe("mon");
  });

  it("finds today's session", () => {
    const p = generatePlan(base);
    // 2026-10-26 is a Monday
    expect(planDayInfo(p, "2026-10-26", "2026-10-26")).toMatchObject({ week: 1, weekday: "mon", isTraining: true, sessionIndex: 0 });
    expect(planDayInfo(p, "2026-10-26", "2026-10-27")).toMatchObject({ isTraining: false });
    expect(planDayInfo(p, "2026-10-26", "2026-11-09").week).toBe(3);
    expect(planDayInfo(p, "2026-10-26", "2027-01-01").week).toBe(4);
  });
});
