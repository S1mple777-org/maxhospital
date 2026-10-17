# MaxHospital Pro — aqlli dori eslatmalari

Pro obunachi retseptni tanlaydi (yoki boshqa klinika PDF retseptini yuklaydi). AI undan dori qabul qilish jadvalini tuzadi, bemor tekshirib saqlaydi. Vaqti kelganda eslatma keladi:

| Kanal | Tarif | Qanday ishlaydi |
|---|---|---|
| Sayt | Pro | Sayt ochiq bo'lsa darhol xabar chiqadi, "✅ Ichdim" tugmasi bilan; tab yopiq bo'lsa brauzer bildirishnomasi |
| Telegram | Pro | Bot xabar yuboradi, "✅ Ichdim / ⏭ O'tkazib yubordim" tugmalari bilan |
| Telefon ilovasi | Pro | Eslatmalar telefonga oldindan yoziladi: **internet bo'lmasa ham chalinadi**; offline bosilgan "Ichdim" internet qaytganda yuboriladi |
| SMS | Premium | Eskiz.uz orqali, profildagi telefon raqamiga |

Obuna **ichki balansdan** to'lanadi. Narx va muddatni owner **Owner Panel → Pro tariflar** bo'limida o'zgartiradi (boshlang'ich: Pro 19 000, Premium 39 000 so'm / 30 kun). Avtomatik uzaytirish yoqilgan bo'lsa, davr tugaganda balansdan yechiladi; balans yetmasa obuna tugaydi.

## Xavfsizlik qoidalari (kodda majburiy)

- AI faqat retseptdagi dorilarni oladi. Retseptda yo'q dori jadvalga **qo'shilmaydi**.
- Saytdagi retseptda doza **shifokor yozganidek** olinadi. AI dozani o'zgartira olmaydi.
- Chastota yoki muddat noaniq bo'lsa (masalan "og'riqda"), AI vaqt o'ylab topmaydi, balki "tekshiring" belgisini qo'yadi.
- Bemor saqlashdan oldin "Jadvalni tekshirdim" belgisini qo'yishi shart.

## Ishga tushirish

### 1. Migratsiya

`drizzle/migrations/0002_medication_reminders.sql`. Bu fayl `supabase/migrations/20261017120000_medication_reminders.sql` bilan bir xil.

Lovable chatiga yozing:

> `drizzle/migrations/0002_medication_reminders.sql` migratsiyasini bazaga qo'lla, faylni o'zgartirma. Keyin `plan-medications`, `dispatch-reminders` va `telegram-webhook` edge funksiyalarini deploy qil.

### 2. Secret'lar (Edge Functions → Secrets)

| Nomi | Majburiy | Qiymati |
|---|---|---|
| `REMINDERS_CRON_SECRET` | ha | Istalgan uzun tasodifiy matn (masalan 40 belgi) |
| `TELEGRAM_BOT_TOKEN` | Telegram uchun | Botning tokeni (@BotFather). **Tavsiya:** eski token kodda ochiq turibdi, avval uni @BotFather → /revoke orqali yangilang |
| `ESKIZ_EMAIL`, `ESKIZ_PASSWORD` | SMS uchun | Eskiz.uz kabinetidagi login |
| `ESKIZ_FROM` | yo'q | Jo'natuvchi nomi, standart `4546` |
| `GEMINI_API_KEY` | ha | allaqachon qo'shilgan |

> `telegram-webhook` funksiyasi hozircha tokenni kod ichidan oladi. Token yangilansa, uni ham yangi tokenga moslash kerak bo'ladi: `BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")`.

### 3. Har daqiqalik yuborish (cron)

Migratsiya `pg_cron` orqali ikkita ishni rejalashtiradi:
- har soatda obunalarni uzaytirish;
- har daqiqada `dispatch-reminders` funksiyasini chaqirish.

Ikkinchi ish funksiya manzilini va kalitni Vault'dan oladi. SQL editorda bir marta bajaring:

```sql
select vault.create_secret('https://mhyiqzeowliasmozvjdk.supabase.co/functions/v1/dispatch-reminders', 'reminders_function_url');
select vault.create_secret('<REMINDERS_CRON_SECRET bilan bir xil matn>', 'reminders_cron_secret');

-- tekshirish:
select jobname, schedule from cron.job;
```

**Zaxira variant:** bazada `pg_cron` yoki `pg_net` ishlamasa (migratsiya xato bermaydi, faqat ogohlantiradi), GitHub repo → **Settings → Secrets → Actions** ga quyidagilarni qo'shing:
- `REMINDERS_FUNCTION_URL`: yuqoridagi manzil;
- `REMINDERS_CRON_SECRET`: yuqoridagi kalit.

Shunda `.github/workflows/reminders-cron.yml` har 5 daqiqada yuboradi. GitHub jadvali ba'zan bir necha daqiqa kechikadi, shuning uchun asosiy usul pg_cron. Ilovadagi eslatmalarga bu ta'sir qilmaydi, ular telefonning o'zida chalinadi.

### 4. SMS shabloni (Eskiz)

Eskiz yangi akkauntda faqat **tasdiqlangan shablon** bo'yicha SMS yuboradi. Kabinetda shu shablonni moderatsiyaga yuboring:

```
MaxHospital: soat %d - %w ichish vaqti.
```

Kod yuboradigan matn: `MaxHospital: soat 08:00 - Amoksitsillin 500 mg ichish vaqti.`

## Tekshirish ro'yxati

- [ ] Owner Panel → Pro tariflar: narxlar ko'rinadi va saqlanadi
- [ ] Test foydalanuvchiga balans qo'shing → `/pro` → obuna bo'ling, balans kamayadi
- [ ] `/medications` → saytdagi retsept → "AI bilan reja tuzish" → jadval chiqadi, dozalar retseptdagidek
- [ ] PDF retsept yuklab ko'ring
- [ ] Vaqtni 2–3 daqiqa keyinga qo'yib saqlang → sayt, Telegram va (Premium bo'lsa) SMS keladi
- [ ] Telegram'da "✅ Ichdim" → saytda holat "Ichildi" bo'ladi
- [ ] Ilovada: jadval saqlang → telefonni **samolyot rejimiga** o'tkazing → eslatma baribir chalinadi → "Ichdim" bosing → internet yoqilgach saytda "Ichildi"

## Fayllar

```
drizzle/migrations/0002_medication_reminders.sql   jadvallar, RLS, obuna/jadval funksiyalari, cron
supabase/functions/plan-medications/               AI: retsept/PDF -> jadval loyihasi
supabase/functions/dispatch-reminders/             vaqti kelganlarni yuborish (sayt, Telegram, SMS)
supabase/functions/telegram-webhook/               "Ichdim" tugmasi
supabase/functions/_shared/medication-plan.ts      umumiy mantiq (testlar: src/test/medicationPlan.test.ts)
src/pages/ProPage.tsx                              /pro — tariflar
src/pages/MedicationsPage.tsx                      /medications — jadvallar, bugungi eslatmalar
src/components/medications/                        sayt bildirishnomalari, owner narx tahriri
src/lib/localReminders.ts                          ilova: internetsiz eslatmalar
.github/workflows/reminders-cron.yml               zaxira cron
```
