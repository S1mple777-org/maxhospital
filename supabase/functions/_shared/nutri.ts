// MaxNutri: o'zbek taomlari bazasi, kunlik me'yor va "bu porsiya siz uchun qanday" hisob-kitobi.
// Toza modul — sayt, server (rasm tahlili) va testlar uchun umumiy.
//
// Qoida (AGENTS.md: manbaga asoslangan): AI faqat RASMDAGI TAOMNI TANIYDI va porsiyani taxmin qiladi
// (shu ro'yxatdagi id bilan). Kaloriya, uglevod, tuz — hammasi shu jadvaldan, kod bilan hisoblanadi.
// Taom qiymatlari — an'anaviy retseptlar bo'yicha hisoblangan TAXMINIY o'rtacha qiymatlar
// (go'sht, yog', guruch, un ulushiga qarab har bir xonadonda farq qiladi).
// Me'yorlar manbasi:
//   - JSST (WHO): tuz < 5 g/kun (natriy < 2000 mg), erkin shakar < energiyaning 10% i (ideal 5%), 2015/2023;
//   - Kunlik energiya: Mifflin–St Jeor formulasi × faollik;
//   - Diabet: ADA "Standards of Care" — uglevodni hisoblash va "likopcha usuli" (yarmi sabzavot);
//     bir mahalga 45–60 g uglevod — ko'p diabet maktablarida boshlang'ich mo'ljal, aniq miqdorni shifokor belgilaydi.

export type FoodCat = "main" | "soup" | "bread" | "breakfast" | "salad" | "fruit" | "sweet" | "drink" | "fast" | "basic";

export interface Food {
  id: string;
  name: string;
  cat: FoodCat;
  portion: number;         // odatiy porsiya, g (ml)
  portionName: string;     // "1 kosa", "1 dona"
  // 100 g uchun:
  kcal: number; protein: number; fat: number; carbs: number;
  sodium: number;          // mg
  sugar: number;           // erkin (qo'shilgan) shakar, g
  fiber: number;           // g
  veg?: boolean;           // sabzavotli taom / salat (likopchaning yarmi)
}

const f = (id: string, name: string, cat: FoodCat, portion: number, portionName: string,
  kcal: number, protein: number, fat: number, carbs: number, sodium: number, sugar = 0, fiber = 0, veg = false): Food =>
  ({ id, name, cat, portion, portionName, kcal, protein, fat, carbs, sodium, sugar, fiber, veg });

