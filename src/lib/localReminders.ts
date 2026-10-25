// Android app: medication reminders as LOCAL notifications.
// Planning happens online (the schedule lives on the server); once synced,
// the phone rings at the right time even without internet, and "✅ Ichdim"
// taps made offline are queued and sent when the connection is back.
import { isNativeApp } from "@/lib/native";
import { localTime, markReminder, reminderBody, reminderTitle, type MedicationSchedule } from "@/lib/medications";
import { supabase } from "@/integrations/supabase/client";

// "med-alarm": budilnikka o'xshash o'z ovozi bor kanal (res/raw/med_alarm.wav, scripts/android-setup.mjs).
// Eski "med-reminders" kanali ovozsiz bo'lib qolgan telefonlar bor edi; Android kanal ovozini keyin
// o'zgartirishga ruxsat bermaydi, shuning uchun yangi kanal.
const CHANNEL_ID = "med-alarm";
const OLD_CHANNEL_ID = "med-reminders";
const ALARM_SOUND = "med_alarm.wav";
const ACTION_TYPE = "MED_REMINDER";
/** Follow-up ("Ichdingizmi?") notifications use notify_id + this offset. */
const FOLLOWUP_OFFSET = 1_000_000_000;
const FOLLOWUP_MS = 10 * 60_000;
const QUEUE_KEY = "mh_med_mark_queue";
const CACHE_KEY = "mh_med_cache";
const SYNC_DAYS = 14;
/** Each reminder also gets a follow-up; some phones (Samsung) allow ~500 alarms per app. */
const MAX_LOCAL = 200;

interface QueuedMark {
  id: string;
  status: "taken" | "skipped";
  at: string;
}

export interface CachedReminder {
  id: string;
  notify_id: number;
  scheduled_at: string;
  status: string;
  medicine_name: string;
  dose: string | null;
  instructions: string | null;
}

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable */
  }
};

/** Reminders saved on the phone during the last sync (for offline viewing). */
export const cachedReminders = (): CachedReminder[] => readJson<CachedReminder[]>(CACHE_KEY, []);

let initialized = false;

async function plugin() {
  return (await import("@capacitor/local-notifications")).LocalNotifications;
}

/** One-time setup: channel, action buttons, tap handler, reconnect handler. */
export async function initLocalReminders(): Promise<void> {
  if (!isNativeApp() || initialized) return;
  initialized = true;
  const LocalNotifications = await plugin();

  await LocalNotifications.createChannel({
    id: CHANNEL_ID,
    name: "Dori eslatmalari (budilnik)",
    description: "Dori ichish vaqti kelganda budilnik ovozi bilan eslatadi",
    importance: 5,
    visibility: 1,
    vibration: true,
    sound: ALARM_SOUND,
    lights: true,
    lightColor: "#0E7C74",
  });
  try { await LocalNotifications.deleteChannel({ id: OLD_CHANNEL_ID }); } catch { /* not there */ }

  await LocalNotifications.registerActionTypes({
    types: [{
      id: ACTION_TYPE,
      actions: [
        { id: "taken", title: "✅ Ichdim" },
        { id: "snooze", title: "⏰ 10 daqiqa" },
        { id: "skip", title: "⏭ O'tkazdim" },
      ],
    }],
  });

  await LocalNotifications.addListener("localNotificationActionPerformed", async (event) => {
    const extra = (event.notification.extra ?? {}) as { reminderId?: string; notifyId?: number; info?: Record<string, string> };
    const reminderId = extra.reminderId;
    if (!reminderId) return;
    const followupId = typeof extra.notifyId === "number" ? FOLLOWUP_OFFSET + extra.notifyId : null;
    if (event.actionId === "taken" || event.actionId === "skip") {
      if (followupId) await LocalNotifications.cancel({ notifications: [{ id: followupId }] }).catch(() => undefined);
      await markOrQueue(reminderId, event.actionId === "taken" ? "taken" : "skipped");
    } else if (event.actionId === "snooze" && followupId) {
      // 10 daqiqadan keyin yana chalinadi (avtomatik qayta eslatma o'rniga).
      await LocalNotifications.cancel({ notifications: [{ id: followupId }] }).catch(() => undefined);
      await LocalNotifications.schedule({ notifications: [followupNotification(followupId, extra, Date.now() + FOLLOWUP_MS)] });
    }
  });

  window.addEventListener("online", () => { void flushQueue(); });
  const { App } = await import("@capacitor/app");
  await App.addListener("resume", () => { void flushQueue(); void syncLocalReminders(); });
}

