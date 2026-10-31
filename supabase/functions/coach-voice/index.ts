// MaxFitness ovozli murabbiy: iborani o'zbekcha ovozga aylantiradi va keshlaydi.
//   POST { text } -> { url }   (url — ochiq "coach-voice" bucket'idagi .wav fayl)
// Faqat _shared/coach.ts yasay oladigan iboralar qabul qilinadi (allCoachPhrases), shuning uchun
// funksiyadan ixtiyoriy matnni ovozga aylantirish uchun foydalanib bo'lmaydi. Bir ibora bir marta
// yaratiladi va barcha foydalanuvchilar uchun keshdan beriladi.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json, serviceClient } from "../_shared/http.ts";
import { allCoachPhrases, phraseKey } from "../_shared/coach.ts";

const BUCKET = "coach-voice";
const ALLOWED = allCoachPhrases();
const voice = () => Deno.env.get("COACH_TTS_VOICE") || "Kore";
const ttsModels = () => (Deno.env.get("COACH_TTS_MODELS") || "gemini-2.5-flash-preview-tts,gemini-2.5-pro-preview-tts")
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const { text } = await req.json().catch(() => ({}));
  if (typeof text !== "string" || !ALLOWED.has(text)) return json({ error: "Unknown phrase" }, 400);

  const db = serviceClient();
  await ensureBucket(db);
  const path = `${voice()}/${await phraseKey(text, voice())}.wav`;
  const url = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  const head = await fetch(url, { method: "HEAD" }).catch(() => null);
  if (head?.ok) return json({ url, cached: true });

  try {
    const audio = await tts(text);
    const { error } = await db.storage.from(BUCKET).upload(path, audio, { contentType: "audio/wav", upsert: true, cacheControl: "31536000" });
    if (error) throw new Error(error.message);
    return json({ url, cached: false });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 502);
  }
});
