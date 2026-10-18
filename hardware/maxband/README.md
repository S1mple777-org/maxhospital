# MaxBand — MaxHospital aqlli bilaguzugi

MaxBand — MaxHospital saytiga ulangan bilaguzuk. U shunchaki soat emas: dori vaqtini bilakda eslatadi, puls va SpO₂ ni kuzatadi, yiqilishni sezadi, SOS bosilganda oila a'zolari va shifokorga joylashuv bilan xabar yuboradi.

> MaxBand tibbiy asbob emas. Puls va SpO₂ optik sensor bilan taxminiy o'lchanadi, stress va uyqu esa hisoblangan baho. Qon bosimini bilaguzuk o'lchamaydi: uni manjetli tonometrda o'lchab, saytdagi "Salomatligim" sahifasiga kiritasiz.

## Imkoniyatlar va tariflar

| Imkoniyat | Free | Pro | Premium |
|---|:-:|:-:|:-:|
| Soat, qadam, suv ichish va "turing, yuring" eslatmasi | ✓ | ✓ | ✓ |
| **SOS** (A tugmasini 3 s bosib turish) va **yiqilishni aniqlash** | ✓ | ✓ | ✓ |
| Puls, SpO₂, uyqu, stress (HRV) saytga yuboriladi | | ✓ | ✓ |
| Dori eslatmasi bilakda, "Ichdim" tugmasi | | ✓ | ✓ |
| Xavfli puls / SpO₂ haqida xabar | | ✓ | ✓ |
| Ekranda QR favqulodda tibbiy karta | | ✓ | ✓ |
| "Shifokorga murojaat" tugmasi (B ni 3 s bosib turish) | | ✓ | ✓ |
| Oila nazorati: farzand o'z akkauntida ko'rsatkichlarni ko'radi | | | ✓ |
| Dori 30 daqiqada ichilmasa, oilaga xabar | | | ✓ |
| Konsultatsiya paytida shifokor pulsni jonli ko'radi | | | ✓ |
| SOS shifokorga ham yuboriladi | | | ✓ |

SOS va yiqilish xabari tarifga bog'liq emas: xavfsizlik pullik bo'lmasligi kerak.

**Biznes model.** Bilaguzuk alohida sotiladi. Qutida bir martalik kod bor (`MXB-XXXX-XXXX`), u **3 oy Premium** beradi. Kodlarni owner **Owner Panel → MaxBand kodlari** bo'limida yaratadi.

## Qismlar

Narxlar taxminiy, 2026-yil kuzidagi Toshkent bozori va AliExpress bo'yicha. Sotib olishdan oldin tekshiring.

| Qism | Vazifasi | Taxminiy narx |
|---|---|---|
| ESP32-C3 SuperMini | Mikrokontroller, Wi-Fi | 35–45 ming so'm |
| MAX30102 moduli | Puls, SpO₂, HRV | 20–30 ming |
| MPU6050 (GY-521) | Qadam, yiqilish, uyqu | 15–25 ming |
| 0.96" OLED SSD1306, I2C, 128×64 | Ekran | 25–35 ming |
| Vibromotor (10 mm, tanga shaklida) + S8050 tranzistor + 1 kΩ + 1N4148 diod | Eslatma | 8–12 ming |
| 2 ta tugma (6×6 mm) | Boshqaruv | 2 ming |
| Li-Po batareya 3.7 V, 300–400 mAh | Quvvat | 25–35 ming |
| TP4056 zaryadlovchi (himoyali, USB-C) | Zaryadlash | 8–12 ming |
| 2 ta 100 kΩ rezistor | Batareya kuchlanishini o'lchash | 1 ming |
| 3D bosilgan korpus + silikon tasma | Bilaguzuk shakli | 40–60 ming |
| **Jami** | | **≈ 180–270 ming so'm** |

Seriyali ishlab chiqarishda (maxsus plata, kichikroq qismlar) tannarx taxminan 2 baravar kamayadi. Sotuv narxi saytda: **349 000 so'm** (3 oylik Premium bilan).

QR kod 0.96" ekranda kichik chiqadi (taxminan 6 mm), telefon uni 3–5 sm masofadan o'qiydi. 1.3" ekran olsangiz QR yiriklashadi, lekin u boshqa kontrollerda (SH1106) ishlaydi va kodda kutubxonani almashtirish kerak bo'ladi.

## Ulash sxemasi

Uchta modul ham bitta I2C shinaga ulanadi.

