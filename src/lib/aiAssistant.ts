import { supabase } from "@/integrations/supabase/client";
import type { Lang, MetricTrend, Triage } from "../../supabase/functions/_shared/medical-ai.ts";

export * from "../../supabase/functions/_shared/medical-ai.ts";

export interface AiSource {
  n: number;
  book_title: string;
  book_author: string | null;
  page: number;
  excerpt: string;
}

export interface AiDoctor {
  id: string;
  name: string;
  title: string;
  rating: number;
  is_online: boolean;
}

export interface AiReply {
  triage: Triage;
  answer: string;
  department: { id: string; name: string } | null;
  doctors: AiDoctor[];
  sources: AiSource[];
  trends?: MetricTrend[];
  /** questions left today on a limited plan; null/absent = unlimited */
  quota?: { left: number; limit: number | null } | null;
}

export interface ChatHistoryItem {
  role: "user" | "assistant";
  content: string;
}

async function functionError(error: any, fallback: string): Promise<Error & { code?: string }> {
  try {
    const body = await error?.context?.json?.();
    if (body?.error) return Object.assign(new Error(body.error), { code: body.code as string | undefined });
  } catch {
    /* ignore */
  }
  return new Error(fallback);
}

export async function askAssistant(params: {
  message?: string;
  history?: ChatHistoryItem[];
  language: Lang;
  mode?: "chat" | "trends";
}): Promise<AiReply> {
  const { data, error } = await supabase.functions.invoke("ai-assistant", {
    body: { mode: "chat", ...params },
  });
  if (error) throw await functionError(error, "AI-yordamchi bilan bog'lanib bo'lmadi");
  if (data?.error) throw new Error(data.error);
  return data as AiReply;
}
