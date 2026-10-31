// MaxFitness ovozli murabbiy: iborani o'zbekcha ovozga aylantiradi va keshlaydi.
//   POST { text }        -> { url } faqat tayyor (keshdagi) ovoz uchun; yo'q bo'lsa 404 — ilova matn+signal bilan davom etadi
//   POST { warm: true }  -> pg_cron har daqiqada: faol rejalar uchun yetishmayotgan iboralarni yaratadi
// Gemini TTS bepul tarifda daqiqasiga ~3 so'rov — shuning uchun ovoz foydalanuvchi kutmasdan, fonda tayyorlanadi.
// Faqat _shared/coach.ts yasay oladigan iboralar qabul qilinadi (allCoachPhrases), shuning uchun
// funksiyadan ixtiyoriy matnni ovozga aylantirish uchun foydalanib bo'lmaydi. Bir ibora bir marta
// yaratiladi va barcha foydalanuvchilar uchun keshdan beriladi.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json, serviceClient } from "../_shared/http.ts";
import { allCoachPhrases, coachSteps, phraseKey, stepPhrases } from "../_shared/coach.ts";
import { generatePlan, type FitnessAnswers } from "../_shared/fitness.ts";
import { isCronRequest } from "../_shared/notify.ts";

const BUCKET = "coach-voice";
const ALLOWED = allCoachPhrases();
const voice = () => Deno.env.get("COACH_TTS_VOICE") || "Kore";
const ttsModels = () => (Deno.env.get("COACH_TTS_MODELS") || "gemini-2.5-flash-preview-tts")
  .split(",").map((m) => m.trim()).filter(Boolean);

/** 24 kHz 16-bit PCM -> 16 kHz (hajm 1/3 kichik, nutq uchun yetarli). */
function resample(pcm: Int16Array, from: number, to: number): Int16Array {
  if (from === to) return pcm;
  const n = Math.floor(pcm.length * to / from);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const x = i * from / to, i0 = Math.floor(x), f = x - i0;
    const a = pcm[i0] ?? 0, b = pcm[i0 + 1] ?? a;
    out[i] = Math.round(a + (b - a) * f);
  }
  return out;
}

function wav(pcm: Int16Array, rate: number): Uint8Array {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + pcm.length * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return new Uint8Array(buf);
}

class QuotaError extends Error {}

async function tts(text: string): Promise<Uint8Array> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
  let last = "";
  for (const model of ttsModels()) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `O'zbek tilida, quvnoq va dalda beruvchi fitnes murabbiyi ovozida, aniq talaffuz bilan o'qing: ${text}` }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice() } } },
        },
      }),
    });
    const body = await res.json().catch(() => ({}));
    const part = body?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data);
    if (res.ok && part) {
      const rate = Number(String(part.inlineData.mimeType ?? "").match(/rate=(\d+)/)?.[1] ?? 24000);
      const bytes = Uint8Array.from(atob(part.inlineData.data), (c) => c.charCodeAt(0));
      const pcm = new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
      return wav(resample(pcm, rate, 16000), 16000);
    }
    last = `${model}: ${res.status} ${body?.error?.message ?? "no audio"}`;
    if (res.status === 429) throw new QuotaError(last);
    console.warn("coach-voice tts", last);
  }
  throw new Error(last);
}

let bucketReady = false;
async function ensureBucket(db: ReturnType<typeof serviceClient>) {
  if (bucketReady) return;
  const { data } = await db.storage.getBucket(BUCKET);
  if (!data) await db.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 2_000_000, allowedMimeTypes: ["audio/wav"] });
  bucketReady = true;
}

const pathFor = async (text: string) => `${voice()}/${await phraseKey(text, voice())}.wav`;

/** Bucket'dagi tayyor fayllar nomlari. */
async function existing(db: ReturnType<typeof serviceClient>): Promise<Set<string>> {
  const out = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const { data } = await db.storage.from(BUCKET).list(voice(), { limit: 1000, offset });
    (data ?? []).forEach((f) => out.add(`${voice()}/${f.name}`));
    if (!data || data.length < 1000) return out;
  }
}

/** Faol / tasdiq kutayotgan rejalar uchun kerakli barcha iboralar (navbat tartibida). */
async function neededPhrases(db: ReturnType<typeof serviceClient>): Promise<string[]> {
  const { data } = await db.from("fitness_plans").select("questionnaire, adapt_factor")
    .in("status", ["active", "pending_doctor"]).order("created_at", { ascending: false }).limit(200);
  const seen = new Set<string>();
  for (const row of data ?? []) {
    try {
      const plan = generatePlan(row.questionnaire as FitnessAnswers, Number(row.adapt_factor) || 1);
      for (const w of plan.weeks) for (const s of w.sessions) for (const p of stepPhrases(coachSteps(s))) seen.add(p);
    } catch (e) { console.warn("coach-voice plan", e); }
  }
  // Avval faol rejalarga keraklilari, keyin qolgan barcha iboralar (hamma uchun bir marta)
  return [...new Set([...seen, ...ALLOWED])].filter((p) => ALLOWED.has(p));
}

async function warm(db: ReturnType<typeof serviceClient>, max: number) {
  const have = await existing(db);
  const todo: { text: string; path: string }[] = [];
  for (const text of await neededPhrases(db)) {
    const path = await pathFor(text);
    if (!have.has(path)) todo.push({ text, path });
  }
  let made = 0, quota: string | null = null;
  for (const t of todo.slice(0, max)) {
    try {
      const audio = await tts(t.text);
      const { error } = await db.storage.from(BUCKET).upload(t.path, audio, { contentType: "audio/wav", upsert: true, cacheControl: "31536000" });
      if (error) throw new Error(error.message);
      made++;
    } catch (e) {
      if (e instanceof QuotaError) { quota = (e as Error).message.match(/requests per (minute|day)/)?.[0] ?? "429"; break; }
      console.warn("coach-voice warm", t.text.slice(0, 40), (e as Error).message);
    }
  }
  return { missing: todo.length, made, quota };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const body = await req.json().catch(() => ({}));
  const db = serviceClient();
  await ensureBucket(db);

  if (body?.warm) {
    if (!(await isCronRequest(req, db))) return json({ error: "Forbidden" }, 403);
    return json(await warm(db, 3));
  }

  const text = body?.text;
  if (typeof text !== "string" || !ALLOWED.has(text)) return json({ error: "Unknown phrase" }, 400);
  const url = db.storage.from(BUCKET).getPublicUrl(await pathFor(text)).data.publicUrl;
  const head = await fetch(url, { method: "HEAD" }).catch(() => null);
  return head?.ok ? json({ url }) : json({ error: "not ready" }, 404);
});
