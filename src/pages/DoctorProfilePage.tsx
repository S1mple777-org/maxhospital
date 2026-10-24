import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { motion } from "framer-motion";
import { Star, MapPin, Briefcase, Clock, Users, ArrowLeft, Stethoscope, Send, Phone, Home, Languages, GraduationCap, Activity, ClipboardList } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import BookingPicker from "@/components/booking/BookingPicker";
import {
  WEEK_DAYS, normalizeWorkHours, hasWorkHours, isWorkingNow, tashkentNow,
  loadDoctorStats, loadDoctorContact, loadDoctorPatients, type DoctorStats, type DoctorPatient,
} from "@/lib/doctorProfile";

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
  const { user, isAdmin, isOwner } = useAuth();
  const [stats, setStats] = useState<DoctorStats | null>(null);
  const [homeAddress, setHomeAddress] = useState<string | null>(null);
  const [patients, setPatients] = useState<DoctorPatient[] | null>(null);

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

      const [st, contact] = await Promise.all([loadDoctorStats(doc.id), loadDoctorContact(doc.id)]);
      setStats(st);
      setHomeAddress(contact?.home_address ?? null);
    };
    load();
  }, [id, user?.id]);

  const canSeePatients = !!doctor && !!user && (doctor.user_id === user.id || isAdmin || isOwner);
  useEffect(() => {
    if (canSeePatients) loadDoctorPatients(doctor.id).then(setPatients);
    else setPatients(null);
  }, [canSeePatients, doctor?.id]);

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Yuklanmoqda...</p></div>;
  if (!doctor) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Shifokor topilmadi</p></div>;

  const name = doctor.profileData?.full_name || "Shifokor";
  const getDeptName = (dept: any) => {
    if (!dept) return "-";
    return language === "ru" ? dept.name_ru : language === "en" ? dept.name_en : dept.name_uz;
  };

  const working = isWorkingNow(doctor.work_hours);
  const hours = normalizeWorkHours(doctor.work_hours);
  const today = tashkentNow().day;
  const patientsCount = stats?.patients ?? doctor.patients_count ?? 0;
  const tgName = doctor.telegram_username?.replace(/^@/, "");
  const phone = doctor.profileData?.phone as string | undefined;

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
                  <p className="text-sm text-muted-foreground mb-2">{getDeptName(doctor.deptData)}</p>
                  {working !== null && (
                    <p className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full mb-3 ${working ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${working ? "bg-green-500" : "bg-muted-foreground"}`} />
                      {working ? "Hozir ish vaqtida" : "Hozir ish vaqtidan tashqari"}
                    </p>
                  )}

                  <div className="flex items-center gap-1 justify-center sm:justify-start mb-4">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} className={`w-4 h-4 ${s <= Math.round(doctor.rating) ? "fill-warning text-warning" : "text-muted"}`} />
                    ))}
                    <span className="text-sm text-muted-foreground ml-1">{Number(doctor.rating).toFixed(1)}</span>
                  </div>

                  <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                  <button
                    onClick={() => navigate("/start-consultation")}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity"
                  >
                    <Stethoscope className="w-4 h-4" /> Konsultatsiya boshlash
                  </button>
                  {phone && (
                    <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-foreground font-medium text-sm hover:bg-secondary">
                      <Phone className="w-4 h-4" /> Qo'ng'iroq
                    </a>
                  )}
                  {tgName && (
                    <a href={`https://t.me/${tgName}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#229ED9] text-white font-medium text-sm hover:opacity-90">
                      <Send className="w-4 h-4" /> Telegram
                    </a>
                  )}
                  </div>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                { icon: Clock, label: "Tajriba", value: `${doctor.experience_years} yil` },
                { icon: Users, label: "Bemorlar", value: Number(patientsCount).toLocaleString() },
                { icon: Star, label: "Reyting", value: Number(doctor.rating).toFixed(1) },
                { icon: Activity, label: "Konsultatsiyalar", value: (stats?.consultations ?? 0).toLocaleString() },
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

              {(() => {
                const rows = [
                  { icon: Briefcase, label: "Ish joyi", value: doctor.workplace },
                  { icon: MapPin, label: "Ish manzili", value: doctor.address },
                  { icon: Home, label: "Yashash manzili", value: homeAddress },
                  { icon: Phone, label: "Telefon", value: phone, href: phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : undefined },
                  { icon: Send, label: "Telegram", value: tgName ? `@${tgName}` : null, href: tgName ? `https://t.me/${tgName}` : undefined },
                  { icon: Languages, label: "Tillar", value: doctor.languages },
                  { icon: GraduationCap, label: "Ma'lumoti", value: doctor.education },
                  { icon: Clock, label: "Tajriba", value: doctor.experience_years ? `${doctor.experience_years} yil` : null },
                ].filter((r) => r.value);
                return rows.length === 0 ? null : (
                  <div className="grid sm:grid-cols-2 gap-4">
                    {rows.map((r) => (
                      <div key={r.label} className="flex items-start gap-2 min-w-0">
                        <r.icon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">{r.label}</p>
                          {r.href ? (
                            <a href={r.href} target={r.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="text-sm text-primary hover:underline break-words">{r.value}</a>
                          ) : (
                            <p className="text-sm text-foreground break-words">{r.value}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Book a time inside the doctor's working hours */}
            <BookingPicker doctorId={doctor.id} departmentId={doctor.department_id ?? null} doctorUserId={doctor.user_id} />

            {/* Work hours */}
            {hasWorkHours(doctor.work_hours) && (
              <div className="bg-card rounded-2xl border border-border p-6 card-shadow mt-6">
                <h2 className="font-display text-lg font-bold text-foreground mb-4 flex items-center gap-2"><Clock className="w-5 h-5 text-primary" /> Ish vaqti</h2>
                <div className="divide-y divide-border">
                  {WEEK_DAYS.map(({ key, label }) => {
                    const d = hours[key];
                    return (
                      <div key={key} className={`flex justify-between py-2 text-sm ${key === today ? "font-semibold text-primary" : "text-foreground"}`}>
                        <span>{label}{key === today && " (bugun)"}</span>
                        <span className={d.on ? "" : "text-muted-foreground"}>{d.on ? `${d.from} – ${d.to}` : "Dam olish"}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-3">Toshkent vaqti bilan</p>
              </div>
            )}

            {/* Patients: only the doctor himself and admins */}
            {canSeePatients && (
              <div className="bg-card rounded-2xl border border-border p-6 card-shadow mt-6">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2"><ClipboardList className="w-5 h-5 text-primary" /> Bemorlar</h2>
                  {stats && stats.active > 0 && <span className="text-xs px-2 py-1 rounded-full bg-warning/10 text-warning font-medium">{stats.active} ta navbatda / faol</span>}
                </div>
                <p className="text-xs text-muted-foreground mb-4">Bu ro'yxatni faqat {doctor.user_id === user?.id ? "siz" : "shifokor"} va admin ko'radi.</p>
                {patients === null ? (
                  <p className="text-sm text-muted-foreground">Yuklanmoqda...</p>
                ) : patients.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Hali yakunlangan konsultatsiya yo'q.</p>
                ) : (
                  <div className="space-y-2">
                    {patients.map((p) => (
                      <div key={p.patient_id} className="flex items-start justify-between gap-3 bg-secondary/30 rounded-xl p-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{p.full_name || "Bemor"}</p>
                          {p.last_diagnosis && <p className="text-xs text-muted-foreground truncate">Tashxis: {p.last_diagnosis}</p>}
                          {p.phone && <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`} className="text-xs text-primary hover:underline">{p.phone}</a>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-foreground font-medium">{Number(p.visits)} marta</p>
                          <p className="text-xs text-muted-foreground">{new Date(p.last_visit).toLocaleDateString("uz-UZ")}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default DoctorProfilePage;