| Modul pini | ESP32-C3 SuperMini |
|---|---|
| OLED, MAX30102, MPU6050: **VCC** | 3V3 |
| hammasining **GND** | GND |
| hammasining **SDA** | GPIO 6 |
| hammasining **SCL** | GPIO 7 |
| Tugma A (OK / SOS) | GPIO 3 ↔ GND |
| Tugma B (ekran / shifokor) | GPIO 4 ↔ GND |
| Vibromotor | GPIO 10 → 1 kΩ → S8050 bazasi. Motor: 3V3 → motor → kollektor, emitter → GND. Motor parallel ulangan 1N4148 diod |
| Batareya kuchlanishi | BAT+ → 100 kΩ → **GPIO 0** → 100 kΩ → GND |
| Quvvat | Li-Po → TP4056 (B+/B−). TP4056 OUT+ → SuperMini **5V** pin, OUT− → GND |

```
            3V3 ─┬──────────┬──────────┬──────────┐
                 │          │          │          │
              [OLED]   [MAX30102]  [MPU6050]   [motor]──┐
                 │          │          │          │  ▲ 1N4148
   GPIO6 SDA ────┴──────────┴──────────┘          C│
   GPIO7 SCL ────┴──────────┴──────────┘     S8050 ├─B── 1k ── GPIO10
                                                  E│
   GPIO3 ── [A] ── GND      GPIO4 ── [B] ── GND    GND

   Li-Po ── TP4056 ── 5V pin          BAT+ ─ 100k ─┬─ 100k ─ GND
                                                    └── GPIO0
```

Muhim:
- MAX30102 sensori teriga tegib turishi kerak: korpusning pastki tomonida unga oyna (teshik) qoldiring.
- MPU6050 ni plataga qattiq mahkamlang, aks holda qadam va yiqilish noto'g'ri aniqlanadi.
- GPIO 2, 8, 9 ishga tushish (strapping) pinlari, ularni tugmalarga ulamang.

## Dasturni yuklash (Arduino IDE)

1. **Arduino IDE 2** ni o'rnating.
2. **File → Preferences → Additional boards manager URLs** maydoniga quyidagini qo'shing:
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
3. **Boards Manager** → `esp32` (Espressif) → Install.
4. **Library Manager** orqali quyidagilarni o'rnating:
   - `WiFiManager` (tzapu)
   - `ArduinoJson` (7-versiya)
   - `Adafruit SSD1306`
   - `Adafruit GFX Library`
   - `SparkFun MAX3010x Pulse and Proximity Sensor Library`
5. `hardware/maxband/firmware/maxband/maxband.ino` ni oching. Papkadagi boshqa fayllar ham avtomatik ochiladi.
6. **Tools** menyusida:
   - **Board**: ESP32C3 Dev Module
   - **USB CDC On Boot**: Enabled
   - **Partition Scheme**: Huge APP (3MB No OTA)
7. Platani USB-C orqali ulang va **Upload** bosing.

Arduino o'rnatmasdan ham bo'ladi: GitHub → **Actions → MaxBand firmware** → oxirgi muvaffaqiyatli ish → `maxband-firmware` artefaktini yuklab oling. Ichidagi `maxband.ino.merged.bin` faylini https://espressif.github.io/esptool-js/ sahifasida brauzer orqali `0x0` manzilga yozing.

## Birinchi ishga tushirish

1. **Wi-Fi.** Bilaguzuk `MaxBand-Setup` Wi-Fi tarmog'ini ochadi. Telefon bilan unga ulaning, ochilgan sahifada uy Wi-Fi'ni tanlab, parolini kiriting.
2. **Ulash.** Ekranda 6 xonali kod chiqadi. Saytda **MaxBand** sahifasini oching → **Bilaguzukni ulash** → kodni kiriting va kim taqishini tanlang (o'zingiz yoki oila a'zosi).
3. **Premium.** Qutidagi `MXB-...` kodni shu sahifadagi **Qutidagi kod** maydoniga kiriting. 3 oy Premium yoqiladi.
4. **Oila nazorati.** Farzandingiz emailini **Oila nazorati** maydoniga kiriting. U o'z akkauntida taklifni qabul qiladi.
5. **SOS uchun joylashuv.** Ixtiyoriy: telefonda **SOS uchun joylashuv** belgisini yoqing.

## Boshqaruv

