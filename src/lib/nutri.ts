import { supabase } from "@/integrations/supabase/client";
import { loadEmergencyCards } from "@/lib/care";
import { conditionsFromText } from "@/lib/fitness";
import type { MealItem, NutriGoal, NutriProfile, Totals } from "../../supabase/functions/_shared/nutri.ts";

export * from "../../supabase/functions/_shared/nutri.ts";

const db = supabase as any;

export type MealKind = "breakfast" | "lunch" | "dinner" | "snack";
export const MEAL_UZ: Record<MealKind, string> = { breakfast: "Nonushta", lunch: "Tushlik", dinner: "Kechki ovqat", snack: "Yengil tamaddi" };

export function mealByTime(d = new Date()): MealKind {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", hour: "2-digit", hour12: false }).format(d));
  return h < 11 ? "breakfast" : h < 16 ? "lunch" : h < 22 ? "dinner" : "snack";
}

export interface MealRow { id: string; day: string; meal: MealKind; items: MealItem[]; totals: Totals; source: "photo" | "manual"; created_at: string }
export interface NutriSettings { goal: NutriGoal; activity: NutriProfile["activity"]; diabetes: boolean; hypertension: boolean; share_with_doctor: boolean }

export const todayTashkent = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date());

export async function loadMeals(days = 7): Promise<MealRow[]> {
  const from = new Date(Date.now() - (days - 1) * 864e5);
  const fromDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(from);
  const { data } = await db.from("nutri_meals").select("*").gte("day", fromDay).order("created_at", { ascending: false });
  return (data ?? []) as MealRow[];
}

export async function saveMeal(meal: MealKind, items: MealItem[], totals: Totals, source: "photo" | "manual") {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Avval tizimga kiring");
  const { error } = await db.from("nutri_meals").insert({ user_id: user.id, day: todayTashkent(), meal, items, totals, source });
  if (error) throw new Error(error.message);
}

export async function deleteMeal(id: string) {
  const { error } = await db.from("nutri_meals").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Sozlamalar + Passport'dan profil (yosh, jins, bo'y, vazn; kasalliklar — birinchi marta). */
export async function loadProfile(): Promise<{ settings: NutriSettings; profile: NutriProfile; saved: boolean }> {
  const { data: { user } } = await supabase.auth.getUser();
  const [{ data: s }, cards] = await Promise.all([
    db.from("nutri_settings").select("*").eq("user_id", user?.id).maybeSingle(),
    loadEmergencyCards(),
  ]);
  const c = cards.find((x) => !x.family_member_id);
  const guess = conditionsFromText(c?.conditions, c?.medications);
  const settings: NutriSettings = s ?? {
    goal: "keep", activity: "low", share_with_doctor: false,
    diabetes: guess.conditions.includes("diabetes"), hypertension: guess.conditions.includes("hypertension"),
  };
  const age = c?.birth_date ? Math.floor((Date.now() - Date.parse(c.birth_date)) / (365.25 * 864e5)) : null;
  return {
    saved: !!s,
    settings,
    profile: {
      age, sex: (c?.gender as any) ?? null, height_cm: c?.height_cm ? Number(c.height_cm) : null, weight_kg: c?.weight_kg ? Number(c.weight_kg) : null,
      activity: settings.activity, goal: settings.goal, diabetes: settings.diabetes, hypertension: settings.hypertension,
    },
  };
}

export async function saveSettings(s: NutriSettings) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Avval tizimga kiring");
  const { error } = await db.from("nutri_settings").upsert({ user_id: user.id, ...s, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

/** Rasmni kichraytiradi (1024 px, JPEG) — tezroq yuboriladi. */
export async function shrinkImage(file: File, max = 1024): Promise<{ data: string; mimeType: string; preview: string }> {
  const url = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * k); canvas.height = Math.round(img.height * k);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const preview = canvas.toDataURL("image/jpeg", 0.82);
  URL.revokeObjectURL(url);
  return { data: preview.split(",")[1], mimeType: "image/jpeg", preview };
}

export async function analyzePhoto(data: string, mimeType: string): Promise<{ is_food: boolean; items: MealItem[]; unknown: string[] }> {
  const { data: r, error } = await supabase.functions.invoke("nutri-photo", { body: { data, mimeType } });
  if (error) {
    let msg = error.message;
    try { msg = (await (error as any).context?.json())?.error ?? msg; } catch { /* keep */ }
    throw new Error(msg);
  }
  return r;
}

export interface ConsultNutrition { available: boolean; shared?: boolean; settings?: Partial<NutriSettings>; meals?: { day: string; meal: MealKind; items: MealItem[]; totals: Totals }[] }
export async function loadConsultationNutrition(consultationId: string): Promise<ConsultNutrition> {
  const { data, error } = await db.rpc("get_consultation_nutrition", { _consultation_id: consultationId, _days: 7 });
  return error || !data ? { available: false } : data;
}
