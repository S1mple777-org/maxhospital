import { supabase } from "@/integrations/supabase/client";

// New RPCs / table are not in the generated types yet.
const db = supabase as any;

export const WEEK_DAYS = [
  { key: "mon", label: "Dushanba" },
  { key: "tue", label: "Seshanba" },
  { key: "wed", label: "Chorshanba" },
  { key: "thu", label: "Payshanba" },
  { key: "fri", label: "Juma" },
  { key: "sat", label: "Shanba" },
  { key: "sun", label: "Yakshanba" },
] as const;

export type DayKey = (typeof WEEK_DAYS)[number]["key"];
export interface DayHours { on: boolean; from: string; to: string }
export type WorkHours = Partial<Record<DayKey, DayHours>>;

export const defaultWorkHours = (): Record<DayKey, DayHours> =>
  Object.fromEntries(
    WEEK_DAYS.map(({ key }) => [key, { on: key !== "sat" && key !== "sun", from: "09:00", to: "18:00" }]),
  ) as Record<DayKey, DayHours>;

export const normalizeWorkHours = (raw: unknown): Record<DayKey, DayHours> => {
  const base = defaultWorkHours();
  const src = (raw && typeof raw === "object" ? raw : {}) as WorkHours;
  const hasAny = Object.keys(src).length > 0;
  for (const { key } of WEEK_DAYS) {
    const d = src[key];
    if (d) base[key] = { on: !!d.on, from: d.from || "09:00", to: d.to || "18:00" };
    else if (hasAny) base[key] = { ...base[key], on: false };
  }
  return base;
};

export const hasWorkHours = (raw: unknown) => !!raw && typeof raw === "object" && Object.keys(raw as object).length > 0;

/** Current weekday key and "HH:MM" in Tashkent time. */
export function tashkentNow(): { day: DayKey; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = get("weekday").toLowerCase().slice(0, 3) as DayKey;
  const hour = get("hour") === "24" ? "00" : get("hour");
  return { day, time: `${hour}:${get("minute")}` };
}

export function isWorkingNow(raw: unknown): boolean | null {
  if (!hasWorkHours(raw)) return null;
  const hours = normalizeWorkHours(raw);
  const { day, time } = tashkentNow();
  const d = hours[day];
  return !!d?.on && d.from <= time && time < d.to;
}

export interface DoctorStats { patients: number; consultations: number; active: number }
export interface DoctorPatient {
  patient_id: string; full_name: string | null; phone: string | null;
  visits: number; last_visit: string; last_diagnosis: string | null;
}

export async function loadDoctorStats(doctorId: string): Promise<DoctorStats | null> {
  const { data } = await db.rpc("get_doctor_stats", { _doctor_id: doctorId });
  const row = Array.isArray(data) ? data[0] : data;
  return row ? { patients: Number(row.patients), consultations: Number(row.consultations), active: Number(row.active) } : null;
}

export async function loadDoctorContact(doctorId: string): Promise<{ home_address: string | null; show_home_address: boolean } | null> {
  const { data } = await db.rpc("get_doctor_contact", { _doctor_id: doctorId });
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}

export async function loadDoctorPatients(doctorId: string): Promise<DoctorPatient[]> {
  const { data, error } = await db.rpc("get_doctor_patients", { _doctor_id: doctorId });
  if (error) return [];
  return (data ?? []) as DoctorPatient[];
}

export async function loadDoctorPrivate(doctorId: string) {
  const { data } = await db.from("doctor_private").select("home_address, show_home_address").eq("doctor_id", doctorId).maybeSingle();
  return (data ?? null) as { home_address: string | null; show_home_address: boolean } | null;
}

export async function saveDoctorPrivate(doctorId: string, home_address: string, show_home_address: boolean) {
  const { error } = await db.from("doctor_private").upsert({
    doctor_id: doctorId, home_address: home_address.trim() || null, show_home_address, updated_at: new Date().toISOString(),
  });
  return error;
}
