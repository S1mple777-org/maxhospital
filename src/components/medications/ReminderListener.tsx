import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isNativeApp } from "@/lib/native";
import { markReminder } from "@/lib/medications";
import { clearLocalReminders, syncLocalReminders } from "@/lib/localReminders";
import { playMyVoiceNote } from "@/lib/medVoice";

/**
 * Mounted once in App:
 *  - site: shows a medication reminder (user_notifications row) the moment it
 *    arrives, with "Ichdim" / "O'tkazib yubordim" buttons, plus a browser
 *    notification when the tab is in the background;
 *  - Android app: keeps the phone's offline alarms in sync with the server.
 */
const ReminderListener = () => {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      if (isNativeApp()) void clearLocalReminders();
      return;
    }
    if (isNativeApp()) void syncLocalReminders();

    const channel = supabase
      .channel(`user-notifications-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "user_notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as { id: string; kind: string; title: string; body: string | null; data: any };
          const reminderId: string | undefined = n.data?.reminder_id;

          const act = async (status: "taken" | "skipped") => {
            if (!reminderId) return;
            try {
              await markReminder(reminderId, status);
              toast.success(status === "taken" ? "Ichildi deb belgilandi" : "O'tkazib yuborildi");
            } catch (e: any) {
              toast.error(e.message);
            }
            await (supabase.from("user_notifications" as any) as any).update({ read_at: new Date().toISOString() }).eq("id", n.id);
          };

          // Saytda: yaqinning ovozidagi eslatma (ilovada bildirishnoma kanali o'zi chaladi).
          if (n.kind === "medication" && reminderId && !isNativeApp()) void playMyVoiceNote();

          // MaxBand SOS / fall / ilova SOS: a red toast that stays until it is dismissed.
          if (n.kind === "maxband_sos" || n.kind === "sos") {
            toast.error(n.title, {
              description: n.body ?? undefined,
              duration: 30 * 60_000,
              action: { label: n.data?.url ? "Xaritada" : "Ochish", onClick: () => window.location.assign(n.data?.url ?? n.data?.link ?? "/maxband") },
            });
          } else toast(n.title, {
            description: n.body ?? undefined,
            duration: 5 * 60_000,
            action: reminderId
              ? { label: "✅ Ichdim", onClick: () => void act("taken") }
              : typeof n.data?.url === "string" && n.data.url.startsWith("/")
                ? { label: "Ochish", onClick: () => window.location.assign(n.data.url) }
                : undefined,
            cancel: reminderId ? { label: "O'tkazish", onClick: () => void act("skipped") } : undefined,
          });

          // The app already rings through its own local notification.
          if (!isNativeApp() && document.visibilityState === "hidden" && "Notification" in window
              && Notification.permission === "granted") {
            try {
              new Notification(n.title, { body: n.body ?? undefined, tag: n.id, icon: "/favicon.ico" });
            } catch {
              /* some browsers only allow notifications from a service worker */
            }
          }
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [user?.id]);

  return null;
};

export default ReminderListener;
