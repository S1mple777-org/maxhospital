# MaxHospital — onlayn shifoxona

MaxHospital — bemorlar uydan chiqmasdan malakali shifokorlardan chat va video orqali maslahat oladigan onlayn tibbiy platforma. Sun'iy intellekt asosidagi AI-yordamchi bemorni to'g'ri shifokorga yo'naltiradi, shoshilinch holatlarni aniqlaydi va ko'rik natijalarini tahlil qiladi.

## Asosiy imkoniyatlar

| Imkoniyat | Tavsif |
|---|---|
| Onlayn konsultatsiya | Shifokor bilan chat va video qo'ng'iroq (Daily.co), 10 daqiqa bepul video |
| Elektron retsept | Shifokor retsept yozadi, bemor uni PDF ko'rinishida yuklab oladi |
| **AI-yordamchi** | Gemini asosida, saytdagi tibbiy kitoblarga tayangan holda ishlaydi (pastda batafsil) |
| **Salomatligim** | Bemorning ko'rik ko'rsatkichlari grafigi va o'zgarish tahlili |
| **Pro: dori eslatmalari** | AI retseptdan jadval tuzadi; Telegram, sayt, ilova (internetsiz) va SMS (Premium) orqali eslatadi. Batafsil: [MEDICATIONS.md](MEDICATIONS.md) |
| **Tahlil natijalari (Pro)** | Bemor qon/siydik tahlili PDF yoki rasmini yuklaydi, AI qiymatlarni o'qiydi, me'yordan chiqqanlarini kitoblar asosida tushuntiradi |
| **Hamyon va favqulodda kredit** | Balans yetmasa favqulodda konsultatsiya qarzga boshlanadi; qarz keyingi to'lovlardan oldin to'lanadi |
| Telegram | Telegram orqali kirish va bildirishnomalar |
| 3 til | O'zbek, rus, ingliz |
| Rollar | Bemor, shifokor, admin (moliyaviy, bo'lim boshlig'i, jurnalist), owner |

## AI-yordamchi qanday ishlaydi

1. **Shoshilinch belgilar filtri.** Ko'krak og'rig'i, nafas qisishi, hushdan ketish, insult belgilari, kuchli qon ketish va boshqa xavfli belgilar (o'zbek, rus, ingliz tillarida) AI chaqirilishidan oldin aniqlanadi. Bemorga darhol **103** raqamiga qo'ng'iroq qilish tugmasi ko'rsatiladi. Model xatosi tufayli xavfli holat o'tkazib yuborilmaydi.
2. **Kitoblardan qidiruv (RAG).** Admin "AI kutubxona" bo'limida tibbiy kitoblarni PDF ko'rinishida yuklaydi. Matn bo'laklarga ajratiladi, Gemini embedding vektorlariga aylantiriladi va `pgvector` ichida saqlanadi. Har bir savolga eng mos bo'laklar topiladi.
3. **Manbali javob.** Gemini faqat topilgan bo'laklar asosida javob beradi va har bir faktdan keyin `[1]`, `[2]` ko'rinishida manba qo'yadi. Bemor kitob nomi, muallifi va betini ko'radi. Manbasiz "uy sharoitida yordam" javobi tizim tomonidan avtomatik "shifokorga murojaat"ga o'zgartiriladi.
4. **Triaj va yo'naltirish.** Har bir javob uch darajadan biriga ega: *shoshilinch* (103), *shifokor kerak* (mos bo'lim va onlayn shifokorlar havolasi bilan), *uy sharoitida yordam* (oddiy holatlar).
5. **Ko'riklar tahlili.** Shifokor retsept yozayotganda bosim, puls, harorat, SpO₂, qand, vazn, xolesterin, gemoglobinni kiritadi. O'sish/pasayish va me'yorga yaqinlashish kod orqali aniq hisoblanadi, AI esa bu raqamlarni bemorga tushuntiradi.

Maxfiylik: AI so'rovlari statistikasida savol va javob matni saqlanmaydi, faqat triaj darajasi va bo'lim. Kitob bo'laklari va vektor qidiruv faqat server tomonida ochiq.

## Free, Pro va Premium

Limitlar `plan_limits` jadvalida saqlanadi va **Owner Panel → Pro tariflar** bo'limida o'zgartiriladi. Standart qiymatlar:

| | Free | Pro | Premium |
|---|---|---|---|
| AI-yordamchi savollari | 5 / kun | 50 / kun | cheksiz |
| Shoshilinch belgilar (103) tekshiruvi | ✓ | ✓ | ✓ |
| Bepul video qo'ng'iroq | 10 daqiqa | 20 daqiqa | 30 daqiqa |
| Ko'rsatkichlar AI tahlili va PDF hisobot | — | ✓ | ✓ |
| Tahlil natijasini AI o'qishi | — | 5 / oy | 20 / oy |
| Favqulodda kredit | 50 000 so'm | 100 000 so'm | 150 000 so'm |
| Dori eslatmalari (Telegram, sayt, ilova) | — | ✓ | ✓ |
| SMS eslatma | — | — | ✓ |

