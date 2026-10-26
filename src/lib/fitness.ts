import { supabase } from "@/integrations/supabase/client";
import {
  conditionsFromText, generatePlan,
  type Condition, type FitnessAnswers, type FitnessPlan,
} from "../../supabase/functions/_shared/fitness.ts";

export * from "../../supabase/functions/_shared/fitness.ts";

// New tables / RPCs are not in the generated types yet.
const db = supabase as any;

export type FitnessStatus = "pending_doctor" | "active" | "rejected" | "archived";

export interface FitnessPlanRow {
  id: string;
  status: FitnessStatus;
  risk_reasons: string[];
  questionnaire: FitnessAnswers;
  plan: FitnessPlan;
  doctor_id: string | null;
  doctor_note: string | null;
  reviewed_at: string | null;
  start_date: string;
  reminder_enabled: boolean;
  reminder_time: string;
  adapt_factor: number;
  created_at: string;
}

export interface FitnessSessionRow { id: string; day: string; week: number; rpe: number; pain: boolean; note: string | null }

export const todayTashkent = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date());

/** Ko'rsatish uchun reja doim anketa + joriy koeffitsientdan qayta tuziladi (kod bir xil natija beradi). */
export const livePlan = (row: Pick<FitnessPlanRow, "questionnaire" | "adapt_factor">) =>
  generatePlan(row.questionnaire, Number(row.adapt_factor) || 1);

export async function loadMyFitness(): Promise<{ plan: FitnessPlanRow | null; sessions: FitnessSessionRow[] }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { plan: null, sessions: [] };
  const { data } = await db.from("fitness_plans").select("*").eq("user_id", user.id)
    .in("status", ["pending_doctor", "active", "rejected"]).order("created_at", { ascending: false }).limit(1);
  const plan = (data?.[0] as FitnessPlanRow | undefined) ?? null;
  if (!plan) return { plan: null, sessions: [] };
  const { data: s } = await db.from("fitness_sessions").select("id, day, week, rpe, pain, note")
    .eq("plan_id", plan.id).order("day", { ascending: false }).limit(200);
  return { plan, sessions: (s ?? []) as FitnessSessionRow[] };
}

/** Passport dan anketa uchun boshlang'ich qiymatlar. */
export async function passportDefaults(): Promise<Partial<FitnessAnswers>> {
  const { data } = await supabase.from("emergency_cards" as any).select("*").is("family_member_id", null).limit(1);
  const c = (data?.[0] ?? null) as any;
  if (!c) return {};
  const age = c.birth_date ? Math.floor((Date.now() - Date.parse(c.birth_date)) / (365.25 * 86_400_000)) : undefined;
  const parsed = conditionsFromText(c.conditions, c.medications);
  return {
    age: age && age > 0 && age < 120 ? age : undefined,
    sex: c.gender === "male" || c.gender === "female" ? c.gender : null,
    height_cm: c.height_cm ? Number(c.height_cm) : null,
    weight_kg: c.weight_kg ? Number(c.weight_kg) : null,
    conditions: parsed.conditions as Condition[],
    beta_blocker: parsed.beta_blocker,
  };
}

export interface MyDoctor { id: string; name: string; title: string | null }

/** Bemor bilan konsultatsiya o'tkazgan shifokorlar (faqat ular rejani tasdiqlay oladi). */
export async function loadMyDoctors(): Promise<MyDoctor[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase.from("consultations").select("doctor_id")
    .eq("patient_id", user.id).in("status", ["completed", "active"]).limit(200);
  const ids = [...new Set((data ?? []).map((r: any) => r.doctor_id).filter(Boolean))] as string[];
  if (!ids.length) return [];
  const { data: docs } = await supabase.from("doctors").select("id, user_id, title").in("id", ids);
  return Promise.all((docs ?? []).map(async (d: any) => {
    const { data: p } = await supabase.from("profiles").select("full_name").eq("user_id", d.user_id).maybeSingle();
    return { id: d.id, name: (p as any)?.full_name || "Shifokor", title: d.title ?? null };
  }));
}

const errMsg = (e: any) => String(e?.message || "Xatolik yuz berdi");

export async function saveFitnessPlan(answers: FitnessAnswers, plan: FitnessPlan, doctorId: string | null, reminderTime: string) {
  const { data, error } = await db.rpc("save_fitness_plan", {
    _questionnaire: answers, _plan: plan, _doctor_id: doctorId, _start_date: null, _reminder_time: reminderTime,
  });
  if (error) throw new Error(errMsg(error));
  return data as { id: string; status: FitnessStatus; risk_reasons: string[] };
}

export async function logFitnessSession(planId: string, day: string, rpe: number, pain: boolean, note: string) {
  const { data, error } = await db.rpc("log_fitness_session", { _plan_id: planId, _day: day, _rpe: rpe, _pain: pain, _note: note || null });
  if (error) throw new Error(errMsg(error));
  return data as { adapt_factor: number; previous: number; reason: "pain" | "hard" | "easy" | null; week: number };
}

export async function setFitnessReminder(planId: string, enabled: boolean, time: string) {
  const { error } = await db.rpc("set_fitness_reminder", { _plan_id: planId, _enabled: enabled, _time: time });
  if (error) throw new Error(errMsg(error));
}

export async function archiveFitnessPlan(planId: string) {
  const { error } = await db.rpc("archive_fitness_plan", { _plan_id: planId });
  if (error) throw new Error(errMsg(error));
}

// ---- Shifokor ---------------------------------------------------------------
export interface DoctorFitnessRow {
  plan_id: string; status: FitnessStatus; patient_id: string; patient_name: string; risk_reasons: string[];
  questionnaire: FitnessAnswers; created_at: string; sessions: number; last_pain: boolean | null; avg_rpe: number | null;
}

export async function loadDoctorFitness(): Promise<DoctorFitnessRow[]> {
  const { data, error } = await db.rpc("list_fitness_for_doctor");
  return error ? [] : (data as DoctorFitnessRow[]);
}

export async function reviewFitnessPlan(planId: string, approve: boolean, note: string) {
  const { error } = await db.rpc("review_fitness_plan", { _plan_id: planId, _approve: approve, _note: note || null });
  if (error) throw new Error(errMsg(error));
}
