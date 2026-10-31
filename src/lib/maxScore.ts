import { supabase } from "@/integrations/supabase/client";

export interface ScoreDay {
  day: string;
  score: number;
  meds: { taken: number; due: number; value: number } | null;
  move: { steps: number; fitness: boolean; value: number };
  check: boolean;
  passport: boolean;
}

export interface MaxScore {
  today: ScoreDay;
  week: ScoreDay[];
  avg7: number;
  streak: number;
  badges: string[];
  family: { name: string; today: number; avg7: number }[];
}

export async function loadMaxScore(): Promise<MaxScore | null> {
  const { data, error } = await (supabase as any).rpc("my_max_score");
  if (error) { console.warn("max score", error.message); return null; }
  return data as MaxScore | null;
}

export const BADGES: Record<string, { icon: string; title: string; text: string }> = {
  streak3: { icon: "🔥", title: "3 kun ketma-ket", text: "Uch kun ketma-ket 70+ ball" },
  streak7: { icon: "🏆", title: "Haftalik chempion", text: "Yetti kun ketma-ket 70+ ball" },
  meds_week: { icon: "💊", title: "Dori intizomi", text: "Hafta davomida birorta dori qolmadi" },
  steps10k: { icon: "👟", title: "10 000 qadam", text: "Bir kunda 10 000 qadam (MaxBand)" },
  fitness3: { icon: "💪", title: "Faol hafta", text: "Haftada 3 ta MaxFitness mashqi" },
};

export const scoreColor = (s: number) => (s >= 70 ? "text-emerald-600" : s >= 40 ? "text-amber-500" : "text-rose-600");
export const scoreLabel = (s: number) => (s >= 85 ? "A'lo" : s >= 70 ? "Yaxshi" : s >= 40 ? "O'rtacha" : "Past");

/** Eng ko'p ball qo'shadigan bitta maslahat (eng zaif qism). */
export function nextTip(d: ScoreDay): { text: string; to: string } | null {
  const opts: { gain: number; text: string; to: string }[] = [];
  if (d.meds && d.meds.value < 1) opts.push({ gain: 35 * (1 - d.meds.value), text: `Dorilarni belgilang: ${d.meds.taken}/${d.meds.due} ichildi`, to: "/medications" });
  if (d.move.value < 1) opts.push({ gain: 30 * (1 - d.move.value), text: d.move.steps ? `Yana ${Math.max(0, 7000 - d.move.steps).toLocaleString("ru-RU")} qadam yoki bugungi MaxFitness mashqi` : "Bugungi MaxFitness mashqini bajaring yoki 7000 qadam yuring", to: "/maxfitness" });
  if (!d.check) opts.push({ gain: 20, text: "Bosim, qand yoki pulsni o'lchab kiriting", to: "/health" });
  if (!d.passport) opts.push({ gain: 15, text: "Passport'ni to'ldiring: qon guruhi, tug'ilgan sana, yaqin raqami", to: "/emergency-card" });
  opts.sort((a, b) => b.gain - a.gain);
  return opts[0] ? { text: opts[0].text, to: opts[0].to } : null;
}
