import { describe, expect, it } from "vitest";
import { FOODS, dailyTargets, judgeMeal, saltGrams, sanitizeDetected, suggestFoods, totals, type NutriProfile } from "../../supabase/functions/_shared/nutri.ts";

const p: NutriProfile = { age: 50, sex: "male", height_cm: 175, weight_kg: 85, activity: "low", goal: "keep", diabetes: false, hypertension: false };

describe("MaxNutri", () => {
  it("food table is sane", () => {
    const ids = new Set<string>();
    for (const f of FOODS) {
      expect(ids.has(f.id)).toBe(false); ids.add(f.id);
      // energy roughly matches macros (4/9/4 kcal per g), within 30%
      const calc = f.protein * 4 + f.fat * 9 + f.carbs * 4;
      if (f.kcal > 20) expect(Math.abs(calc - f.kcal) / f.kcal).toBeLessThan(0.3);
      expect(f.sugar).toBeLessThanOrEqual(f.carbs);
    }
    expect(FOODS.length).toBeGreaterThan(50);
  });

  it("sums a plate of osh + non", () => {
    const t = totals([{ food: "osh", grams: 350 }, { food: "non", grams: 90 }]);
    expect(t.kcal).toBe(Math.round(200 * 3.5 + 260 * 0.9));
    expect(t.carbs).toBeCloseTo(22 * 3.5 + 52 * 0.9, 0);
    expect(saltGrams(2000)).toBe(5);
  });

  it("daily targets: Mifflin-St Jeor, weight loss −500, WHO salt", () => {
    const t = dailyTargets(p);
    expect(t.kcal).toBe(Math.round((10 * 85 + 6.25 * 175 - 250 + 5) * 1.4 / 10) * 10);
    expect(dailyTargets({ ...p, goal: "lose" }).kcal).toBe(t.kcal - 500);
    expect(t.sodiumMax).toBe(2000);
    expect(dailyTargets({ ...p, sex: "female", weight_kg: 45, height_cm: 150, goal: "lose" }).kcal).toBeGreaterThanOrEqual(1200);
    expect(dailyTargets({ ...p, age: null }).kcal).toBe(2000);
  });

  it("diabetic: osh with bread is too many carbs; salad alone is fine", () => {
    const d = { ...p, diabetes: true };
    const t = dailyTargets(d);
    const v = judgeMeal([{ food: "osh", grams: 350 }, { food: "non", grams: 90 }], d, t);
    expect(v.some((x) => x.level === "bad" && /Uglevod/.test(x.text))).toBe(true);
    expect(v.some((x) => /Nonni yarmiga/.test(x.text))).toBe(true);
    const ok = judgeMeal([{ food: "achchiq_chuchuk", grams: 150 }, { food: "tovuq", grams: 150 }], d, t);
    expect(ok.every((x) => x.level === "good")).toBe(true);
  });

  it("hypertension: salty meal is flagged", () => {
    const h = { ...p, hypertension: true };
    const v = judgeMeal([{ food: "norin", grams: 250 }, { food: "kolbasa", grams: 50 }], h, dailyTargets(h));
    expect(v.some((x) => x.level === "bad" && /Tuz/.test(x.text))).toBe(true);
  });

  it("sugary drink flagged by WHO free sugar", () => {
    const v = judgeMeal([{ food: "gazli", grams: 330 }], p, dailyTargets(p));
    expect(v.some((x) => /shakar/.test(x.text))).toBe(true);
  });

  it("suggestions avoid salty food for hypertension and fit remaining kcal", () => {
    const h = { ...p, hypertension: true };
    const t = dailyTargets(h);
    const s = suggestFoods(totals([{ food: "osh", grams: 700 }]), t, h);
    expect(s.length).toBeGreaterThan(0);
    expect(s.some((x) => x.food.id === "kolbasa")).toBe(false);
    expect(s[0].food.veg).toBe(true);
  });

  it("AI output is sanitized", () => {
    const r = sanitizeDetected({ items: [{ food_id: "osh", grams: 400 }, { food_id: "pizza_hut", name: "Noma'lum", grams: 100 }, { food_id: "somsa", grams: 5 }] });
    expect(r.items).toEqual([{ food: "osh", grams: 400 }]);
    expect(r.unknown).toEqual(["Noma'lum"]);
  });
});
