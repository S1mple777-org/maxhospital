// Irsiy xavf xaritasi: oila a'zolarining kasalliklari -> qaysi kasallik xavfi oshgan va qachon qanday
// tekshiruvdan o'tish kerak. Toza, qoidalarga asoslangan (AI emas); har bir tavsiyada manba ko'rsatiladi.
// Bu tashxis emas — natijani shifokor bilan muhokama qilish kerak.

export type Relative =
  | "father" | "mother" | "brother" | "sister" | "son" | "daughter"
  | "gf_father" | "gm_father" | "gf_mother" | "gm_mother" | "uncle_aunt";

export const RELATIVE_UZ: Record<Relative, string> = {
  father: "Ota", mother: "Ona", brother: "Aka / uka", sister: "Opa / singil", son: "O'g'il", daughter: "Qiz",
  gf_father: "Bobo (ota tomondan)", gm_father: "Buvi (ota tomondan)",
  gf_mother: "Bobo (ona tomondan)", gm_mother: "Buvi (ona tomondan)", uncle_aunt: "Amaki / tog'a / xola / amma",
};

const FIRST: Relative[] = ["father", "mother", "brother", "sister", "son", "daughter"];
const MALE: Relative[] = ["father", "brother", "son", "gf_father", "gf_mother"];
export const isFirstDegree = (r: Relative) => FIRST.includes(r);

export type Disease =
  | "heart" | "stroke" | "diabetes" | "hypertension" | "cholesterol"
  | "colorectal" | "breast" | "ovarian" | "prostate" | "glaucoma" | "hip_fracture";

export const DISEASE_UZ: Record<Disease, string> = {
  heart: "Infarkt / yurak ishemik kasalligi",
  stroke: "Insult",
  diabetes: "Qandli diabet (2-tur)",
  hypertension: "Yuqori qon bosimi",
  cholesterol: "Juda yuqori xolesterin (oilaviy)",
  colorectal: "Yo'g'on ichak saratoni",
  breast: "Ko'krak bezi saratoni",
  ovarian: "Tuxumdon saratoni",
  prostate: "Prostata saratoni",
  glaucoma: "Glaukoma (ko'z bosimi)",
  hip_fracture: "Son suyagi singan (osteoporoz)",
};

export interface FamilyCase { relative: Relative; disease: Disease; age?: number | null }
export interface Person { age: number | null; sex: "male" | "female" | null; bmi?: number | null }

export type RiskLevel = "high" | "increased" | "average";
export interface RiskItem {
  id: string;
  title: string;
  level: RiskLevel;
  why: string[];              // qaysi qarindoshlar tufayli
  action: string;             // nima qilish kerak
  startAge: number | null;    // shu yoshdan
  now: boolean;               // hozir boshlash kerakmi
  source: string;
}

const has = (cases: FamilyCase[], d: Disease, pred: (c: FamilyCase) => boolean = () => true) =>
  cases.filter((c) => c.disease === d && pred(c));
const who = (cs: FamilyCase[]) => cs.map((c) => `${RELATIVE_UZ[c.relative]}${c.age ? ` (${c.age} yoshda)` : ""}`);
const minAge = (cs: FamilyCase[]) => {
  const a = cs.map((c) => c.age).filter((x): x is number => typeof x === "number" && x > 0);
  return a.length ? Math.min(...a) : null;
};

function item(p: Person, base: Omit<RiskItem, "now">): RiskItem {
  const now = base.startAge === null || (p.age !== null && p.age >= base.startAge);
  return { ...base, now };
}

