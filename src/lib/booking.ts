import { supabase } from "@/integrations/supabase/client";

// New RPCs / columns are not in the generated types yet.
const db = supabase as any;

export const SLOT_MINUTES = 30;
/** Patients can cancel a booking up to this long before it starts (the server checks the same). */
export const CANCEL_BEFORE_MS = 2 * 60 * 60_000;

export interface Slot { slot_at: string; taken: boolean }

export async function loadSlots(doctorId: string, days = 7): Promise<Slot[]> {
  const { data, error } = await db.rpc("get_doctor_slots", { _doctor_id: doctorId, _days: days });
  return error ? [] : (data as Slot[]);
}

async function rpcError(error: any): Promise<Error> {
  return new Error(error?.message || "Xatolik yuz berdi");
}

export async function bookConsultation(doctorId: string, slotAt: string, familyMemberId: string | null): Promise<string> {
  const { data, error } = await db.rpc("book_consultation", {
    _doctor_id: doctorId, _slot: slotAt, _family_member_id: familyMemberId,
  });
  if (error) throw await rpcError(error);
  return data as string;
}

export async function cancelBooking(consultationId: string): Promise<void> {
  const { error } = await db.rpc("cancel_booking", { _consultation_id: consultationId });
  if (error) throw await rpcError(error);
}

export interface QueueStatus {
  found: boolean;
  status?: string;
  booked?: boolean;
  scheduled_at?: string | null;
  position?: number;
  ahead?: number;
  busy?: boolean;
  avg_minutes?: number;
  estimate_minutes?: number;
  doctor_online?: boolean;
}

export async function loadQueueStatus(consultationId: string): Promise<QueueStatus> {
  const { data, error } = await db.rpc("queue_status", { _consultation_id: consultationId });
  return error || !data ? { found: false } : (data as QueueStatus);
}

/** Telegram message to the patient when the doctor accepts (the site notice comes from a DB trigger). */
export async function notifyPatientCalled(consultationId: string): Promise<void> {
  try {
    await supabase.functions.invoke("notify-consultation", { body: { consultation_id: consultationId } });
  } catch {
    /* the in-site notice is enough if Telegram fails */
  }
}

const TZ = "Asia/Tashkent";
export const fmtSlotTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
export const fmtSlotDay = (iso: string) =>
  new Date(iso).toLocaleDateString("uz-UZ", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
export const fmtSlotFull = (iso: string) => `${fmtSlotDay(iso)}, ${fmtSlotTime(iso)}`;
/** Tashkent calendar day key, for grouping slots by day. */
export const slotDayKey = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/** "~15 daqiqa", "~1 soat 10 daqiqa". */
export function fmtWait(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `~${m} daqiqa`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `~${h} soat ${r} daqiqa` : `~${h} soat`;
}
