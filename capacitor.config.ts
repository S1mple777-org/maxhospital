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
    // Ilova status bar ostiga kirib ketmasligi uchun.
    SystemBars: {
      insetsHandling: "native",
    },
  },
};

export default config;
