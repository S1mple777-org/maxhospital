// Pro / Premium care features: family, emergency card, second opinion, home diary, weekly report.
import { supabase } from "@/integrations/supabase/client";
import type { Lang } from "@/lib/aiAssistant";
import type { HomeAlert } from "../../supabase/functions/_shared/home-alerts.ts";

export { orderQueue } from "../../supabase/functions/_shared/queue.ts";
export type { HomeAlert } from "../../supabase/functions/_shared/home-alerts.ts";

async function fnError(error: any, fallback: string): Promise<Error & { code?: string }> {
  try {
    const body = await error?.context?.json?.();
    if (body?.error) return Object.assign(new Error(body.error), { code: body.code as string | undefined });
  } catch {
    /* ignore */
  }
  return new Error(error?.message || fallback);
}

// ---- Family -------------------------------------------------------------------
export type Relation = "child" | "parent" | "spouse" | "sibling" | "grandparent" | "other";
export const RELATIONS: Record<Relation, string> = {
  child: "Farzand", parent: "Ota-ona", spouse: "Turmush o'rtoq", sibling: "Aka-uka / opa-singil", grandparent: "Bobo / buvi", other: "Boshqa",
};

export interface FamilyMember {
  id: string;
  full_name: string;
  relation: Relation;
  birth_date: string | null;
  gender: "male" | "female" | null;
  notes: string | null;
}

export async function loadFamily(): Promise<FamilyMember[]> {
  const { data, error } = await supabase.from("family_members" as any).select("*").order("created_at");
  if (error) return [];
  return (data as unknown as FamilyMember[]) ?? [];
}

export async function addFamilyMember(m: Omit<FamilyMember, "id">): Promise<FamilyMember> {
  const { data, error } = await supabase.rpc("add_family_member" as any, {
    _full_name: m.full_name, _relation: m.relation, _birth_date: m.birth_date || null, _gender: m.gender || null, _notes: m.notes || null,
  });
  if (error) throw new Error(error.message);
  return data as unknown as FamilyMember;
}