/** Taxminiy qiymatlar (100 g uchun), an'anaviy retseptlar bo'yicha. */
export const FOODS: Food[] = [
  // Asosiy taomlar
  f("osh", "Osh (palov)", "main", 350, "1 likopcha", 200, 6, 10, 22, 350, 0, 1.5),
  f("lagmon", "Lag'mon (sho'rvali)", "main", 450, "1 kosa", 110, 5, 4, 14, 380, 0, 1.2),
  f("qovurma_lagmon", "Qovurma lag'mon", "main", 350, "1 likopcha", 190, 8, 9, 20, 450, 0, 1.5),
  f("manti", "Manti", "main", 250, "5 dona", 220, 10, 11, 20, 400),
  f("chuchvara", "Chuchvara (sho'rvali)", "main", 350, "1 kosa", 110, 6, 5, 11, 380),
  f("dimlama", "Dimlama", "main", 400, "1 likopcha", 95, 6, 5, 7, 300, 0, 2, true),
  f("norin", "Norin", "main", 250, "1 likopcha", 220, 12, 10, 20, 500),
  f("qozon_kabob", "Qozon kabob", "main", 300, "1 likopcha", 230, 12, 15, 12, 420, 0, 1.5),
  f("shashlik", "Shashlik (qo'y go'shti)", "main", 150, "3 six", 250, 20, 18, 1, 450),
  f("lula_kabob", "Lula kabob", "main", 150, "2 six", 270, 17, 21, 3, 500),
  f("tovuq_shashlik", "Tovuq shashlik", "main", 150, "3 six", 180, 24, 9, 1, 400),
  f("somsa", "Somsa (go'shtli)", "main", 120, "1 dona", 300, 10, 18, 25, 450, 0, 1),
  f("dolma", "Do'lma", "main", 250, "1 likopcha", 150, 8, 9, 9, 350, 0, 2, true),
  f("moshxorda", "Moshxo'rda", "soup", 400, "1 kosa", 95, 4, 3, 13, 300, 0, 2.5),
  f("shorva", "Sho'rva (go'shtli)", "soup", 400, "1 kosa", 60, 4, 3, 4, 350, 0, 1, true),
  f("mastava", "Mastava", "soup", 400, "1 kosa", 75, 3.5, 3, 9, 330, 0, 1),
  f("tovuq_shorva", "Tovuq sho'rva", "soup", 400, "1 kosa", 45, 4, 2, 3, 330, 0, 0.5),
  // Non va nonushta
  f("non", "Non (obi non)", "bread", 90, "chorak non", 260, 8.5, 1.5, 52, 450, 0, 2.5),
  f("patir", "Patir non", "bread", 100, "chorak patir", 330, 8, 12, 48, 450, 0, 2),
  f("tuxum", "Tuxum (qovurilgan)", "breakfast", 100, "2 dona", 190, 13, 15, 1, 200),
  f("qatiq", "Qatiq / kefir", "breakfast", 200, "1 stakan", 60, 3, 3, 4, 45),
  f("sut", "Sut", "breakfast", 250, "1 stakan", 64, 3.2, 3.6, 4.8, 44),
  f("botqa", "Sutli bo'tqa (guruchli)", "breakfast", 250, "1 kosa", 100, 3, 3, 16, 60, 3),
  f("qaymoq", "Qaymoq", "breakfast", 30, "2 osh qoshiq", 290, 2.5, 30, 3, 40),
  f("pishloq", "Pishloq", "breakfast", 30, "2 bo'lak", 350, 25, 27, 0, 600),
  f("kolbasa", "Kolbasa", "breakfast", 50, "3 bo'lak", 300, 12, 27, 2, 1000),
  f("asal", "Asal / murabbo", "breakfast", 20, "1 osh qoshiq", 304, 0, 0, 82, 4, 80),
  f("guruch", "Guruch (qaynatilgan)", "basic", 200, "1 likopcha", 130, 2.7, 0.3, 28, 1, 0, 0.4),
  f("grechka", "Grechka", "basic", 200, "1 likopcha", 110, 4, 1, 21, 4, 0, 2.7),
  f("makaron", "Makaron", "basic", 200, "1 likopcha", 150, 5, 1.5, 30, 5, 0, 1.8),
  f("tovuq", "Tovuq go'shti (qaynatilgan)", "basic", 150, "1 bo'lak", 170, 25, 7, 0, 70),
  f("baliq", "Baliq (qovurilgan)", "basic", 150, "1 bo'lak", 200, 20, 11, 5, 300),
  f("kartoshka_fri", "Kartoshka fri", "fast", 150, "1 porsiya", 312, 3.4, 15, 41, 210, 0, 3.8),
  // Salat va sabzavot
  f("achchiq_chuchuk", "Achchiq-chuchuk / shakarob", "salad", 150, "1 likopcha", 20, 1, 0.2, 4, 150, 0, 1.2, true),
  f("sabzavot_salat", "Sabzavotli salat (yog'li)", "salad", 150, "1 likopcha", 60, 1.2, 4.5, 4.5, 180, 0, 1.8, true),
  f("olivye", "Olivye (stolichniy)", "salad", 150, "1 likopcha", 160, 5, 13, 6, 400, 0, 1),
  // Mevalar
  f("olma", "Olma", "fruit", 180, "1 dona", 52, 0.3, 0.2, 14, 1, 0, 2.4),
  f("banan", "Banan", "fruit", 120, "1 dona", 89, 1.1, 0.3, 23, 1, 0, 2.6),
  f("uzum", "Uzum", "fruit", 150, "1 shingil", 69, 0.7, 0.2, 18, 2, 0, 0.9),
  f("qovun", "Qovun", "fruit", 300, "2 tilim", 34, 0.8, 0.2, 8, 16, 0, 0.9),
  f("tarvuz", "Tarvuz", "fruit", 300, "2 tilim", 30, 0.6, 0.2, 7.6, 1, 0, 0.4),
  f("anor", "Anor", "fruit", 150, "1 dona", 83, 1.7, 1.2, 19, 3, 0, 4),
  f("xurmo", "Xurmo", "fruit", 170, "1 dona", 70, 0.6, 0.2, 18.6, 1, 0, 3.6),
  f("mayiz", "Mayiz / quruq meva", "fruit", 40, "bir hovuch", 300, 3, 0.5, 79, 11, 0, 3.7),
  f("yongoq", "Yong'oq / bodom", "fruit", 30, "bir hovuch", 650, 15, 65, 14, 2, 0, 6.7),
  // Shirinlik
  f("holva", "Holva", "sweet", 50, "2 bo'lak", 520, 12, 30, 54, 50, 45),
  f("chak_chak", "Chak-chak", "sweet", 60, "1 bo'lak", 450, 6, 20, 60, 100, 35),
  f("tort", "Tort / pirojniy", "sweet", 100, "1 bo'lak", 370, 5, 18, 48, 250, 30),
  f("konfet", "Shokoladli konfet", "sweet", 30, "3 dona", 530, 5, 30, 60, 50, 50),
  f("pechenye", "Pechenye", "sweet", 50, "4–5 dona", 450, 6, 18, 68, 350, 25),
  // Ichimlik
  f("choy", "Choy (shakarsiz)", "drink", 250, "1 piyola", 1, 0, 0, 0.3, 3),
  f("choy_shakar", "Choy (2 qoshiq shakar bilan)", "drink", 250, "1 piyola", 32, 0, 0, 8, 3, 8),
  f("gazli", "Gazli ichimlik (Coca-Cola va h.k.)", "drink", 330, "1 banka", 42, 0, 0, 10.6, 4, 10.6),
  f("sharbat", "Paketli sharbat", "drink", 250, "1 stakan", 46, 0.2, 0, 11, 5, 9),
  f("kompot", "Kompot (shakarli)", "drink", 250, "1 stakan", 50, 0.1, 0, 12.5, 2, 10),
  // Fast food
  f("lavash", "Lavash / shaurma", "fast", 350, "1 dona", 230, 11, 11, 22, 600, 1, 1.5),
  f("burger", "Burger", "fast", 220, "1 dona", 250, 13, 12, 24, 500, 3, 1.3),
  f("hotdog", "Hot-dog", "fast", 150, "1 dona", 270, 10, 15, 24, 750, 3, 1),
  f("pitsa", "Pitsa", "fast", 250, "2 bo'lak", 266, 11, 10, 33, 600, 2, 2.3),
];

