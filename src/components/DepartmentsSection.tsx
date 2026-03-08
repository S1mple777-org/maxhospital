import { useLanguage } from "@/contexts/LanguageContext";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import {
  Bone, Heart, Brain, Baby, Fingerprint, Eye, SmilePlus, Stethoscope,
} from "lucide-react";

const iconMap: Record<string, any> = {
  bone: Bone, heart: Heart, brain: Brain, baby: Baby,
  fingerprint: Fingerprint, eye: Eye, "smile-plus": SmilePlus, stethoscope: Stethoscope,
};

const colorMap: Record<string, string> = {
  bone: "from-red-400 to-orange-400",
  heart: "from-pink-400 to-rose-400",
  brain: "from-purple-400 to-violet-400",
  baby: "from-blue-400 to-cyan-400",
  fingerprint: "from-amber-400 to-yellow-400",
  eye: "from-teal-400 to-emerald-400",
  "smile-plus": "from-green-400 to-lime-400",
  stethoscope: "from-indigo-400 to-blue-400",
};

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 40, scale: 0.9, rotateX: 15 },
  visible: {
    opacity: 1, y: 0, scale: 1, rotateX: 0,
    transition: { type: "spring", stiffness: 150, damping: 18 },
  },
};

const DepartmentsSection = () => {
  const { t, language } = useLanguage();
  const [departments, setDepartments] = useState<any[]>([]);

  useEffect(() => {
    supabase.from("departments").select("*").eq("is_active", true).then(({ data }) => {
      if (data) setDepartments(data);
    });
  }, []);

  const getName = (dept: any) => language === "ru" ? dept.name_ru : language === "en" ? dept.name_en : dept.name_uz;

  return (
    <section id="departments" className="py-20 relative">
      <div className="absolute inset-0 bg-secondary/30" />
      {/* Decorative floating shapes */}
      <div className="absolute top-10 left-10 w-32 h-32 bg-primary/5 rounded-full blur-2xl animate-float-slow" />
      <div className="absolute bottom-10 right-10 w-40 h-40 bg-accent/10 rounded-full blur-2xl animate-float-reverse" />

      <div className="container mx-auto px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <motion.h2
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1, type: "spring" }}
            className="font-display text-3xl md:text-4xl font-bold text-foreground mb-3"
          >
            {t("departments.title")}
          </motion.h2>
          <p className="text-muted-foreground max-w-md mx-auto">{t("departments.subtitle")}</p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          {departments.map((dept) => {
            const Icon = iconMap[dept.icon] || Stethoscope;
            const color = colorMap[dept.icon] || "from-teal-400 to-emerald-400";
            return (
              <motion.div
                key={dept.id}
                variants={cardVariants}
                whileHover={{ y: -8, scale: 1.03, transition: { type: "spring", stiffness: 300 } }}
                className="group cursor-pointer"
              >
                <div className="bg-card rounded-xl p-6 card-shadow hover:card-shadow-hover transition-all duration-300 text-center relative overflow-hidden">
                  {/* Shimmer on hover */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-shimmer pointer-events-none" />
                  {dept.icon_url ? (
                    <div className="w-14 h-14 rounded-xl mx-auto mb-4 overflow-hidden group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                      <img src={dept.icon_url} alt={getName(dept)} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <motion.div
                      whileHover={{ rotate: [0, -10, 10, -5, 0], transition: { duration: 0.5 } }}
                      className={`w-14 h-14 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center mx-auto mb-4 transition-transform duration-300`}
                    >
                      <Icon className="w-7 h-7 text-white" />
                    </motion.div>
                  )}
                  <h3 className="font-display font-semibold text-sm text-foreground">{getName(dept)}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{Number(dept.price_uzs).toLocaleString()} UZS</p>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
};

export default DepartmentsSection;