async function markOrQueue(id: string, status: "taken" | "skipped") {
  // update the offline cache right away so the app shows it
  writeJson(CACHE_KEY, cachedReminders().map((r) => (r.id === id ? { ...r, status } : r)));
  try {
    await markReminder(id, status);
  } catch {
    const queue = readJson<QueuedMark[]>(QUEUE_KEY, []).filter((q) => q.id !== id);
    queue.push({ id, status, at: new Date().toISOString() });
    writeJson(QUEUE_KEY, queue);
  }
}

/** Sends "Ichdim" taps that were made offline. */
export async function flushQueue(): Promise<void> {
  const queue = readJson<QueuedMark[]>(QUEUE_KEY, []);
  if (!queue.length) return;
  const left: QueuedMark[] = [];
  for (const q of queue) {
    try {
      await markReminder(q.id, q.status);
    } catch (e: any) {
      // keep it only if it failed because we are offline; drop rejected ones
      if (!navigator.onLine || /fetch|network/i.test(String(e?.message))) left.push(q);
    }
  }
  writeJson(QUEUE_KEY, left);
}

/**
 * Asks for the notification permission. Returns false if notifications are blocked.
 * The exact-alarm settings screen is NOT opened here any more (it used to open on every
 * app resume); with USE_EXACT_ALARM (Android 13+) it is granted automatically, and the
 * "Telefondagi eslatmalar" check on the medications page has a button for older phones.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!isNativeApp()) return false;
  const LocalNotifications = await plugin();
  let perm = await LocalNotifications.checkPermissions();
  if (perm.display !== "granted") perm = await LocalNotifications.requestPermissions();
  return perm.display === "granted";
}

/** Opens the "Alarms & reminders" setting (Android 12+), so reminders ring exactly on time. */
export async function openExactAlarmSettings(): Promise<void> {
  if (!isNativeApp()) return;
  const LocalNotifications = await plugin();
  try { await LocalNotifications.changeExactNotificationSetting(); } catch { /* Android < 12 */ }
}

/**
 * Downloads the next 14 days of reminders whose schedule includes the "app"
 * channel and schedules them on the phone. Call after login, after saving a
 * schedule and whenever the app comes back to the foreground.
 */
export async function syncLocalReminders(): Promise<{ scheduled: number } | null> {
  if (!isNativeApp()) return null;
  await initLocalReminders();
  await flushQueue();

  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return null;

  const now = new Date();
  const until = new Date(now.getTime() + SYNC_DAYS * 86_400_000);
  const [{ data: reminders, error }, { data: schedules }] = await Promise.all([
    supabase.from("medication_reminders" as any)
      .select("id, notify_id, schedule_id, scheduled_at, status")
      .gte("scheduled_at", new Date(now.getTime() - 86_400_000).toISOString())
      .lt("scheduled_at", until.toISOString())
      .order("scheduled_at")
      .limit(1000),
    supabase.from("medication_schedules" as any)
      .select("id, medicine_name, dose, instructions, channels, is_active, timezone"),
  ]);
  if (error) return null; // offline: keep what is already scheduled on the phone

  const byId = new Map(((schedules ?? []) as unknown as MedicationSchedule[]).map((s) => [s.id, s]));
  const rows = ((reminders ?? []) as any[])
    .map((r) => ({ r, s: byId.get(r.schedule_id) }))
    .filter(({ s }) => s);

  writeJson(CACHE_KEY, rows.map(({ r, s }) => ({
    id: r.id, notify_id: r.notify_id, scheduled_at: r.scheduled_at, status: r.status,
    medicine_name: s!.medicine_name, dose: s!.dose, instructions: s!.instructions,
  })));

  const LocalNotifications = await plugin();

  // Replace everything this feature scheduled before.
  const pending = await LocalNotifications.getPending();
  const ours = pending.notifications.filter((n) => (n.extra as any)?.kind === "med");
  if (ours.length) await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) });

  const upcoming = rows
    .filter(({ r, s }) => r.status === "pending" && s!.is_active && s!.channels.includes("app")
      && new Date(r.scheduled_at).getTime() > Date.now())
    .slice(0, MAX_LOCAL);

  // Vaqti endigina o'tgan (10 daqiqa ichida), hali javob berilmagan: faqat "Ichdingizmi?" qayta eslatmasi.
  const recent = rows.filter(({ r, s }) => (r.status === "pending" || r.status === "sent") && s!.is_active && s!.channels.includes("app")
    && new Date(r.scheduled_at).getTime() <= Date.now() && new Date(r.scheduled_at).getTime() + FOLLOWUP_MS > Date.now() + 5_000);

  if (!upcoming.length && !recent.length) return { scheduled: 0 };
  if (!(await ensureNotificationPermission())) return { scheduled: 0 };

  const infoOf = (r: any, s: MedicationSchedule) => ({
    medicine_name: s.medicine_name, dose: s.dose ?? "", instructions: s.instructions ?? "",
    time: localTime(r.scheduled_at, s.timezone),
  });
  await LocalNotifications.schedule({
    notifications: [
      ...recent.map(({ r, s }) => followupNotification(FOLLOWUP_OFFSET + r.notify_id,
        { kind: "med", reminderId: r.id, notifyId: r.notify_id, info: infoOf(r, s!) }, new Date(r.scheduled_at).getTime() + FOLLOWUP_MS)),
      ...upcoming.flatMap(({ r, s }) => {
      const info = infoOf(r, s!);
      const extra = { kind: "med", reminderId: r.id, notifyId: r.notify_id, info };
      const at = new Date(r.scheduled_at).getTime();
      return [
        {
          id: r.notify_id,
          title: reminderTitle("uz", info),
          body: reminderBody("uz", info),
          schedule: { at: new Date(at), allowWhileIdle: true },
          channelId: CHANNEL_ID,
          sound: ALARM_SOUND,
          actionTypeId: ACTION_TYPE,
          autoCancel: true,
          extra,
        },
        // "Ichdim" bosilmasa, 10 daqiqadan keyin yana (bosilsa — bekor qilinadi).
        followupNotification(FOLLOWUP_OFFSET + r.notify_id, extra, at + FOLLOWUP_MS),
      ];
    })],
  });
  return { scheduled: upcoming.length };
}