export const FOOD_BY_ID = new Map(FOODS.map((x) => [x.id, x]));

export const CAT_UZ: Record<FoodCat, string> = {
  main: "Asosiy taomlar", soup: "Sho'rvalar", bread: "Non", breakfast: "Nonushta", salad: "Salat",
  fruit: "Meva", sweet: "Shirinlik", drink: "Ichimlik", fast: "Fast food", basic: "Garnir va go'sht",
};

export interface MealItem { food: string; grams: number }
export interface Totals { kcal: number; protein: number; fat: number; carbs: number; sodium: number; sugar: number; fiber: number }

const r1 = (x: number) => Math.round(x * 10) / 10;

export function totals(items: MealItem[]): Totals {
  const t: Totals = { kcal: 0, protein: 0, fat: 0, carbs: 0, sodium: 0, sugar: 0, fiber: 0 };
  for (const it of items) {
    const fd = FOOD_BY_ID.get(it.food);
    if (!fd || !(it.grams > 0)) continue;
    const k = it.grams / 100;
    t.kcal += fd.kcal * k; t.protein += fd.protein * k; t.fat += fd.fat * k; t.carbs += fd.carbs * k;
    t.sodium += fd.sodium * k; t.sugar += fd.sugar * k; t.fiber += fd.fiber * k;
  }
  return {
    kcal: Math.round(t.kcal), protein: r1(t.protein), fat: r1(t.fat), carbs: r1(t.carbs),
    sodium: Math.round(t.sodium), sugar: r1(t.sugar), fiber: r1(t.fiber),
  };
}

/** Natriy (mg) -> osh tuzi (g). */
export const saltGrams = (sodiumMg: number) => r1(sodiumMg * 2.5 / 1000);

export type NutriGoal = "keep" | "lose" | "gain";
export interface NutriProfile {
  age: number | null; sex: "male" | "female" | null; height_cm: number | null; weight_kg: number | null;
  activity: "low" | "medium" | "high";
  goal: NutriGoal;
  diabetes: boolean; hypertension: boolean; kidney?: boolean;
}

