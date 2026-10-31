// MaxHospital'ning o'z Android plagini (scripts/android/AppInstallerPlugin.java).
// Eski APK larda ba'zi metodlar yo'q bo'lishi mumkin — chaqiruvchilar xatoni ushlaydi.
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export interface NativeNotificationStatus {
  enabled: boolean;
  channelExists?: boolean;
  /** 0 o'chiq, 1–2 ovozsiz, 3+ ovozli */
  channelImportance?: number;
  channelSound?: boolean;
}

export interface AppInstallerPlugin {
  canInstall(): Promise<{ allowed: boolean }>;
  openInstallSettings(): Promise<void>;
  downloadAndInstall(options: { url: string }): Promise<{ started: boolean }>;
  addListener(event: "progress", cb: (p: { percent: number }) => void): Promise<PluginListenerHandle>;
  notificationStatus(options: { channel?: string }): Promise<NativeNotificationStatus>;
  openNotificationSettings(options: { channel?: string }): Promise<void>;
  openAppSettings(): Promise<void>;
  /** 1.0.31+ APK: yaqinning ovozi bilan chalinadigan bildirishnoma kanali. key="" — o'chirish. */
  setVoiceChannel(options: { key: string; base64?: string }): Promise<{ channelId?: string }>;
}

export const AppInstaller = registerPlugin<AppInstallerPlugin>("AppInstaller");
export const hasNativeTools = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("AppInstaller");
