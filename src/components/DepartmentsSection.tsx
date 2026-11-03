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


const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
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

      <div className="container mx-auto px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-3">{t("departments.title")}</h2>
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
            return (
              <motion.div
                key={dept.id}
                variants={cardVariants}
                className="group cursor-pointer"
              >
                <div className="bg-card rounded-2xl p-6 border border-border lift text-center">
                  {dept.icon_url ? (
                    <div className="w-14 h-14 rounded-2xl mx-auto mb-4 overflow-hidden">
                      <img src={dept.icon_url} alt={getName(dept)} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-accent text-accent-foreground flex items-center justify-center mx-auto mb-4 transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon className="w-7 h-7" />
                    </div>
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
