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
  // Ilova ichida yangilash: yangi APK ni o'rnatish oynasini ochish uchun (foydalanuvchi baribir tasdiqlaydi).
  '<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />',
  // SOS: yaqinlarga joylashuvni yuborish (faqat SOS bosilganda so'raladi).
  '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
  '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
  '<uses-feature android:name="android.hardware.location.gps" android:required="false" />',
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

// Dori eslatmasi ovozi: budilnikka o'xshash "dit-dit-dit-dit" (res/raw/med_alarm.wav).
// Fayl repoga qo'shilmaydi — shu yerda generatsiya qilinadi (22 kHz, mono, 16-bit, ~5 soniya).
// Ovoz faqat YANGI kanalga beriladi (src/lib/localReminders.ts: "med-alarm"), chunki Android
// kanal ovozini keyin o'zgartirishga ruxsat bermaydi.
{
  const rawDir = "android/app/src/main/res/raw";
  const wavPath = `${rawDir}/med_alarm.wav`;
  if (!existsSync(wavPath)) {
    const rate = 22050;
    const samples = [];
    const tone = (freq, sec, amp = 0.8) => {
      const n = Math.round(rate * sec), fade = Math.round(rate * 0.006);
      for (let i = 0; i < n; i++) {
        const env = Math.min(1, i / fade, (n - i) / fade);
        // asosiy ton + oktava: quloqqa yoqimli, lekin baland eshitiladi
        const v = Math.sin((2 * Math.PI * freq * i) / rate) * 0.75 + Math.sin((4 * Math.PI * freq * i) / rate) * 0.25;
        samples.push(v * amp * env);
      }
    };
    const silence = (sec) => { for (let i = 0; i < Math.round(rate * sec); i++) samples.push(0); };
    for (let round = 0; round < 3; round++) {
      for (let b = 0; b < 4; b++) { tone(b % 2 ? 1320 : 1046, 0.12); silence(0.07); }
      silence(0.6);
    }
    const data = Buffer.alloc(samples.length * 2);
    samples.forEach((v, i) => data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), i * 2));
    const header = Buffer.alloc(44);
    header.write("RIFF", 0); header.writeUInt32LE(36 + data.length, 4); header.write("WAVE", 8);
    header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
    header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
    header.write("data", 36); header.writeUInt32LE(data.length, 40);
    mkdirSync(rawDir, { recursive: true });
    writeFileSync(wavPath, Buffer.concat([header, data]));
    console.log(`✓ Dori eslatmasi ovozi yaratildi (${(samples.length / rate).toFixed(1)} s).`);
  }
}

// Ilova ichida yangilash: AppInstaller native plagini (scripts/android/AppInstallerPlugin.java).
//  - Java faylini Android loyihaga ko'chiradi
//  - MainActivity'da ro'yxatdan o'tkazadi
//  - FileProvider yuklangan APK ni ko'rsata olishi uchun res/xml/file_paths.xml ga cache/updates qo'shadi
{
  const javaDir = "android/app/src/main/java/uz/maxhospital/app";
  mkdirSync(javaDir, { recursive: true });
  writeFileSync(`${javaDir}/AppInstallerPlugin.java`, readFileSync("scripts/android/AppInstallerPlugin.java", "utf8"));

  const mainPath = `${javaDir}/MainActivity.java`;
  const main = existsSync(mainPath) ? readFileSync(mainPath, "utf8") : "";
  if (!main.includes("registerPlugin(AppInstallerPlugin.class)")) {
    writeFileSync(mainPath, `package uz.maxhospital.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppInstallerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`);
    console.log("✓ AppInstaller plagini MainActivity'ga qo'shildi.");
  }

  const pathsFile = "android/app/src/main/res/xml/file_paths.xml";
  // apk_updates — ilova ichida yangilash; med_voice — yaqinning ovozidagi dori eslatmasi (bildirishnoma ovozi).
  const entry = '<cache-path name="apk_updates" path="updates/" />\n    <files-path name="med_voice" path="voice/" />';
  if (existsSync(pathsFile)) {
    let xml = readFileSync(pathsFile, "utf8");
    if (!xml.includes('name="apk_updates"')) xml = xml.replace("</paths>", '    <cache-path name="apk_updates" path="updates/" />\n</paths>');
    if (!xml.includes('name="med_voice"')) xml = xml.replace("</paths>", '    <files-path name="med_voice" path="voice/" />\n</paths>');
    writeFileSync(pathsFile, xml);
  } else {
    mkdirSync("android/app/src/main/res/xml", { recursive: true });
    writeFileSync(pathsFile, `<?xml version="1.0" encoding="utf-8"?>\n<paths xmlns:android="http://schemas.android.com/apk/res/android">\n    <external-path name="my_images" path="." />\n    <cache-path name="my_cache_images" path="." />\n    ${entry}\n</paths>\n`);
  }
  const manifestNow = readFileSync(manifestPath, "utf8");
  if (!manifestNow.includes("androidx.core.content.FileProvider")) {
    console.warn("! AndroidManifest.xml da FileProvider topilmadi — ilova ichida yangilash ishlamasligi mumkin.");
  }
}
