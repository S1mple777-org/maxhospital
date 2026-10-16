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
}

export interface ChatHistoryItem {
  role: "user" | "assistant";
  content: string;
}

async function errorMessage(error: any, fallback: string): Promise<string> {
  try {
    const body = await error?.context?.json?.();
    if (body?.error) return body.error;
  } catch {
    /* ignore */
  }
  return fallback;
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
  if (error) throw new Error(await errorMessage(error, "AI-yordamchi bilan bog'lanib bo'lmadi"));
  if (data?.error) throw new Error(data.error);
  return data as AiReply;
}
