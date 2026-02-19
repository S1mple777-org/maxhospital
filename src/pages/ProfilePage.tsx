import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import { User, Wallet, Shield, LogOut } from "lucide-react";

const ProfilePage = () => {
  const { user, profile, roles, signOut } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
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

  return (
    <div className="min-h-screen bg-background pt-20">
      <div className="container mx-auto px-4 max-w-2xl">
        <div className="bg-card rounded-2xl border border-border p-8 card-shadow">
          {/* Avatar */}
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-hero-gradient flex items-center justify-center text-2xl font-bold text-primary-foreground">
              {profile.full_name?.[0]?.toUpperCase() || "U"}
            </div>
            <div>
              <h1 className="font-display text-xl font-bold text-foreground">{profile.full_name || "Foydalanuvchi"}</h1>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>

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
