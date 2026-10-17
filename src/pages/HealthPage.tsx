import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Crown, FileDown, Loader2, Sparkles } from "lucide-react";
import { Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AiAnswerCard from "@/components/ai/AiAnswerCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { analyzeTrends, askAssistant, METRIC_BY_KEY, type AiReply, type Lang, type MetricTrend } from "@/lib/aiAssistant";
import { usePlanStatus } from "@/lib/planPerks";
import { generateHealthReportPdf } from "@/lib/healthReportPdf";
import { savePdf } from "@/lib/native";
import HomeDiaryCard from "@/components/care/HomeDiaryCard";
import WeeklyReportCard from "@/components/care/WeeklyReportCard";

const T: Record<Lang, Record<string, string>> = {
  uz: {
    title: "Salomatligim",
    subtitle: "Shifokor ko'riklarida kiritilgan ko'rsatkichlaringiz va ularning o'zgarishi",
    empty: "Hali ko'rik ko'rsatkichlari yo'q. Shifokor konsultatsiyadan so'ng ularni kiritadi.",
    start: "Konsultatsiya boshlash",
    analyze: "AI bilan tahlil qilish",
    analyzing: "Tahlil qilinmoqda...",
    pdf: "PDF hisobot",
    proLock: "AI tahlil va PDF hisobot — Pro",
    proHint: "Free tarifda grafiklar ko'rinadi. Pro va Premium'da AI ko'rsatkichlarni tushuntiradi va shifokorga olib boriladigan PDF hisobot tayyorlaydi.",
    latest: "Oxirgi",
    previous: "oldingi",
    normal: "Me'yor",
    low: "Past",
    high: "Yuqori",
    ok: "Me'yorda",
    better: "yaxshilangan",
    worse: "yomonlashgan",
    stable: "o'zgarmagan",
  },
  ru: {
    title: "Моё здоровье",
    subtitle: "Показатели, внесённые врачами на осмотрах, и их динамика",
    empty: "Пока нет показателей. Врач внесёт их после консультации.",
    start: "Начать консультацию",
    analyze: "Анализ с помощью AI",
    analyzing: "Анализирую...",
    pdf: "PDF-отчёт",
    proLock: "AI-анализ и PDF-отчёт — Pro",
    proHint: "В Free видны графики. В Pro и Premium AI объясняет показатели и готовит PDF-отчёт для врача.",
    latest: "Последнее",
    previous: "ранее",
    normal: "Норма",
    low: "Низкий",
    high: "Высокий",
    ok: "В норме",
    better: "улучшилось",
    worse: "ухудшилось",
    stable: "без изменений",
  },
  en: {
    title: "My health",
    subtitle: "Measurements recorded by doctors at your visits and how they changed",
    empty: "No measurements yet. A doctor records them after a consultation.",
    start: "Start a consultation",
    analyze: "Analyse with AI",
    analyzing: "Analysing...",
    pdf: "PDF report",
    proLock: "AI analysis and PDF report — Pro",
    proHint: "Free shows the charts. Pro and Premium add an AI explanation and a PDF report to take to your doctor.",
    latest: "Latest",
    previous: "previous",
    normal: "Normal",
    low: "Low",
    high: "High",
    ok: "Normal",
    better: "improved",
    worse: "worsened",
    stable: "unchanged",
  },
};

const statusClass = {
  low: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  high: "bg-red-500/15 text-red-700 dark:text-red-400",
  normal: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  unknown: "bg-muted text-muted-foreground",
};

const TrendCard = ({ trend, lang }: { trend: MetricTrend; lang: Lang }) => {
  const t = T[lang];
  const def = METRIC_BY_KEY[trend.metric];
  const data = trend.history.map((h) => ({ value: h.value, date: new Date(h.at).toLocaleDateString() }));
  const DirIcon = trend.direction === "up" ? ArrowUpRight : trend.direction === "down" ? ArrowDownRight : ArrowRight;
  const tone = trend.improving === true ? "text-emerald-600" : trend.improving === false ? "text-red-600" : "text-muted-foreground";
  const verdict = trend.direction === "stable" ? t.stable : trend.improving === true ? t.better : trend.improving === false ? t.worse : "";

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium text-foreground">{def.label[lang]}</div>
        {trend.status !== "unknown" && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass[trend.status]}`}>
            {trend.status === "normal" ? t.ok : t[trend.status]}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-display font-bold text-foreground">{trend.latest}</span>
        <span className="text-xs text-muted-foreground">{def.unit}</span>
      </div>
      {trend.previous !== null && (
        <div className={`mt-0.5 flex items-center gap-1 text-xs ${tone}`}>
          <DirIcon className="w-3.5 h-3.5" />
          {trend.change! > 0 ? "+" : ""}{trend.change} ({trend.changePercent ?? 0}%) · {t.previous}: {trend.previous}
          {verdict && <span>· {verdict}</span>}
        </div>
      )}
      {def.normal && (
        <div className="mt-0.5 text-xs text-muted-foreground">{t.normal}: {def.normal[0]}–{def.normal[1]} {def.unit}</div>
      )}
      {data.length > 1 && (
        <div className="mt-3 h-24">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
              {def.normal && <ReferenceArea y1={def.normal[0]} y2={def.normal[1]} fill="hsl(var(--primary))" fillOpacity={0.08} />}
              <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" domain={["auto", "auto"]} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

const HealthPage = () => {
  const { user, profile, loading } = useAuth();
  const { language } = useLanguage();
  const lang = language as Lang;
  const t = T[lang];
  const navigate = useNavigate();
  const { status } = usePlanStatus(!!user);
  const healthAi = status?.limits.health_ai ?? false;
  const [rows, setRows] = useState<any[] | null>(null);
  const [reply, setReply] = useState<AiReply | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!loading && !user) { navigate("/auth"); return; }
    if (!user) return;
    supabase
      .from("health_measurements")
      .select("*")
      .eq("patient_id", user.id)
      .order("measured_at", { ascending: true })
      .then(({ data }) => setRows(data ?? []));
  }, [user, loading, reloadKey]);

  const trends = useMemo(() => analyzeTrends(rows ?? []), [rows]);

  const analyze = async () => {
    setAnalyzing(true);
    setError("");
    try {
      setReply(await askAssistant({ language: lang, mode: "trends" }));
    } catch (e: any) {
      setError(e?.message || "Xatolik");
    } finally {
      setAnalyzing(false);
    }
  };

  const downloadPdf = async () => {
    const pdf = generateHealthReportPdf({
      patientName: profile?.full_name || "",
      trends,
      language: lang,
      aiAnswer: reply?.answer ?? null,
    });
    await savePdf(pdf, `salomatlik-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center"><Activity className="w-5 h-5 text-primary" /></div>
              <div>
                <h1 className="font-display text-2xl font-bold text-foreground">{t.title}</h1>
                <p className="text-sm text-muted-foreground">{t.subtitle}</p>
              </div>
            </div>
            {trends.length > 0 && status && (healthAi ? (
              <div className="flex flex-col sm:flex-row gap-2">
                <button onClick={analyze} disabled={analyzing} className="flex items-center justify-center gap-2 rounded-xl bg-hero-gradient px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60">
                  {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {analyzing ? t.analyzing : t.analyze}
                </button>
                <button onClick={downloadPdf} className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-secondary">
                  <FileDown className="w-4 h-4" /> {t.pdf}
                </button>
              </div>
            ) : (
              <Link to="/pro" className="flex items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/5 px-4 py-2.5 text-sm font-medium text-primary">
                <Crown className="w-4 h-4" /> {t.proLock}
              </Link>
            ))}
          </div>

          {status && !healthAi && trends.length > 0 && (
            <div className="mb-4 rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">{t.proHint}</div>
          )}
          {error && <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">{error}</div>}
          {reply && <div className="mb-6"><AiAnswerCard reply={reply} language={lang} /></div>}

          {status && (
            <div className="grid gap-4 md:grid-cols-2 mb-6">
              <HomeDiaryCard enabled={status.limits.home_diary} language={lang} rows={(rows ?? []) as any[]} onSaved={() => setReloadKey((k) => k + 1)} />
              <WeeklyReportCard enabled={status.limits.weekly_report} language={lang} refreshKey={reloadKey} />
            </div>
          )}

          {rows === null ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : trends.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center">
              <p className="text-muted-foreground mb-4">{t.empty}</p>
              <Link to="/start-consultation" className="inline-block rounded-xl bg-hero-gradient px-5 py-2.5 text-sm font-medium text-primary-foreground">{t.start}</Link>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {trends.map((tr) => <TrendCard key={tr.metric} trend={tr} lang={lang} />)}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default HealthPage;
