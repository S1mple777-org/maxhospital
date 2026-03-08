import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import { Stethoscope, Mail, Lock, User, Eye, EyeOff, ArrowRight, MessageCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

const AuthPage = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [telegramMode, setTelegramMode] = useState(false);
  const [telegramPolling, setTelegramPolling] = useState(false);
  const [telegramRequestId, setTelegramRequestId] = useState<string | null>(null);

  const handleTelegramLogin = async () => {
    if (!email) { toast.error("Email kiriting"); return; }
    setLoading(true);
    try {
      const res = await supabase.functions.invoke("telegram-auth", {
        body: { action: "request_auth", email, type: "login" },
      });
      if (res.data?.error) throw new Error(res.data.error);
      if (res.error) throw new Error(res.error.message);
      setTelegramRequestId(res.data.request_id);
      setTelegramPolling(true);
      toast.success("Telegram botga xabar yuborildi. Tasdiqlang!");
      // Start polling
      const interval = setInterval(async () => {
        const check = await supabase.functions.invoke("telegram-auth", {
          body: { action: "check_auth", request_id: res.data.request_id },
        });
        if (check.data?.status === "approved" && check.data?.action_link) {
          clearInterval(interval);
          setTelegramPolling(false);
          window.location.href = check.data.action_link;
        } else if (check.data?.status === "rejected" || check.data?.status === "expired") {
          clearInterval(interval);
          setTelegramPolling(false);
          setTelegramRequestId(null);
          toast.error(check.data.status === "rejected" ? "So'rov rad etildi" : "So'rov muddati tugadi");
        }
      }, 2000);
      // Auto-stop after 5 min
      setTimeout(() => { clearInterval(interval); setTelegramPolling(false); }, 300000);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        // Check 2FA before signing in
        const twoFaCheck = await supabase.functions.invoke("telegram-auth", {
          body: { action: "check_2fa", email },
        });

        if (twoFaCheck.data?.two_fa) {
          // 2FA enabled - verify password first by attempting sign in
          const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
          if (signInErr) throw signInErr;

          // Password correct - sign out and request Telegram approval
          await supabase.auth.signOut();

          // Send Telegram auth request
          const res = await supabase.functions.invoke("telegram-auth", {
            body: { action: "request_auth", email, type: "2fa" },
          });
          if (res.data?.error) throw new Error(res.data.error);
          if (res.error) throw new Error(res.error.message);

          setTelegramRequestId(res.data.request_id);
          setTelegramPolling(true);
          toast.success("2FA: Telegram botdan tasdiqlang!");

          // Poll for approval
          const interval = setInterval(async () => {
            const check = await supabase.functions.invoke("telegram-auth", {
              body: { action: "check_auth", request_id: res.data.request_id },
            });
            if (check.data?.status === "approved") {
              clearInterval(interval);
              setTelegramPolling(false);
              // Sign in again after approval
              const { error: finalErr } = await supabase.auth.signInWithPassword({ email, password });
              if (finalErr) { toast.error(finalErr.message); return; }
              toast.success("Muvaffaqiyatli kirdingiz!");
              navigate("/");
            } else if (check.data?.status === "rejected" || check.data?.status === "expired") {
              clearInterval(interval);
              setTelegramPolling(false);
              setTelegramRequestId(null);
              toast.error(check.data.status === "rejected" ? "2FA rad etildi" : "So'rov muddati tugadi");
            }
          }, 2000);
          setTimeout(() => { clearInterval(interval); setTelegramPolling(false); }, 300000);
          setLoading(false);
          return;
        }

        // No 2FA - normal login
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Muvaffaqiyatli kirdingiz!");
        navigate("/");
      } else {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin },
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
    const { error } = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (error) toast.error(error.message);
  };

  const handleAppleLogin = async () => {
    const { error } = await lovable.auth.signInWithOAuth("apple", { redirect_uri: window.location.origin });
    if (error) toast.error(error.message);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{ y: [0, -30, 0], x: [0, 20, 0], rotate: [0, 5, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-primary/5 blur-3xl"
        />
        <motion.div
          animate={{ y: [0, 20, 0], x: [0, -15, 0], rotate: [0, -3, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute -bottom-32 -left-20 w-96 h-96 rounded-full bg-accent/10 blur-3xl"
        />
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute top-1/4 left-1/4 w-40 h-40 rounded-full bg-primary/3 blur-2xl"
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-md relative z-10"
      >
        {/* Logo */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5, type: "spring", stiffness: 200 }}
          className="text-center mb-8"
        >
          <motion.div
            whileHover={{ rotate: [0, -10, 10, 0], scale: 1.1 }}
            transition={{ duration: 0.5 }}
            className="w-16 h-16 rounded-2xl bg-hero-gradient flex items-center justify-center mx-auto mb-4 shadow-lg"
            style={{ boxShadow: "0 8px 32px -8px hsl(var(--primary) / 0.4)" }}
          >
            <Stethoscope className="w-8 h-8 text-primary-foreground" />
          </motion.div>
          <h1 className="font-display text-3xl font-bold text-foreground tracking-tight">Online Hospital</h1>
          <motion.p
            key={isLogin ? "login" : "register"}
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="text-sm text-muted-foreground mt-2"
          >
            {isLogin ? "Hisobingizga kiring" : "Yangi hisob yarating"}
          </motion.p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="bg-card rounded-3xl p-8 border border-border relative overflow-hidden"
          style={{ boxShadow: "0 20px 60px -12px hsl(var(--foreground) / 0.1)" }}
        >
          {/* Decorative line */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-1 rounded-full bg-hero-gradient" />

          {/* OAuth buttons */}
          <div className="space-y-3 mb-6 mt-2">
            {/* Telegram Login */}
            {isLogin && (
              <motion.button
                whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.98 }}
                onClick={() => setTelegramMode(!telegramMode)}
                className="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-2xl bg-[#229ED9] text-white font-medium text-sm hover:bg-[#229ED9]/90 transition-all duration-200 group"
              >
                <MessageCircle className="w-5 h-5" />
                <span className="group-hover:translate-x-0.5 transition-transform">Telegram orqali kirish</span>
              </motion.button>
            )}

            <AnimatePresence>
              {telegramMode && isLogin && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  {telegramPolling ? (
                    <div className="flex flex-col items-center gap-3 py-4">
                      <Loader2 className="w-8 h-8 text-[#229ED9] animate-spin" />
                      <p className="text-sm text-muted-foreground text-center">Telegram botdan tasdiqlang...</p>
                      <a href="https://t.me/maxhospitalbot" target="_blank" className="text-xs text-[#229ED9] hover:underline">@maxhospitalbot ga o'tish →</a>
                    </div>
                  ) : (
                    <div className="space-y-2 pb-2">
                      <input
                        type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email manzilingiz"
                        className="w-full px-4 py-3 rounded-2xl border border-input bg-background text-foreground text-sm focus:ring-2 focus:ring-[#229ED9]/30 focus:border-[#229ED9] outline-none"
                      />
                      <button
                        onClick={handleTelegramLogin} disabled={loading}
                        className="w-full py-2.5 rounded-2xl bg-[#229ED9]/10 text-[#229ED9] font-medium text-sm hover:bg-[#229ED9]/20 transition-colors disabled:opacity-50"
                      >
                        {loading ? "Yuborilmoqda..." : "Tasdiqlash so'rovi yuborish"}
                      </button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.98 }}
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-2xl border border-border text-foreground font-medium text-sm hover:bg-secondary/80 transition-all duration-200 group"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              <span className="group-hover:translate-x-0.5 transition-transform">Google bilan kirish</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.98 }}
              onClick={handleAppleLogin}
              className="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-2xl border border-border text-foreground font-medium text-sm hover:bg-secondary/80 transition-all duration-200 group"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              <span className="group-hover:translate-x-0.5 transition-transform">Apple bilan kirish</span>
            </motion.button>
          </div>

          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">yoki</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <AnimatePresence mode="wait">
              {!isLogin && (
                <motion.div
                  key="fullname"
                  initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div className="relative group">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <input
                      type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
                      placeholder="F.I.Sh."
                      className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-input bg-background text-foreground text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition-all duration-200"
                      required
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div layout className="relative group">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder={t("auth.email")}
                className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-input bg-background text-foreground text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition-all duration-200"
                required
              />
            </motion.div>

            <motion.div layout className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <input
                type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder={t("auth.password")}
                className="w-full pl-11 pr-12 py-3.5 rounded-2xl border border-input bg-background text-foreground text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition-all duration-200"
                required minLength={6}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </motion.div>

            <motion.button
              whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.98 }}
              type="submit" disabled={loading}
              className="w-full py-3.5 rounded-2xl bg-hero-gradient text-primary-foreground font-semibold text-sm hover:opacity-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 group"
              style={{ boxShadow: "0 8px 24px -6px hsl(var(--primary) / 0.35)" }}
            >
              {loading ? (
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full" />
              ) : (
                <>
                  {isLogin ? t("nav.login") : t("nav.register")}
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </motion.button>
          </form>

          {/* 2FA Polling Overlay */}
          <AnimatePresence>
            {telegramPolling && !telegramMode && (
              <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                className="mt-4 bg-accent/30 rounded-2xl p-6 text-center"
              >
                <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground mb-1">🔐 2FA Tasdiqlash</p>
                <p className="text-xs text-muted-foreground mb-3">Telegram botdan so'rovni tasdiqlang...</p>
                <a href="https://t.me/maxhospitalbot" target="_blank" className="text-xs text-primary hover:underline">@maxhospitalbot ga o'tish →</a>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.p layout className="text-center text-sm text-muted-foreground mt-6">
            {isLogin ? t("auth.noAccount") : t("auth.hasAccount")}{" "}
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-primary font-semibold hover:underline underline-offset-4 transition-colors"
            >
              {isLogin ? t("nav.register") : t("nav.login")}
            </button>
          </motion.p>
        </motion.div>

        {/* Footer text */}
        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
          className="text-center text-xs text-muted-foreground/60 mt-6"
        >
          Tizimga kirish orqali shartlarga rozilik bildirasiz
        </motion.p>
      </motion.div>
    </div>
  );
};

export default AuthPage;
