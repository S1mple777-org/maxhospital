import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { Menu, X, Globe, Palette, Stethoscope, User, Shield, Crown, LogOut } from "lucide-react";
import { Language } from "@/lib/i18n";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";

const languages: { code: Language; label: string; flag: string }[] = [
  { code: "uz", label: "O'zbek", flag: "🇺🇿" },
  { code: "ru", label: "Русский", flag: "🇷🇺" },
  { code: "en", label: "English", flag: "🇬🇧" },
];

const themes = [
  { id: "medical" as const, icon: "🏥" },
  { id: "light" as const, icon: "☀️" },
  { id: "dark" as const, icon: "🌙" },
];

const Navbar = () => {
  const { language, setLanguage, t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { user, profile, isAdmin, isOwner, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const navItems = [
    { label: t("nav.home"), href: "/" },
    { label: t("nav.departments"), href: "/departments" },
    { label: t("nav.doctors"), href: "/doctors" },
    { label: t("nav.news"), href: "/news" },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 nav-bg border-b border-border">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-hero-gradient flex items-center justify-center">
              <Stethoscope className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-lg text-foreground">Online Hospital</span>
          </Link>

          <div className="hidden md:flex items-center gap-6">
            {navItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-2">
            {/* Language */}
            <div className="relative">
              <button onClick={() => { setLangOpen(!langOpen); setThemeOpen(false); setUserMenuOpen(false); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                <Globe className="w-4 h-4" />
                {languages.find((l) => l.code === language)?.flag}
              </button>
              {langOpen && (
                <div className="absolute right-0 mt-1 w-36 rounded-lg border border-border bg-card shadow-lg py-1 z-50">
                  {languages.map((l) => (
                    <button key={l.code} onClick={() => { setLanguage(l.code); setLangOpen(false); }} className={`w-full text-left px-3 py-2 text-sm hover:bg-secondary transition-colors flex items-center gap-2 ${language === l.code ? "text-primary font-medium" : "text-foreground"}`}>
                      <span>{l.flag}</span> {l.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Theme */}
            <div className="relative">
              <button onClick={() => { setThemeOpen(!themeOpen); setLangOpen(false); setUserMenuOpen(false); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                <Palette className="w-4 h-4" />
                {themes.find((th) => th.id === theme)?.icon}
              </button>
              {themeOpen && (
                <div className="absolute right-0 mt-1 w-40 rounded-lg border border-border bg-card shadow-lg py-1 z-50">
                  {themes.map((th) => (
                    <button key={th.id} onClick={() => { setTheme(th.id); setThemeOpen(false); }} className={`w-full text-left px-3 py-2 text-sm hover:bg-secondary transition-colors flex items-center gap-2 ${theme === th.id ? "text-primary font-medium" : "text-foreground"}`}>
                      <span>{th.icon}</span> {t(`theme.${th.id}`)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Auth */}
            {user ? (
              <div className="relative">
                <button
                  onClick={() => { setUserMenuOpen(!userMenuOpen); setLangOpen(false); setThemeOpen(false); }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-foreground hover:bg-secondary transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-hero-gradient flex items-center justify-center text-xs font-bold text-primary-foreground">
                    {profile?.full_name?.[0]?.toUpperCase() || "U"}
                  </div>
                  <span className="font-medium max-w-24 truncate">{profile?.full_name || "User"}</span>
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 mt-1 w-48 rounded-lg border border-border bg-card shadow-lg py-1 z-50">
                    <Link to="/profile" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary">
                      <User className="w-4 h-4" /> {t("nav.profile")}
                    </Link>
                    {(isAdmin || isOwner) && (
                      <Link to="/admin" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary">
                        <Shield className="w-4 h-4" /> Admin Panel
                      </Link>
                    )}
                    {isOwner && (
                      <Link to="/owner" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary">
                        <Crown className="w-4 h-4" /> Owner Panel
                      </Link>
                    )}
                    <button onClick={handleSignOut} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-secondary">
                      <LogOut className="w-4 h-4" /> Chiqish
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link to="/auth" className="px-4 py-2 text-sm font-medium text-foreground hover:text-primary transition-colors">
                  {t("nav.login")}
                </Link>
                <Link to="/auth" className="px-4 py-2 text-sm font-medium rounded-lg bg-hero-gradient text-primary-foreground hover:opacity-90 transition-opacity">
                  {t("nav.register")}
                </Link>
              </>
            )}
          </div>

          <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden p-2 text-foreground">
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="md:hidden border-t border-border bg-card overflow-hidden">
            <div className="px-4 py-4 space-y-3">
              {navItems.map((item) => (
                <Link key={item.href} to={item.href} onClick={() => setMobileOpen(false)} className="block text-sm font-medium text-foreground hover:text-primary">{item.label}</Link>
              ))}
              {user ? (
                <>
                  <Link to="/profile" onClick={() => setMobileOpen(false)} className="block text-sm font-medium text-foreground">{t("nav.profile")}</Link>
                  {(isAdmin || isOwner) && <Link to="/admin" onClick={() => setMobileOpen(false)} className="block text-sm font-medium text-foreground">Admin Panel</Link>}
                  {isOwner && <Link to="/owner" onClick={() => setMobileOpen(false)} className="block text-sm font-medium text-foreground">Owner Panel</Link>}
                  <button onClick={handleSignOut} className="block text-sm font-medium text-destructive">Chiqish</button>
                </>
              ) : (
                <div className="flex gap-2 pt-2">
                  <Link to="/auth" className="flex-1 text-center px-4 py-2 text-sm font-medium border border-border rounded-lg text-foreground">{t("nav.login")}</Link>
                  <Link to="/auth" className="flex-1 text-center px-4 py-2 text-sm font-medium rounded-lg bg-hero-gradient text-primary-foreground">{t("nav.register")}</Link>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                {languages.map((l) => (
                  <button key={l.code} onClick={() => setLanguage(l.code)} className={`px-3 py-1.5 rounded-lg text-sm border ${language === l.code ? "border-primary text-primary bg-accent" : "border-border text-muted-foreground"}`}>
                    {l.flag}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                {themes.map((th) => (
                  <button key={th.id} onClick={() => setTheme(th.id)} className={`px-3 py-1.5 rounded-lg text-sm border ${theme === th.id ? "border-primary text-primary bg-accent" : "border-border text-muted-foreground"}`}>
                    {th.icon}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;