| Harakat | Natija |
|---|---|
| A ni qisqa bosish | Eslatmada: **Ichdim**. Yiqilish sanog'ida: **bekor qilish** |
| B ni qisqa bosish | Ekranlar: soat → salomatlik → QR karta → dorilar. Eslatmada: **10 daqiqadan keyin** |
| A ni 3 soniya bosib turish | **SOS** |
| B ni 3 soniya bosib turish | **Shifokorga murojaat** (A bilan tasdiqlanadi) |
| Yoqishda A+B ni bosib turish | Wi-Fi sozlamasini o'chirish |
| Yoqishda A+B ni 10 soniya bosib turish | To'liq tozalash: qayta ulash kerak bo'ladi |

## Qanday ishlaydi

```
MaxBand ──HTTPS──▶ device-api (Supabase Edge Function) ──▶ Postgres (band_* jadvallar)
   ▲  ulash kodi, sinxron (5 daq), SOS                      │
   └── dori eslatmalari, sozlamalar, QR, "jonli" rejim ◀────┘
                                    │
                    Telegram + sayt bildirishnomasi: egasi, kuzatuvchilar, shifokor
```

- **Xavfsizlik.**
  - Bilaguzuk birinchi ishga tushganda tasodifiy maxfiy kalit yaratadi. Server undan faqat xeshni saqlaydi.
  - Bilaguzuk server sertifikatini o'zidagi ildiz sertifikatlar (`root_ca.h`) bilan tekshiradi.
  - Kuzatuvchi bilaguzuk egasining joylashuvini faqat SOS xabarida ko'radi.
- **Internetsiz.**
  - Soat, qadam va eslatmalar internetsiz ishlayveradi.
  - O'lchovlar xotirada saqlanadi (taxminan 1500 ta yozuv) va internet qaytganda yuboriladi.
  - SOS internet paydo bo'lguncha 10 daqiqa davomida qayta yuboriladi.
- **Puls.** 5 daqiqada bir marta saytga o'rtacha qiymat yuboriladi. Shifokor konsultatsiyasi paytida bilaguzuk "jonli" rejimga o'tadi va har 15 soniyada yuboradi.
- **Xavfli puls.**
  - Server ketma-ket 2–3 o'lchovni tekshiradi, bitta tasodifiy sakrash hisobga olinmaydi.
  - Yurish paytida (ko'p qadam bo'lsa) yuqori puls xavfli deb hisoblanmaydi.
- **Uyqu.** Kechasi har 5 daqiqada harakat soni sanaladi: harakat kam bo'lsa, uxlayapti deb hisoblanadi (aktigrafiya). Uyqu bahosi ikki narsadan tuziladi: davomiyligi (7–9 soat eng yaxshi) va necha marta uyg'ongani.
- **Stress.** HRV (RMSSD) shu odamning oldingi kunlardagi o'rtacha qiymati bilan solishtiriladi. Dastlabki 3 kunda umumiy me'yorlar ishlatiladi.

Taxminiy batareya muddati 300 mAh bilan 1–1,5 kun. Ekran 15 soniyada o'chadi, sensor past tokda ishlaydi.

## Qurilmasiz sinash

Saytdagi **MaxBand → Bilaguzuk simulyatori** brauzerda virtual bilaguzuk yaratadi. U haqiqiy qurilma bilan bir xil protokolda ishlaydi: ulash kodi, sinxron, SOS, yiqilish, xavfli puls, dori eslatmasi, QR. Simulyator ma'lumotlari saytda "SIMULYATOR" deb belgilanadi.

## Fayllar

```
hardware/maxband/firmware/maxband/maxband.ino   bilaguzuk dasturi
hardware/maxband/firmware/maxband/config.h      server manzili va pinlar
hardware/maxband/firmware/maxband/root_ca.h     ildiz sertifikatlar
hardware/maxband/firmware/maxband/qrcodegen.*   QR kod (Project Nayuki, MIT)
supabase/functions/device-api/                  server: ulash, sinxron, hodisalar
supabase/functions/_shared/band.ts              tekshiruv, ogohlantirish, uyqu va stress hisoblari (testlar: src/test/maxband.test.ts)
drizzle/migrations/0005_maxband.sql             jadvallar, RLS, RPC
src/pages/MaxBandPage.tsx                       /maxband sahifasi
src/components/band/                            dashboard, simulyator, shifokor paneli, owner kodlari
.github/workflows/firmware.yml                  dasturni GitHub'da kompilyatsiya qilish
```
