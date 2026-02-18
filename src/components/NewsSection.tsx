import { useLanguage } from "@/contexts/LanguageContext";
import { motion } from "framer-motion";
import { Calendar, ArrowRight } from "lucide-react";

const newsData = [
  {
    id: 1,
    image: "🏥",
    date: "2026-02-15",
    titleKey: "Yangi kardiologiya bo'limi ochildi",
    titleRu: "Открыто новое отделение кардиологии",
    titleEn: "New Cardiology Department Opened",
    descKey: "Eng zamonaviy uskunalar bilan jihozlangan yangi kardiologiya bo'limi bemorlar xizmatida.",
    descRu: "Новое отделение кардиологии, оснащённое современным оборудованием, к вашим услугам.",
    descEn: "A new cardiology department equipped with state-of-the-art facilities is now available.",
  },
  {
    id: 2,
    image: "💊",
    date: "2026-02-10",
    titleKey: "Bepul tibbiy ko'rik kunlari",
    titleRu: "Дни бесплатных медицинских осмотров",
    titleEn: "Free Medical Checkup Days",
    descKey: "Har oyning birinchi haftasida bepul tibbiy ko'rik imkoniyati.",
    descRu: "Бесплатные медицинские осмотры в первую неделю каждого месяца.",
    descEn: "Free medical checkups available during the first week of every month.",
  },
  {
    id: 3,
    image: "🩺",
    date: "2026-02-05",
    titleKey: "Telemeditsina xizmatlari kengaytirildi",
    titleRu: "Расширены телемедицинские услуги",
    titleEn: "Telemedicine Services Expanded",
    descKey: "Endi barcha bo'limlar bo'yicha onlayn konsultatsiya olish imkoni mavjud.",
    descRu: "Теперь доступны онлайн-консультации по всем отделениям.",
    descEn: "Online consultations are now available across all departments.",
  },
];

const NewsSection = () => {
  const { language, t } = useLanguage();

  const getTitle = (news: typeof newsData[0]) => {
    if (language === "ru") return news.titleRu;
    if (language === "en") return news.titleEn;
    return news.titleKey;
  };

  const getDesc = (news: typeof newsData[0]) => {
    if (language === "ru") return news.descRu;
    if (language === "en") return news.descEn;
    return news.descKey;
  };

  return (
    <section id="news" className="py-20 relative">
      <div className="absolute inset-0 bg-secondary/30" />
      <div className="container mx-auto px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-3">
            {t("news.title")}
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            {t("news.subtitle")}
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          {newsData.map((news, i) => (
            <motion.article
              key={news.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="group cursor-pointer"
            >
              <div className="bg-card rounded-xl overflow-hidden card-shadow hover:card-shadow-hover transition-all duration-300 hover:-translate-y-1">
                <div className="h-44 bg-secondary flex items-center justify-center text-5xl">
                  {news.image}
                </div>
                <div className="p-5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                    <Calendar className="w-3 h-3" />
                    {new Date(news.date).toLocaleDateString(language === "ru" ? "ru-RU" : language === "en" ? "en-US" : "uz-UZ")}
                  </div>
                  <h3 className="font-display font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
                    {getTitle(news)}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                    {getDesc(news)}
                  </p>
                  <span className="inline-flex items-center gap-1 text-sm text-primary font-medium group-hover:gap-2 transition-all">
                    {t("news.readMore")} <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default NewsSection;
