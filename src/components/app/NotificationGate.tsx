import { useEffect, useRef, useState } from "react";
import { BellOff, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isNativeApp } from "@/lib/native";
import { enableNotifications, getNotifyStatus, openNotificationSettings, type NotifyStatus } from "@/lib/notifyPermission";
import { syncLocalReminders } from "@/lib/localReminders";

/**
 * Faqat ilovada, kirgan foydalanuvchi uchun:
 *  - birinchi ochilishda Android'ning bildirishnoma ruxsati oynasini o'zi chiqaradi
 *    (avval faqat kelgusi eslatma bo'lganda so'ralardi va ko'pincha umuman so'ralmasdi);
 *  - ruxsat yo'q yoki dori kanali o'chiq/ovozsiz bo'lsa — yuqorida "Yoqish" paneli.
 */
const NotificationGate = () => {
  const { user } = useAuth();
  const [s, setS] = useState<NotifyStatus | null>(null);
  const [hidden, setHidden] = useState(false);
  const asked = useRef(false);

  const check = async () => {
    const st = await getNotifyStatus().catch(() => null);
    if (st && (st.display === "prompt" || st.display === "prompt-with-rationale") && !asked.current) {
      asked.current = true;
      if (await enableNotifications().catch(() => false)) void syncLocalReminders();
      setS(await getNotifyStatus().catch(() => st));
      return;
    }
    setS(st);
  };

  useEffect(() => {
    if (!isNativeApp() || !user) return;
    void check();
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s || hidden) return null;
  const denied = s.display !== "granted";
  if (!denied && !s.channelBlocked && !s.channelSilent) return null;

  const text = denied
    ? "Bildirishnomalar o'chiq — dori eslatmalari kelmaydi."
    : s.channelBlocked ? "«Dori eslatmalari» kanali o'chirilgan." : "Dori eslatmalari ovozsiz.";
  const action = async () => {
    if (denied) { if (await enableNotifications()) void syncLocalReminders(); }
    else await openNotificationSettings(true);
  };

  return (
    <div className="fixed top-16 inset-x-3 z-[60] mx-auto max-w-md rounded-xl border border-destructive/30 bg-card px-3 py-2.5 shadow-lg flex items-center gap-2">
      <BellOff className="w-4 h-4 text-destructive shrink-0" />
      <p className="text-xs text-foreground flex-1">{text}</p>
      <button onClick={() => void action()} className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground shrink-0">
        {denied ? "Yoqish" : "Ovozni yoqish"}
      </button>
      <button onClick={() => setHidden(true)} aria-label="Yopish" className="p-1 text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
    </div>
  );
};

export default NotificationGate;
