import { supabase } from "@/integrations/supabase/client";

export * from "../../supabase/functions/_shared/sos.ts";

const db = supabase as any;

export interface SosContact { id: string; name: string; phone: string; relation: string | null }

export async function loadSosContacts(): Promise<SosContact[]> {
  const { data } = await db.from("sos_contacts").select("id, name, phone, relation").order("created_at");
  return (data ?? []) as SosContact[];
}

export async function addSosContact(c: { name: string; phone: string; relation: string }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Avval tizimga kiring");
  const { error } = await db.from("sos_contacts").insert({ user_id: user.id, name: c.name.trim(), phone: c.phone, relation: c.relation.trim() || null });
  if (error) throw new Error(/duplicate|unique/i.test(error.message) ? "Bu raqam allaqachon qo'shilgan" : error.message);
}

export async function removeSosContact(id: string) {
  const { error } = await db.from("sos_contacts").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Joylashuv (8 soniyagacha kutadi; ruxsat bo'lmasa null — SOS baribir ketadi). */
export function currentPosition(timeoutMs = 8000): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    const t = setTimeout(() => resolve(null), timeoutMs + 500);
    navigator.geolocation.getCurrentPosition(
      (p) => { clearTimeout(t); resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }); },
      () => { clearTimeout(t); resolve(null); },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

export interface SosResult {
  ok: boolean; event_id: string; app: number; telegram: number; sms: number; sms_failed: number;
  cost: number; debt: number; location: boolean;
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("sos", { body });
  if (error) {
    let msg = error.message;
    try { msg = (await (error as any).context?.json())?.error ?? msg; } catch { /* keep */ }
    throw new Error(msg);
  }
  return data as T;
}

export const triggerSos = (pos: { lat: number; lng: number; accuracy: number } | null) =>
  call<SosResult>({ action: "trigger", kind: "sos", ...(pos ?? {}) });

export const markSafe = (eventId: string) =>
  call<{ ok: boolean; app: number; telegram: number; sms: number; cost: number; debt: number }>({ action: "safe", event_id: eventId });
