import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, Crown, Loader2, Phone, Send, Sparkles, TrendingUp } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AiAnswerCard from "@/components/ai/AiAnswerCard";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { askAssistant, EMERGENCY_PHONE, type AiReply, type ChatHistoryItem, type Lang } from "@/lib/aiAssistant";
import { remaining, usePlanStatus } from "@/lib/planPerks";

const QUOTA: Record<Lang, { left: (n: number, of: number) => string; upgrade: string }> = {
  uz: { left: (n, of) => `Bugun qolgan bepul savollar: ${n} / ${of}`, upgrade: "Pro / Premium tariflari" },
  ru: { left: (n, of) => `Осталось вопросов сегодня: ${n} / ${of}`, upgrade: "Тарифы Pro / Premium" },
  en: { left: (n, of) => `Questions left today: ${n} / ${of}`, upgrade: "Pro / Premium plans" },
};

type Item =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; reply: AiReply }
  | { id: number; role: "error"; text: string; upsell?: boolean };

const T: Record<Lang, Record<string, string | string[]>> = {
  uz: {
    title: "AI-yordamchi",
    subtitle: "Saytdagi tibbiy kitoblar asosida javob beradi, kerakli shifokorni topadi va ko'rik natijalaringizni taqqoslaydi.",
    disclaimer: "AI shifokor emas va tashxis qo'ymaydi. Javoblar faqat ma'lumot uchun.",
    emergency: `Hayot uchun xavfli holatda darhol ${EMERGENCY_PHONE} ga qo'ng'iroq qiling.`,
    placeholder: "Belgilaringizni yozing: nima, qachondan beri, qanchalik kuchli...",
    send: "Yuborish",
    thinking: "Kitoblardan qidirilmoqda...",
    login: "AI-yordamchidan foydalanish uchun tizimga kiring",
    loginBtn: "Kirish",
    trends: "Ko'rsatkichlarimni tahlil qil",
    trendsUser: "Oldingi ko'riklardagi ko'rsatkichlarimni taqqoslab ber",
    hello: "Assalomu alaykum! Sizni nima bezovta qilyapti? Belgilarni batafsil yozsangiz, aniqroq yo'naltiraman.",
    examples: ["2 kundan beri boshim og'riyapti va ko'nglim ayniyapti", "Qo'limni issiq suvda kuydirib oldim, nima qilay?", "Bolamning harorati 38, yo'tali bor"],
  },
  ru: {
    title: "AI-помощник",
    subtitle: "Отвечает на основе медицинских книг сайта, подбирает нужного врача и сравнивает результаты ваших осмотров.",
    disclaimer: "AI не врач и не ставит диагноз. Ответы носят информационный характер.",
    emergency: `При угрозе жизни сразу звоните ${EMERGENCY_PHONE}.`,
    placeholder: "Опишите симптомы: что, с какого времени, насколько сильно...",
    send: "Отправить",
    thinking: "Ищу в книгах...",
    login: "Войдите, чтобы пользоваться AI-помощником",
    loginBtn: "Войти",
    trends: "Проанализировать мои показатели",
    trendsUser: "Сравни мои показатели с прошлых осмотров",
    hello: "Здравствуйте! Что вас беспокоит? Опишите симптомы подробнее, чтобы я точнее направил вас.",
    examples: ["Второй день болит голова и тошнит", "Обжёг руку горячей водой, что делать?", "У ребёнка температура 38 и кашель"],
  },
  en: {
    title: "AI assistant",
    subtitle: "Answers from the site's medical books, finds the right doctor and compares your check-up results.",
    disclaimer: "The AI is not a doctor and does not diagnose. Answers are for information only.",
    emergency: `In a life-threatening situation call ${EMERGENCY_PHONE} immediately.`,
    placeholder: "Describe your symptoms: what, since when, how strong...",
    send: "Send",
    thinking: "Searching the books...",
    login: "Sign in to use the AI assistant",
    loginBtn: "Sign in",
    trends: "Analyse my measurements",
    trendsUser: "Compare my measurements from earlier visits",
    hello: "Hello! What is bothering you? The more detail you give, the better I can guide you.",
    examples: ["I've had a headache and nausea for 2 days", "I burned my hand with hot water, what should I do?", "My child has a 38° fever and a cough"],
  },
};

