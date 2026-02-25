import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Star, ArrowLeft, Stethoscope, Shield } from "lucide-react";
import { motion } from "framer-motion";

const avatarColors = [
  "from-teal-400 to-emerald-500",
  "from-blue-400 to-indigo-500",
  "from-amber-400 to-orange-500",
  "from-pink-400 to-rose-500",
];

const DepartmentDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { language, t } = useLanguage();
  const [department, setDepartment] = useState<any>(null);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [admins, setAdmins] = useState<any[]>([]);

  const getName = (item: any, prefix = "name") =>
    language === "ru" ? item[`${prefix}_ru`] : language === "en" ? item[`${prefix}_en`] : item[`${prefix}_uz`];

  useEffect(() => {
    if (!id) return;
    // Load department
    supabase.from("departments").select("*").eq("id", id).maybeSingle().then(({ data }) => {
      if (data) setDepartment(data);
    });
    // Load doctors in this department
    const loadDoctors = async () => {
      const { data } = await supabase.from("doctors").select("*").eq("department_id", id);
      if (!data) return;
      const withProfiles = await Promise.all(data.map(async (d: any) => {
        const { data: p } = await supabase.from("profiles").select("full_name, avatar_url").eq("user_id", d.user_id).maybeSingle();
        return { ...d, profileData: p };
      }));
      setDoctors(withProfiles);
    };
    loadDoctors();
    // Load admins
    const loadAdmins = async () => {
      const { data: adminRoles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      if (!adminRoles || adminRoles.length === 0) return;
      const profiles = await Promise.all(adminRoles.map(async (r: any) => {
        const { data: p } = await supabase.from("profiles").select("*").eq("user_id", r.user_id).maybeSingle();
        return p;
      }));
      setAdmins(profiles.filter(Boolean));
    };
    loadAdmins();
  }, [id]);

  if (!department) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 pb-20 text-center text-muted-foreground">Yuklanmoqda...</div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-20">
        <div className="container mx-auto px-4 max-w-4xl">
          <Link to="/departments" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
            <ArrowLeft className="w-4 h-4" /> Bo'limlarga qaytish
          </Link>

          {/* Department Header */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border border-border p-6 mb-8 flex items-center gap-5">
            {department.icon_url ? (
              <img src={department.icon_url} alt="" className="w-16 h-16 rounded-xl object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center">
                <Stethoscope className="w-8 h-8 text-primary" />
              </div>
            )}
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground">{getName(department)}</h1>
              <p className="text-sm text-muted-foreground">{Number(department.price_uzs).toLocaleString()} UZS / konsultatsiya</p>
            </div>
          </motion.div>

          {/* Doctors */}
          <h2 className="font-display text-lg font-semibold text-foreground mb-4">Bu bo'limdagi shifokorlar</h2>
          {doctors.length === 0 ? (
            <div className="bg-card rounded-xl border border-border p-8 text-center text-muted-foreground mb-8">
              <p>Bu bo'limda hozir shifokorlar yo'q</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {doctors.map((doc, i) => {
                const name = doc.profileData?.full_name || "Doctor";
                return (
                  <motion.div key={doc.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                    <div className="bg-card rounded-xl overflow-hidden border border-border hover:-translate-y-1 transition-all">
                      <div className="relative h-40 bg-secondary flex items-center justify-center">
                        {doc.profileData?.avatar_url ? (
                          <img src={doc.profileData.avatar_url} alt={name} className="w-full h-full object-cover" />
                        ) : (
                          <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${avatarColors[i % avatarColors.length]} flex items-center justify-center text-2xl font-bold text-white`}>
                            {name[0]?.toUpperCase() || "D"}
                          </div>
                        )}
                        <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${doc.is_online ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${doc.is_online ? "bg-green-500" : "bg-muted-foreground"}`} />
                          {doc.is_online ? "Online" : "Offline"}
                        </div>
                      </div>
                      <div className="p-4">
                        <h3 className="font-display font-semibold text-foreground mb-1">{name}</h3>
                        <p className="text-sm text-primary font-medium mb-1">{doc.title}</p>
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                          <span>{doc.experience_years} yil tajriba</span>
                          <span>{doc.patients_count} bemor</span>
                        </div>
                        <div className="flex items-center gap-0.5 mb-3">
                          {[1,2,3,4,5].map(s => (
                            <Star key={s} className={`w-3 h-3 ${s <= Math.round(doc.rating) ? "fill-warning text-warning" : "text-muted"}`} />
                          ))}
                          <span className="text-xs text-muted-foreground ml-1">{Number(doc.rating).toFixed(1)}</span>
                        </div>
                        <Link to="/start-consultation" className="w-full py-2 rounded-lg border border-primary text-primary text-sm font-medium hover:bg-primary hover:text-primary-foreground transition-colors block text-center">
                          Konsultatsiya
                        </Link>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Admins */}
          {admins.length > 0 && (
            <div>
              <h2 className="font-display text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" /> Mas'ul adminlar
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {admins.map((admin: any) => (
                  <div key={admin.id} className="bg-card rounded-xl border border-border p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-hero-gradient flex items-center justify-center text-lg font-bold text-primary-foreground">
                      {admin.full_name?.[0]?.toUpperCase() || "A"}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{admin.full_name || "Admin"}</p>
                      <p className="text-xs text-muted-foreground">{admin.phone || "Telefon ko'rsatilmagan"}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default DepartmentDetailPage;
