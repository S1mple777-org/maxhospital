import { describe, expect, it } from "vitest";
import { allCoachPhrases, coachSteps, stepPhrases, uzNumber, uzOrdinal } from "../../supabase/functions/_shared/coach.ts";
import { generatePlan, type FitnessAnswers } from "../../supabase/functions/_shared/fitness.ts";

const base: FitnessAnswers = {
  age: 35, sex: "male", height_cm: 175, weight_kg: 72, level: "light", goal: "health",
  days_per_week: 3, minutes_per_session: 30, place: "outdoor", conditions: [], red_flags: [], beta_blocker: false,
};

describe("voice coach", () => {
  it("says numbers in Uzbek", () => {
    expect(uzNumber(1)).toBe("bir");
    expect(uzNumber(15)).toBe("o'n besh");
    expect(uzNumber(40)).toBe("qirq");
    expect(uzOrdinal(1)).toBe("Birinchi");
    expect(uzOrdinal(2)).toBe("Ikkinchi");
    expect(uzOrdinal(3)).toBe("Uchinchi");
  });

  it("every phrase of every possible plan is allowed by the server", () => {
    const allowed = allCoachPhrases();
    const variants: Partial<FitnessAnswers>[] = [
      {}, { level: "none", minutes_per_session: 15 }, { level: "active", days_per_week: 6, minutes_per_session: 60, goal: "strength" },
      { age: 70, place: "home" }, { conditions: ["joint_pain", "back_pain"], place: "gym" }, { sex: "female", conditions: ["pregnancy"] },
      { conditions: ["hypertension"], goal: "mobility", days_per_week: 2 }, { goal: "weight", days_per_week: 5, minutes_per_session: 45 },
    ];
    let n = 0;
    for (const v of variants) for (const f of [0.5, 1, 1.5]) {
      const plan = generatePlan({ ...base, ...v }, f);
      for (const w of plan.weeks) for (const s of w.sessions) {
        for (const p of stepPhrases(coachSteps(s))) { expect(allowed.has(p)).toBe(true); n++; }
      }
    }
    expect(n).toBeGreaterThan(100);
  });

  it("builds an ordered session: intro first, done last, counts for reps", () => {
    const s = generatePlan(base).weeks[0].sessions[0]; // strength day
    const steps = coachSteps(s);
    expect(steps[0].kind).toBe("say");
    expect(steps[steps.length - 1]).toMatchObject({ kind: "say", title: "Tugadi" });
    expect(steps.some((x) => x.kind === "count")).toBe(true);
    expect(steps.some((x) => x.kind === "timer")).toBe(true);
  });
});
