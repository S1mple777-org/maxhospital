// MaxFitness ovozli murabbiy: bir mashg'ulotni ketma-ket qadamlarga aylantiradi
// (gapirish, taymer, takrorlarni sanash, dam olish). Toza, tashqi kutubxonasiz.
//
// Ovoz serverda yaratiladi va keshlanadi (coach-voice funksiyasi). Server faqat shu modul
// yasay oladigan iboralarni qabul qiladi (allCoachPhrases) — boshqa matnni ovozga aylantirmaydi.

import { EXERCISES, type ExerciseItem } from "./exercises.ts";

/** Bir mashg'ulot (fitness.ts FitnessSession bilan mos). */
export interface CoachSession { label: string; items: ExerciseItem[] }

const ONES = ["", "bir", "ikki", "uch", "to'rt", "besh", "olti", "yetti", "sakkiz", "to'qqiz"];
const TENS = ["", "o'n", "yigirma", "o'ttiz", "qirq", "ellik", "oltmish", "yetmish", "sakson", "to'qson"];

/** 1..99 -> "o'n besh" */
export function uzNumber(n: number): string {
  const k = Math.round(n);
  if (k <= 0 || k > 99) return String(k);
  const t = Math.floor(k / 10), o = k % 10;
  return [TENS[t], ONES[o]].filter(Boolean).join(" ");
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** 1 -> "Birinchi" */
export function uzOrdinal(n: number): string {
  const w = uzNumber(n);
  return cap(/[aeiou]$/.test(w) ? `${w}nchi` : `${w}inchi`);
}

// ---- Iboralar (generator ham, server tekshiruvi ham shulardan foydalanadi) ----
export const P = {
  intro: (label: string) => `Mashqni boshlaymiz. Bugun: ${label}. Telefonni yoningizga qo'ying va mening ovozimga quloq soling.`,
  timed: (name: string, minutes: number, how: string) => `${name}. ${cap(uzNumber(minutes))} daqiqa. ${how}`,
  half: "Yarmi o'tdi. Zo'r ketyapsiz!",
  last10: "Oxirgi o'n soniya!",
  setStart: (name: string, how: string | null, set: number, reps: number) =>
    `${how ? `${name}. ${how} ` : ""}${uzOrdinal(set)} yondashuv. ${cap(uzNumber(reps))} marta. Boshladik!`,
  count: (n: number) => cap(uzNumber(n)),
  otherSide: "Endi boshqa tomonga.",
  rest: (sec: number) => `Dam oling. ${cap(uzNumber(sec))} soniya.`,
  hold: (name: string, how: string | null, sec: number) => `${how ? `${name}. ${how} ` : ""}${cap(uzNumber(sec))} soniya. O'ng oyoq.`,
  holdLeft: "Endi chap oyoq.",
  go: "Boshladik!",
  done: "Barakalla! Bugungi mashq tugadi. Endi qanchalik qiyin bo'lganini belgilang.",
};

export const REST_SECONDS = 40;
export const SECONDS_PER_REP = 3.5;
const SIDED = new Set(["bird_dog", "side_lying_leg"]);

export type CoachStep =
  | { kind: "say"; text: string; title: string; item: number }
  | { kind: "timer"; seconds: number; title: string; item: number; cues: { at: number; say: string }[] }
  | { kind: "count"; reps: number; title: string; item: number }
  | { kind: "rest"; seconds: number; title: string; item: number };

/** Mashg'ulot -> qadamlar ketma-ketligi. */
export function coachSteps(s: CoachSession): CoachStep[] {
  const out: CoachStep[] = [{ kind: "say", text: P.intro(s.label), title: s.label, item: -1 }];
  s.items.forEach((it: ExerciseItem, i) => {
    if (it.minutes) {
      const sec = it.minutes * 60;
      out.push({ kind: "say", text: P.timed(it.name, it.minutes, it.how), title: it.name, item: i });
      const cues = [{ at: Math.round(sec / 2), say: P.half }];
      if (sec >= 60) cues.push({ at: sec - 10, say: P.last10 });
      out.push({ kind: "timer", seconds: sec, title: it.name, item: i, cues });
      return;
    }
    const sets = Math.max(1, it.sets ?? 1);
    for (let set = 1; set <= sets; set++) {
      const how = set === 1 ? it.how : null;
      if (it.reps) {
        out.push({ kind: "say", text: P.setStart(it.name, how, set, it.reps), title: `${it.name} · ${set}/${sets}`, item: i });
        out.push({ kind: "count", reps: it.reps, title: `${it.name} · ${set}/${sets}`, item: i });
        if (SIDED.has(it.id)) {
          out.push({ kind: "say", text: P.otherSide, title: it.name, item: i });
          out.push({ kind: "count", reps: it.reps, title: `${it.name} · ${set}/${sets}`, item: i });
        }
      } else if (it.seconds) {
        out.push({ kind: "say", text: P.hold(it.name, how, it.seconds), title: `${it.name} · ${set}/${sets}`, item: i });
        out.push({ kind: "timer", seconds: it.seconds, title: it.name, item: i, cues: [] });
        out.push({ kind: "say", text: P.holdLeft, title: it.name, item: i });
        out.push({ kind: "timer", seconds: it.seconds, title: it.name, item: i, cues: [] });
      }
      if (set < sets) {
        out.push({ kind: "say", text: P.rest(REST_SECONDS), title: "Dam olish", item: i });
        out.push({ kind: "rest", seconds: REST_SECONDS, title: "Dam olish", item: i });
      }
    }
  });
  out.push({ kind: "say", text: P.done, title: "Tugadi", item: s.items.length });
  return out;
}

/** Qadamlar uchun kerak bo'ladigan barcha iboralar (oldindan yuklash uchun). */
export function stepPhrases(steps: CoachStep[]): string[] {
  const set = new Set<string>();
  for (const st of steps) {
    if (st.kind === "say") set.add(st.text);
    if (st.kind === "timer") st.cues.forEach((c) => set.add(c.say));
    if (st.kind === "count") for (let n = 1; n <= st.reps; n++) set.add(P.count(n));
  }
  set.add(P.go);
  return [...set];
}

const LABELS = ["Kuch mashqlari", "Yurish + muvozanat", "Aerob mashq"];

/** Server ruxsat beradigan barcha iboralar. */
export function allCoachPhrases(): Set<string> {
  const s = new Set<string>([P.half, P.last10, P.otherSide, P.holdLeft, P.go, P.done, P.rest(REST_SECONDS)]);
  LABELS.forEach((l) => s.add(P.intro(l)));
  for (let n = 1; n <= 20; n++) s.add(P.count(n));
  for (const e of Object.values(EXERCISES)) {
    for (let m = 1; m <= 60; m++) s.add(P.timed(e.name, m, e.how));
    for (let set = 1; set <= 3; set++) {
      for (let r = 1; r <= 20; r++) s.add(P.setStart(e.name, set === 1 ? e.how : null, set, r));
    }
    for (const sec of [10, 15, 20, 30, 45, 60]) {
      s.add(P.hold(e.name, e.how, sec));
      s.add(P.hold(e.name, null, sec));
    }
  }
  return s;
}

/** Iboraning barqaror kaliti (kesh fayl nomi uchun). */
export async function phraseKey(text: string, voice: string): Promise<string> {
  const data = new TextEncoder().encode(`${voice}|${text}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}
