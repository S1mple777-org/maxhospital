// Client-side helpers for Pro subscriptions and medication reminders.
import { supabase } from "@/integrations/supabase/client";
import type { PlanItem, PlanLang } from "../../supabase/functions/_shared/medication-plan.ts";

export * from "../../supabase/functions/_shared/medication-plan.ts";

export type PlanId = "free" | "pro" | "premium";
export type Channel = "web" | "telegram" | "app" | "sms";

export interface SubscriptionPlan {
  id: "pro" | "premium";
  name: string;
  price_uzs: number;
  period_days: number;
  sms_enabled: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface Subscription {
  user_id: string;
  plan_id: "pro" | "premium";
  status: "active" | "expired";
  current_period_end: string;
  auto_renew: boolean;
}

export interface MedicationSchedule {
  id: string;
  prescription_id: string | null;
  source: "prescription" | "upload" | "manual";
  medicine_name: string;
  dose: string | null;
  instructions: string | null;
  times: string[];
  start_date: string;
  days: number;
  timezone: string;
  channels: Channel[];
  is_active: boolean;
  created_at: string;
}

export interface MedicationReminder {
  id: string;
  notify_id: number;
  schedule_id: string;
  scheduled_at: string;
  status: "pending" | "sent" | "taken" | "skipped" | "missed";
}

export interface Routine {
  wake: string;
  breakfast: string;
  lunch: string;
  dinner: string;
  sleep: string;
}

export const DEFAULT_ROUTINE: Routine = { wake: "07:00", breakfast: "08:00", lunch: "13:00", dinner: "19:00", sleep: "23:00" };
export const TIMEZONE = "Asia/Tashkent";

/** Today in Tashkent as "YYYY-MM-DD". */
export const todayInTashkent = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

async function functionError(error: any, fallback: string): Promise<Error & { code?: string }> {
  try {
    const body = await error?.context?.json?.();
    if (body?.error) return Object.assign(new Error(body.error), { code: body.code });
  } catch {
    /* ignore */
  }
  return new Error(error?.message || fallback);
}

const isActive = (s: Subscription | null) =>
  !!s && s.status === "active" && new Date(s.current_period_end).getTime() > Date.now();

export async function loadSubscription(userId: string): Promise<{ plan: PlanId; subscription: Subscription | null }> {
  const { data } = await supabase.from("subscriptions" as any).select("*").eq("user_id", userId).maybeSingle();
  const sub = (data as Subscription | null) ?? null;
  return { plan: isActive(sub) ? sub!.plan_id : "free", subscription: sub };
}

export async function loadPlans(): Promise<SubscriptionPlan[]> {
  const { data } = await supabase.from("subscription_plans" as any).select("*").order("sort_order");
  return (data as SubscriptionPlan[] | null) ?? [];
}

export async function subscribe(planId: "pro" | "premium"): Promise<Subscription> {
  const { data, error } = await supabase.rpc("subscribe_plan" as any, { _plan_id: planId });
  if (error) throw new Error(error.message);
  return data as Subscription;
}

export async function setAutoRenew(enabled: boolean): Promise<void> {
  const { error } = await supabase.rpc("set_subscription_auto_renew" as any, { _enabled: enabled });
  if (error) throw new Error(error.message);
}

export interface DraftPlan {
  source: "prescription" | "upload";
  prescription_id: string | null;
  items: PlanItem[];
  warnings: string[];
}

export async function draftPlanWithAi(params: {
  prescriptionId?: string;
  pdfBase64?: string;
  routine: Routine;
  note?: string;
  language: PlanLang;
}): Promise<DraftPlan> {
  const { data, error } = await supabase.functions.invoke("plan-medications", {
    body: {
      prescription_id: params.prescriptionId,
      pdf_base64: params.pdfBase64,
      routine: params.routine,
      note: params.note,
      language: params.language,
    },
  });
  if (error) throw await functionError(error, "AI bilan bog'lanib bo'lmadi");
  if (data?.error) throw new Error(data.error);
  return data as DraftPlan;
}

export async function saveSchedules(params: {
  items: Pick<PlanItem, "medicine_name" | "dose" | "instructions" | "times" | "days" | "start_date">[];
  source: "prescription" | "upload" | "manual";
  prescriptionId: string | null;
  channels: Channel[];
}): Promise<string[]> {
  const { data, error } = await supabase.rpc("create_medication_schedules" as any, {
    _items: params.items,
    _source: params.source,
    _prescription_id: params.prescriptionId,
    _channels: params.channels,
    _timezone: TIMEZONE,
  });
  if (error) throw new Error(error.message);
  return (data as string[] | null) ?? [];
}

export async function loadSchedules(): Promise<MedicationSchedule[]> {
  const { data } = await supabase.from("medication_schedules" as any).select("*").order("created_at", { ascending: false });
  return (data as MedicationSchedule[] | null) ?? [];
}

export async function loadReminders(fromIso: string, toIso: string): Promise<MedicationReminder[]> {
  const { data } = await supabase.from("medication_reminders" as any)
    .select("id, notify_id, schedule_id, scheduled_at, status")
    .gte("scheduled_at", fromIso).lt("scheduled_at", toIso)
    .order("scheduled_at")
    .limit(1000);
  return (data as MedicationReminder[] | null) ?? [];
}

export async function stopSchedule(id: string): Promise<void> {
  const { error } = await supabase.rpc("stop_medication_schedule" as any, { _schedule_id: id });
  if (error) throw new Error(error.message);
}

export async function deleteSchedule(id: string): Promise<void> {
  const { error } = await supabase.from("medication_schedules" as any).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function markReminder(id: string, status: "taken" | "skipped"): Promise<void> {
  const { error } = await supabase.rpc("mark_medication_reminder" as any, { _reminder_id: id, _status: status });
  if (error) throw new Error(error.message);
}

/** File -> base64 (without the data: prefix). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error ?? new Error("Faylni o'qib bo'lmadi"));
    reader.readAsDataURL(file);
  });
}

export const formatUzs = (n: number) => `${Number(n).toLocaleString("ru-RU").replace(/,/g, " ")} so'm`;
