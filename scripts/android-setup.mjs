// `npx cap add android` dan keyin bir marta ishga tushadi (npm run android:init ichida).
// Video qo'ng'iroq uchun kamera va mikrofon ruxsatlarini AndroidManifest.xml ga qo'shadi.
// Qayta ishga tushirish xavfsiz: bor ruxsatlarni ikki marta qo'shmaydi.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

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
  console.log(`✓ AndroidManifest.xml ga ${missing.length} ta ruxsat qo'shildi (kamera, mikrofon).`);
}