export interface Targets {
  kcal: number; carbsMin: number; carbsMax: number; protein: number;
  sodiumMax: number; sugarMax: number; fiberMin: number;
  mealCarbsMax: number | null;     // diabet uchun bir mahalga
  basis: string[];                 // hisob qanday qilingani
}

const ACT = { low: 1.4, medium: 1.6, high: 1.8 } as const;

/** Kunlik me'yorlar. */
export function dailyTargets(p: NutriProfile): Targets {
  const basis: string[] = [];
  let kcal = 2000;
  if (p.age && p.height_cm && p.weight_kg && p.sex) {
    const bmr = 10 * p.weight_kg + 6.25 * p.height_cm - 5 * p.age + (p.sex === "male" ? 5 : -161);
    kcal = bmr * ACT[p.activity];
    basis.push(`Energiya: Mifflin–St Jeor (${Math.round(bmr)} kkal) × faollik ${ACT[p.activity]}`);
  } else {
    basis.push("Energiya: o'rtacha 2000 kkal (yosh, bo'y, vazn kiritilmagan)");
  }
  if (p.goal === "lose") { kcal -= 500; basis.push("Vazn tashlash: −500 kkal (haftasiga ~0,5 kg)"); }
  if (p.goal === "gain") { kcal += 300; basis.push("Vazn olish: +300 kkal"); }
  kcal = Math.round(Math.max(p.sex === "male" ? 1500 : 1200, kcal) / 10) * 10;

  const sodiumMax = 2000;
  basis.push("Tuz: kuniga 5 g dan kam (natriy < 2000 mg) — JSST");
  const sugarMax = Math.round((kcal * 0.10) / 4);
  basis.push(`Qo'shilgan shakar: energiyaning 10% idan kam (≈${sugarMax} g) — JSST`);
  const weight = p.weight_kg ?? 70;
  const protein = Math.round(weight * (p.kidney ? 0.8 : 1.0));
  return {
    kcal,
    carbsMin: Math.round((kcal * 0.45) / 4), carbsMax: Math.round((kcal * (p.diabetes ? 0.5 : 0.6)) / 4),
    protein, sodiumMax, sugarMax, fiberMin: 25,
    mealCarbsMax: p.diabetes ? 60 : null,
    basis: p.diabetes ? [...basis, "Diabet: bir mahalga ≤ 45–60 g uglevod (boshlang'ich mo'ljal; aniq miqdorni shifokoringiz belgilaydi) — ADA"] : basis,
  };
}

export type Verdict = { level: "good" | "warn" | "bad"; text: string };

/** Bir mahal ovqat bo'yicha xulosa (shaxsiy kasalliklarga qarab). */
export function judgeMeal(items: MealItem[], p: NutriProfile, t: Targets): Verdict[] {
  const s = totals(items);
  const out: Verdict[] = [];
  const foods = items.map((i) => FOOD_BY_ID.get(i.food)).filter(Boolean) as Food[];
  const hasVeg = foods.some((x) => x.veg);
  const bread = items.filter((i) => FOOD_BY_ID.get(i.food)?.cat === "bread").reduce((a, i) => a + i.grams, 0);

  if (p.diabetes && t.mealCarbsMax !== null) {
    if (s.carbs > t.mealCarbsMax + 15) {
      const tip = bread > 0 ? "Nonni yarmiga kamaytiring" : foods.some((x) => x.id === "osh" || x.cat === "main") ? "Porsiyani ⅔ ga tushiring" : "Porsiyani kamaytiring";
      out.push({ level: "bad", text: `Uglevod ${s.carbs} g — diabet uchun bir mahalga ko'p (mo'ljal ≤ ${t.mealCarbsMax} g). ${tip} va sabzavotli salat qo'shing — qand keskin ko'tarilmaydi.` });
    } else if (s.carbs > t.mealCarbsMax) {
      out.push({ level: "warn", text: `Uglevod ${s.carbs} g — mo'ljaldan biroz ko'p (≤ ${t.mealCarbsMax} g). 2 soatdan keyin qandni o'lchab ko'ring.` });
    } else if (s.carbs > 0) {
      out.push({ level: "good", text: `Uglevod ${s.carbs} g — diabet uchun me'yorda.` });
    }
  }
  const mealSodiumMax = p.hypertension ? 700 : 900;
  if (s.sodium > mealSodiumMax) {
    out.push({
      level: p.hypertension ? "bad" : "warn",
      text: `Tuz ≈ ${saltGrams(s.sodium)} g — bir mahal uchun ko'p (kunlik me'yor 5 g).${p.hypertension ? " Bosim uchun xavfli: ertaga tuzni kamaytiring, kolbasa va tuzlamalardan qoching." : ""}`,
    });
  }
  if (s.sugar > 25) out.push({ level: "bad", text: `Qo'shilgan shakar ${s.sugar} g — JSST tavsiya qilgan kunlik idealdan (25 g) ko'p. Shirin choy va gazli ichimlik o'rniga — shakarsiz choy yoki suv.` });
  if (s.kcal > t.kcal * 0.45) out.push({ level: "warn", text: `${s.kcal} kkal — kunlik me'yoringizning ${Math.round((s.kcal / t.kcal) * 100)}% i bir mahalda.` });
  if (!hasVeg && foods.some((x) => x.cat === "main" || x.cat === "fast")) out.push({ level: "warn", text: "Sabzavot yo'q. Likopchaning yarmi sabzavot bo'lsin (achchiq-chuchuk, salat)." });
  if (hasVeg) out.push({ level: "good", text: "Zo'r — sabzavot bor." });
  if (!out.some((v) => v.level !== "good")) out.push({ level: "good", text: "Muvozanatli ovqat 👍" });
  return out;
}

