import type { CapacitorConfig } from "@capacitor/cli";

// Android ilova sozlamalari. Batafsil: ANDROID.md
const config: CapacitorConfig = {
  appId: "uz.maxhospital.app",
  appName: "MaxHospital",
  webDir: "dist",
  android: {
    // Faqat HTTPS: bemor ma'lumotlari shifrlanmagan kanal orqali yuborilmaydi.
    allowMixedContent: false,
  },
  plugins: {
    // Orqa fonda sayt yangilanishi (src/lib/appUpdate.ts boshqaradi, scripts/build-ota.mjs fayllarni tayyorlaydi).
    // autoUpdate o'chiq: Capgo bulutiga ulanmaymiz, yangilanish o'zimizning Netlify saytimizdan olinadi.
    // resetWhenUpdate: yangi APK o'rnatilsa, ichidagi (yangiroq) versiyaga qaytadi.
    CapacitorUpdater: {
      autoUpdate: false,
      resetWhenUpdate: true,
      appReadyTimeout: 10000,
    },
    // Ilova status bar ostiga kirib ketmasligi uchun.
    SystemBars: {
      insetsHandling: "native",
    },
    // Dori eslatmalari (internetsiz ishlaydigan budilnik). Ikonka scripts/android-setup.mjs da yaratiladi.
    LocalNotifications: {
      smallIcon: "ic_stat_medication",
      iconColor: "#0E7C74",
    },
  },
};

export default config;
