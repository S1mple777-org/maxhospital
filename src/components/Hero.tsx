import { useLanguage } from "@/contexts/LanguageContext";
import { motion } from "framer-motion";
import { Play, ArrowRight, Shield, Clock, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import heroImage from "@/assets/hero-medical.jpg";
import { Link } from "react-router-dom";

const Hero = () => {
  const { t } = useLanguage();
  const [stats, setStats] = useState([
    { value: "0", label: t("hero.stats.doctors"), icon: "👨‍⚕️" },
    { value: "0", label: t("hero.stats.patients"), icon: "👥" },
    { value: "0", label: t("hero.stats.consultations"), icon: "💬" },
    { value: "98%", label: t("hero.stats.satisfaction"), icon: "⭐" },
  ]);

  useEffect(() => {
    const loadStats = async () => {
      const [doctorsRes, profilesRes, consultationsRes] = await Promise.all([
        supabase.from("doctors").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("consultations").select("id", { count: "exact", head: true }),
      ]);
      setStats([
        { value: `${doctorsRes.count || 0}+`, label: t("hero.stats.doctors"), icon: "👨‍⚕️" },
        { value: `${profilesRes.count || 0}+`, label: t("hero.stats.patients"), icon: "👥" },
        { value: `${consultationsRes.count || 0}+`, label: t("hero.stats.consultations"), icon: "💬" },
        { value: "98%", label: t("hero.stats.satisfaction"), icon: "⭐" },
      ]);
    };
    loadStats();
  }, [t]);

  const features = [
    { icon: Shield, text: "HIPAA Compliant" },
    { icon: Clock, text: "24/7 Available" },
    { icon: Video, text: "HD Video Call" },
  ];

  return (
    <section id="home" className="relative min-h-screen flex items-center pt-16 overflow-hidden">
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-hero-gradient opacity-5" />
        <div className="absolute top-20 right-0 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute bottom-20 left-0 w-80 h-80 rounded-full bg-accent/30 blur-3xl" />
      </div>

      <div className="container mx-auto px-4 py-20 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <div className="flex items-center gap-2 mb-6 flex-wrap">
              {features.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-accent text-accent-foreground">
                  <f.icon className="w-3 h-3" />{f.text}
                </span>
              ))}
            </div>

            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-extrabold leading-tight mb-4">
              <span className="text-gradient">{t("hero.title")}</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-3 font-medium">{t("hero.subtitle")}</p>
            <p className="text-muted-foreground mb-8 max-w-lg">{t("hero.description")}</p>

            <div className="flex flex-wrap gap-3 mb-12">
              <Link to="/start-consultation" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-hero-gradient text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity shadow-lg">
                {t("hero.cta")} <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/departments" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-border text-foreground font-semibold text-sm hover:bg-secondary transition-colors">
                <Play className="w-4 h-4" />{t("hero.learnMore")}
              </Link>
            </div>

            <div className="grid grid-cols-4 gap-4">
              {stats.map((stat, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.1, duration: 0.5 }} className="text-center">
                  <div className="text-xl mb-1">{stat.icon}</div>
                  <div className="font-display font-bold text-xl text-foreground">{stat.value}</div>
                  <div className="text-xs text-muted-foreground">{stat.label}</div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, delay: 0.2 }} className="relative hidden lg:block">
            <div className="relative rounded-2xl overflow-hidden card-shadow">
              <img src={heroImage} alt="Online Hospital - Medical Consultation" className="w-full h-auto rounded-2xl" loading="eager" />
              <div className="absolute inset-0 bg-gradient-to-t from-primary/20 to-transparent" />
            </div>
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.8, duration: 0.5 }} className="absolute -bottom-4 -left-4 glass rounded-xl px-4 py-3 card-shadow">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-hero-gradient flex items-center justify-center text-lg">👨‍⚕️</div>
                <div>
                  <div className="text-sm font-semibold text-foreground">Dr. Ahmadov</div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Online
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
