import { useLanguage } from "@/contexts/LanguageContext";
import { motion } from "framer-motion";
import { ArrowRight, Heart, Video, Clock, BookOpenCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import heroImage from "@/assets/hero-medical.jpg";
import { Link } from "react-router-dom";
import EcgLine from "@/components/EcgLine";

const PERKS = {
  uz: [{ icon: Clock, text: "24/7 shifokor" }, { icon: Video, text: "Video konsultatsiya" }, { icon: BookOpenCheck, text: "Manbali AI javoblar" }],
  ru: [{ icon: Clock, text: "Врач 24/7" }, { icon: Video, text: "Видеоконсультация" }, { icon: BookOpenCheck, text: "ИИ с источниками" }],
  en: [{ icon: Clock, text: "Doctors 24/7" }, { icon: Video, text: "Video consultation" }, { icon: BookOpenCheck, text: "AI answers with sources" }],
} as const;
const PULSE = { uz: "Puls", ru: "Пульс", en: "Pulse" } as const;

const Hero = () => {
  const { t, language } = useLanguage();
  const [counts, setCounts] = useState({ doctors: 0, patients: 0, consultations: 0 });
  const [bpm, setBpm] = useState(72);

  useEffect(() => {
    void (async () => {
      const [d, p, c] = await Promise.all([
        supabase.from("doctors").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("consultations").select("id", { count: "exact", head: true }),
      ]);
      setCounts({ doctors: d.count || 0, patients: p.count || 0, consultations: c.count || 0 });
    })();
  }, []);

  // Puls raqami sekin o'zgarib turadi — jonli ko'rinish uchun (faqat bezak).
  useEffect(() => {
    const id = setInterval(() => setBpm((b) => Math.min(76, Math.max(68, b + (Math.random() > 0.5 ? 1 : -1)))), 1800);
    return () => clearInterval(id);
  }, []);

  const stats = [
    { value: `${counts.doctors}+`, label: t("hero.stats.doctors") },
    { value: `${counts.patients}+`, label: t("hero.stats.patients") },
    { value: `${counts.consultations}+`, label: t("hero.stats.consultations") },
  ];
  const perks = PERKS[language as keyof typeof PERKS] ?? PERKS.uz;

  return (
    <section id="home" className="relative min-h-[92vh] flex items-center pt-20 overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-accent/40 via-background to-background" />

      <div className="container mx-auto px-4 py-16">
        <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-14 items-center">
          <div>
            <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} className="flex flex-wrap gap-x-5 gap-y-2 mb-6 text-sm text-muted-foreground">
              {perks.map((p) => (
                <li key={p.text} className="inline-flex items-center gap-1.5"><p.icon className="w-4 h-4 text-primary" />{p.text}</li>
              ))}
            </motion.ul>

            <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1 }}
              className="font-display text-4xl md:text-5xl lg:text-6xl font-extrabold leading-[1.08] tracking-tight text-foreground mb-5 max-w-xl">
              {t("hero.title")}
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.25 }}
              className="text-lg text-muted-foreground mb-2 font-medium max-w-lg">{t("hero.subtitle")}</motion.p>
            <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.32 }}
              className="text-muted-foreground mb-8 max-w-lg">{t("hero.description")}</motion.p>

            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.4 }} className="flex flex-wrap gap-3 mb-12">
              <Link to="/start-consultation" className="group inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-hero-gradient text-primary-foreground font-semibold text-sm shadow-lg hover:shadow-xl transition-shadow">
                {t("hero.cta")} <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link to="/departments" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-border bg-card text-foreground font-semibold text-sm hover:bg-secondary transition-colors">
                {t("hero.learnMore")}
              </Link>
            </motion.div>

            <motion.dl initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.6 }} className="flex divide-x divide-border max-w-md">
              {stats.map((s) => (
                <div key={s.label} className="px-5 first:pl-0">
                  <dt className="sr-only">{s.label}</dt>
                  <dd className="font-display font-bold text-2xl text-foreground">{s.value}</dd>
                  <dd className="text-xs text-muted-foreground leading-tight mt-0.5">{s.label}</dd>
                </div>
              ))}
            </motion.dl>
          </div>

          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.2 }} className="relative hidden lg:block">
            <div className="rounded-3xl overflow-hidden card-shadow">
              <img src={heroImage} alt="Online shifokor konsultatsiyasi" className="w-full h-auto" loading="eager" />
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-t from-primary/25 via-transparent to-transparent" />
            </div>

            {/* Hero'ning asosiy elementi: o'zi chizilib boradigan yurak chizig'i */}
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, duration: 0.6 }}
              className="absolute -bottom-6 -left-8 right-10 glass rounded-2xl px-5 py-4 card-shadow border border-border/60 text-primary">
              <div className="flex items-center gap-3 mb-1">
                <Heart className="w-5 h-5 heart-beat fill-current" />
                <span className="text-xs font-medium text-muted-foreground">{PULSE[language as keyof typeof PULSE] ?? PULSE.uz}</span>
                <span className="ml-auto font-display font-bold text-xl text-foreground tabular-nums">{bpm}<span className="text-xs font-normal text-muted-foreground ml-1">bpm</span></span>
              </div>
              <EcgLine className="w-full h-14" />
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
