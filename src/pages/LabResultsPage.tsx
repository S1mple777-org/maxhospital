import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp, Crown, FileUp, FlaskConical, Loader2, Lock, ShieldCheck } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AiAnswerCard from "@/components/ai/AiAnswerCard";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { fileToBase64 } from "@/lib/medications";
import { readLabResult, remaining, usePlanStatus, type LabFlag, type LabReply } from "@/lib/planPerks";
import type { Lang } from "@/lib/aiAssistant";

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPT = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

const T: Record<Lang, Record<string, string>> = {
  uz: {
    title: "Tahlil natijalari",
    subtitle: "Qon, siydik yoki biokimyo tahlilingiz PDF yoki rasmini yuklang. AI qiymatlarni o'qiydi, me'yordan chiqqanlarini saytdagi tibbiy kitoblar asosida tushuntiradi va kerakli shifokorni taklif qiladi.",
    upload: "PDF yoki rasm tanlash",
    reading: "AI tahlilni o'qimoqda...",
    left: "Bu oy qolgan",
    test: "Ko'rsatkich",
    value: "Natija",
    range: "Me'yor (blankada)",
    date: "Tahlil sanasi",
    privacy: "Fayl va natijalar saqlanmaydi — faqat shu sahifada ko'rsatiladi.",
    note: "Past/yuqori belgisi blankadagi me'yor bilan dastur tomonidan solishtirilgan. Yakuniy xulosani shifokor beradi.",
    lockedTitle: "Pro va Premium imkoniyati",
    locked: "Tahlil natijasini AI bilan o'qish Pro va Premium tariflarida ishlaydi. Premium'da oylik limit kattaroq.",
    plans: "Tariflarni ko'rish",
    login: "Avval tizimga kiring",
    badFile: "PDF yoki rasm (JPG, PNG, WEBP) tanlang, hajmi 8 MB dan kichik bo'lsin.",
    low: "Past",
    high: "Yuqori",
    normal: "Me'yorda",
    unknown: "—",
  },
  ru: {
    title: "Результаты анализов",
    subtitle: "Загрузите PDF или фото анализа крови, мочи или биохимии. AI прочитает значения, объяснит отклонения по медицинским книгам сайта и предложит нужного врача.",
    upload: "Выбрать PDF или фото",
    reading: "AI читает анализ...",
    left: "Осталось в этом месяце",
    test: "Показатель",
    value: "Результат",
    range: "Норма (на бланке)",
    date: "Дата анализа",
    privacy: "Файл и результаты не сохраняются — показываются только на этой странице.",
    note: "Отметка «низкий/высокий» вычислена программой по норме с бланка. Окончательный вывод делает врач.",
    lockedTitle: "Функция Pro и Premium",
    locked: "Чтение анализов с AI доступно в тарифах Pro и Premium. В Premium месячный лимит больше.",
    plans: "Посмотреть тарифы",
    login: "Сначала войдите",
    badFile: "Выберите PDF или фото (JPG, PNG, WEBP) до 8 МБ.",
    low: "Низкий",
    high: "Высокий",
    normal: "Норма",
    unknown: "—",
  },
  en: {
    title: "Lab results",
    subtitle: "Upload a PDF or photo of your blood, urine or biochemistry test. The AI reads the values, explains the out-of-range ones from the site's medical books and suggests the right doctor.",
    upload: "Choose a PDF or photo",
    reading: "The AI is reading your result...",
    left: "Left this month",
    test: "Test",
    value: "Result",
    range: "Reference (on the report)",
    date: "Test date",
    privacy: "The file and the values are not stored — they are only shown on this page.",
    note: "Low/high is computed by the app from the reference range printed on the report. A doctor gives the final interpretation.",
    lockedTitle: "Pro and Premium feature",
    locked: "Reading lab results with AI is part of the Pro and Premium plans. Premium has a higher monthly limit.",
    plans: "See plans",
    login: "Please sign in first",
    badFile: "Choose a PDF or photo (JPG, PNG, WEBP) smaller than 8 MB.",
    low: "Low",
    high: "High",
    normal: "Normal",
    unknown: "—",
  },
};