| Ustuvor navbat | — | +4 o'rin | +6 o'rin |
| Birinchi navbat | — | oyiga 1 bepul, keyin 15 000 so'm | oyiga 3 bepul, keyin 10 000 so'm |
| Konsultatsiyadan keyin bepul savol | — | 72 soat | 72 soat |
| Ikkinchi fikr (boshqa shifokor) | — | — | oyiga 1 |
| Uy o'lchovlari + xavfli qiymat ogohlantirishi | — | ✓ | ✓ |
| AI haftalik hisobot (Telegram) | — | ✓ | ✓ |
| QR kodli favqulodda tibbiy karta | — | ✓ | ✓ |
| Oila profili | — | — | 4 a'zo |

**Ustuvor navbat.** Shifokor kabinetida kutilayotgan so'rovlar navbat tartibida chiqadi. Pro so'rovi 4 o'ringa, Premium 6 o'ringa oldinga o'tadi, ya'ni uzoq kutgan bemordan faqat bir necha kishi o'tadi. "Birinchi navbat" so'rovni eng tepaga qo'yadi. Oylik bepul limitdan keyin bu xizmat pullik bo'ladi va to'lov shifokorga emas, platformaga tushadi (`platform_fees`). Shifokor so'rovni rad etsa, bu to'lov ham qaytariladi.

**Favqulodda tibbiy karta.** QR kod `/e/<token>` sahifasini ochadi, login kerak emas. Bu sahifada faqat kartadagi ma'lumot ko'rinadi. Token 122 bitli tasodifiy son. Bemor kartani o'chirib qo'yishi yoki yangi QR yaratishi mumkin. Obuna tugasa ham karta o'qiladi, chunki bu xavfsizlik uchun muhim.

**Haftalik hisobot.** Barcha raqamlarni kod hisoblaydi (`_shared/weekly-report.ts`), AI ularni faqat so'z bilan tushuntiradi. Hisobot har yakshanba 20:00 da yuboriladi: pg_cron va Vault'dagi `weekly_report_function_url` orqali, ular ishlamasa zaxira `.github/workflows/weekly-report-cron.yml` orqali.

**Favqulodda kredit.** Balans yetmasa bemor konsultatsiyani "favqulodda" qilib boshlaydi. Balansdagi pul ishlatiladi, yetmagan qismi (tarif limitigacha) qarzga yoziladi. Qarz to'lanmaguncha yangi konsultatsiya va obuna sotib olinmaydi. Qarz **Hamyon** sahifasida (`/wallet`) balansdan to'lanadi. Shifokor rad etsa, qarz bekor qilinadi va balansdan to'langan qism qaytariladi. Shoshilinch belgilarga AI javobi hech qachon limitlanmaydi.

Sozlash:
1. `0003_plan_perks.sql` va `0004_premium_care.sql` migratsiyalarini qo'llang.
2. `ai-assistant`, `read-lab-result`, `home-measurement` va `weekly-report` funksiyalarini deploy qiling.

## Texnologiyalar

React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Supabase (Postgres, Auth, Storage, Edge Functions, pgvector), Google Gemini API, Daily.co, Telegram Bot API.

## Ishga tushirish

```sh
npm install
npm run dev
npm test
```

### AI-yordamchini sozlash

1. Google AI Studio'dan Gemini API kalitini oling: https://aistudio.google.com/apikey
2. Supabase (yoki Lovable Cloud) loyihasida Edge Function secret qo'shing:
   - `GEMINI_API_KEY` — majburiy
   - `GEMINI_MODEL` — ixtiyoriy, standart qiymati `gemini-3.8-flash`
3. `supabase/migrations/20261016150000_ai_assistant.sql` migratsiyasini qo'llang.
4. `ai-assistant` va `ingest-book` edge funksiyalarini deploy qiling.
5. Admin panel → **AI kutubxona** bo'limida matnli PDF kitoblarni yuklang.

### Android ilova

Telefon ilovasi (APK) qanday yig'ilishi [ANDROID.md](ANDROID.md) faylida yozilgan.

## Loyiha tuzilmasi

```
src/pages/AiAssistantPage.tsx        AI-yordamchi chat sahifasi (/ai-assistant)
src/pages/HealthPage.tsx             Ko'rsatkichlar grafigi va AI tahlil (/health)
src/components/ai/                   AI javob kartasi, admin kutubxona, ko'rsatkichlar formasi
supabase/functions/ai-assistant/     Triaj, qidiruv va Gemini javobi
supabase/functions/ingest-book/      PDF → bo'laklar → embedding
supabase/functions/_shared/          Umumiy mantiq (shoshilinch filtr, trend tahlili)
```

> AI-yordamchi shifokor o'rnini bosmaydi va tashxis qo'ymaydi. U ma'lumot beradi va bemorni tegishli mutaxassisga yo'naltiradi.
