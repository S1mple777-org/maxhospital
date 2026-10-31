// MaxHospital fitness reja generatori. Toza, tashqi kutubxonasiz: sayt, server va testlar uchun umumiy.
//
// Muhim qoida (AGENTS.md: tibbiy javob manbaga asoslangan bo'lsin): mashq turi, daqiqa, takror va
// cheklovlarni AI EMAS, shu kod belgilaydi. Asos:
//  - JSST (WHO) jismoniy faollik va sedentar xulq bo'yicha ko'rsatmalar, 2020:
//    kattalar haftasiga 150–300 daqiqa o'rtacha aerob faollik + haftasiga ≥2 kun kuch mashqi;
//    65+ yoshda haftasiga ≥3 kun muvozanat mashqlari; "kamdan boshlab, asta-sekin oshirish";
//    surunkali kasalligi borlar uchun ham shu tavsiyalar, imkoniyatiga moslab.
//  - Mashqdan oldingi xavf so'rovnomasi PAR-Q+ uslubida: "ha" javobi bo'lsa — avval shifokor.
//  - Diabet: mashqdan oldin qand (ADA tavsiyalari), gipertoniya: nafasni ushlamaslik, uzoq statik
//    yuklamadan qochish; juda yuqori bosimda mashq qilmaslik (ACSM).
// Bu reja shifokor maslahati o'rnini bosmaydi.

import { EXERCISES, type ExerciseItem } from "./exercises.ts";
export type { ExerciseItem };

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const WEEKDAY_UZ: Record<Weekday, string> = {
  mon: "Dushanba", tue: "Seshanba", wed: "Chorshanba", thu: "Payshanba", fri: "Juma", sat: "Shanba", sun: "Yakshanba",
};

export type ActivityLevel = "none" | "light" | "moderate" | "active";
export type Goal = "health" | "weight" | "strength" | "mobility";
export type Place = "home" | "outdoor" | "gym";
export const LEVEL_UZ: Record<ActivityLevel, string> = {
  none: "Deyarli harakat qilmayman", light: "Ozgina (haftada 1–2 marta yuraman)",
  moderate: "O'rtacha (haftada 3+ marta)", active: "Faol (muntazam sport)",
};
export const GOAL_UZ: Record<Goal, string> = {
  health: "Sog'liq va kayfiyat", weight: "Vazn tashlash", strength: "Kuchliroq bo'lish", mobility: "Egiluvchanlik, og'riqsiz harakat",
};
export const PLACE_UZ: Record<Place, string> = { home: "Uyda", outdoor: "Ko'chada / parkda", gym: "Sport zalda" };

export type Condition =
  | "hypertension" | "diabetes" | "asthma" | "heart" | "back_pain" | "joint_pain" | "obesity" | "pregnancy";
export const CONDITION_UZ: Record<Condition, string> = {
  hypertension: "Yuqori qon bosimi (gipertoniya)",
  diabetes: "Qandli diabet",
  asthma: "Astma / nafas qisishi",
  heart: "Yurak kasalligi",
  back_pain: "Bel / umurtqa og'rig'i",
  joint_pain: "Tizza yoki bo'g'im og'rig'i",
  obesity: "Ortiqcha vazn",
  pregnancy: "Homiladorlik",
};

/** PAR-Q+ uslubidagi savollar: birortasiga "ha" — reja shifokor tasdig'idan keyin boshlanadi. */
export type RedFlag =
  | "chest_pain" | "dizzy_faint" | "heart_told" | "recent_surgery" | "pregnant" | "very_high_bp"
  | "hypo_often" | "doctor_limit";
export const RED_FLAG_UZ: Record<RedFlag, string> = {
  chest_pain: "Jismoniy harakatda yoki dam olganda ko'krakda og'riq bo'ladimi?",
  dizzy_faint: "Bosh aylanib yiqilganmisiz yoki hushdan ketganmisiz (so'nggi 12 oyda)?",
  heart_told: "Shifokor yurak kasalligi borligini va faqat ruxsat etilgan mashqni qilishni aytganmi?",
  recent_surgery: "So'nggi 3 oyda operatsiya bo'lganmi?",
  pregnant: "Homiladormisiz?",
  very_high_bp: "Qon bosimingiz 180/110 yoki undan yuqori bo'ladimi?",
  hypo_often: "Insulin/qand tushiruvchi dori bilan qand tez-tez tushib ketadimi?",
  doctor_limit: "Shifokor jismoniy faollikni cheklashni aytganmi?",
};

