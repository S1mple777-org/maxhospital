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
      {/* Animated background blobs */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-hero-gradient opacity-5" />
        <div className="absolute top-20 right-10 w-96 h-96 rounded-full bg-primary/5 blur-3xl animate-float-slow" />
        <div className="absolute bottom-20 left-0 w-80 h-80 rounded-full bg-accent/30 blur-3xl animate-float-reverse" />
        <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-primary/3 blur-3xl animate-morph" />
        {/* Rotating decorative ring */}
        <div className="absolute top-32 right-1/4 w-40 h-40 border border-primary/10 rounded-full animate-rotate-slow" />
        <div className="absolute bottom-32 right-1/3 w-24 h-24 border border-accent/20 rounded-full animate-rotate-slow" style={{ animationDirection: 'reverse' }} />
      </div>

      <div className="container mx-auto px-4 py-20 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            {/* Animated feature badges */}
            <div className="flex items-center gap-2 mb-6 flex-wrap">
              {features.map((f, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, scale: 0.8, x: -20 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.15, type: "spring", stiffness: 200 }}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-accent text-accent-foreground hover:scale-105 transition-transform cursor-default"
                >
                  <f.icon className="w-3 h-3" />{f.text}
                </motion.span>
              ))}
            </div>

            <motion.h1
              className="font-display text-4xl md:text-5xl lg:text-6xl font-extrabold leading-tight mb-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.8 }}
            >
              <span className="text-gradient animate-gradient-shift">{t("hero.title")}</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="text-lg md:text-xl text-muted-foreground mb-3 font-medium"
            >
              {t("hero.subtitle")}
            </motion.p>
            <motion.p
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="text-muted-foreground mb-8 max-w-lg"
            >
              {t("hero.description")}
            </motion.p>

            {/* Animated CTA buttons */}
            <div className="flex flex-wrap gap-3 mb-12">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, type: "spring", stiffness: 150 }}
              >
                <Link to="/start-consultation" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-hero-gradient text-primary-foreground font-semibold text-sm hover:opacity-90 transition-all shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 animate-glow-pulse">
                  {t("hero.cta")} <ArrowRight className="w-4 h-4 animate-bounce-subtle" />
                </Link>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7, type: "spring", stiffness: 150 }}
              >
                <Link to="/departments" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-border text-foreground font-semibold text-sm hover:bg-secondary hover:scale-105 active:scale-95 transition-all">
                  <Play className="w-4 h-4" />{t("hero.learnMore")}
                </Link>
              </motion.div>
            </div>

            {/* Stats with counter animation */}
            <div className="grid grid-cols-4 gap-4">
              {stats.map((stat, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 30, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.8 + i * 0.12, type: "spring", stiffness: 200, damping: 15 }}
                  whileHover={{ scale: 1.1, y: -5 }}
                  className="text-center cursor-default"
                >
                  <div className="text-xl mb-1">{stat.icon}</div>
                  <div className="font-display font-bold text-xl text-foreground">{stat.value}</div>
                  <div className="text-xs text-muted-foreground">{stat.label}</div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Hero image with enhanced animations */}
          <motion.div
            initial={{ opacity: 0, x: 50, rotateY: 10 }}
            animate={{ opacity: 1, x: 0, rotateY: 0 }}
            transition={{ duration: 0.9, delay: 0.3 }}
            className="relative hidden lg:block"
          >
            {/* Pulse ring behind image */}
            <div className="absolute -inset-4 rounded-2xl bg-primary/10 animate-pulse-ring" />

            <div className="relative rounded-2xl overflow-hidden card-shadow animate-float" style={{ animationDuration: '8s' }}>
              <img src={heroImage} alt="Online Hospital - Medical Consultation" className="w-full h-auto rounded-2xl" loading="eager" />
              <div className="absolute inset-0 bg-gradient-to-t from-primary/20 to-transparent" />
              {/* Shimmer overlay */}
              <div className="absolute inset-0 animate-shimmer pointer-events-none" />
            </div>

            {/* Floating doctor card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8, x: -30 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              transition={{ delay: 1, type: "spring", stiffness: 150 }}
              className="absolute -bottom-4 -left-4 glass rounded-xl px-4 py-3 card-shadow animate-float"
              style={{ animationDelay: '1s' }}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-hero-gradient flex items-center justify-center text-lg">👨‍⚕️</div>
                <div>
                  <div className="text-sm font-semibold text-foreground">Dr. Ahmadov</div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse" />Online
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Floating stats badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 1.3, type: "spring", stiffness: 150 }}
              className="absolute -top-2 -right-2 glass rounded-xl px-3 py-2 card-shadow animate-float-reverse"
            >
              <div className="text-center">
                <div className="text-lg font-bold text-primary">⚡</div>
                <div className="text-[10px] text-muted-foreground font-medium">Fast & Secure</div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
