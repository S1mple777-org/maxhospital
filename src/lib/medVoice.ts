import { supabase } from "@/integrations/supabase/client";
import { isNativeApp } from "@/lib/native";
import { AppInstaller, hasNativeTools } from "@/lib/nativeTools";

/**
 * Yaqinning ovozidagi dori eslatmasi.
 *  - Yozish: mikrofon -> 16 kHz mono WAV (≤ 15 s) -> base64 -> med_voice_notes.
 *  - Ilova (APK 1.0.31+): faol ovoz bildirishnoma kanalining ovozi bo'ladi — budilnik o'rniga shu ovoz chalinadi.
 *  - Sayt: eslatma kelganda shu ovoz o'ynaladi.
 */
const db = supabase as any;
export const MAX_VOICE_MS = 15_000;
const RATE = 16_000;

export interface VoiceTarget { user_id: string; name: string; is_me: boolean }
export interface VoiceNote { id: string; wearer_id: string; recorded_by: string; label: string; duration_ms: number; is_active: boolean; created_at: string }

export async function loadVoiceTargets(): Promise<VoiceTarget[]> {
  const { data } = await db.rpc("voice_targets");
  return (data ?? []) as VoiceTarget[];
}

export async function loadVoiceNotes(wearerId: string): Promise<VoiceNote[]> {
  const { data } = await db.from("med_voice_notes")
    .select("id, wearer_id, recorded_by, label, duration_ms, is_active, created_at")
    .eq("wearer_id", wearerId).order("created_at", { ascending: false });
  return (data ?? []) as VoiceNote[];
}

export async function voiceAudio(id: string): Promise<string | null> {
  const { data } = await db.from("med_voice_notes").select("audio_b64").eq("id", id).maybeSingle();
  return data?.audio_b64 ?? null;
}

export async function saveVoiceNote(wearerId: string, label: string, b64: string, durationMs: number) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Avval tizimga kiring");
  const { error } = await db.from("med_voice_notes").insert({
    wearer_id: wearerId, recorded_by: user.id, label: label.trim(), audio_b64: b64, duration_ms: Math.round(durationMs),
  });
  if (error) throw new Error(error.message);
}

export async function setActiveVoice(id: string | null) {
  const { error } = await db.rpc("set_active_voice", { _id: id });
  if (error) throw new Error(error.message);
  if (isNativeApp()) { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
}

export async function deleteVoiceNote(id: string) {
  const { error } = await db.from("med_voice_notes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---- Yozish ----------------------------------------------------------------------

export interface Recording { stop: () => Promise<{ b64: string; durationMs: number; url: string }>; cancel: () => void }

export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const rec = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const t0 = performance.now();
  rec.start();
  const auto = setTimeout(() => { if (rec.state === "recording") rec.stop(); }, MAX_VOICE_MS);
  const finished = new Promise<void>((r) => { rec.onstop = () => r(); });
  const release = () => { clearTimeout(auto); stream.getTracks().forEach((t) => t.stop()); };
  return {
    cancel: () => { if (rec.state === "recording") rec.stop(); release(); },
    stop: async () => {
      if (rec.state === "recording") rec.stop();
      await finished;
      release();
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      const { wav, durationMs } = await toWav(blob, Math.min(MAX_VOICE_MS, performance.now() - t0));
      return { b64: await blobToBase64(wav), durationMs, url: URL.createObjectURL(wav) };
    },
  };
}

/** Har qanday yozuv -> 16 kHz mono 16-bit WAV, boshidagi/oxiridagi jimlik qirqiladi, ovoz balandligi tekislanadi. */
async function toWav(blob: Blob, fallbackMs: number): Promise<{ wav: Blob; durationMs: number }> {
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new AC();
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const src = buf.getChannelData(0);
    const ratio = buf.sampleRate / RATE;
    const n = Math.floor(src.length / ratio);
    let mono = new Float32Array(n);
    for (let i = 0; i < n; i++) mono[i] = src[Math.floor(i * ratio)];
    // jimlikni qirqish
    const thr = 0.02;
    let a = 0, b = n - 1;
    while (a < n && Math.abs(mono[a]) < thr) a++;
    while (b > a && Math.abs(mono[b]) < thr) b--;
    mono = mono.slice(Math.max(0, a - RATE * 0.1), Math.min(n, b + RATE * 0.2));
    // normallashtirish
    let peak = 0;
    for (const v of mono) peak = Math.max(peak, Math.abs(v));
    const gain = peak > 0 ? Math.min(4, 0.9 / peak) : 1;
    const pcm = new Int16Array(Math.min(mono.length, (RATE * MAX_VOICE_MS) / 1000));
    for (let i = 0; i < pcm.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(mono[i] * gain * 32767)));
    return { wav: encodeWav(pcm), durationMs: (pcm.length / RATE) * 1000 || fallbackMs };
  } finally {
    void ctx.close();
  }
}

function encodeWav(pcm: Int16Array): Blob {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + pcm.length * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return new Blob([buf], { type: "audio/wav" });
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

export const audioUrl = (b64: string) => `data:audio/wav;base64,${b64}`;

// ---- Eslatmada o'ynatish -----------------------------------------------------------

async function myActive(): Promise<{ id: string } | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await db.from("med_voice_notes").select("id").eq("wearer_id", user.id).eq("is_active", true).maybeSingle();
  return data ?? null;
}

/** Sayt: dori eslatmasi kelganda faol ovozni o'ynatadi (bo'lsa). */
export async function playMyVoiceNote(): Promise<boolean> {
  const a = await myActive();
  if (!a) return false;
  const b64 = await voiceAudio(a.id);
  if (!b64) return false;
  try { await new Audio(audioUrl(b64)).play(); return true; } catch { return false; }
}

const KEY = "maxh_voice_channel";

/**
 * Ilova: faol ovoz uchun bildirishnoma kanali id si (yoki null — oddiy budilnik).
 * Ovoz faqat o'zgarganda yuklab olinadi.
 */
export async function voiceChannelId(): Promise<string | null> {
  if (!isNativeApp() || !hasNativeTools()) return null;
  try {
    const a = await myActive();
    const key = a ? a.id.replace(/-/g, "").slice(0, 16) : "";
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* ignore */ }
    if (!a) {
      if (saved) { await AppInstaller.setVoiceChannel({ key: "" }); try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
      return null;
    }
    let r: { channelId?: string };
    try {
      r = await AppInstaller.setVoiceChannel({ key, base64: saved === key ? undefined : (await voiceAudio(a.id)) ?? undefined });
    } catch (e: any) {
      if (!String(e?.message ?? e).includes("NEED_AUDIO")) throw e;
      r = await AppInstaller.setVoiceChannel({ key, base64: (await voiceAudio(a.id)) ?? undefined });
    }
    try { localStorage.setItem(KEY, key); } catch { /* ignore */ }
    return r.channelId ?? null;
  } catch (e) {
    console.warn("voice channel", e);   // eski APK: oddiy budilnik ovozi
    return null;
  }
}