const flagClass: Record<LabFlag, string> = {
  low: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  high: "bg-red-500/15 text-red-700 dark:text-red-400",
  normal: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  unknown: "text-muted-foreground",
};

const LabResultsPage = () => {
  const { user, loading } = useAuth();
  const { language } = useLanguage();
  const lang = language as Lang;
  const t = T[lang];
  const navigate = useNavigate();
  const { status, refresh } = usePlanStatus(!!user);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reply, setReply] = useState<LabReply | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate("/auth");
  }, [loading, user]);

  const limit = status?.limits.lab_reads_monthly ?? 0;
  const left = status ? remaining(limit, status.usage.lab_month) : null;
  const locked = !!status && limit <= 0;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPT.includes(file.type) || file.size > MAX_BYTES) { setError(t.badFile); return; }
    setBusy(true);
    setError("");
    setReply(null);
    try {
      const base64 = await fileToBase64(file);
      setReply(await readLabResult({ base64, mimeType: file.type, language: lang }));
      void refresh();
    } catch (e: any) {
      setError(e?.message || "Xatolik");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="flex items-start gap-3 mb-6">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><FlaskConical className="w-5 h-5 text-primary" /></div>
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground">{t.title}</h1>
              <p className="text-sm text-muted-foreground">{t.subtitle}</p>
            </div>
          </div>

          {locked ? (
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-8 text-center">
              <Lock className="w-8 h-8 mx-auto text-primary mb-3" />
              <h2 className="font-display text-lg font-semibold text-foreground">{t.lockedTitle}</h2>
              <p className="text-sm text-muted-foreground mt-1 mb-5 max-w-md mx-auto">{t.locked}</p>
              <Link to="/pro" className="inline-flex items-center gap-2 rounded-xl bg-hero-gradient px-5 py-2.5 text-sm font-semibold text-primary-foreground">
                <Crown className="w-4 h-4" /> {t.plans}
              </Link>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-dashed border-primary/40 bg-card p-6 text-center mb-6">
                <input ref={inputRef} type="file" accept={ACCEPT.join(",")} className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
                <button
                  onClick={() => inputRef.current?.click()}
                  disabled={busy || !status || left === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-hero-gradient px-6 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                  {busy ? t.reading : t.upload}
                </button>
                {left !== null && (
                  <div className={`mt-3 text-xs ${left === 0 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                    {t.left}: {left} / {limit}
                  </div>
                )}
                <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="w-3.5 h-3.5" /> {t.privacy}
                </div>
              </div>

              {error && <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">{error}</div>}

              {reply && (
                <div className="space-y-6">
                  <AiAnswerCard reply={reply} language={lang} />

                  <div className="rounded-2xl border border-border bg-card overflow-hidden">
                    {reply.lab_date && (
                      <div className="px-4 py-2.5 text-xs text-muted-foreground border-b border-border">{t.date}: {reply.lab_date}</div>
                    )}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-secondary/60 text-left text-xs text-muted-foreground">
                          <tr>
                            <th className="px-4 py-2 font-medium">{t.test}</th>
                            <th className="px-4 py-2 font-medium">{t.value}</th>
                            <th className="px-4 py-2 font-medium">{t.range}</th>
                            <th className="px-4 py-2 font-medium" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {reply.items.map((it, i) => (
                            <tr key={`${it.name}-${i}`} className={it.flag === "low" || it.flag === "high" ? "bg-red-500/5" : ""}>
                              <td className="px-4 py-2 text-foreground">{it.name}</td>
                              <td className="px-4 py-2 font-semibold text-foreground whitespace-nowrap">
                                {it.value}{it.unit ? <span className="font-normal text-muted-foreground"> {it.unit}</span> : null}
                              </td>
                              <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{it.reference_range ?? "—"}</td>
                              <td className="px-4 py-2">
                                {it.flag !== "unknown" && (
                                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${flagClass[it.flag]}`}>
                                    {it.flag === "high" && <ArrowUp className="w-3 h-3" />}
                                    {it.flag === "low" && <ArrowDown className="w-3 h-3" />}
                                    {t[it.flag]}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="px-4 py-2.5 text-xs text-muted-foreground border-t border-border">{t.note}</div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default LabResultsPage;
