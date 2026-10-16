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

async function post(path: string, body: unknown, attempt = 0): Promise<any> {
  const res = await fetch(`${API}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey() },
    body: JSON.stringify(body),
  });
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
    return post(path, body, attempt + 1);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Gemini ${res.status}: ${json?.error?.message ?? "request failed"}`);
  }
  return json;
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

export async function generateJson<T>(opts: {
  system: string;
  turns: ChatTurn[];
  schema: Record<string, unknown>;
  temperature?: number;
}): Promise<T> {
  const json = await post(`models/${chatModel()}:generateContent`, {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: opts.turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
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
