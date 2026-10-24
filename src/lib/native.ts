// Sayt brauzerda ham, Android ilova (Capacitor) ichida ham ishlashi uchun yordamchilar.
import { Capacitor } from "@capacitor/core";
import type { jsPDF } from "jspdf";

export const isNativeApp = () => Capacitor.isNativePlatform();

/** Saytning ommaviy manzili. Ilova ichida window.location "https://localhost" bo'ladi. */
export const PUBLIC_SITE_URL: string =
  (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined) || "https://max-hospital1.netlify.app";

/** Emaildagi tasdiqlash havolasi qaytadigan manzil. */
export const authRedirectUrl = () => (isNativeApp() ? PUBLIC_SITE_URL : window.location.origin);

/**
 * PDF ni saqlaydi. Brauzerda oddiy yuklab olish; ilovada fayl telefonga yoziladi
 * va "Ulashish" oynasi ochiladi (Telegram, Drive, PDF ko'ruvchi va h.k.).
 */
export async function savePdf(pdf: jsPDF, fileName: string): Promise<void> {
  if (!isNativeApp()) {
    pdf.save(fileName);
    return;
  }
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);
  const base64 = (pdf.output("datauristring") as string).split(",")[1];
  const { uri } = await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache });
  await Share.share({ title: fileName, url: uri, dialogTitle: "Retseptni ochish yoki yuborish" });
}

/** PDF ni ko'rish uchun ochadi (brauzerda yangi oynada, ilovada ulashish orqali). */
export async function openPdf(pdf: jsPDF, fileName: string): Promise<void> {
  if (!isNativeApp()) {
    window.open(pdf.output("bloburl") as unknown as string, "_blank");
    return;
  }
  await savePdf(pdf, fileName);
}

/**
 * Supabase "magic link" ni ilovadan chiqmasdan ishlatadi.
 * Brauzerda havolaga o'tiladi; ilovada esa havoladagi token bilan shu yerning o'zida kiriladi.
 */
export async function signInWithMagicLink(
  actionLink: string,
  verify: (tokenHash: string, type: string) => Promise<{ error: { message: string } | null }>,
): Promise<boolean> {
  if (!isNativeApp()) {
    window.location.href = actionLink;
    return false;
  }
  const params = new URL(actionLink).searchParams;
  const tokenHash = params.get("token");
  if (!tokenHash) throw new Error("Kirish havolasi noto'g'ri");
  const { error } = await verify(tokenHash, params.get("type") || "magiclink");
  if (error) throw new Error(error.message);
  return true;
}

/** Android "orqaga" tugmasi: sahifalar bo'yicha orqaga, bosh sahifada esa ilovadan chiqadi. */
export async function initNativeApp(): Promise<void> {
  if (!isNativeApp()) return;
  // Orqa fonda yangilanish: birinchi navbatda "ilova ochildi" deb belgilaydi (aks holda plagin
  // avvalgi versiyaga qaytaradi), keyin yangi versiyani tekshiradi. Kutmaymiz — ilova darhol ochiladi.
  void import("@/lib/appUpdate").then((m) => m.initAppUpdates()).catch(() => undefined);
  const { App } = await import("@capacitor/app");
  await App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack && window.location.pathname !== "/") window.history.back();
    else App.exitApp();
  });
}
