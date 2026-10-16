import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, BookOpen, ChevronDown, HeartPulse, Phone, ShieldCheck, Star, Stethoscope } from "lucide-react";
import type { AiReply, Lang } from "@/lib/aiAssistant";
import { EMERGENCY_PHONE } from "@/lib/aiAssistant";

const T: Record<Lang, Record<string, string>> = {
  uz: {
    emergency: "Shoshilinch holat",
    doctor: "Shifokor ko'rigi tavsiya etiladi",
    self_care: "Uy sharoitida yordam",
    call: `Tez yordam: ${EMERGENCY_PHONE}`,
    department: "Tavsiya etilgan bo'lim",
    doctors: "Mos shifokorlar",
    online: "Onlayn",
    sources: "Manbalar",
    start: "Konsultatsiya boshlash",
  },
  ru: {
    emergency: "Экстренная ситуация",
    doctor: "Рекомендуется осмотр врача",
    self_care: "Помощь в домашних условиях",
    call: `Скорая помощь: ${EMERGENCY_PHONE}`,
    department: "Рекомендуемое отделение",
    doctors: "Подходящие врачи",
    online: "Онлайн",
    sources: "Источники",
    start: "Начать консультацию",
  },
  en: {
    emergency: "Emergency",
    doctor: "A doctor's visit is recommended",
    self_care: "Home care",
    call: `Ambulance: ${EMERGENCY_PHONE}`,
    department: "Recommended department",
    doctors: "Matching doctors",
    online: "Online",
    sources: "Sources",
    start: "Start a consultation",
  },
};

const pageLabel = (lang: Lang, page: number) =>
  lang === "uz" ? `${page}-bet` : lang === "ru" ? `стр. ${page}` : `p. ${page}`;

const STYLE = {
  emergency: { box: "border-red-500/40 bg-red-500/10", badge: "bg-red-600 text-white", Icon: AlertTriangle },
  doctor: { box: "border-amber-500/40 bg-amber-500/10", badge: "bg-amber-500 text-white", Icon: Stethoscope },
  self_care: { box: "border-emerald-500/40 bg-emerald-500/10", badge: "bg-emerald-600 text-white", Icon: ShieldCheck },
} as const;

const AiAnswerCard = ({ reply, language }: { reply: AiReply; language: Lang }) => {
  const t = T[language];
  const style = STYLE[reply.triage] ?? STYLE.doctor;
  const [showSources, setShowSources] = useState(false);

  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${style.box}`}>
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${style.badge}`}>
        <style.Icon className="w-3.5 h-3.5" /> {t[reply.triage]}
      </span>

      <p className="text-sm leading-relaxed text-foreground whitespace-pre-line">{reply.answer}</p>

      {reply.triage === "emergency" && (
        <a
          href={`tel:${EMERGENCY_PHONE}`}
          className="flex items-center justify-center gap-2 w-full rounded-xl bg-red-600 py-3 text-base font-bold text-white hover:bg-red-700"
        >
          <Phone className="w-5 h-5" /> {t.call}
        </a>
      )}

      {reply.department && (
        <Link
          to={`/departments/${reply.department.id}`}
          className="flex items-center gap-2 rounded-xl bg-card border border-border px-3 py-2 text-sm hover:bg-secondary"
        >
          <HeartPulse className="w-4 h-4 text-primary shrink-0" />
          <span className="text-muted-foreground">{t.department}:</span>
          <span className="font-medium text-foreground">{reply.department.name}</span>
        </Link>
      )}

      {reply.doctors.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">{t.doctors}</div>
          {reply.doctors.map((d) => (
            <Link
              key={d.id}
              to={`/doctors/${d.id}`}
              className="flex items-center justify-between gap-3 rounded-xl bg-card border border-border px-3 py-2 hover:bg-secondary"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground truncate">{d.name || d.title}</div>
                <div className="text-xs text-muted-foreground truncate">{d.title}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0 text-xs">
                {d.is_online && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-700 dark:text-emerald-400">{t.online}</span>}
                <span className="flex items-center gap-0.5 text-muted-foreground"><Star className="w-3 h-3 fill-amber-400 text-amber-400" />{Number(d.rating).toFixed(1)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {reply.sources.length > 0 && (
        <div className="rounded-xl bg-card border border-border">
          <button
            onClick={() => setShowSources((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-foreground"
          >
            <span className="flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5 text-primary" /> {t.sources} ({reply.sources.length})</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showSources ? "rotate-180" : ""}`} />
          </button>
          {showSources && (
            <ol className="space-y-2 border-t border-border px-3 py-2">
              {reply.sources.map((s) => (
                <li key={s.n} className="text-xs">
                  <div className="font-medium text-foreground">
                    [{s.n}] {s.book_title}{s.book_author ? ` — ${s.book_author}` : ""}, {pageLabel(language, s.page)}
                  </div>
                  <p className="mt-0.5 text-muted-foreground italic">{s.excerpt}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
};

export default AiAnswerCard;