export interface FitnessAnswers {
  age: number;
  sex?: "male" | "female" | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  level: ActivityLevel;
  goal: Goal;
  days_per_week: number;      // 2..6
  minutes_per_session: number; // 15..60
  place: Place;
  conditions: Condition[];
  red_flags: RedFlag[];
  beta_blocker: boolean;
}


export interface FitnessSession {
  label: string;               // "A: Yurish + muvozanat"
  type: "aerobic" | "strength";
  items: ExerciseItem[];
  total_minutes: number;
}

export interface FitnessWeek {
  week: number;
  multiplier: number;
  aerobic_minutes_week: number;
  sessions: FitnessSession[];  // days.length ta, kunlar tartibida
}

export interface FitnessPlan {
  version: 1;
  days: Weekday[];
  weeks: FitnessWeek[];
  intensity: { rpe: [number, number]; hr: [number, number] | null; talk_test: string };
  precautions: string[];
  /** Tanlangan vaqt JSST minimumiga (150 daq/hafta) yetmasa — qanday to'ldirish. */
  who_note: string | null;
  stop_signs: string[];
  risk_reasons: string[];
  needs_doctor: boolean;
  sources: string[];
}

export const SOURCES = [
  "JSST (WHO): Jismoniy faollik va sedentar xulq bo'yicha ko'rsatmalar, 2020",
  "PAR-Q+: mashqdan oldingi xavf so'rovnomasi",
  "ADA: diabetda jismoniy faollik tavsiyalari",
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round5 = (v: number) => Math.max(5, Math.round(v / 5) * 5);

export function bmi(a: Pick<FitnessAnswers, "height_cm" | "weight_kg">): number | null {
  if (!a.height_cm || !a.weight_kg || a.height_cm < 100) return null;
  return Math.round((a.weight_kg / (a.height_cm / 100) ** 2) * 10) / 10;
}

/** Passport matnidan (kasalliklar, dorilar) taxminiy belgilar — foydalanuvchi anketada tekshiradi. */
export function conditionsFromText(conditions: string | null | undefined, medications: string | null | undefined): { conditions: Condition[]; beta_blocker: boolean } {
  const t = `${conditions ?? ""} ${medications ?? ""}`.toLowerCase();
  const out = new Set<Condition>();
  if (/gipertoni|qon bosim|bosim yuqori|hypertens|гипертон|давлени/.test(t)) out.add("hypertension");
  if (/diabet|qandli|сахарн|диабет|metformin|insulin|инсулин/.test(t)) out.add("diabetes");
  if (/astma|asthma|астм|nafas qis/.test(t)) out.add("asthma");
  if (/yurak|stenokard|infarkt|ишеми|сердеч|стенокард|heart|aritmi/.test(t)) out.add("heart");
  if (/bel |bel og|umurtqa|gryja|grija|osteoxondroz|остеохонд|грыж|позвон|back pain/.test(t)) out.add("back_pain");
  if (/tizza|bo'g'im|bogim|artroz|artrit|артроз|артрит|сустав|колен/.test(t)) out.add("joint_pain");
  if (/homilador|беремен|pregnan/.test(t)) out.add("pregnancy");
  const beta = /bisoprolol|metoprolol|atenolol|nebivolol|karvedilol|carvedilol|propranolol|бисопролол|метопролол|атенолол|небиволол|карведилол|пропранолол|concor|konkor/.test(t);
  return { conditions: [...out], beta_blocker: beta };
}

/** Haftaning kunlari teng taqsimlangan: 3 -> du, chor, ju. */
export function pickDays(n: number): Weekday[] {
  const k = clamp(Math.round(n), 2, 6);
  const presets: Record<number, Weekday[]> = {
    2: ["tue", "fri"],
    3: ["mon", "wed", "fri"],
    4: ["mon", "tue", "thu", "fri"],
    5: ["mon", "tue", "wed", "fri", "sat"],
    6: ["mon", "tue", "wed", "thu", "fri", "sat"],
  };
  return presets[k];
}

/** Xavf sabablari: birortasi bo'lsa reja shifokor tasdig'idan keyin boshlanadi. */
export function riskReasons(a: FitnessAnswers): string[] {
  const r: string[] = a.red_flags.map((f) => RED_FLAG_UZ[f].replace(/\?$/, ""));
  if (a.conditions.includes("heart") && !a.red_flags.includes("heart_told")) r.push("Yurak kasalligi");
  if (a.conditions.includes("pregnancy") && !a.red_flags.includes("pregnant")) r.push("Homiladorlik");
  if (a.age >= 70 && a.level === "none") r.push("70+ yosh va hozir umuman harakat qilinmaydi");
  const b = bmi(a);
  if (b !== null && b >= 40) r.push(`Tana massasi indeksi juda yuqori (${b})`);
  return [...new Set(r)];
}

// ---------------------------------------------------------------------------
// Mashqlar kutubxonasi (uyda, jihozsiz)
// ---------------------------------------------------------------------------
export { EXERCISES };

const ex = (key: keyof typeof EXERCISES, extra: Partial<ExerciseItem> = {}): ExerciseItem => ({ ...EXERCISES[key], ...extra });

/** Haftalik aerob daqiqalar: hozirgi darajadan boshlanadi, 4-haftada JSST minimumiga (150) yaqinlashadi. */
const BASE_AEROBIC: Record<ActivityLevel, number> = { none: 60, light: 90, moderate: 150, active: 180 };
/** 1–3 hafta asta oshadi, 4-hafta — yengillashtirilgan (tiklanish) haftasi. */
export const WEEK_MULTIPLIERS = [1, 1.15, 1.3, 1.1];

/** Taxminiy davomiylik: daqiqalar + har takror ~4 s, har yondashuvdan keyin 40 s dam. */
export function sessionMinutes(items: ExerciseItem[]): number {
  return items.reduce((s, it) => s + (it.minutes ?? 0)
    + Math.ceil(((it.sets ?? 0) * ((it.reps ?? 0) * 4 + (it.seconds ?? 0) * 2 + 40)) / 60), 0);
}

export function generatePlan(a: FitnessAnswers, adaptFactor = 1): FitnessPlan {
  const days = pickDays(a.days_per_week);
  const age = clamp(Math.round(a.age), 14, 100);
  const has = (c: Condition) => a.conditions.includes(c);
  const b = bmi(a);
  const older = age >= 65;
  const capRpe = has("heart") || has("hypertension") || has("pregnancy") || a.red_flags.length > 0 ? 5 : 6;
  const reasons = riskReasons(a);
  const factor = clamp(adaptFactor, 0.5, 1.5);
  const sessionCap = clamp(Math.round(a.minutes_per_session), 15, 60);

  // Asosiy aerob mashq: bo'g'im/bel/ortiqcha vaznda — past zarbli
  // (yugurish va sakrash rejaga umuman kiritilmaydi — boshlovchilar uchun past zarbli mashqlar)
  const aerobicKey: keyof typeof EXERCISES = a.place === "gym" ? "bike" : a.place === "home" ? "march" : "brisk_walk";

  // Kuch mashqlari: kasallikka moslab
  const strengthKeys: (keyof typeof EXERCISES)[] = [
    has("joint_pain") ? "bridge" : "chair_squat",
    "wall_pushup",
    has("back_pain") || has("hypertension") ? "bird_dog" : "bridge",
    has("joint_pain") ? "side_lying_leg" : "calf_raise",
  ];
  // Homiladorlikda (1-trimestrdan keyin) chalqancha yotib mashq qilinmaydi
  const strength = has("pregnancy") ? strengthKeys.map((k) => (k === "bridge" ? "calf_raise" : k)).filter((k, i, arr) => arr.indexOf(k) === i) : strengthKeys;

  // Kuch mashqi kunlari (JSST: haftasiga ≥2 kun). 2 kunlik rejada ikkala kun ham aralash.
  const STRENGTH_IDX: Record<number, number[]> = { 2: [0, 1], 3: [0, 2], 4: [1, 3], 5: [1, 3], 6: [1, 4] };
  const strengthIdx = STRENGTH_IDX[days.length];
  const budget = Math.max(sessionCap - 10, 5);              // 5 daq qizdirish + 5 daq cho'zilish
  const strengthMoves = budget >= 15 ? strength : strength.slice(0, 3);

  const weeks: FitnessWeek[] = WEEK_MULTIPLIERS.map((m, wi) => {
    const mult = Math.round(m * factor * 100) / 100;
    // Maqsad: vazn tashlash — aerob ulushi ko'proq
    const target = Math.round(BASE_AEROBIC[a.level] * mult * (a.goal === "weight" ? 1.2 : 1));
    const aerobicCount = days.length - strengthIdx.length;
    // Kuch kunidagi qisqa aerob qism; agar faqat kuch kunlari bo'lsa (2 kun) — ko'proq
    const sAer = round5(aerobicCount === 0 ? Math.min(budget / 2, target / days.length) : Math.min(10, budget / 3));
    // Mashg'ulot vaqti ham asta oshadi: boshlovchilarda 1-hafta tanlangan vaqtning ~70% i
    const ramp = (a.level === "none" || a.level === "light" ? [0.7, 0.85, 1, 0.85] : [0.85, 0.95, 1, 0.9])[wi];
    const perAerobic = aerobicCount === 0 ? 0
      : Math.max(10, Math.round(Math.min(budget * ramp, (target - sAer * strengthIdx.length) / aerobicCount)));
    const sets = clamp((a.level === "none" ? 1 : 2) + (a.level === "none" && wi >= 1 ? 1 : 0) + (a.level !== "none" && wi === 2 ? 1 : 0), 1, budget >= 15 ? 3 : 2);
    const reps = clamp(Math.round((a.level === "none" ? 8 : 10) * mult) + (a.goal === "strength" ? 2 : 0), 6, 15);

    const sessions: FitnessSession[] = days.map((_, di) => {
      const isStrength = strengthIdx.includes(di);
      const items: ExerciseItem[] = [ex("warmup", { minutes: 5 })];
      if (!isStrength) {
        items.push(ex(aerobicKey, { minutes: perAerobic }));
        if (older || has("pregnancy")) items.push(ex(wi % 2 ? "heel_toe" : "single_leg", { sets: 2, seconds: 20, note: "Har oyoqqa. Yonida tayanch bo'lsin." }));
      } else {
        for (const k of strengthMoves) items.push(ex(k, { sets, reps, note: k === "bird_dog" || k === "side_lying_leg" ? "Har tomonga" : undefined }));
        items.push(ex(aerobicKey, { minutes: sAer, note: "Yengil maromda" }));
        if (older) items.push(ex("single_leg", { sets: 2, seconds: 20, note: "Har oyoqqa" }));
      }
      items.push(ex("stretch", { minutes: a.goal === "mobility" ? 8 : 5 }));
      return {
        label: isStrength ? "Kuch mashqlari" : older || has("pregnancy") ? "Yurish + muvozanat" : "Aerob mashq",
        type: isStrength ? "strength" : "aerobic",
        items,
        total_minutes: sessionMinutes(items),
      };
    });
    const aerobicWeek = sessions.reduce((s, ss) => s + ss.items.filter((i) => i.kind === "aerobic").reduce((t, i) => t + (i.minutes ?? 0), 0), 0);
    return { week: wi + 1, multiplier: mult, aerobic_minutes_week: aerobicWeek, sessions };
  });

  // Puls zonasi: beta-bloker yoki yurak kasalligida — puls ishonchsiz, faqat his-tuyg'u (RPE) bo'yicha
  const hrMax = Math.round(208 - 0.7 * age);                    // Tanaka formulasi
  const hr: [number, number] | null = a.beta_blocker || has("heart") || has("pregnancy")
    ? null : [Math.round(hrMax * 0.5), Math.round(hrMax * (capRpe <= 5 ? 0.65 : 0.7))];

  const precautions: string[] = [];
  if (has("hypertension")) precautions.push("Qon bosimi: mashq oldidan o'lchang. 180/110 yoki undan yuqori bo'lsa o'sha kuni mashq qilmang va shifokorga ayting. Nafasni ushlab turmang, og'ir yuk ko'tarmang.");
  if (has("diabetes")) precautions.push("Diabet: mashqdan oldin qandni o'lchang. 5,6 mmol/l dan past bo'lsa avval biror narsa yeng (meva, non). 13,9 dan yuqori bo'lsa og'ir mashq qilmang. Yoningizda shirinlik bo'lsin, oyoqlaringizni tekshirib turing.");
  if (has("asthma")) precautions.push("Astma: ingalyatoringiz yoningizda bo'lsin, qizdirishni uzoqroq qiling, sovuq havoda tashqarida mashq qilmang.");
  if (has("back_pain")) precautions.push("Bel: sakrash va engashib yuk ko'tarishdan qoching. Og'riq kuchaysa mashqni to'xtating.");
  if (has("joint_pain")) precautions.push("Bo'g'imlar: past zarbli mashqlar tanlandi (yurish, velosiped). O'tirib-turishni og'riqsiz chuqurlikda bajaring.");
  if (has("pregnancy")) precautions.push("Homiladorlik: chalqancha yotib mashq qilmang, issiq xonada va qorinni siquvchi mashqlardan qoching. Rejani shifokoringiz tasdiqlashi shart.");
  if (has("heart")) precautions.push("Yurak: faqat shifokor tasdiqlagan yuklama. Yengil boshlang, ko'krakda og'riq bo'lsa darhol to'xtating.");
  if (a.beta_blocker) precautions.push("Beta-bloker (masalan bisoprolol) pulsni sekinlashtiradi — yuklamani puls bo'yicha emas, his-tuyg'u bo'yicha boshqaring.");
  if (older) precautions.push("65+: muvozanat mashqlarini doim tayanch yonida bajaring, yiqilishdan saqlaning.");
  if (b !== null && b >= 30) precautions.push("Vazn: bo'g'imlarni asrash uchun yugurish va sakrash o'rniga tez yurish va velosiped.");
  precautions.push("Kamdan boshlang: birinchi hafta qiyin bo'lsa, daqiqalarni qisqartiring. Muntazamlik tezlikdan muhimroq.");

  const peak = Math.max(...weeks.map((w) => w.aerobic_minutes_week));
  const who_note = peak >= 150 ? null
    : `Rejadagi aerob mashq haftasiga ${peak} daqiqagacha. JSST kattalarga haftasiga kamida 150 daqiqa tavsiya qiladi — `
      + `qolganini kundalik yurish bilan to'ldiring (masalan, har kuni 15–20 daqiqa piyoda) yoki keyinroq kun/vaqtni oshiring.`;

  return {
    version: 1,
    days,
    weeks,
    intensity: {
      rpe: [3, capRpe],
      hr,
      talk_test: "Mashq paytida gapira olasiz, lekin qo'shiq ayta olmaysiz — bu to'g'ri tezlik.",
    },
    precautions,
    who_note,
    stop_signs: [
      "Ko'krakda og'riq yoki siqilish",
      "Kuchli hansirash, nafas yetishmasligi",
      "Bosh aylanishi, ko'z qorong'ilashishi",
      "Yurak notekis yoki juda tez urishi",
      "Bo'g'imda o'tkir og'riq",
    ],
    risk_reasons: reasons,
    needs_doctor: reasons.length > 0,
    sources: SOURCES,
  };
}

/**
 * Bir haftalik natijadan keyingi hafta yuklamasi (koeffitsient):
 *  og'riq bo'lsa -15%, juda qiyin (o'rtacha RPE ≥ 8) -10%, juda oson (≤ 4) va hammasi bajarilgan +10%.
 */
export function adaptFactor(current: number, week: { planned: number; done: number; avgRpe: number | null; pain: boolean }): number {
  let f = current;
  if (week.pain) f *= 0.85;
  else if (week.avgRpe !== null && week.avgRpe >= 8) f *= 0.9;
  else if (week.avgRpe !== null && week.avgRpe <= 4 && week.done >= week.planned && week.planned > 0) f *= 1.1;
  return Math.round(clamp(f, 0.5, 1.5) * 100) / 100;
}

/** start_date dan boshlab hafta raqami (1..4, keyin 4 da qoladi) va bugun mashq kunimi. */
export function planDayInfo(plan: Pick<FitnessPlan, "days" | "weeks">, startDate: string, today: string): { week: number; weekday: Weekday; isTraining: boolean; sessionIndex: number } {
  const ms = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`);
  const dayNo = Math.max(0, Math.floor(ms / 86_400_000));
  const week = Math.min(plan.weeks.length, Math.floor(dayNo / 7) + 1);
  const weekday = WEEKDAYS[(new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7];
  const sessionIndex = plan.days.indexOf(weekday);
  return { week, weekday, isTraining: sessionIndex >= 0, sessionIndex };
}

/** Keyingi mashq kuni (bugundan keyin; hafta oxiridan keyin — boshidan). */
export function nextTrainingDay(days: Weekday[], today: Weekday): Weekday {
  const t = WEEKDAYS.indexOf(today);
  return days.find((d) => WEEKDAYS.indexOf(d) > t) ?? days[0];
}
