import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useLanguage } from "@/contexts/LanguageContext";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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

const DepartmentsPage = () => {
  const { t, language } = useLanguage();
  const [departments, setDepartments] = useState<any[]>([]);

  useEffect(() => {
    supabase.from("departments").select("*").eq("is_active", true).then(({ data }) => {
      if (data) setDepartments(data);
    });
  }, []);

  const getName = (dept: any) => language === "ru" ? dept.name_ru : language === "en" ? dept.name_en : dept.name_uz;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-20">
        <div className="container mx-auto px-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
            <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-3">{t("departments.title")}</h1>
            <p className="text-muted-foreground max-w-md mx-auto">{t("departments.subtitle")}</p>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {departments.map((dept, i) => {
              const Icon = iconMap[dept.icon] || Stethoscope;
              const color = colorMap[dept.icon] || "from-teal-400 to-emerald-400";
              return (
                <motion.div key={dept.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <Link to={`/departments/${dept.id}`} className="group cursor-pointer block">
                    <div className="bg-card rounded-xl p-6 card-shadow hover:card-shadow-hover transition-all duration-300 hover:-translate-y-1 text-center">
                      {dept.icon_url ? (
                        <div className="w-16 h-16 rounded-xl mx-auto mb-4 overflow-hidden group-hover:scale-110 transition-transform">
                          <img src={dept.icon_url} alt={getName(dept)} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform`}>
                          <Icon className="w-8 h-8 text-white" />
                        </div>
                      )}
                      <h3 className="font-display font-semibold text-foreground">{getName(dept)}</h3>
                      <p className="text-sm text-muted-foreground mt-1">{Number(dept.price_uzs).toLocaleString()} UZS</p>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>

          {departments.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Stethoscope className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Hozircha bo'limlar yo'q</p>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default DepartmentsPage;
