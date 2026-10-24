// `npx cap add android` dan keyin ishga tushadi (npm run android:init va GitHub Actions ichida).
//  - Video qo'ng'iroq uchun kamera va mikrofon ruxsatlari
//  - Dori eslatmalari uchun aniq vaqtli budilnik ruxsati (SCHEDULE_EXACT_ALARM)
//  - Bildirishnoma uchun oq-qora kichik ikonka (ic_stat_medication)
// Qayta ishga tushirish xavfsiz: bor narsani ikki marta qo'shmaydi.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const manifestPath = "android/app/src/main/AndroidManifest.xml";

if (!existsSync(manifestPath)) {
  console.error(`✗ ${manifestPath} topilmadi. Avval "npx cap add android" ni ishga tushiring.`);
  process.exit(1);
}

let xml = readFileSync(manifestPath, "utf8");

const lines = [
  '<uses-permission android:name="android.permission.CAMERA" />',
  '<uses-permission android:name="android.permission.RECORD_AUDIO" />',
  '<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />',
  // Dori eslatmasi aynan belgilangan daqiqada chalinishi uchun (Android 12+).
  // Foydalanuvchi ilovada bir marta ruxsat beradi; bermasa ham eslatma keladi, faqat biroz kechikishi mumkin.
  '<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />',
  // Android 13+: dori eslatmasi budilnik kabi aniq vaqtda — foydalanuvchidan so'ramasdan beriladi.
  // (Android 14 da SCHEDULE_EXACT_ALARM yangi o'rnatilgan ilovaga sukut bo'yicha berilmaydi,
  // shuning uchun eslatmalar kechikib kelardi.)
  '<uses-permission android:name="android.permission.USE_EXACT_ALARM" />',
  // Android 13+: bildirishnoma ko'rsatish ruxsati (ilova so'raydi).
  '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
  // Kamerasi yo'q qurilmalarda ham ilova o'rnatilishi uchun.
  '<uses-feature android:name="android.hardware.camera" android:required="false" />',
  '<uses-feature android:name="android.hardware.microphone" android:required="false" />',
];

const missing = lines.filter((line) => !xml.includes(line.match(/android:name="([^"]+)"/)[0]));

if (missing.length === 0) {
  console.log("✓ Ruxsatlar allaqachon qo'shilgan.");
} else {
  xml = xml.replace("</manifest>", `    ${missing.join("\n    ")}\n</manifest>`);
  writeFileSync(manifestPath, xml);
  console.log(`✓ AndroidManifest.xml ga ${missing.length} ta qator qo'shildi.`);
}

// Android bildirishnoma ikonkasi bir rangli (shaffof fonda oq) bo'lishi kerak.
const iconDir = "android/app/src/main/res/drawable";
const iconPath = `${iconDir}/ic_stat_medication.xml`;
if (!existsSync(iconPath)) {
  mkdirSync(iconDir, { recursive: true });
  writeFileSync(
    iconPath,
    `<?xml version="1.0" encoding="utf-8"?>
<!-- MaxHospital: dori eslatmasi ikonkasi (tibbiy xoch) -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#FFFFFFFF"
        android:pathData="M9.5,3h5a1,1 0,0 1,1 1v4.5h4.5a1,1 0,0 1,1 1v5a1,1 0,0 1,-1 1h-4.5v4.5a1,1 0,0 1,-1 1h-5a1,1 0,0 1,-1 -1v-4.5h-4.5a1,1 0,0 1,-1 -1v-5a1,1 0,0 1,1 -1h4.5v-4.5a1,1 0,0 1,1 -1z" />
</vector>
`,
  );
  console.log("✓ Bildirishnoma ikonkasi yaratildi.");
}
