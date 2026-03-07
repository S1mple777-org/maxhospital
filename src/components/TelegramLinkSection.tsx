import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { MessageCircle, Link2, Unlink, Bell, BellOff, Copy, RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

const TelegramLinkSection = () => {
  const { user, profile, refreshProfile } = useAuth();
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isLinked, setIsLinked] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  useEffect(() => {
    if (profile) {
      setIsLinked(!!(profile as any).telegram_chat_id);
      setNotificationsEnabled((profile as any).telegram_notifications_enabled ?? true);
    }
  }, [profile]);

  const generateCode = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Tizimga kiring"); return; }

      const res = await supabase.functions.invoke("telegram-auth", {
        body: { action: "generate_code" },
      });

      if (res.error) throw new Error(res.error.message);
      setLinkCode(res.data.code);
      toast.success("Kod yaratildi!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const unlinkTelegram = async () => {
    setLoading(true);
    try {
      const res = await supabase.functions.invoke("telegram-auth", {
        body: { action: "unlink" },
      });
      if (res.error) throw new Error(res.error.message);
      setIsLinked(false);
      setLinkCode(null);
      toast.success("Telegram uzildi");
      await refreshProfile();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleNotifications = async () => {
    const newState = !notificationsEnabled;
    setLoading(true);
    try {
      const res = await supabase.functions.invoke("telegram-auth", {
        body: { action: "toggle_notifications", enabled: newState },
      });
      if (res.error) throw new Error(res.error.message);
      setNotificationsEnabled(newState);
      toast.success(newState ? "Bildirishnomalar yoqildi" : "Bildirishnomalar o'chirildi");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyCode = () => {
    if (linkCode) {
      navigator.clipboard.writeText(linkCode);
      toast.success("Kod nusxalandi!");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-2xl border border-border p-6 card-shadow"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-[#229ED9]/10 flex items-center justify-center">
          <MessageCircle className="w-5 h-5 text-[#229ED9]" />
        </div>
        <div>
          <h3 className="font-display font-bold text-foreground">Telegram bog'lash</h3>
          <p className="text-xs text-muted-foreground">
            {isLinked ? "✅ Telegram ulangan" : "Telegramni ulang va bildirishnomalar oling"}
          </p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {isLinked ? (
          <motion.div
            key="linked"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            <div className="bg-primary/5 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {notificationsEnabled ? (
                  <Bell className="w-4 h-4 text-primary" />
                ) : (
                  <BellOff className="w-4 h-4 text-muted-foreground" />
                )}
                <span className="text-sm font-medium text-foreground">
                  Bildirishnomalar
                </span>
              </div>
              <button
                onClick={toggleNotifications}
                disabled={loading}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  notificationsEnabled ? "bg-primary" : "bg-muted"
                }`}
              >
                <motion.div
                  animate={{ x: notificationsEnabled ? 20 : 2 }}
                  className="absolute top-1 w-4 h-4 rounded-full bg-white shadow"
                />
              </button>
            </div>

            <button
              onClick={unlinkTelegram}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-destructive/30 text-destructive text-sm font-medium hover:bg-destructive/5 transition-colors disabled:opacity-50"
            >
              <Unlink className="w-4 h-4" />
              Telegramni uzish
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="not-linked"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            {linkCode ? (
              <div className="space-y-3">
                <div className="bg-secondary/50 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-2">
                    Sizning shaxsiy kodingiz:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-center text-2xl font-mono font-bold text-primary tracking-[0.3em] bg-background rounded-lg py-2 border border-border">
                      {linkCode}
                    </code>
                    <button
                      onClick={copyCode}
                      className="p-2 rounded-lg hover:bg-secondary transition-colors"
                      title="Nusxalash"
                    >
                      <Copy className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>

                <div className="bg-[#229ED9]/5 rounded-xl p-4 text-sm text-muted-foreground space-y-1">
                  <p>1. <a href="https://t.me/maxhospitalbot" target="_blank" className="text-[#229ED9] font-medium hover:underline inline-flex items-center gap-1">@maxhospitalbot <ExternalLink className="w-3 h-3" /></a> ga o'ting</p>
                  <p>2. <code className="bg-secondary px-1.5 py-0.5 rounded text-xs">/link {linkCode}</code> buyrug'ini yuboring</p>
                  <p>3. Akkaunt avtomatik ulanadi ✅</p>
                </div>

                <button
                  onClick={generateCode}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                  Yangi kod olish
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Telegramni ulash uchun shaxsiy kod yarating va uni botga yuboring.
                </p>
                <button
                  onClick={generateCode}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#229ED9] text-white font-medium text-sm hover:bg-[#229ED9]/90 transition-colors disabled:opacity-50"
                >
                  <Link2 className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                  {loading ? "Yaratilmoqda..." : "Kod yaratish"}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default TelegramLinkSection;