/** Bugun qolgan me'yor ichida mos keladigan taomlar (kasallikka qarab saralangan). */
export function suggestFoods(eaten: Totals, t: Targets, p: NutriProfile, limit = 6): { food: Food; reason: string }[] {
  const leftK = t.kcal - eaten.kcal, leftNa = t.sodiumMax - eaten.sodium, leftC = t.carbsMax - eaten.carbs;
  return FOODS
    .filter((x) => x.cat !== "sweet" && x.cat !== "fast" && x.id !== "gazli" && x.id !== "sharbat" && x.id !== "kolbasa")
    .map((x) => {
      const k = x.portion / 100;
      const kc = x.kcal * k, na = x.sodium * k, c = x.carbs * k;
      let score = 0;
      if (kc > leftK + 50) score -= 100;
      if (na > Math.max(leftNa, 300)) score -= p.hypertension ? 80 : 30;   // tuz oshgan kuni ham kam tuzlilari qoladi
      if (p.diabetes && c > Math.min(t.mealCarbsMax ?? 999, leftC)) score -= 60;
      if (x.veg) score += 25;
      score += Math.min(20, (x.protein * k) / 2) + Math.min(15, x.fiber * k * 2);
      if (p.hypertension) score -= na / 50;
      if (p.diabetes) score -= c / 3;
      return { food: x, score, kc };
    })
    .filter((x) => x.score > -20 && x.kc <= leftK + 50)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ food }) => ({
      food,
      reason: food.veg ? "sabzavot, kam kaloriya" : food.protein * food.portion / 100 >= 15 ? "oqsilga boy" : food.fiber >= 2 ? "kletchatkaga boy" : "me'yoringizga sig'adi",
    }));
}

/** AI uchun katalog (rasm tahlili): "id: nom (odatiy porsiya)". */
export const catalogPrompt = () => FOODS.map((x) => `${x.id}: ${x.name} (${x.portionName} ≈ ${x.portion} g)`).join("\n");

/** AI javobini tekshirish: faqat ma'lum id, gramm 10..2000. */
export function sanitizeDetected(raw: unknown): { items: MealItem[]; unknown: string[] } {
  const arr = Array.isArray((raw as any)?.items) ? (raw as any).items : [];
  const items: MealItem[] = [];
  const unknown: string[] = [];
  for (const it of arr.slice(0, 12)) {
    const id = typeof it?.food_id === "string" ? it.food_id : null;
    const g = Math.round(Number(it?.grams));
    if (id && FOOD_BY_ID.has(id) && g >= 10 && g <= 2000) items.push({ food: id, grams: g });
    else if (typeof it?.name === "string" && it.name.trim()) unknown.push(it.name.trim().slice(0, 60));
  }
  return { items, unknown };
}
