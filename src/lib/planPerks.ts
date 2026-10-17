// Free / Pro / Premium limits, emergency credit (debt) and lab-result reading.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FALLBACK_STATUS, normalizeStatus, type PlanId, type PlanLimits, type PlanStatus } from "../../supabase/functions/_shared/plan.ts";
import type { LabItem } from "../../supabase/functions/_shared/lab-report.ts";
import type { AiReply, Lang } from "@/lib/aiAssistant";

export * from "../../supabase/functions/_shared/plan.ts";
export type { LabItem, LabFlag } from "../../supabase/functions/_shared/lab-report.ts";

export type PlanLimitsRow = PlanLimits & { plan_id: PlanId; updated_at?: string };

async function functionError(error: any, fallback: string): Promise<Error & { code?: string }> {
  try {
    const body = await error?.context?.json?.();
    if (body?.error) return Object.assign(new Error(body.error), { code: body.code as string | undefined });
  } catch {
    /* ignore */
  }
  return new Error(error?.message || fallback);
}

export async function loadPlanStatus(): Promise<PlanStatus> {
  const { data, error } = await supabase.rpc("my_plan_status" as any);
  if (error) {
    console.warn("my_plan_status unavailable", error.message);
    return FALLBACK_STATUS;
  }
  return normalizeStatus(data);
}

/** Current user's plan status; refresh() after a payment. */
export function usePlanStatus(enabled: boolean) {
  const [status, setStatus] = useState<PlanStatus | null>(null);
  const refresh = useCallback(async () => {
    if (!enabled) return null;
    const s = await loadPlanStatus();
    setStatus(s);
    return s;
  }, [enabled]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { status, refresh };
}

/** Same values as the plan_limits seed in migration 0003; used until the table exists. */
export const DEFAULT_PLAN_LIMITS: PlanLimitsRow[] = [
  {
    plan_id: "free", ai_daily_questions: 5, video_free_minutes: 10, health_ai: false, lab_reads_monthly: 0, emergency_credit_uzs: 50000,
    queue_boost: 0, queue_first_monthly: 0, queue_first_price_uzs: null, followup_hours: 0, second_opinions_monthly: 0,
    home_diary: false, weekly_report: false, emergency_card: false, family_members: 0,
  },
  {
    plan_id: "pro", ai_daily_questions: 50, video_free_minutes: 20, health_ai: true, lab_reads_monthly: 5, emergency_credit_uzs: 100000,
    queue_boost: 4, queue_first_monthly: 1, queue_first_price_uzs: 15000, followup_hours: 72, second_opinions_monthly: 0,
    home_diary: true, weekly_report: true, emergency_card: true, family_members: 0,
  },
  {
    plan_id: "premium", ai_daily_questions: null, video_free_minutes: 30, health_ai: true, lab_reads_monthly: 20, emergency_credit_uzs: 150000,
    queue_boost: 6, queue_first_monthly: 3, queue_first_price_uzs: 10000, followup_hours: 72, second_opinions_monthly: 1,
    home_diary: true, weekly_report: true, emergency_card: true, family_members: 4,
  },
];

export async function loadPlanLimits(): Promise<PlanLimitsRow[]> {
  const { data } = await supabase.from("plan_limits" as any).select("*");
  const order: PlanId[] = ["free", "pro", "premium"];
  // Columns added by a later migration may be missing in an older database: fill them from the defaults.
  return ((data as unknown as Partial<PlanLimitsRow>[] | null) ?? [])
    .map((r) => ({ ...DEFAULT_PLAN_LIMITS.find((d) => d.plan_id === r.plan_id)!, ...Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined)) }) as PlanLimitsRow)
    .filter((r) => order.includes(r.plan_id))
    .sort((a, b) => order.indexOf(a.plan_id) - order.indexOf(b.plan_id));
}

export async function startConsultationOnCredit(doctorId: string, familyMemberId: string | null = null): Promise<string> {
  const { data, error } = await supabase.rpc("create_consultation_on_credit" as any, { _doctor_id: doctorId, _family_member_id: familyMemberId });
  if (error) throw new Error(error.message);
  return data as unknown as string;
}

export async function repayDebt(): Promise<{ paid_uzs: number; balance_uzs: number; debt_uzs: number }> {
  const { data, error } = await supabase.rpc("repay_emergency_credit" as any);
  if (error) throw new Error(error.message);
  return data as unknown as { paid_uzs: number; balance_uzs: number; debt_uzs: number };
}

export interface CreditRow {
  id: string;
  consultation_id: string | null;
  amount_uzs: number;
  repaid_uzs: number;
  status: "open" | "repaid" | "cancelled";
  created_at: string;
  settled_at: string | null;
}

export async function loadCredits(): Promise<CreditRow[]> {
  const { data } = await supabase.from("emergency_credits" as any).select("*").order("created_at", { ascending: false }).limit(50);
  return (data as unknown as CreditRow[] | null) ?? [];
}

export const isDebtError = (message: string) => /qarz/i.test(message);

export interface LabReply extends AiReply {
  lab_date: string | null;
  items: LabItem[];
  quota: { left: number; limit: number } | null;
}

export async function readLabResult(params: { base64: string; mimeType: string; language: Lang }): Promise<LabReply> {
  const { data, error } = await supabase.functions.invoke("read-lab-result", {
    body: { file_base64: params.base64, mime_type: params.mimeType, language: params.language },
  });
  if (error) throw await functionError(error, "AI bilan bog'lanib bo'lmadi");
  if (data?.error) throw Object.assign(new Error(data.error), { code: data.code });
  return data as LabReply;
}

export const PLAN_NAMES: Record<PlanId, string> = { free: "Free", pro: "Pro", premium: "Premium" };