const AiAssistantPage = () => {
  const { user, loading } = useAuth();
  const { language } = useLanguage();
  const lang = language as Lang;
  const t = T[lang];
  const [items, setItems] = useState<Item[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const nextId = useRef(1);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { status } = usePlanStatus(!!user);
  const [quota, setQuota] = useState<{ left: number; limit: number } | null>(null);
  useEffect(() => {
    if (!status) return;
    const left = remaining(status.limits.ai_daily_questions, status.usage.ai_today);
    setQuota(left === null ? null : { left, limit: status.limits.ai_daily_questions ?? 0 });
  }, [status]);
  const q = QUOTA[lang];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items, busy]);

  const history = (): ChatHistoryItem[] =>
    items.flatMap((it): ChatHistoryItem[] =>
      it.role === "user" ? [{ role: "user", content: it.text }]
        : it.role === "assistant" ? [{ role: "assistant", content: it.reply.answer }]
        : [],
    );

  const send = async (text: string, mode: "chat" | "trends" = "chat") => {
    const message = text.trim();
    if (!message || busy) return;
    const prior = history();
    setItems((prev) => [...prev, { id: nextId.current++, role: "user", text: message }]);
    setInput("");
    setBusy(true);
    try {
      const reply = await askAssistant({ message, history: prior, language: lang, mode });
      setItems((prev) => [...prev, { id: nextId.current++, role: "assistant", reply }]);
      if (reply.quota && reply.quota.limit !== null) setQuota({ left: Math.max(0, reply.quota.left), limit: reply.quota.limit });
    } catch (e: any) {
      const upsell = e?.code === "daily_limit" || e?.code === "pro_required";
      if (e?.code === "daily_limit") setQuota((prev) => (prev ? { ...prev, left: 0 } : prev));
      setItems((prev) => [...prev, { id: nextId.current++, role: "error", text: e?.message || "Xatolik", upsell }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-hero-gradient flex items-center justify-center shrink-0">
              <Sparkles className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground">{t.title}</h1>
              <p className="text-sm text-muted-foreground">{t.subtitle}</p>
            </div>
          </div>

          <div className="mb-4 flex flex-col sm:flex-row gap-2 text-xs">
            <div className="flex-1 rounded-xl border border-border bg-card px-3 py-2 text-muted-foreground">{t.disclaimer}</div>
            <a href={`tel:${EMERGENCY_PHONE}`} className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 font-medium text-red-700 dark:text-red-400">
              <Phone className="w-4 h-4 shrink-0" /> {t.emergency}
            </a>
          </div>

          {!loading && !user ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center">
              <Bot className="w-10 h-10 mx-auto text-primary mb-3" />
              <p className="text-foreground mb-4">{t.login}</p>
              <Link to="/auth" className="inline-block px-5 py-2.5 rounded-xl bg-hero-gradient text-primary-foreground text-sm font-medium">{t.loginBtn}</Link>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card card-shadow">
              <div className="p-4 space-y-4 min-h-[320px] max-h-[60vh] overflow-y-auto">
                <div className="flex gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><Bot className="w-4 h-4 text-primary" /></div>
                  <div className="rounded-2xl bg-secondary px-4 py-2.5 text-sm text-foreground">{t.hello}</div>
                </div>

                {items.length === 0 && (
                  <div className="flex flex-wrap gap-2 pl-10">
                    {(t.examples as string[]).map((ex) => (
                      <button key={ex} onClick={() => send(ex)} className="rounded-full border border-border px-3 py-1.5 text-xs text-foreground hover:bg-secondary">{ex}</button>
                    ))}
                  </div>
                )}

                {items.map((it) =>
                  it.role === "user" ? (
                    <div key={it.id} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl bg-primary px-4 py-2.5 text-sm text-primary-foreground whitespace-pre-line">{it.text}</div>
                    </div>
                  ) : it.role === "assistant" ? (
                    <div key={it.id} className="flex gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><Bot className="w-4 h-4 text-primary" /></div>
                      <div className="flex-1 min-w-0"><AiAnswerCard reply={it.reply} language={lang} /></div>
                    </div>
                  ) : (
                    <div key={it.id} className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
                      {it.text}
                      {it.upsell && (
                        <Link to="/pro" className="mt-2 flex w-fit items-center gap-1.5 rounded-lg bg-hero-gradient px-3 py-1.5 text-xs font-semibold text-primary-foreground">
                          <Crown className="w-3.5 h-3.5" /> {q.upgrade}
                        </Link>
                      )}
                    </div>
                  ),
                )}

                {busy && (
                  <div className="flex items-center gap-2 pl-10 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" /> {t.thinking}
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              <div className="border-t border-border p-3 space-y-2">
                {quota && (
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className={quota.left === 0 ? "text-destructive font-medium" : ""}>{q.left(quota.left, quota.limit)}</span>
                    <Link to="/pro" className="flex items-center gap-1 text-primary hover:underline"><Crown className="w-3 h-3" /> {q.upgrade}</Link>
                  </div>
                )}
                <button
                  onClick={() => send(t.trendsUser as string, "trends")}
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50"
                >
                  <TrendingUp className="w-3.5 h-3.5 text-primary" /> {t.trends}
                </button>
                <div className="flex gap-2">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
                    }}
                    rows={2}
                    maxLength={2000}
                    placeholder={t.placeholder as string}
                    className="flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    onClick={() => send(input)}
                    disabled={busy || !input.trim()}
                    aria-label={t.send as string}
                    className="self-end rounded-xl bg-primary p-3 text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default AiAssistantPage;
