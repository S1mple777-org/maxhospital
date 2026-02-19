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
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-12">
          <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-3">{t("departments.title")}</h2>
          <p className="text-muted-foreground max-w-md mx-auto">{t("departments.subtitle")}</p>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {departments.map((dept, i) => {
            const Icon = iconMap[dept.icon] || Stethoscope;
            const color = colorMap[dept.icon] || "from-teal-400 to-emerald-400";
            return (
              <motion.div key={dept.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }} className="group cursor-pointer">
                <div className="bg-card rounded-xl p-6 card-shadow hover:card-shadow-hover transition-all duration-300 hover:-translate-y-1 text-center">
                  <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform`}>
                    <Icon className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="font-display font-semibold text-sm text-foreground">{getName(dept)}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{Number(dept.price_uzs).toLocaleString()} UZS</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default DepartmentsSection;