export async function updateFamilyMember(id: string, m: Omit<FamilyMember, "id">): Promise<void> {
  const { error } = await (supabase.from("family_members" as any) as any)
    .update({ full_name: m.full_name.trim(), relation: m.relation, birth_date: m.birth_date || null, gender: m.gender || null, notes: m.notes || null })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteFamilyMember(id: string): Promise<void> {
  const { error } = await supabase.from("family_members" as any).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export const ageOf = (birth: string | null) => {
  if (!birth) return null;
  const b = new Date(birth);
  const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a;
};

// ---- Emergency card -----------------------------------------------------------
export const BLOOD_TYPES = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"] as const;

export interface EmergencyCard {
  id?: string;
  family_member_id: string | null;
  token?: string;
  blood_type: string | null;
  allergies: string | null;
  conditions: string | null;
  medications: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  notes: string | null;
  is_enabled: boolean;
  updated_at?: string;
  // MaxHospital Passport
  birth_date: string | null;
  gender: "male" | "female" | null;
  height_cm: number | null;
  weight_kg: number | null;
  address: string | null;
  surgeries: string | null;
  vaccinations: string | null;
  family_history: string | null;
  insurance: string | null;
  organ_donor: boolean | null;
  doctor_name: string | null;
  doctor_phone: string | null;
  contact2_name: string | null;
  contact2_phone: string | null;
  visibility: Record<string, boolean>;
}

/** Which passport sections the patient can show or hide behind the QR code. */
export const PASSPORT_SECTIONS = [
  { key: "full_name", label: "Ism-familiya", defaultVisible: true },
  { key: "birth_date", label: "Tug'ilgan yil", defaultVisible: true },
  { key: "gender", label: "Jinsi", defaultVisible: false },
  { key: "body", label: "Bo'y va vazn", defaultVisible: false },
  { key: "address", label: "Yashash manzili", defaultVisible: false },
  { key: "blood_type", label: "Qon guruhi", defaultVisible: true },
  { key: "allergies", label: "Allergiyalar", defaultVisible: true },
  { key: "conditions", label: "Surunkali kasalliklar", defaultVisible: true },
  { key: "medications", label: "Doimiy dorilar", defaultVisible: true },
  { key: "notes", label: "Qo'shimcha eslatma", defaultVisible: true },
  { key: "surgeries", label: "O'tkazilgan operatsiyalar", defaultVisible: false },
  { key: "vaccinations", label: "Emlashlar", defaultVisible: false },
  { key: "family_history", label: "Oilaviy kasalliklar", defaultVisible: false },
  { key: "contact", label: "Yaqin odam", defaultVisible: true },
  { key: "contact2", label: "Ikkinchi yaqin odam", defaultVisible: false },
  { key: "doctor", label: "Davolovchi shifokor", defaultVisible: false },
  { key: "insurance", label: "Sug'urta", defaultVisible: false },
  { key: "organ_donor", label: "Organ donorligi", defaultVisible: false },
] as const;
export type PassportSectionKey = (typeof PASSPORT_SECTIONS)[number]["key"];

export const isSectionVisible = (v: Record<string, boolean> | null | undefined, key: PassportSectionKey) => {
  const def = PASSPORT_SECTIONS.find((x) => x.key === key)?.defaultVisible ?? false;
  return typeof v?.[key] === "boolean" ? v[key] : def;
};

export async function loadEmergencyCards(): Promise<EmergencyCard[]> {
  const { data, error } = await supabase.from("emergency_cards" as any).select("*");
  if (error) return [];
  return ((data as unknown as EmergencyCard[]) ?? []).map((c) => ({ ...c, visibility: c.visibility ?? {} }));
}

export async function saveEmergencyCard(c: EmergencyCard, regenerate = false): Promise<EmergencyCard> {
  const num = (x: unknown) => (x === null || x === undefined || x === "" ? "" : String(x));
  const d = {
    blood_type: c.blood_type || "", allergies: c.allergies || "", conditions: c.conditions || "",
    medications: c.medications || "", contact_name: c.contact_name || "", contact_phone: c.contact_phone || "",
    notes: c.notes || "", birth_date: c.birth_date || "", gender: c.gender || "",
    height_cm: num(c.height_cm), weight_kg: num(c.weight_kg), address: c.address || "",
    surgeries: c.surgeries || "", vaccinations: c.vaccinations || "", family_history: c.family_history || "",
    insurance: c.insurance || "", organ_donor: c.organ_donor, doctor_name: c.doctor_name || "",
    doctor_phone: c.doctor_phone || "", contact2_name: c.contact2_name || "", contact2_phone: c.contact2_phone || "",
  };
  const { data, error } = await supabase.rpc("save_passport" as any, {
    _family_member_id: c.family_member_id, _d: d, _visibility: c.visibility ?? {},
    _is_enabled: c.is_enabled, _regenerate: regenerate,
  });
  if (error) {
    if (/_phone/.test(error.message)) throw new Error("Telefon raqami noto'g'ri. Masalan: +998 90 123 45 67");
    throw new Error(error.message);
  }
  return data as unknown as EmergencyCard;
}

export interface PublicEmergencyCard {
  full_name: string | null;
  birth_year: number | null;
  gender: "male" | "female" | null;
  height_cm: number | null;
  weight_kg: number | null;
  address: string | null;
  blood_type: string | null;
  allergies: string | null;
  conditions: string | null;
  medications: string | null;
  notes: string | null;
  surgeries: string | null;
  vaccinations: string | null;
  family_history: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact2_name: string | null;
  contact2_phone: string | null;
  doctor_name: string | null;
  doctor_phone: string | null;
  insurance: string | null;
  organ_donor: boolean | null;
  updated_at: string;
}

export async function loadPublicEmergencyCard(token: string): Promise<PublicEmergencyCard | null> {
  const { data, error } = await supabase.rpc("get_emergency_card" as any, { _token: token });
  if (error) throw new Error(error.message);
  return ((data as unknown as PublicEmergencyCard[]) ?? [])[0] ?? null;
}

export function emergencyCardUrl(token: string): string {
  const base = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined) || "https://maxhospital.lovable.app";
  return `${base.replace(/\/$/, "")}/e/${token}`;
}

// ---- Second opinion -------------------------------------------------------------
export interface SecondOpinion {
  id: string;
  consultation_id: string;
  question: string | null;
  status: "pending" | "answered";
  verdict: "agree" | "partly" | "disagree" | null;
  answer: string | null;
  created_at: string;
  answered_at: string | null;
}

export const VERDICTS: Record<"agree" | "partly" | "disagree", { label: string; cls: string }> = {
  agree: { label: "Roziman", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  partly: { label: "Qisman roziman", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  disagree: { label: "Boshqacha fikrdaman", cls: "bg-red-500/15 text-red-700 dark:text-red-400" },
};

export async function loadMySecondOpinions(): Promise<SecondOpinion[]> {
  const { data, error } = await supabase.from("second_opinions" as any).select("*").order("created_at", { ascending: false });
  if (error) return [];
  return (data as unknown as SecondOpinion[]) ?? [];
}

export async function requestSecondOpinion(consultationId: string, question: string): Promise<void> {
  const { error } = await supabase.rpc("request_second_opinion" as any, { _consultation_id: consultationId, _question: question });
  if (error) throw new Error(error.message);
}

export interface SecondOpinionRequest {
  id: string;
  status: "pending" | "answered";
  created_at: string;
  question: string | null;
  department_name: string | null;
  original_doctor_title: string | null;
  diagnosis: string | null;
  medicines: { name?: string; dose?: string; frequency?: string; duration?: string }[] | null;
  notes: string | null;
  patient_birth_year: number | null;
  measurements: { metric: string; value: number; unit: string; at: string }[] | null;
  answer: string | null;
  verdict: "agree" | "partly" | "disagree" | null;
  answered_at: string | null;
}

export async function loadSecondOpinionRequests(): Promise<SecondOpinionRequest[]> {
  const { data, error } = await supabase.rpc("list_second_opinion_requests" as any);
  if (error) throw new Error(error.message);
  return (data as unknown as SecondOpinionRequest[]) ?? [];
}

export async function answerSecondOpinion(id: string, verdict: "agree" | "partly" | "disagree", answer: string): Promise<void> {
  const { error } = await supabase.rpc("answer_second_opinion" as any, { _id: id, _verdict: verdict, _answer: answer });
  if (error) throw new Error(error.message);
}

// ---- Home diary -----------------------------------------------------------------
export async function addHomeMeasurements(params: {
  items: { metric: string; value: number }[];
  measuredAt?: string;
  note?: string;
  language: Lang;
}): Promise<{ saved: number; alerts: HomeAlert[]; telegram: boolean }> {
  const { data, error } = await supabase.functions.invoke("home-measurement", {
    body: { items: params.items, measured_at: params.measuredAt, note: params.note, language: params.language },
  });
  if (error) throw await fnError(error, "Saqlab bo'lmadi");
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function deleteMeasurement(id: string): Promise<void> {
  const { error } = await supabase.from("health_measurements").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---- Weekly report --------------------------------------------------------------
export interface WeeklyReport {
  id: string;
  period_start: string;
  period_end: string;
  content: string;
  created_at: string;
  sent_telegram: boolean;
}

export async function loadLatestWeeklyReport(): Promise<WeeklyReport | null> {
  const { data, error } = await supabase.from("weekly_reports" as any).select("*").order("period_start", { ascending: false }).limit(1);
  if (error) return null;
  return ((data as unknown as WeeklyReport[]) ?? [])[0] ?? null;
}

export async function generateWeeklyReport(language: Lang, refresh = false): Promise<WeeklyReport> {
  const { data, error } = await supabase.functions.invoke("weekly-report", { body: { mode: "user", language, refresh } });
  if (error) throw await fnError(error, "Hisobotni tayyorlab bo'lmadi");
  if (data?.error) throw new Error(data.error);
  return data.report as WeeklyReport;
}
