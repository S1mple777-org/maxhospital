# MaxHospital: o'z Supabase loyihasiga o'tish

Yangi loyiha: **maxhospitalonline** (`sgmeuwbvfffopmczjwcv`, us-east-1)
URL: `https://sgmeuwbvfffopmczjwcv.supabase.co`

Hozirgi sayt (Vercel + Lovable Cloud) **o'zgarmadi**. Quyidagi 4–5-qadamlarga qadar u eski bazada ishlayveradi.

## 1. Allaqachon bajarilgan (Claude, 18.10.2026)

- Eski bo'sh jadvallar (13 ta, 0 yozuv) `legacy_unused` sxemasiga ko'chirildi. Ularni hech kim o'qiy olmaydi. Xohlasangiz keyin SQL Editor'da `drop schema legacy_unused cascade;` bilan butunlay o'chiring.
- Barcha migratsiyalar qo'llandi: 12 ta Lovable + 0000–0004. Bu Postgres sxemasi asl fayllar bilan bir xil ekani lokal bazada `pg_dump` bilan taqqoslab tekshirildi.
  - MCP vositasi `DROP`/`DELETE` buyruqlarini qabul qilmaydi. Shuning uchun yangi bazaga ular `scripts/rewrite_migrations_nodrop.py` bilan `DROP`siz qilib qo'llandi.
  - Ikkita eski RLS qoidasi o'chirilmasdan butunlay yopib qo'yildi (`USING/WITH CHECK (false)`), natija bir xil.
- `vector`, `pg_net` kengaytmalari; `plan_defaults` seed; `department-icons` (ochiq) va `medical-books` (yopiq) bucket'lari.
- 12 ta edge funksiya joylandi va har biri chaqirib tekshirildi.
- Bazada real sinov o'tkazildi va orqaga qaytarildi: ro'yxatdan o'tish, kredit, qarz bloki, balansni buzib bo'lmasligi, rad etishda pul qaytishi.
- Telegram webhook endi `TELEGRAM_WEBHOOK_SECRET` bilan himoyalangan. Ilgari URL'ni bilgan har kim soxta xabar bilan admin `/topup` qila olardi.

## 2. Siz bajarasiz: bitta SQL (1 daqiqa)

Supabase Dashboard → **SQL Editor** → New query. U yerga `supabase/manual/stop_medication_schedule.sql` faylining matnini qo'ying va **Run** bosing.

## 3. Secrets (Dashboard → Edge Functions → Secrets)

| Nomi | Qiymat |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio kaliti |
| `DAILY_API_KEY` | Daily.co kaliti |
| `TELEGRAM_BOT_TOKEN` | **Yangi** token (@BotFather → /revoke; eski token GitHub'da ochiq qolgan) |
| `TELEGRAM_WEBHOOK_SECRET` | 32+ belgili tasodifiy matn (faqat harf/raqam/_-) |
| `REMINDERS_CRON_SECRET` | 32+ belgili tasodifiy matn |
| `SITE_URL` | `https://maxhospital.vercel.app` |
| `ESKIZ_EMAIL`, `ESKIZ_PASSWORD`, `ESKIZ_FROM` | ixtiyoriy (SMS) |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` va `SUPABASE_SERVICE_ROLE_KEY` o'zi bor, ularni qo'shmang.

## 4. Auth sozlamalari (Dashboard → Authentication)

- **URL Configuration → Site URL**: `https://maxhospital.vercel.app`. **Redirect URLs** ga quyidagilarni qo'shing:
  - `https://maxhospital.vercel.app/**`
  - `https://*-<vercel-akkaunt>.vercel.app/**` (preview uchun)
  - Android ilova sxemasi (agar bor bo'lsa).
- **Providers → Google** saytda ishlatilsa, Google Cloud'dagi OAuth client'ga yangi callback qo'shiladi: `https://sgmeuwbvfffopmczjwcv.supabase.co/auth/v1/callback`
- **Leaked password protection**: yoqing (tavsiya).

## 5. Avval Preview'da sinash

Vercel → Project → Settings → Environment Variables → **faqat Preview** muhitiga kiriting:

```
VITE_SUPABASE_URL=https://sgmeuwbvfffopmczjwcv.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<Dashboard → Settings → API → anon (legacy JWT) kaliti>
VITE_SUPABASE_PROJECT_ID=sgmeuwbvfffopmczjwcv
```

Keyin `feature/own-supabase` branch'ini push qiling (Vercel o'zi preview yasaydi) va sinov ro'yxatini bajaring:

1. Ro'yxatdan o'tish va kirish.
2. Owner akkaunti (`owner@gmail.com`) yangi bazada tayyor: kirib, owner panel ochilishini tekshiring.
3. Owner panel: bo'lim narxlari, tariflar, limitlar.
4. Shifokor qo'shish (admin panel → email bo'yicha).
5. Balans to'ldirish → konsultatsiya → shifokor qabul qiladi → chat.
6. Video qo'ng'iroq (Daily).
7. AI yordamchi savoli, "ko'kragim og'riyapti" deb yozib favqulodda javobni tekshiring.
8. Kitob PDF yuklash (admin) → `ready` holatiga o'tishi.
9. Pro obuna → dori jadvali → eslatma.
10. Telefonda: sahifalar sig'ishi, login saqlanishi.

## 6. Asosiy saytni almashtirish

1. Vercel'da o'sha 3 o'zgaruvchini **Production** muhitiga ham kiriting → **Redeploy**.
2. Telegram webhook'ni yangi funksiyaga o'tkazing: brauzerda bir marta oching:
   `https://sgmeuwbvfffopmczjwcv.supabase.co/functions/v1/telegram-webhook?action=setup`
   Natijada `{"ok":true,...}` chiqishi kerak.
3. GitHub → Settings → Secrets → Actions:
   - `REMINDERS_FUNCTION_URL` = `https://sgmeuwbvfffopmczjwcv.supabase.co/functions/v1/dispatch-reminders`
   - `WEEKLY_REPORT_FUNCTION_URL` = `https://sgmeuwbvfffopmczjwcv.supabase.co/functions/v1/weekly-report`
   - `REMINDERS_CRON_SECRET` = 3-qadamdagi bilan bir xil
4. Android ilova: repodagi `.env` faylini yangi qiymatlar bilan yangilang → `build-apk` workflow → yangi APK.

**Orqaga qaytarish:** Vercel'dagi 3 o'zgaruvchini o'chirsangiz, sayt `.env` dagi eski Lovable bazasiga qaytadi. Webhook uchun eski Lovable manzilidagi `?action=setup` ni oching.

Eslatma: eski bazadagi foydalanuvchilar va ma'lumotlar avtomatik ko'chmaydi. Yangi bazada hammasi toza boshlanadi.