/** Oila tarixi -> xavf ro'yxati (avval yuqori xavflar). */
export function assessHeredity(cases: FamilyCase[], p: Person): RiskItem[] {
  const out: RiskItem[] = [];
  const fd = (c: FamilyCase) => isFirstDegree(c.relative);

  // 1. Yo'g'on ichak saratoni — USMSTF 2017, USPSTF 2021
  {
    const f = has(cases, "colorectal", fd);
    const young = f.filter((c) => (c.age ?? 99) < 60);
    const any = has(cases, "colorectal");
    if (young.length || f.length >= 2) {
      const youngest = minAge(f);
      const start = Math.max(18, Math.min(40, youngest ? youngest - 10 : 40));
      out.push(item(p, { id: "colorectal", title: DISEASE_UZ.colorectal, level: "high", why: who(f),
        action: `Kolonoskopiya ${start} yoshdan (yoki qarindosh tashxis olgan yoshdan 10 yil oldin), har 5 yilda.`, startAge: start,
        source: "USMSTF (AQSh ko'p tarmoqli yo'g'on ichak saratoni guruhi), 2017" }));
    } else if (f.length === 1) {
      out.push(item(p, { id: "colorectal", title: DISEASE_UZ.colorectal, level: "increased", why: who(f),
        action: "Yo'g'on ichak tekshiruvi (kolonoskopiya) 40 yoshdan.", startAge: 40, source: "USMSTF, 2017" }));
    } else {
      out.push(item(p, { id: "colorectal", title: DISEASE_UZ.colorectal, level: any.length ? "increased" : "average", why: who(any),
        action: "Yo'g'on ichak saratoni skriningi 45 yoshdan (najasda yashirin qon testi yoki kolonoskopiya).", startAge: 45,
        source: "USPSTF, 2021" }));
    }
  }

  // 2. Ko'krak / tuxumdon saratoni — USPSTF 2019 (BRCA), USPSTF 2024 (mammografiya)
  {
    const breast = has(cases, "breast");
    const ovarian = has(cases, "ovarian");
    const fdYoung = breast.filter((c) => fd(c) && (c.age ?? 99) < 50);
    const maleBreast = breast.filter((c) => MALE.includes(c.relative));
    const high = fdYoung.length > 0 || breast.length >= 2 || ovarian.length > 0 || maleBreast.length > 0;
    if (high) {
      out.push(item(p, { id: "breast", title: "Ko'krak / tuxumdon saratoni (BRCA)", level: "high", why: who([...breast, ...ovarian]),
        action: "Genetik maslahat (BRCA1/2 tekshiruvi haqida) — shifokor yo'llanmasi bilan." + (p.sex !== "male" ? " Mammografiyani shifokor belgilagan yoshdan, odatda 40 dan oldin ham." : ""),
        startAge: null, source: "USPSTF: BRCA bilan bog'liq saraton xavfi, 2019" }));
    } else if (p.sex !== "male") {
      out.push(item(p, { id: "breast", title: DISEASE_UZ.breast, level: breast.length ? "increased" : "average", why: who(breast),
        action: breast.length ? "Mammografiya 40 yoshdan, har 1–2 yilda; boshlash vaqtini shifokor bilan aniqlang." : "Mammografiya 40 yoshdan har 2 yilda.",
        startAge: 40, source: "USPSTF, 2024" }));
    }
  }

  // 3. Prostata (erkaklar) — ACS
  if (p.sex !== "female") {
    const f = has(cases, "prostate", (c) => c.relative === "father" || c.relative === "brother" || c.relative === "son");
    const young = f.filter((c) => (c.age ?? 99) < 65);
    if (f.length) {
      const start = young.length || f.length >= 2 ? 40 : 45;
      out.push(item(p, { id: "prostate", title: DISEASE_UZ.prostate, level: young.length || f.length >= 2 ? "high" : "increased", why: who(f),
        action: `PSA tekshiruvi haqida ${start} yoshdan urolog bilan gaplashing.`, startAge: start,
        source: "Amerika saraton jamiyati (ACS): prostata saratonini erta aniqlash" }));
    } else if (p.sex === "male") {
      out.push(item(p, { id: "prostate", title: DISEASE_UZ.prostate, level: "average", why: [],
        action: "PSA tekshiruvi haqida 50 yoshdan shifokor bilan gaplashing.", startAge: 50, source: "ACS" }));
    }
  }

  // 4. Yurak-qon tomir — ACC/AHA 2018/2019: erta yurak kasalligi (erkak < 55, ayol < 65) oilada — xavf kuchaytiruvchi
  {
    const heart = has(cases, "heart");
    const early = heart.filter((c) => fd(c) && c.age && (MALE.includes(c.relative) ? c.age < 55 : c.age < 65));
    const chol = has(cases, "cholesterol", fd);
    const stroke = has(cases, "stroke", fd);
    if (early.length || chol.length) {
      out.push(item(p, { id: "heart", title: "Yurak-qon tomir kasalliklari", level: "high", why: who([...early, ...chol]),
        action: "Qonda xolesterin (lipid profil) hozir tekshirilsin, natijaga ko'ra muntazam. Bosimni yiliga o'lchang, chekmang, harakat (MaxFitness).",
        startAge: chol.length ? 2 : 18, source: "ACC/AHA xolesterin bo'yicha ko'rsatma, 2018; birlamchi profilaktika, 2019" }));
    } else if (heart.length || stroke.length) {
      out.push(item(p, { id: "heart", title: "Yurak-qon tomir va insult", level: "increased", why: who([...heart, ...stroke]),
        action: "Lipid profil 20 yoshdan har 4–6 yilda, bosim yiliga. Qand va vaznni nazorat qiling.", startAge: 20,
        source: "AHA/ACC birlamchi profilaktika, 2019" }));
    }
  }

  // 5. Qandli diabet — ADA 2024: ortiqcha vazn + 1-darajali qarindoshda diabet -> har qanday yoshda; hammaga 35 dan
  {
    const f = has(cases, "diabetes", fd);
    const any = has(cases, "diabetes");
    const overweight = (p.bmi ?? 0) >= 25;
    if (f.length) {
      const start = overweight ? 18 : 35;
      out.push(item(p, { id: "diabetes", title: DISEASE_UZ.diabetes, level: overweight || f.length >= 2 ? "high" : "increased", why: who(f),
        action: `Qondagi qand / HbA1c ${overweight ? "hozir (ortiqcha vazn + oilada diabet)" : "35 yoshdan"}, me'yorda bo'lsa har 3 yilda.`,
        startAge: start, source: "ADA: Diabet bo'yicha tibbiy yordam standartlari, 2024" }));
    } else if (any.length) {
      out.push(item(p, { id: "diabetes", title: DISEASE_UZ.diabetes, level: "average", why: who(any),
        action: "Qand / HbA1c 35 yoshdan har 3 yilda.", startAge: 35, source: "ADA, 2024" }));
    }
  }

  // 6. Gipertoniya — USPSTF 2021: xavfi oshganlarda yiliga
  {
    const f = has(cases, "hypertension", fd);
    if (f.length) {
      out.push(item(p, { id: "hypertension", title: DISEASE_UZ.hypertension, level: f.length >= 2 ? "high" : "increased", why: who(f),
        action: "Qon bosimini 18 yoshdan kamida yiliga bir marta o'lchang (uyda ham). Tuzni kamaytiring.", startAge: 18,
        source: "USPSTF: kattalarda gipertoniya skriningi, 2021" }));
    }
  }

  // 7. Glaukoma — AAO
  {
    const f = has(cases, "glaucoma", fd);
    if (f.length) {
      out.push(item(p, { id: "glaucoma", title: DISEASE_UZ.glaucoma, level: "increased", why: who(f),
        action: "Ko'z bosimi va ko'z tubi tekshiruvi 40 yoshdan har 1–2 yilda (oftalmolog).", startAge: 40,
        source: "Amerika oftalmologiya akademiyasi (AAO)" }));
    }
  }

  // 8. Osteoporoz — USPSTF 2018 (ota-onada son suyagi sinishi — FRAX xavf omili)
  {
    const f = has(cases, "hip_fracture", (c) => c.relative === "father" || c.relative === "mother");
    if (f.length) {
      out.push(item(p, { id: "osteoporosis", title: "Osteoporoz (suyak mo'rtligi)", level: "increased", why: who(f),
        action: p.sex === "female" ? "Suyak zichligi (densitometriya) — menopauzadan keyin, 65 yoshdan oldin ham, shifokor bilan." : "Suyak zichligi haqida 50 yoshdan keyin shifokor bilan gaplashing.",
        startAge: p.sex === "female" ? 50 : 50, source: "USPSTF: osteoporoz skriningi, 2018" }));
    }
  }

  const order: Record<RiskLevel, number> = { high: 0, increased: 1, average: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

export const LEVEL_UZ: Record<RiskLevel, string> = { high: "Yuqori xavf", increased: "Oshgan xavf", average: "Odatiy xavf" };

/** Passport'dagi "oila kasalliklari" maydoniga yoziladigan qisqa matn. */
export function familySummary(cases: FamilyCase[]): string {
  return cases.map((c) => `${RELATIVE_UZ[c.relative]}: ${DISEASE_UZ[c.disease]}${c.age ? ` (${c.age} y.)` : ""}`).join("; ").slice(0, 1000);
}
