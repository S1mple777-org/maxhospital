import { useLanguage } from "@/contexts/LanguageContext";
import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const avatarColors = [
  "from-teal-400 to-emerald-500",
  "from-blue-400 to-indigo-500",
  "from-amber-400 to-orange-500",
  "from-pink-400 to-rose-500",
  "from-purple-400 to-violet-500",
  "from-cyan-400 to-sky-500",
];

const DoctorsSection = () => {
  const { t, language } = useLanguage();
  const [doctors, setDoctors] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("doctors").select("*").limit(4);
      if (!data) return;
      const withProfiles = await Promise.all(data.map(async (d: any) => {
        const [profileRes, deptRes] = await Promise.all([
          supabase.from("profiles").select("full_name, avatar_url").eq("user_id", d.user_id).maybeSingle(),
          d.department_id ? supabase.from("departments").select("name_uz, name_ru, name_en").eq("id", d.department_id).maybeSingle() : Promise.resolve({ data: null }),
        ]);
        return { ...d, profileData: profileRes.data, deptData: deptRes.data };
      }));
      setDoctors(withProfiles);
    };
    load();
  }, []);

  const getDeptName = (dept: any) => {
    if (!dept) return "-";
    return language === "ru" ? dept.name_ru : language === "en" ? dept.name_en : dept.name_uz;
  };

  if (doctors.length === 0) {
    return (
      <section id="doctors" className="py-20">
        <div className="container mx-auto px-4">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-12">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-3">{t("doctors.title")}</h2>
            <p className="text-muted-foreground max-w-md mx-auto">{t("doctors.subtitle")}</p>
          </motion.div>
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-lg mb-2">👨‍⚕️</p>
            <p>Hozircha shifokorlar yo'q</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="doctors" className="py-20">
      <div className="container mx-auto px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-12">
          <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-3">{t("doctors.title")}</h2>
          <p className="text-muted-foreground max-w-md mx-auto">{t("doctors.subtitle")}</p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {doctors.map((doc, i) => {
            const name = doc.profileData?.full_name || "Doctor";
            return (
              <motion.div key={doc.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }} className="group">
                <div className="bg-card rounded-xl overflow-hidden card-shadow hover:card-shadow-hover transition-all duration-300 hover:-translate-y-1">
                  <div className="relative h-48 bg-secondary flex items-center justify-center">
                    {doc.profileData?.avatar_url ? (
                      <img src={doc.profileData.avatar_url} alt={name} className="w-full h-full object-cover" />
                    ) : (
                      <div className={`w-24 h-24 rounded-full bg-gradient-to-br ${avatarColors[i % avatarColors.length]} flex items-center justify-center text-3xl font-bold text-white shadow-lg`}>
                        {name[0]?.toUpperCase() || "D"}
                      </div>
                    )}
                    <div className={`absolute top-3 right-3 px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${doc.is_online ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${doc.is_online ? "bg-green-500" : "bg-muted-foreground"}`} />
                      {doc.is_online ? t("doctors.online") : t("doctors.offline")}
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-display font-semibold text-foreground mb-1">{name}</h3>
                    <p className="text-sm text-primary font-medium mb-1">{doc.title}</p>
                    <p className="text-xs text-muted-foreground mb-3">{getDeptName(doc.deptData)}</p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                      <span>{doc.experience_years} {t("doctors.experience")}</span>
                      <span>{doc.patients_count.toLocaleString()} {t("doctors.patients")}</span>
                    </div>
                    <div className="flex items-center gap-0.5 mb-4">
                      {[1,2,3,4,5].map((s) => (
                        <Star key={s} className={`w-3.5 h-3.5 ${s <= Math.round(doc.rating) ? "fill-warning text-warning" : "text-muted"}`} />
                      ))}
                      <span className="text-xs text-muted-foreground ml-1">{Number(doc.rating).toFixed(1)}</span>
                    </div>
                    <Link to="/start-consultation" className="w-full py-2 rounded-lg border border-primary text-primary text-sm font-medium hover:bg-primary hover:text-primary-foreground transition-colors block text-center">
                      {t("doctors.viewProfile")}
                    </Link>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default DoctorsSection;
