// Free / Pro / Premium limits shared by the edge functions and the web app.
// The numbers live in the plan_limits table (owner panel); these helpers only read them.

export type PlanId = "free" | "pro" | "premium";

export interface PlanLimits {
  /** null = unlimited */
  ai_daily_questions: number | null;
  video_free_minutes: number;
  health_ai: boolean;
  lab_reads_monthly: number;
  emergency_credit_uzs: number;
}

export interface EmergencyCredit {
  id: string;
  consultation_id: string | null;
  amount_uzs: number;
  repaid_uzs: number;
  created_at: string;
}

export interface PlanStatus {
  plan: PlanId;
  limits: PlanLimits;
  usage: { ai_today: number; lab_month: number };
  debt_uzs: number;
  credit: EmergencyCredit | null;
}

/** Used when the limits cannot be read (e.g. the migration is not applied yet). */
export const FALLBACK_STATUS: PlanStatus = {
  plan: "free",
  limits: { ai_daily_questions: 5, video_free_minutes: 10, health_ai: false, lab_reads_monthly: 0, emergency_credit_uzs: 0 },
  usage: { ai_today: 0, lab_month: 0 },
  debt_uzs: 0,
  credit: null,
};

/** Questions left; null = unlimited. Never negative. */
export function remaining(limit: number | null | undefined, used: number): number | null {
  if (limit === null || limit === undefined) return null;
  return Math.max(0, limit - Math.max(0, used));
}

/**
 * How an emergency consultation would be paid.
 * balance is used first, the rest becomes a debt that must fit the plan's credit limit.
 */
export function emergencyQuote(params: { price: number; balance: number; creditLimit: number; debt: number }): {
  /** "enough": normal payment works; "debt": an unpaid credit exists; "limit": shortfall exceeds the limit */
  status: "enough" | "ok" | "debt" | "limit";
  fromBalance: number;
  credit: number;
} {
  const balance = Math.max(0, params.balance);
  const shortfall = Math.max(0, params.price - balance);
  if (params.debt > 0) return { status: "debt", fromBalance: 0, credit: 0 };
  if (shortfall === 0) return { status: "enough", fromBalance: params.price, credit: 0 };
  if (shortfall > params.creditLimit) return { status: "limit", fromBalance: balance, credit: shortfall };
  return { status: "ok", fromBalance: balance, credit: shortfall };
}

export function normalizeStatus(raw: any): PlanStatus {
  if (!raw || typeof raw !== "object") return FALLBACK_STATUS;
  const l = raw.limits ?? {};
  const plan: PlanId = raw.plan === "pro" || raw.plan === "premium" ? raw.plan : "free";
  return {
    plan,
    limits: {
      ai_daily_questions: l.ai_daily_questions === null || l.ai_daily_questions === undefined ? null : Number(l.ai_daily_questions),
      video_free_minutes: Number(l.video_free_minutes ?? 10),
      health_ai: !!l.health_ai,
      lab_reads_monthly: Number(l.lab_reads_monthly ?? 0),
      emergency_credit_uzs: Number(l.emergency_credit_uzs ?? 0),
    },
    usage: { ai_today: Number(raw.usage?.ai_today ?? 0), lab_month: Number(raw.usage?.lab_month ?? 0) },
    debt_uzs: Number(raw.debt_uzs ?? 0),
    credit: raw.credit ?? null,
  };
}
