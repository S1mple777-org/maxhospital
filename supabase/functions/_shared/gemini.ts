// Minimal Google Gemini REST client used by the edge functions.
import { normalizeVector } from "./medical-ai.ts";

const API = "https://generativelanguage.googleapis.com/v1beta";
export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIM = 768;

function apiKey(): string {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
  return key;
}

export function chatModel(): string {
  return Deno.env.get("GEMINI_MODEL") || "gemini-3.8-flash";
}

/** Seconds Google asks us to wait before retrying (from a 429 body), or null. */
function retryDelaySeconds(json: any): number | null {
  const details = json?.error?.details as { retryDelay?: string }[] | undefined;
  const hint = details?.find((d) => typeof d?.retryDelay === "string")?.retryDelay;
  const m = hint?.match(/^(\d+(?:\.\d+)?)s$/) ?? String(json?.error?.message ?? "").match(/retry in (\d+(?:\.\d+)?)s/i);
  return m ? Number(m[1]) : null;
}

async function post(path: string, body: unknown, attempt = 0): Promise<any> {
  const res = await fetch(`${API}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey() },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (res.ok) return json;

  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    // Free-tier quota: Google says how long to wait. Wait that long if it fits in the request time.
    const hinted = res.status === 429 ? retryDelaySeconds(json) : null;
    const waitMs = hinted !== null ? (hinted + 1) * 1000 : 1500 * 2 ** attempt;
    if (waitMs <= 30_000) {
      await new Promise((r) => setTimeout(r, waitMs));
      return post(path, body, attempt + 1);
    }
  }
  throw new Error(`Gemini ${res.status}: ${json?.error?.message ?? "request failed"}`);
}

/** Chat models to try in order: GEMINI_MODEL, then any in GEMINI_FALLBACK_MODELS (comma-separated). */
function chatModels(): string[] {
  const extra = (Deno.env.get("GEMINI_FALLBACK_MODELS") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return [chatModel(), ...extra.filter((m) => m !== chatModel())];
}

/** generateContent with fallback to the next model when one is overloaded or out of quota. */
async function generate(body: unknown): Promise<any> {
  let lastError: unknown;
  for (const model of chatModels()) {
    try {
      return await post(`models/${model}:generateContent`, body);
    } catch (e) {
      lastError = e;
      if (!/Gemini (429|5\d\d)/.test(String((e as Error)?.message))) throw e;
    }
  }
  throw lastError;
}

export type EmbedTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

export async function embedTexts(texts: string[], taskType: EmbedTask): Promise<number[][]> {
  const out: number[][] = [];
  const BATCH = 50;
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const json = await post(`models/${EMBEDDING_MODEL}:batchEmbedContents`, {
      requests: slice.map((text) => ({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: EMBEDDING_DIM,
      })),
    });
    const embeddings = json.embeddings as { values: number[] }[] | undefined;
    if (!embeddings || embeddings.length !== slice.length) {
      throw new Error("Gemini returned an unexpected number of embeddings");
    }
    // 768-dim vectors from gemini-embedding-001 are not normalized.
    for (const e of embeddings) out.push(normalizeVector(e.values));
  }
  return out;
}

export interface ChatTurn {
  role: "user" | "model";
  text: string;
}

/** A file passed to the model inline (e.g. a PDF prescription), base64-encoded. */
export interface InlineFile {
  mimeType: string;
  data: string;
}

export async function generateJson<T>(opts: {
  system: string;
  turns: ChatTurn[];
  schema: Record<string, unknown>;
  temperature?: number;
  /** attached to the last turn, before its text */
  files?: InlineFile[];
}): Promise<T> {
  const last = opts.turns.length - 1;
  const json = await generate({
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: opts.turns.map((t, i) => ({
      role: t.role,
      parts: [
        ...(i === last ? (opts.files ?? []).map((f) => ({ inlineData: { mimeType: f.mimeType, data: f.data } })) : []),
        { text: t.text },
      ],
    })),
    generationConfig: {
      temperature: opts.temperature ?? 0.2,
      responseMimeType: "application/json",
      responseSchema: opts.schema,
    },
    safetySettings: [
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
    ],
  });
  const text = json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error("Gemini returned an empty answer");
  return JSON.parse(text) as T;
}

/** Turns a pgvector literal into the string format PostgREST expects. */
export const toPgVector = (v: number[]) => `[${v.join(",")}]`;
