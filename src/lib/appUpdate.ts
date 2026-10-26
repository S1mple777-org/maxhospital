// Ilovani orqa fonda yangilash (faqat Android ilova ichida; brauzerda hech narsa qilmaydi).
//
//  1. Har ochilishda notifyAppReady(): "yangi versiya muvaffaqiyatli ochildi". Agar yangi versiya
//     buzuq bo'lib, 10 soniyada shu chaqiruvga yetmasa, plagin avvalgi versiyaga o'zi qaytaradi.
//  2. Netlify'dagi /ota/latest.json o'qiladi (scripts/build-ota.mjs har deployda yozadi).
//  3. Versiya boshqa bo'lsa, zip orqa fonda yuklanadi va next() bilan navbatga qo'yiladi:
//     ilova keyingi safar ochilganda (yoki fonga o'tib qaytganda) yangisi ishlaydi. Hech narsa bosilmaydi.
//  4. Agar yangi sayt versiyasi yangiroq APK talab qilsa (min_apk_build), yuklab olinmaydi va
//     "Yangi versiya bor" oynasi chiqadi: bir bosishda APK yuklanadi, Android "O'rnatish"ni so'raydi.
import { Capacitor } from "@capacitor/core";
import { isNativeApp, PUBLIC_SITE_URL } from "@/lib/native";
import { AppInstaller } from "@/lib/nativeTools";
const RELEASES_API = "https://api.github.com/repos/S1mple777-org/maxhospital/releases/latest";

export const APP_BUILD: string = typeof __APP_BUILD__ !== "undefined" ? __APP_BUILD__ : "dev";
export const APK_DOWNLOAD_URL = "https://github.com/S1mple777-org/maxhospital/releases/latest";
const LATEST_URL = `${PUBLIC_SITE_URL}/ota/latest.json`;
const QUEUED_KEY = "maxhospital.ota.queued";

export interface OtaLatest {
  version: string; url: string; sha256?: string; size?: number; min_apk_build?: number; built_at?: string;
}

export interface UpdateState {
  /** APK versionCode (GitHub Actions run raqami) */
  apkBuild: number | null;
  apkVersion: string | null;
  /** hozir ishlayotgan sayt versiyasi */
  webBuild: string;
  /** yuklab olingan va keyingi ochilishda ishlaydigan versiya */
  queued: string | null;
  /** yangi APK kerak (sayt yangilanishi bu ilovaga mos emas) */
  needsApk: boolean;
  checking: boolean;
  error: string | null;
  /** APK yuklanmoqda: 0..100, null = yuklanmayapti */
  apkProgress: number | null;
}

