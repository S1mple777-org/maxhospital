import { supabase } from "@/integrations/supabase/client";

// New table / RPCs are not in the generated types yet.
const db = supabase as any;

export type CheckinAnswer = "better" | "same" | "worse";

export const ANSWERS: { key: CheckinAnswer; emoji: string; label: string; cls: string }[] = [
  { key: "better", emoji: "😀", label: "Yaxshilandi", cls: "border-green-500/40 bg-green-500/10 text-green-700" },
  { key: "same", emoji: "😐", label: "O'zgarmadi", cls: "border-amber-500/40 bg-amber-500/10 text-amber-700" },
  { key: "worse", emoji: "😟", label: "Yomonlashdi", cls: "border-rose-500/40 bg-rose-500/10 text-rose-700" },
];
export const answerInfo = (a: string | null | undefined) => ANSWERS.find((x) => x.key === a) ?? null;

export interface Checkin {
  id: string; prescription_id: string; seq: number; due_at: string; answered_at: string | null;
  answer: CheckinAnswer | null; note: string | null;
}

export async function loadCheckins(prescriptionId: string): Promise<Checkin[]> {
  const { data, error } = await db.from("treatment_checkins")
    .select("id, prescription_id, seq, due_at, answered_at, answer, note")
    .eq("prescription_id", prescriptionId).order("seq");
  return error ? [] : (data as Checkin[]);
}

export async function answerCheckin(id: string, answer: CheckinAnswer, note?: string): Promise<"ok" | "already" | "error"> {
  const { data, error } = await db.rpc("answer_treatment_checkin", { _id: id, _answer: answer, _note: note || null });
  if (error) return "error";
  return data?.already ? "already" : "ok";
}

export interface CheckinPageInfo {
  found: boolean; seq?: number; answered?: boolean; answer?: CheckinAnswer | null;
  doctor_name?: string; prescribed_at?: string; days?: number;
}

export async function getCheckinByToken(token: string): Promise<CheckinPageInfo> {
  const { data, error } = await db.rpc("get_checkin_by_token", { _token: token });
  return error || !data ? { found: false } : (data as CheckinPageInfo);
}

export async function answerCheckinByToken(token: string, answer: CheckinAnswer, note?: string): Promise<"ok" | "already" | "error"> {
  const { data, error } = await db.rpc("answer_checkin_by_token", { _token: token, _answer: answer, _note: note || null });
  if (error || !data?.ok && !data?.already) return "error";
  return data.already ? "already" : "ok";
}

export interface OverviewRow {
  checkin_id: string; prescription_id: string; patient_name: string; diagnosis: string; seq: number;
  due_at: string; answered_at: string | null; answer: CheckinAnswer | null; note: string | null;
  doses_taken: number; doses_skipped: number; doses_missed: number;
}

export async function loadDoctorOverview(days = 30): Promise<OverviewRow[]> {
  const { data, error } = await db.rpc("doctor_treatment_overview", { _days: days });
  return error ? [] : (data as OverviewRow[]);
}
