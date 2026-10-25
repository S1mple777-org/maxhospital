// Ilova bildirishnomalari: ruxsat, kanal (ovoz) holati va kerakli sozlamani ochish.
import { isNativeApp } from "@/lib/native";
import { AppInstaller, hasNativeTools } from "@/lib/nativeTools";
import { CHANNEL_ID, initLocalReminders } from "@/lib/localReminders";

export interface NotifyStatus {
  /** "granted" | "denied" | "prompt" | "prompt-with-rationale" */
  display: string;
  /** kanal o'chirilgan (importance 0) */
  channelBlocked: boolean;
  /** kanal ovozsiz (importance < 3 yoki ovoz yo'q) */
  channelSilent: boolean;
  /** native tekshiruv bormi (APK 1.0.27+) */
  detailed: boolean;
}

async function ln() {
  return (await import("@capacitor/local-notifications")).LocalNotifications;
}

export async function getNotifyStatus(): Promise<NotifyStatus | null> {
  if (!isNativeApp()) return null;
  await initLocalReminders().catch(() => undefined);   // kanal mavjud bo'lsin
  const display = (await (await ln()).checkPermissions()).display;
  let channelBlocked = false, channelSilent = false, detailed = false;
  if (hasNativeTools()) {
    try {
      const s = await AppInstaller.notificationStatus({ channel: CHANNEL_ID });
      detailed = true;
      if (s.channelExists) {
        channelBlocked = (s.channelImportance ?? 3) === 0;
        channelSilent = !channelBlocked && ((s.channelImportance ?? 3) < 3 || s.channelSound === false);
      }
    } catch { /* eski APK: metod yo'q */ }
  }
  return { display, channelBlocked, channelSilent, detailed };
}

/** Ruxsat so'raydi; Android oyna ko'rsatmasa (avval rad etilgan) — sozlamani ochadi. */
export async function enableNotifications(): Promise<boolean> {
  if (!isNativeApp()) return false;
  const LocalNotifications = await ln();
  const perm = await LocalNotifications.requestPermissions();
  if (perm.display === "granted") return true;
  await openNotificationSettings(false);
  return false;
}

export async function openNotificationSettings(channel: boolean): Promise<void> {
  if (!hasNativeTools()) return;
  try { await AppInstaller.openNotificationSettings(channel ? { channel: CHANNEL_ID } : {}); } catch { /* eski APK */ }
}

export async function openAppSettings(): Promise<void> {
  if (!hasNativeTools()) return;
  try { await AppInstaller.openAppSettings(); } catch { /* eski APK */ }
}
