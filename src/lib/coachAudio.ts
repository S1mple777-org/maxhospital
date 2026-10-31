import { supabase } from "@/integrations/supabase/client";

/**
 * Ovozli murabbiy uchun audio: bitta AudioContext ("Boshlash" bosilganda yaratiladi, shuning uchun
 * telefon brauzeri va ilovada keyingi barcha ovozlarga ruxsat bo'ladi), oldindan yuklangan iboralar
 * va signal tovushlari. Ovoz yuklanmasa — telefonning o'z TTS'i (bo'lsa), bo'lmasa faqat ekran + signal.
 */
export class CoachAudio {
  ctx: AudioContext;
  private buffers = new Map<string, AudioBuffer>();
  private current: AudioBufferSourceNode | null = null;

  constructor() {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC();
  }

  get loaded() { return this.buffers.size; }

  /** Iboralarni serverdan (keshdan) yuklaydi. onProgress(tayyor, jami). */
  async preload(phrases: string[], onProgress: (done: number, total: number) => void): Promise<number> {
    let done = 0;
    const queue = [...phrases];
    const worker = async () => {
      while (queue.length) {
        const text = queue.shift()!;
        try {
          // Server faqat tayyor (oldindan yaratilgan) ovozni beradi; yo'q bo'lsa — ekran va signal bilan davom etamiz.
          const { data, error } = await supabase.functions.invoke("coach-voice", { body: { text } });
          if (error || !data?.url) throw error ?? new Error("not ready");
          const res = await fetch(data.url);
          const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
          this.buffers.set(text, buf);
        } catch (e) {
          console.warn("coach voice", text.slice(0, 30), e);
        }
        onProgress(++done, phrases.length);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    return this.buffers.size;
  }

  /** Iborani aytadi va tugashini kutadi. */
  say(text: string): Promise<void> {
    this.stop();
    const buf = this.buffers.get(text);
    if (buf) {
      return new Promise((resolve) => {
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(this.ctx.destination);
        src.onended = () => { if (this.current === src) this.current = null; resolve(); };
        this.current = src;
        src.start();
      });
    }
    return speakFallback(text);
  }

  stop() {
    try { this.current?.stop(); } catch { /* already stopped */ }
    this.current = null;
    try { window.speechSynthesis?.cancel(); } catch { /* not supported */ }
  }

  /** Qisqa signal (oxirgi soniyalar, qadam tugashi). */
  beep(freq = 880, ms = 160, volume = 0.25) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.value = freq;
    g.gain.value = volume;
    o.connect(g); g.connect(this.ctx.destination);
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
    o.start(t); o.stop(t + ms / 1000);
  }

  async resume() { if (this.ctx.state === "suspended") await this.ctx.resume(); }
  async suspend() { this.stop(); if (this.ctx.state === "running") await this.ctx.suspend(); }
  close() { this.stop(); this.ctx.close().catch(() => undefined); }
}

/** Telefonda o'zbek (yoki turk) ovozi bo'lsa — shu bilan; aks holda ovozsiz (ekran yetarli). */
function speakFallback(text: string): Promise<void> {
  const synth = window.speechSynthesis;
  if (!synth) return wait(Math.min(4000, 400 + text.length * 45));
  const voices = synth.getVoices();
  const v = voices.find((x) => x.lang.toLowerCase().startsWith("uz")) ?? voices.find((x) => x.lang.toLowerCase().startsWith("tr"));
  if (!v) return wait(Math.min(4000, 400 + text.length * 45));
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.voice = v; u.lang = v.lang; u.rate = 1;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    synth.speak(u);
  });
}

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function vibrate(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern); } catch { /* not supported */ }
}

/** Mashq paytida ekran o'chmasin. */
export async function keepScreenOn(): Promise<() => void> {
  try {
    const lock = await (navigator as any).wakeLock?.request("screen");
    return () => { lock?.release?.().catch(() => undefined); };
  } catch {
    return () => undefined;
  }
}