let state: UpdateState = { apkBuild: null, apkVersion: null, webBuild: APP_BUILD, queued: null, needsApk: false, checking: false, error: null, apkProgress: null };
const listeners = new Set<(s: UpdateState) => void>();
const set = (patch: Partial<UpdateState>) => { state = { ...state, ...patch }; listeners.forEach((l) => l(state)); };
export const getUpdateState = () => state;
export function subscribeUpdates(fn: (s: UpdateState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const storage = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
};

async function fetchLatest(): Promise<OtaLatest | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${LATEST_URL}?t=${Date.now()}`, { cache: "no-store", signal: ctrl.signal });
    if (!res.ok) return null;
    const j = (await res.json()) as OtaLatest;
    return j && typeof j.version === "string" && typeof j.url === "string" ? j : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Ilova ochilganda bir marta (native.ts -> initNativeApp). Xatolar ilovani to'xtatmaydi. */
export async function initAppUpdates(): Promise<void> {
  if (!isNativeApp()) return;
  let Updater: typeof import("@capgo/capacitor-updater").CapacitorUpdater;
  try {
    ({ CapacitorUpdater: Updater } = await import("@capgo/capacitor-updater"));
    await Updater.notifyAppReady();
  } catch (e) {
    console.warn("updater unavailable", e);
    return;
  }
  try {
    const { App } = await import("@capacitor/app");
    const info = await App.getInfo();
    set({ apkBuild: Number(info.build) || null, apkVersion: info.version ?? null });
  } catch { /* ignore */ }

  // Eski, endi ishlatilmaydigan versiyalarni o'chirish (telefon xotirasi to'lmasin).
  try {
    const [{ bundle: current }, { bundles }] = await Promise.all([Updater.current(), Updater.list()]);
    for (const b of bundles) {
      if (b.id !== current.id && (b.status === "success" || b.status === "error")) {
        await Updater.delete({ id: b.id }).catch(() => undefined);
      }
    }
  } catch { /* ignore */ }

  await checkForUpdate();
}

/** Yangilanishni tekshiradi va topilsa orqa fonda yuklaydi. Profildagi "Tekshirish" tugmasi ham shuni chaqiradi. */
export async function checkForUpdate(): Promise<void> {
  if (!isNativeApp() || state.checking) return;
  set({ checking: true, error: null });
  try {
    const latest = await fetchLatest();
    if (!latest) { set({ error: "Yangilanish serveriga ulanib bo'lmadi" }); return; }

    if (state.apkBuild !== null && (latest.min_apk_build ?? 0) > state.apkBuild) {
      set({ needsApk: true });
      return;
    }
    if (latest.version === APP_BUILD) { set({ queued: null }); return; }
    if (storage.get(QUEUED_KEY) === latest.version) { set({ queued: latest.version }); return; }

    const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
    const url = new URL(latest.url, PUBLIC_SITE_URL).toString();
    const bundle = await CapacitorUpdater.download({ url, version: latest.version });
    await CapacitorUpdater.next({ id: bundle.id });
    storage.set(QUEUED_KEY, latest.version);
    set({ queued: latest.version });
  } catch (e: any) {
    console.warn("ota update failed", e);
    set({ error: String(e?.message || e).slice(0, 120) });
  } finally {
    set({ checking: false });
  }
}

/** Yuklab olingan versiyani hozir ishga tushirish (ilova qayta yuklanadi). */
export async function applyQueuedUpdateNow(): Promise<void> {
  if (!isNativeApp()) return;
  const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
  const { bundles } = await CapacitorUpdater.list();
  const next = bundles.find((b) => b.version === state.queued);
  if (next) await CapacitorUpdater.set({ id: next.id });   // JS konteksti shu yerda qayta yuklanadi
}

/** Oxirgi APK fayl manzili (GitHub Releases). */
async function latestApkUrl(): Promise<string | null> {
  try {
    const res = await fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json" }, cache: "no-store" });
    if (!res.ok) return null;
    const j = await res.json();
    const asset = (j?.assets ?? []).find((a: any) => typeof a?.name === "string" && a.name.endsWith(".apk"));
    return typeof asset?.browser_download_url === "string" ? asset.browser_download_url : null;
  } catch {
    return null;
  }
}

export type ApkInstallResult = "started" | "needs_permission" | "browser" | "error";

/**
 * Yangi APK ni ILOVANING O'ZIDA yuklab, Android o'rnatish oynasini ochadi.
 * Birinchi marta Android "Bu manbadan o'rnatishga ruxsat"ni so'raydi — sozlama ochiladi, ruxsat berib qaytasiz.
 * Eski APK larda (plagin yo'q) — tizim brauzerida Releases sahifasi ochiladi.
 */
export async function installLatestApk(): Promise<ApkInstallResult> {
  if (!isNativeApp()) return "error";
  if (!Capacitor.isPluginAvailable("AppInstaller")) {
    // Eski APK: brauzerda Releases sahifasi emas, to'g'ridan-to'g'ri .apk fayl ochiladi
    // (sahifada birinchi turgan "Source code (zip)" APK emas edi).
    window.open((await latestApkUrl()) ?? APK_DOWNLOAD_URL, "_blank");
    return "browser";
  }
  if (state.apkProgress !== null) return "started";
  try {
    const { allowed } = await AppInstaller.canInstall();
    if (!allowed) {
      await AppInstaller.openInstallSettings();
      return "needs_permission";
    }
    const url = await latestApkUrl();
    if (!url) { set({ error: "Yangi versiya topilmadi (internetni tekshiring)" }); return "error"; }
    set({ apkProgress: 0, error: null });
    const sub = await AppInstaller.addListener("progress", (p) => set({ apkProgress: p.percent }));
    try {
      await AppInstaller.downloadAndInstall({ url });
    } finally {
      await sub.remove();
      set({ apkProgress: null });
    }
    return "started";
  } catch (e: any) {
    set({ apkProgress: null, error: String(e?.message || e).slice(0, 160) });
    return "error";
  }
}

/** Eski nom: endi ilova ichida yangilaydi. */
export function openApkDownload(): void {
  void installLatestApk();
}
