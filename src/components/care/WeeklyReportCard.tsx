import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Crown, Loader2, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import type { Lang } from "@/lib/aiAssistant";
import { generateWeeklyReport, loadLatestWeeklyReport, type WeeklyReport } from "@/lib/care";

/** Pro / Premium: AI weekly summary of measurements and medicine adherence (also sent to Telegram on Sundays). */
const WeeklyReportCard = ({ enabled, language, refreshKey }: { enabled: boolean; language: Lang; refreshKey: number }) => {
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (enabled) loadLatestWeeklyReport().then(setReport); }, [enabled, refreshKey]);

  if (!enabled) {
    return (
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
        <div className="flex items-center gap-2 font-semibold text-foreground"><CalendarDays className="w-5 h-5 text-primary" /> Haftalik AI hisobot</div>
        <p className="text-sm text-muted-foreground mt-1">Har yakshanba AI hafta bo'yi o'lchovlar va dori ichilishini tahlil qilib, Telegram'ga qisqa hisobot yuboradi.</p>
        <Link to="/pro" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-hero-gradient px-4 py-2 text-sm font-semibold text-primary-foreground">
          <Crown className="w-4 h-4" /> Pro va Premium'da
        </Link>
      </div>
    );
  }

  const make = async () => {
    setBusy(true);
    try {
      setReport(await generateWeeklyReport(language, !!report));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 font-semibold text-foreground"><CalendarDays className="w-5 h-5 text-primary" /> Haftalik AI hisobot</div>
        <button onClick={make} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary disabled:opacity-50">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {report ? "Yangilash" : "Hozir tayyorlash"}
        </button>
      </div>
      {report ? (
        <>
          <div className="text-xs text-muted-foreground mb-2">{report.period_start} — {report.period_end}</div>
          <p className="text-sm text-foreground whitespace-pre-line">{report.content}</p>
          {report.sent_telegram && <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><Send className="w-3 h-3" /> Telegram'ga yuborilgan</div>}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Hisobot har yakshanba kechqurun avtomatik tayyorlanadi va Telegram'ga yuboriladi. Hozir ko'rish uchun tugmani bosing.</p>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">Raqamlarni dastur hisoblaydi, AI faqat ularni tushuntiradi. Bu tashxis emas.</p>
    </div>
  );
};

export default WeeklyReportCard;
