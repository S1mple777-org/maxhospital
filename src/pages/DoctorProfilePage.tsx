import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { motion } from "framer-motion";
import { Star, MapPin, Briefcase, Clock, Users, ArrowLeft, Stethoscope, Send } from "lucide-react";

const avatarColors = [
  "from-teal-400 to-emerald-500",
  "from-blue-400 to-indigo-500",
  "from-amber-400 to-orange-500",
  "from-pink-400 to-rose-500",
];

const DoctorProfilePage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const [doctor, setDoctor] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: doc } = await supabase.from("doctors").select("*").eq("id", id).maybeSingle();
      if (!doc) { setLoading(false); return; }

      const [profileRes, phoneRes, deptRes] = await Promise.all([
        supabase.from("profiles").select("full_name, avatar_url").eq("user_id", doc.user_id).maybeSingle(),
        supabase.rpc("get_public_phone", { _user_id: doc.user_id }),
        doc.department_id ? supabase.from("departments").select("name_uz, name_ru, name_en").eq("id", doc.department_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);

      setDoctor({ ...doc, profileData: profileRes.data ? { ...profileRes.data, phone: phoneRes.data } : null, deptData: deptRes.data });
      setLoading(false);
    };
    load();
  }, [id]);

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Yuklanmoqda...</p></div>;
  if (!doctor) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Shifokor topilmadi</p></div>;

  const name = doctor.profileData?.full_name || "Shifokor";
  const getDeptName = (dept: any) => {
    if (!dept) return "-";
    return language === "ru" ? dept.name_ru : language === "en" ? dept.name_en : dept.name_uz;
  };

  const bio = language === "ru" ? doctor.bio_ru : language === "en" ? doctor.bio_en : doctor.bio_uz;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-20">
        <div className="container mx-auto px-4 max-w-3xl">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
            <ArrowLeft className="w-4 h-4" /> Orqaga
          </button>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            {/* Header */}
            <div className="bg-card rounded-2xl border border-border p-8 card-shadow mb-6">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                <div className="relative">
                  {doctor.profileData?.avatar_url ? (
                    <img src={doctor.profileData.avatar_url} alt={name} className="w-28 h-28 rounded-2xl object-cover" />
                  ) : (
                    <div className={`w-28 h-28 rounded-2xl bg-gradient-to-br ${avatarColors[0]} flex items-center justify-center text-4xl font-bold text-white`}>
                      {name[0]?.toUpperCase()}
                    </div>
                  )}
                  <span className={`absolute -bottom-2 -right-2 px-2 py-1 rounded-full text-xs font-medium ${doctor.is_online ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                    {doctor.is_online ? "Online" : "Offline"}
                  </span>
                </div>

                <div className="flex-1 text-center sm:text-left">
                  <h1 className="font-display text-2xl font-bold text-foreground mb-1">{name}</h1>
                  <p className="text-primary font-medium mb-1">{doctor.title || "Shifokor"}</p>
                  <p className="text-sm text-muted-foreground mb-3">{getDeptName(doctor.deptData)}</p>

                  <div className="flex items-center gap-1 justify-center sm:justify-start mb-4">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} className={`w-4 h-4 ${s <= Math.round(doctor.rating) ? "fill-warning text-warning" : "text-muted"}`} />
                    ))}
                    <span className="text-sm text-muted-foreground ml-1">{Number(doctor.rating).toFixed(1)}</span>
                  </div>

                  <button
                    onClick={() => navigate("/start-consultation")}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity"
                  >
                    <Stethoscope className="w-4 h-4" /> Konsultatsiya boshlash
                  </button>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                { icon: Clock, label: "Tajriba", value: `${doctor.experience_years} yil` },
                { icon: Users, label: "Bemorlar", value: doctor.patients_count.toLocaleString() },
                { icon: Star, label: "Reyting", value: Number(doctor.rating).toFixed(1) },
                { icon: Briefcase, label: "Ish joyi", value: doctor.workplace || "-" },
              ].map((stat, i) => (
                <div key={i} className="bg-card rounded-xl border border-border p-4 text-center">
                  <stat.icon className="w-5 h-5 text-primary mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground mb-1">{stat.label}</p>
                  <p className="text-sm font-semibold text-foreground">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Details */}
            <div className="bg-card rounded-2xl border border-border p-6 card-shadow space-y-4">
              <h2 className="font-display text-lg font-bold text-foreground">Ma'lumotlar</h2>

              {bio && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Bio</p>
                  <p className="text-sm text-foreground">{bio}</p>
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                {doctor.address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-primary mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">Manzil</p>
                      <p className="text-sm text-foreground">{doctor.address}</p>
                    </div>
                  </div>
                )}
                {doctor.workplace && (
                  <div className="flex items-start gap-2">
                    <Briefcase className="w-4 h-4 text-primary mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">Ish joyi</p>
                      <p className="text-sm text-foreground">{doctor.workplace}</p>
                    </div>
                  </div>
                )}
                {doctor.telegram_username && (
                  <div className="flex items-start gap-2">
                    <Send className="w-4 h-4 text-primary mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">Telegram</p>
                      <a href={`https://t.me/${doctor.telegram_username.replace("@", "")}`} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                        @{doctor.telegram_username.replace("@", "")}
                      </a>
                    </div>
                  </div>
                )}
                {doctor.profileData?.phone && (
                  <div className="flex items-start gap-2">
                    <Users className="w-4 h-4 text-primary mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">Telefon</p>
                      <p className="text-sm text-foreground">{doctor.profileData.phone}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default DoctorProfilePage;