function followupNotification(id: number, extra: { reminderId?: string; notifyId?: number; info?: Record<string, string> }, atMs: number) {
  const info = extra.info ?? {};
  return {
    id,
    title: `⏰ Ichdingizmi? ${info.medicine_name ?? "Dori"}`,
    body: reminderBody("uz", { medicine_name: info.medicine_name ?? "", dose: info.dose, instructions: info.instructions, time: info.time ?? "" }),
    schedule: { at: new Date(atMs), allowWhileIdle: true },
    channelId: CHANNEL_ID,
    sound: ALARM_SOUND,
    actionTypeId: ACTION_TYPE,
    autoCancel: true,
    extra: { ...extra, kind: "med" },
  };
}

/** Removes everything this feature scheduled on the phone (e.g. on sign-out). */
export async function clearLocalReminders(): Promise<void> {
  if (!isNativeApp()) return;
  const LocalNotifications = await plugin();
  const pending = await LocalNotifications.getPending();
  const ours = pending.notifications.filter((n) => (n.extra as any)?.kind === "med");
  if (ours.length) await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
  writeJson(CACHE_KEY, []);
  writeJson(QUEUE_KEY, []);
}

export interface ReminderDiagnostics {
  /** "granted" | "denied" | "prompt" ... */
  display: string;
  /** exact alarms (Android 12+): "granted" | "denied" | "unknown" */
  exact: string;
  /** medication notifications currently scheduled on this phone */
  scheduled: number;
  next: string | null;
}

/** What the phone actually has: permissions and how many reminders are scheduled. */
export async function reminderDiagnostics(): Promise<ReminderDiagnostics | null> {
  if (!isNativeApp()) return null;
  const LocalNotifications = await plugin();
  const perm = await LocalNotifications.checkPermissions();
  let exact = "unknown";
  try { exact = (await LocalNotifications.checkExactNotificationSetting()).exact_alarm; } catch { /* Android < 12 */ }
  const pending = await LocalNotifications.getPending();
  const ours = pending.notifications.filter((n) => (n.extra as any)?.kind === "med");
  const times = ours.map((n) => (n.schedule?.at ? new Date(n.schedule.at as any).getTime() : NaN)).filter((t) => !Number.isNaN(t)).sort((a, b) => a - b);
  return { display: perm.display, exact, scheduled: ours.length, next: times.length ? new Date(times[0]).toISOString() : null };
}

/** Test notification in 1 minute, to check that the phone really rings (permissions, battery saver). */
export async function scheduleTestReminder(): Promise<boolean> {
  if (!isNativeApp()) return false;
  await initLocalReminders();
  if (!(await ensureNotificationPermission())) return false;
  const LocalNotifications = await plugin();
  await LocalNotifications.schedule({
    notifications: [{
      id: 2_000_000_000 + Math.floor(Math.random() * 1000),
      title: "💊 Sinov eslatmasi",
      body: "Bu bildirishnoma keldi — dori eslatmalari telefoningizda ishlaydi.",
      schedule: { at: new Date(Date.now() + 60_000), allowWhileIdle: true },
      channelId: CHANNEL_ID,
      sound: ALARM_SOUND,
      autoCancel: true,
      extra: { kind: "test" },
    }],
  });
  return true;
}
