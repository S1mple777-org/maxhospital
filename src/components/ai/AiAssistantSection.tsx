import { Link } from "react-router-dom";
import { BookOpen, Siren, Sparkles, TrendingUp, UserRoundSearch } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Lang } from "@/lib/aiAssistant";

const T: Record<Lang, { title: string; subtitle: string; cta: string; items: [string, string][] }> = {
  uz: {
    title: "AI-yordamchi",
    subtitle: "Sun'iy intellekt saytdagi tibbiy kitoblarga tayangan holda sizga yo'l ko'rsatadi",
    cta: "AI-yordamchini sinab ko'rish",
    items: [
      ["To'g'ri shifokor", "Belgilaringizga qarab kerakli bo'lim va onlayn shifokorni tavsiya qiladi"],
      ["Manbali javob", "Oddiy holatlarda kitob nomi va beti ko'rsatilgan javob beradi"],
      ["Ko'riklar tahlili", "Oldingi ko'rik natijalaringizni taqqoslab, o'sish yoki pasayishni tushuntiradi"],
      ["Xavfli holatlar", "Shoshilinch belgilarni darhol aniqlab, 103 tez yordamga yo'naltiradi"],
    ],
  },
  ru: {
    title: "AI-помощник",
    subtitle: "Искусственный интеллект подскажет, опираясь на медицинские книги сайта",
    cta: "Попробовать AI-помощника",
    items: [
      ["Нужный врач", "По симптомам подбирает отделение и врача онлайн"],
      ["Ответ с источником", "В простых случаях отвечает с указанием книги и страницы"],
      ["Анализ осмотров", "Сравнивает прошлые показатели и объясняет рост или снижение"],
      ["Опасные состояния", "Сразу распознаёт экстренные признаки и направляет в скорую 103"],
    ],
  },
  en: {
    title: "AI assistant",
    subtitle: "Artificial intelligence guides you using the site's own medical books",
    cta: "Try the AI assistant",
    items: [
      ["The right doctor", "Suggests the department and an online doctor based on your symptoms"],
      ["Answers with sources", "For simple cases it answers citing the book and page"],
      ["Check-up analysis", "Compares your earlier results and explains rises or drops"],
      ["Dangerous signs", "Detects emergency signs instantly and directs you to 103"],
    ],
  },
};

const ICONS = [UserRoundSearch, BookOpen, TrendingUp, Siren];

const AiAssistantSection = () => {
  const { language } = useLanguage();
  const t = T[language as Lang];
  return (
    <section className="py-16">
      <div className="container mx-auto px-4">
        <div className="rounded-3xl border border-border bg-card p-6 md:p-10 card-shadow">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary mb-3">
                <Sparkles className="w-3.5 h-3.5" /> Gemini AI
              </div>
              <h2 className="font-display text-3xl font-bold text-foreground">{t.title}</h2>
              <p className="text-muted-foreground mt-1">{t.subtitle}</p>
            </div>
            <Link to="/ai-assistant" className="inline-flex items-center justify-center gap-2 rounded-xl bg-hero-gradient px-5 py-3 text-sm font-medium text-primary-foreground">
              <Sparkles className="w-4 h-4" /> {t.cta}
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {t.items.map(([title, text], i) => {
              const Icon = ICONS[i];
              return (
                <div key={title} className="rounded-2xl bg-secondary/50 p-4">
                  <Icon className="w-6 h-6 text-primary mb-2" />
                  <div className="font-semibold text-foreground text-sm">{title}</div>
                  <p className="text-xs text-muted-foreground mt-1">{text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default AiAssistantSection;
