import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User, Wallet, Shield, LogOut, Edit, Save, X, Phone, Home, MapPin, Briefcase, Clock, Send, Stethoscope, FileText, IdCard, Scale, FlaskConical, Sparkles, Users, Crown, Activity, Trophy, Dna, Siren } from "lucide-react";
import TelegramLinkSection from "@/components/TelegramLinkSection";
import AppVersionCard from "@/components/app/AppVersionCard";
import { toast } from "sonner";
import { WEEK_DAYS, normalizeWorkHours, hasWorkHours, loadDoctorPrivate, saveDoctorPrivate, type DayKey, type DayHours } from "@/lib/doctorProfile";

const ProfilePage = () => {
  const { user, profile, roles, signOut, refreshProfile, isDoctor, isAdmin, isOwner } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  // Doctor-specific fields
  const [doctorData, setDoctorData] = useState<any>(null);
  const [docTitle, setDocTitle] = useState("");
  const [docAddress, setDocAddress] = useState("");
  const [docWorkplace, setDocWorkplace] = useState("");
  const [docExperience, setDocExperience] = useState(0);
  const [docTelegram, setDocTelegram] = useState("");
  const [docLanguages, setDocLanguages] = useState("");
  const [docEducation, setDocEducation] = useState("");
  const [docHours, setDocHours] = useState<Record<DayKey, DayHours>>(normalizeWorkHours(null));
  const [docHome, setDocHome] = useState("");
  const [docShowHome, setDocShowHome] = useState(false);
  const [privateData, setPrivateData] = useState<{ home_address: string | null; show_home_address: boolean } | null>(null);

  const fillDoctorForm = (d: any, priv: typeof privateData) => {
    setDocTitle(d.title || "");
    setDocAddress(d.address || "");
    setDocWorkplace(d.workplace || "");
    setDocExperience(d.experience_years || 0);
    setDocTelegram(d.telegram_username || "");
    setDocLanguages(d.languages || "");
    setDocEducation(d.education || "");
    setDocHours(normalizeWorkHours(d.work_hours));
    setDocHome(priv?.home_address || "");
    setDocShowHome(!!priv?.show_home_address);
  };

  useEffect(() => {
    if (isDoctor && user) {
      supabase.from("doctors").select("*").eq("user_id", user.id).maybeSingle().then(({ data }) => {
        if (data) {
          setDoctorData(data);
          loadDoctorPrivate(data.id).then((priv) => {
            setPrivateData(priv);
            fillDoctorForm(data, priv);
          });
        }
      });
    }
  }, [isDoctor, user]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const startEditing = () => {
    setFullName(profile?.full_name || "");
    setPhone(profile?.phone || "");
    if (doctorData) fillDoctorForm(doctorData, privateData);
    setEditing(true);
  };

  const handleSave = async () => {
    if (!user || !fullName.trim()) {
      toast.error("Ism kiritilishi shart");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim(), phone: phone.trim() || null })
      .eq("user_id", user.id);

    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }

    // Save doctor fields
    if (isDoctor && doctorData) {
      for (const { key, label } of WEEK_DAYS) {
        const d = docHours[key];
        if (d.on && d.from >= d.to) {
          toast.error(`${label}: ish tugash vaqti boshlanishidan keyin bo'lishi kerak`);
          setSaving(false);
          return;
        }
      }
      const docUpdate = {
        title: docTitle.trim(),
        address: docAddress.trim(),
        workplace: docWorkplace.trim(),
        experience_years: docExperience,
        telegram_username: docTelegram.trim().replace(/^@/, ""),
        languages: docLanguages.trim() || null,
        education: docEducation.trim() || null,
        work_hours: docHours,
      };
      const { error: docErr } = await supabase
        .from("doctors")
        .update(docUpdate as any)
        .eq("id", doctorData.id);
      const privErr = docErr ? null : await saveDoctorPrivate(doctorData.id, docHome, docShowHome);
      if (docErr || privErr) {
        toast.error((docErr || privErr).message);
        setSaving(false);
        return;
      }
      setDoctorData({ ...doctorData, ...docUpdate });
      setPrivateData({ home_address: docHome.trim() || null, show_home_address: docShowHome });
    }

    setSaving(false);
    toast.success("Profil yangilandi");
    setEditing(false);
    await refreshProfile();
  };

  if (!user || !profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Avval tizimga kiring</p>
          <button onClick={() => navigate("/auth")} className="px-6 py-2 rounded-xl bg-hero-gradient text-primary-foreground font-medium text-sm">
            {t("nav.login")}
          </button>
        </div>
      </div>
    );
  }

  const inputClass = "px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm w-full";

  return (
    <div className="min-h-screen bg-background pt-20">
      <div className="container mx-auto px-4 max-w-2xl">
        <button onClick={() => navigate("/")} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
          <Home className="w-4 h-4" /> Bosh sahifaga qaytish
        </button>
        <div className="bg-card rounded-2xl border border-border p-4 sm:p-8 card-shadow">
          {/* Avatar & Name */}
          <div className="flex items-start sm:items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
              <div className="w-12 h-12 sm:w-16 sm:h-16 shrink-0 rounded-full bg-hero-gradient flex items-center justify-center text-xl sm:text-2xl font-bold text-primary-foreground">
                {profile.full_name?.[0]?.toUpperCase() || "U"}
              </div>
              <div className="min-w-0 flex-1">
                {editing ? (
                  <div className="space-y-2">
                    <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="F.I.Sh." className={inputClass} />
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefon raqam" className="pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm w-full" />
                    </div>
                  </div>
                ) : (
                  <>
                    <h1 className="font-display text-lg sm:text-xl font-bold text-foreground break-words">{profile.full_name || "Foydalanuvchi"}</h1>
                    <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                  </>
                )}
              </div>
            </div>
            {editing ? (
              <div className="flex gap-2 shrink-0">
                <button onClick={handleSave} disabled={saving} className="p-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
                  <Save className="w-4 h-4" />
                </button>
                <button onClick={() => setEditing(false)} className="p-2 rounded-lg border border-border text-foreground hover:bg-secondary">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button onClick={startEditing} className="shrink-0 p-2 rounded-lg border border-border text-foreground hover:bg-secondary">
                <Edit className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Doctor edit fields */}
          {editing && isDoctor && doctorData && (
            <div className="bg-secondary/30 rounded-xl p-4 mb-6 space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-primary" /> Shifokor ma'lumotlari
              </h3>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Lavozim</label>
                  <input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="Kardiolog" className={inputClass} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Tajriba (yil)</label>
                  <input type="number" value={docExperience} onChange={(e) => setDocExperience(Number(e.target.value))} min={0} className={inputClass} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Ish joyi</label>
                  <input value={docWorkplace} onChange={(e) => setDocWorkplace(e.target.value)} placeholder="Toshkent tibbiyot akademiyasi" className={inputClass} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Ish manzili</label>
                  <input value={docAddress} onChange={(e) => setDocAddress(e.target.value)} placeholder="Toshkent sh., Chilonzor t." className={inputClass} />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Telegram username</label>
                  <div className="relative">
                    <Send className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input value={docTelegram} onChange={(e) => setDocTelegram(e.target.value)} placeholder="username" className="pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm w-full" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Tillar</label>
                  <input value={docLanguages} onChange={(e) => setDocLanguages(e.target.value)} placeholder="O'zbek, rus, ingliz" className={inputClass} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Ma'lumoti</label>
                  <input value={docEducation} onChange={(e) => setDocEducation(e.target.value)} placeholder="TTA, 2015" className={inputClass} />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Yashash manzili</label>
                  <input value={docHome} onChange={(e) => setDocHome(e.target.value)} placeholder="Toshkent sh., Yunusobod t." className={inputClass} />
                  <label className="flex items-center gap-2 mt-2 text-xs text-foreground cursor-pointer">
                    <input type="checkbox" checked={docShowHome} onChange={(e) => setDocShowHome(e.target.checked)} className="accent-primary" />
                    Bemorlarga ko'rsatilsin
                    <span className="text-muted-foreground">(belgilanmasa, faqat siz va admin ko'rasiz)</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-2 block flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Ish vaqti</label>
                <div className="space-y-1.5">
                  {WEEK_DAYS.map(({ key, label }) => {
                    const d = docHours[key];
                    const set = (patch: Partial<DayHours>) => setDocHours({ ...docHours, [key]: { ...d, ...patch } });
                    return (
                      <div key={key} className="flex items-center gap-2 text-sm">
                        <label className="flex items-center gap-2 w-32 shrink-0 cursor-pointer">
                          <input type="checkbox" checked={d.on} onChange={(e) => set({ on: e.target.checked })} className="accent-primary" />
                          <span className="text-foreground">{label}</span>
                        </label>
                        {d.on ? (
                          <>
                            <input type="time" value={d.from} onChange={(e) => set({ from: e.target.value })} className="px-2 py-1 rounded-lg border border-input bg-background text-foreground text-sm" />
                            <span className="text-muted-foreground">–</span>
                            <input type="time" value={d.to} onChange={(e) => set({ to: e.target.value })} className="px-2 py-1 rounded-lg border border-input bg-background text-foreground text-sm" />
                          </>
                        ) : <span className="text-xs text-muted-foreground">Dam olish</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Doctor info display (non-editing) */}
          {!editing && isDoctor && doctorData && (
            <div className="bg-primary/5 rounded-xl p-4 mb-6">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                <Stethoscope className="w-4 h-4 text-primary" /> Shifokor ma'lumotlari
              </h3>
              <div className="grid sm:grid-cols-2 gap-2 text-sm">
                {doctorData.title && <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Lavozim</span><span className="text-foreground font-medium text-right break-words min-w-0">{doctorData.title}</span></div>}
                {doctorData.experience_years > 0 && <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Tajriba</span><span className="text-foreground font-medium text-right break-words min-w-0">{doctorData.experience_years} yil</span></div>}
                {doctorData.workplace && <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Ish joyi</span><span className="text-foreground font-medium text-right break-words min-w-0">{doctorData.workplace}</span></div>}
                {doctorData.address && <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Ish manzili</span><span className="text-foreground font-medium text-right break-words min-w-0">{doctorData.address}</span></div>}
                {doctorData.telegram_username && <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Telegram</span><span className="text-primary font-medium text-right break-all min-w-0">@{doctorData.telegram_username.replace("@", "")}</span></div>}
                {doctorData.languages && <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Tillar</span><span className="text-foreground font-medium text-right break-words min-w-0">{doctorData.languages}</span></div>}
                {doctorData.education && <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Ma'lumoti</span><span className="text-foreground font-medium text-right break-words min-w-0">{doctorData.education}</span></div>}
                {privateData?.home_address && <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Yashash manzili</span><span className="text-foreground font-medium text-right break-words min-w-0">{privateData.home_address} <span className="text-xs text-muted-foreground">({privateData.show_home_address ? "ko'rinadi" : "yashirin"})</span></span></div>}
                {hasWorkHours(doctorData.work_hours) && <div className="flex justify-between gap-3"><span className="text-muted-foreground shrink-0">Ish vaqti</span><span className="text-foreground font-medium text-right min-w-0">Belgilangan</span></div>}
              </div>
              <button onClick={() => navigate(`/doctors/${doctorData.id}`)} className="mt-3 text-xs text-primary font-medium hover:underline">Ommaviy profilimni ko'rish →</button>
            </div>
          )}

          {/* Info Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-6">
            <div className="bg-secondary/50 rounded-xl p-4 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Wallet className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-foreground">Balans</span>
              </div>
              <div className="text-xl sm:text-2xl font-display font-bold text-foreground break-all">
                {Number(profile.balance_uzs).toLocaleString()}
                <span className="text-sm font-normal text-muted-foreground ml-1">UZS</span>
              </div>
            </div>
            <div className="bg-secondary/50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-foreground">Rollar</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {roles.map((role) => (
                  <span key={role} className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary capitalize">
                    {role}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {profile.is_banned && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 mb-6">
              <p className="text-sm text-destructive font-medium">⚠️ Hisobingiz bloklangan</p>
              {profile.ban_reason && <p className="text-xs text-destructive/80 mt-1">Sabab: {profile.ban_reason}</p>}
            </div>
          )}

          {/* Details */}
          <div className="space-y-3 mb-6">
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Telefon</span>
              <span className="text-sm font-medium text-foreground">{profile.phone || "Ko'rsatilmagan"}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Ro'yxatdan o'tgan</span>
              <span className="text-sm font-medium text-foreground">
                {new Date(profile.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>

          {/* Admin / owner panels: only for accounts that have them */}
          {(isAdmin || isOwner) && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-foreground mb-3">Boshqaruv</h3>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => navigate("/admin")} className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border text-sm text-foreground hover:bg-secondary transition-colors text-left">
                  <Shield className="w-4 h-4 shrink-0" />
                  <span className="truncate">Admin Panel</span>
                </button>
                {isOwner && (
                  <button onClick={() => navigate("/owner")} className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border text-sm text-foreground hover:bg-secondary transition-colors text-left">
                    <Crown className="w-4 h-4 shrink-0 text-amber-500" />
                    <span className="truncate">Owner Panel</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Secondary services moved out of the main menu */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-foreground mb-3">Qo'shimcha xizmatlar</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { to: "/emergency-card", label: "MaxHospital Passport", icon: IdCard, cls: "text-red-500" },
                { to: "/second-opinion", label: "Ikkinchi fikr", icon: Scale, cls: "" },
                { to: "/lab-results", label: "Tahlil natijalari", icon: FlaskConical, cls: "" },
                { to: "/maxfitness", label: "MaxFitness", icon: Activity, cls: "text-emerald-500" },
                { to: "/maxscore", label: "MaxScore", icon: Trophy, cls: "text-amber-500" },
                { to: "/irsiy-xavf", label: "Irsiy xavf xaritasi", icon: Dna, cls: "text-violet-500" },
                { to: "/sos", label: "SOS sozlamalari", icon: Siren, cls: "text-rose-600" },
                { to: "/ai-assistant", label: "AI yordamchi", icon: Sparkles, cls: "" },
                { to: "/users", label: "Foydalanuvchilar", icon: Users, cls: "" },
              ].map(({ to, label, icon: Icon, cls }) => (
                <button
                  key={to}
                  onClick={() => navigate(to)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border text-sm text-foreground hover:bg-secondary transition-colors text-left"
                >
                  <Icon className={`w-4 h-4 shrink-0 ${cls}`} />
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* My Prescriptions Link */}
          <button
            onClick={() => navigate("/my-prescriptions")}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-primary/30 text-primary text-sm font-medium hover:bg-primary/5 transition-colors mb-4"
          >
            <FileText className="w-4 h-4" />
            Mening retseptlarim
          </button>

          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-destructive text-destructive text-sm font-medium hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Chiqish
          </button>
        </div>

        {/* Telegram Link Section */}
        <div className="mt-6">
          <TelegramLinkSection />
        </div>

        {/* Faqat ilovada: versiya va yangilanish */}
        <AppVersionCard />
      </div>
    </div>
  );
};

export default ProfilePage;
