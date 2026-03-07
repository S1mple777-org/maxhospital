import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User, Wallet, Shield, LogOut, Edit, Save, X, Phone, Home, MapPin, Briefcase, Clock, Send, Stethoscope } from "lucide-react";
import TelegramLinkSection from "@/components/TelegramLinkSection";
import { toast } from "sonner";

const ProfilePage = () => {
  const { user, profile, roles, signOut, refreshProfile, isDoctor } = useAuth();
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

  useEffect(() => {
    if (isDoctor && user) {
      supabase.from("doctors").select("*").eq("user_id", user.id).maybeSingle().then(({ data }) => {
        if (data) {
          setDoctorData(data);
          setDocTitle(data.title || "");
          setDocAddress(data.address || "");
          setDocWorkplace(data.workplace || "");
          setDocExperience(data.experience_years || 0);
          setDocTelegram(data.telegram_username || "");
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
    if (doctorData) {
      setDocTitle(doctorData.title || "");
      setDocAddress(doctorData.address || "");
      setDocWorkplace(doctorData.workplace || "");
      setDocExperience(doctorData.experience_years || 0);
      setDocTelegram(doctorData.telegram_username || "");
    }
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
      const { error: docErr } = await supabase
        .from("doctors")
        .update({
          title: docTitle.trim(),
          address: docAddress.trim(),
          workplace: docWorkplace.trim(),
          experience_years: docExperience,
          telegram_username: docTelegram.trim(),
        })
        .eq("id", doctorData.id);
      if (docErr) {
        toast.error(docErr.message);
        setSaving(false);
        return;
      }
      setDoctorData({ ...doctorData, title: docTitle.trim(), address: docAddress.trim(), workplace: docWorkplace.trim(), experience_years: docExperience, telegram_username: docTelegram.trim() });
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
        <div className="bg-card rounded-2xl border border-border p-8 card-shadow">
          {/* Avatar & Name */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-hero-gradient flex items-center justify-center text-2xl font-bold text-primary-foreground">
                {profile.full_name?.[0]?.toUpperCase() || "U"}
              </div>
              <div>
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
                    <h1 className="font-display text-xl font-bold text-foreground">{profile.full_name || "Foydalanuvchi"}</h1>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                  </>
                )}
              </div>
            </div>
            {editing ? (
              <div className="flex gap-2">
                <button onClick={handleSave} disabled={saving} className="p-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
                  <Save className="w-4 h-4" />
                </button>
                <button onClick={() => setEditing(false)} className="p-2 rounded-lg border border-border text-foreground hover:bg-secondary">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button onClick={startEditing} className="p-2 rounded-lg border border-border text-foreground hover:bg-secondary">
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
                  <label className="text-xs text-muted-foreground mb-1 block">Manzil</label>
                  <input value={docAddress} onChange={(e) => setDocAddress(e.target.value)} placeholder="Toshkent sh., Chilonzor t." className={inputClass} />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Telegram username</label>
                  <div className="relative">
                    <Send className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input value={docTelegram} onChange={(e) => setDocTelegram(e.target.value)} placeholder="username" className="pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm w-full" />
                  </div>
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
                {doctorData.title && <div className="flex justify-between"><span className="text-muted-foreground">Lavozim</span><span className="text-foreground font-medium">{doctorData.title}</span></div>}
                {doctorData.experience_years > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Tajriba</span><span className="text-foreground font-medium">{doctorData.experience_years} yil</span></div>}
                {doctorData.workplace && <div className="flex justify-between"><span className="text-muted-foreground">Ish joyi</span><span className="text-foreground font-medium">{doctorData.workplace}</span></div>}
                {doctorData.address && <div className="flex justify-between"><span className="text-muted-foreground">Manzil</span><span className="text-foreground font-medium">{doctorData.address}</span></div>}
                {doctorData.telegram_username && <div className="flex justify-between"><span className="text-muted-foreground">Telegram</span><span className="text-primary font-medium">@{doctorData.telegram_username.replace("@", "")}</span></div>}
              </div>
            </div>
          )}

          {/* Info Cards */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-secondary/50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Wallet className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-foreground">Balans</span>
              </div>
              <div className="text-2xl font-display font-bold text-foreground">
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

          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-destructive text-destructive text-sm font-medium hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Chiqish
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
