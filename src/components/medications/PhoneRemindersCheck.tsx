import { useEffect, useState } from "react";
import { BellRing, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { isNativeApp } from "@/lib/native";
import { ensureNotificationPermission, openExactAlarmSettings, reminderDiagnostics, scheduleTestReminder, syncLocalReminders, type ReminderDiagnostics } from "@/lib/localReminders";

const ok = (v: string) => v === "granted";

/**
 * Only in the Android app: shows whether this phone will really ring
 * (notification permission, exact alarms, how many reminders are scheduled) and lets the user test it.
 */
const PhoneRemindersCheck = () => {
  const [d, setD] = useState<ReminderDiagnostics | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => reminderDiagnostics().then(setD).catch(() => setD(null));
  useEffect(() => {
    if (!isNativeApp()) return;
    void refresh();
    // Returning from the settings screen: show the new state.
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  if (!isNativeApp() || !d) return null;

  const sync = async () => {
    setBusy(true);
    const r = await syncLocalReminders().catch(() => null);
    await refresh();
    setBusy(false);
    toast.success(r ? `Telefonga ${r.scheduled} ta eslatma qo'yildi` : "Sinxronlab bo'lmadi (internetni tekshiring)");
  };
  const test = async () => {
    const done = await scheduleTestReminder().catch(() => false);
    if (done) toast.success("1 daqiqadan keyin sinov eslatmasi keladi. Ilovani yopib kuting.");
    else toast.error("Bildirishnomaga ruxsat berilmagan. Telefon sozlamalaridan yoqing.");
    void refresh();
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 mb-6">
      <p className="text-sm font-semibold text-foreground flex items-center gap-2"><BellRing className="w-4 h-4 text-primary" /> Telefondagi eslatmalar</p>
      <ul className="mt-2 space-y-1 text-xs">
        <li className={ok(d.display) ? "text-emerald-700" : "text-destructive"}>
          {ok(d.display) ? "✓ Bildirishnomaga ruxsat bor" : "✗ Bildirishnomaga ruxsat yo'q"}
          {!ok(d.display) && (
            <button onClick={async () => { if (!(await ensureNotificationPermission())) toast.error("Sozlamalar → Ilovalar → MaxHospital → Bildirishnomalar dan yoqing"); void refresh(); }}
              className="ml-2 underline font-medium">Ruxsat berish</button>
          )}
        </li>
        <li className={d.exact === "denied" ? "text-amber-700" : "text-emerald-700"}>
          {d.exact === "denied" ? "! Aniq vaqtli budilnik o'chiq — eslatma kechikib kelishi mumkin" : "✓ Aniq vaqtda chalinadi"}
          {d.exact === "denied" && (
            <button onClick={() => void openExactAlarmSettings()} className="ml-2 underline font-medium">Yoqish</button>
          )}
        </li>
        <li className={d.scheduled > 0 ? "text-emerald-700" : "text-amber-700"}>
          {d.scheduled > 0
            ? `✓ Telefonda ${d.scheduled} ta eslatma rejalashtirilgan${d.next ? `, keyingisi: ${new Date(d.next).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}`
            : "! Telefonda rejalashtirilgan eslatma yo'q — «Sinxronlash» ni bosing"}
        </li>
      </ul>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Saytda (kompyuterda) qo'shilgan eslatmalar telefonga ilova ochilganda tushadi. Xiaomi, Samsung va boshqalarda
        «Batareyani tejash»dan MaxHospital'ni chiqaring, aks holda telefon eslatmani to'xtatib qo'yishi mumkin.
      </p>
      <div className="mt-3 flex gap-2">
        <button onClick={sync} disabled={busy} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border py-2 text-xs font-medium text-foreground disabled:opacity-60">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Sinxronlash
        </button>
        <button onClick={test} className="flex-1 rounded-xl bg-primary py-2 text-xs font-medium text-primary-foreground">Sinov eslatmasi (1 daqiqa)</button>
      </div>
    </div>
  );
};

export default PhoneRemindersCheck;
