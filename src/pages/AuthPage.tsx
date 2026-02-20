import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import { Stethoscope, Mail, Lock, User, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

const AuthPage = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Muvaffaqiyatli kirdingiz!");
        navigate("/");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        toast.success("Ro'yxatdan o'tdingiz!");
        navigate("/");
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    const { error } = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (error) toast.error(error.message);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-hero-gradient flex items-center justify-center mx-auto mb-4">
            <Stethoscope className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="font-display text-2xl font-bold text-foreground">Online Hospital</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isLogin ? t("nav.login") : t("nav.register")}
          </p>
        </div>

        <div className="bg-card rounded-2xl p-6 card-shadow border border-border">
          {/* Google Button */}
          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border text-foreground font-medium text-sm hover:bg-secondary transition-colors mb-4"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {t("auth.loginWithGoogle")}
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">OR</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="F.I.Sh."
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-input bg-background text-foreground text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                  required
                />
              </div>
            )}

            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("auth.email")}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-input bg-background text-foreground text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                required
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("auth.password")}
                className="w-full pl-10 pr-10 py-3 rounded-xl border border-input bg-background text-foreground text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-hero-gradient text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? "..." : isLogin ? t("nav.login") : t("nav.register")}
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-4">
            {isLogin ? t("auth.noAccount") : t("auth.hasAccount")}{" "}
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-primary font-medium hover:underline"
            >
              {isLogin ? t("nav.register") : t("nav.login")}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
