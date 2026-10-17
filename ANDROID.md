# MaxHospital — Android ilova

Sayt [Capacitor](https://capacitorjs.com) yordamida Android ilovaga aylantiriladi. Ilova ichida xuddi shu sayt ishlaydi, backend (Supabase, AI, video) o'zgarmaydi.

## Kerakli dasturlar (bir marta o'rnatiladi)

| Dastur | Versiya | Qayerdan |
|---|---|---|
| Node.js | **22 yoki yangiroq** | https://nodejs.org (LTS) |
| Android Studio | eng oxirgi | https://developer.android.com/studio |
| Git | istalgan | https://git-scm.com |

Android Studio birinchi ochilganda **Standard** sozlamani tanlang: u Android SDK va Java'ni o'zi o'rnatadi.

Tekshirish: terminalda `node -v` buyrug'i `v22` yoki undan katta raqam ko'rsatishi kerak.

## Birinchi marta ishga tushirish

Terminalni loyiha papkasida oching:

```sh
git pull                 # eng oxirgi kodni olish
npm install              # kutubxonalarni o'rnatish
npm run android:init     # android/ papkasini yaratish (faqat BIR MARTA)
npm run android:open     # Android Studio'da ochish
```

`android:init` quyidagilarni avtomatik bajaradi:
1. Saytni build qiladi (`dist/` papka).
2. `android/` loyihasini yaratadi.
3. Video qo'ng'iroq uchun kamera va mikrofon ruxsatlarini qo'shadi (`scripts/android-setup.mjs`).
4. `assets/` papkadagi rasmlardan ilova ikonkasi va ochilish ekranini yaratadi.
5. Hammasini Android loyihaga ko'chiradi.

## Android Studio'da

1. Pastki qatorda **Gradle sync** tugashini kuting. Birinchi marta 5–15 daqiqa ketadi.
2. Telefonni USB orqali ulang. Telefonda **Dasturchi rejimi → USB debugging** yoqilgan bo'lishi kerak. Yoki **Device Manager** orqali emulyator yarating.
3. Yuqoridagi yashil **▶ Run** tugmasini bosing. Ilova telefonga o'rnatiladi va ochiladi.

### APK fayl olish

**Build → Build Bundle(s) / APK(s) → Build APK(s)**

Tayyor fayl shu yerda bo'ladi: `android/app/build/outputs/apk/debug/app-debug.apk`. Uni Telegram orqali do'stlaringizga yuborib, o'rnatib ko'rishingiz mumkin. Telefon "noma'lum manbadan o'rnatish"ga ruxsat so'raydi.

### Google Play uchun

**Build → Generate Signed Bundle / APK → Android App Bundle (.aab)**

Imzo kaliti (keystore) yaratiladi. **Kalit faylini va parolini yo'qotmang**, aks holda ilovani keyin yangilay olmaysiz. Google Play Developer akkaunti bir martalik $25 turadi, maxfiylik siyosati sahifasi ham talab qilinadi.

## Kompyutersiz: GitHub Actions orqali APK

`.github/workflows/build-apk.yml` APK ni GitHub serverida yig'adi. Bu ish telefondan ham bo'ladi.

1. `main` ga har push qilinganda build avtomatik boshlanadi. Qo'lda ishga tushirish uchun: **Actions → Build MaxHospital APK → Run workflow**.
2. Build 10–15 daqiqa davom etadi.
3. Tayyor APK: repo sahifasidagi **Releases** bo'limida eng oxirgi versiya → `MaxHospital-1.0.N.apk`. Uni yuklab oling va oching.

Kalit qo'shilmagan bo'lsa, debug APK yig'iladi. Har buildda imzo kaliti yangi bo'ladi, shuning uchun yangi versiyani o'rnatishdan oldin eskisini o'chirish kerak. Buni oldini olish uchun imzo kalitini bir marta yarating (kompyuterda):

```sh
keytool -genkeypair -v -keystore maxhospital.jks -alias maxhospital -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 maxhospital.jks > keystore.txt     # Windows: certutil -encode maxhospital.jks keystore.txt
```

Keyin **Settings → Secrets and variables → Actions** ga 4 ta secret qo'shing: `ANDROID_KEYSTORE_BASE64` (keystore.txt ichidagi matn), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`maxhospital`), `ANDROID_KEY_PASSWORD`. Shundan keyin har bir build bir xil kalit bilan imzolanadi va ilova o'chirilmasdan yangilanadi. `.jks` faylni repoga **qo'shmang**.

> Repo ochiq (public) bo'lgani uchun Releases'dagi APK ni hamma yuklab olishi mumkin.

## Kod o'zgargandan keyin

Saytda biror narsa o'zgarsa (yoki `git pull` qilsangiz):

```sh
npm run android:sync
```

Keyin Android Studio'da yana **▶ Run** bosing. Ilova sayt kodini o'z ichida saqlaydi, shuning uchun sayt yangilanganda ilovani ham qayta build qilish kerak.

## Ilovada nima boshqacha ishlaydi

| Funksiya | Ilovada |
|---|---|
| Retsept PDF | Fayl telefonga yoziladi va "Ulashish" oynasi ochiladi: Telegram, Drive yoki PDF ko'ruvchi |
| Telegram orqali kirish | Bot tasdiqlagach, ilovaning o'zida kiriladi, brauzer ochilmaydi |
| Ro'yxatdan o'tish emaili | Tasdiqlash havolasi saytga (`maxhospital.lovable.app`) olib boradi |
| Video qo'ng'iroq | Birinchi marta kamera va mikrofon ruxsatini so'raydi |
| "Orqaga" tugmasi | Oldingi sahifaga qaytaradi, bosh sahifada ilovadan chiqadi |
| 103 tugmasi, Telegram havolalari | Telefon qo'ng'iroq ilovasi yoki Telegram ochiladi |

Sayt boshqa domenga ko'chsa, `.env` faylga `VITE_PUBLIC_SITE_URL="https://yangi-domen.uz"` qo'shing.

## Sinov ro'yxati

Telefonda quyidagilarni tekshiring:

- [ ] Email va parol bilan kirish
- [ ] Telegram orqali kirish
- [ ] Shifokor bilan chat
- [ ] Video qo'ng'iroq: kamera va ovoz ikki tomonda ham ishlaydi
- [ ] Retseptni PDF qilib yuklash va ulashish
- [ ] AI-yordamchi javob beradi
- [ ] "Orqaga" tugmasi
- [ ] Ekran tepasi soat va batareya qatori ostiga kirib ketmagan

## Muammolar

| Xato | Yechim |
|---|---|
| `npm run android:init` — "android platform already exists" | `android/` allaqachon bor. `npm run android:sync` ishlating |
| Node versiyasi xatosi | Node.js 22+ o'rnating |
| Gradle: "Unsupported Java version" | Android Studio → Settings → Build Tools → Gradle → **Gradle JDK**: "jbr-21" (Android Studio ichidagi) tanlang |
| "SDK location not found" | Loyihani Android Studio orqali oching (`npm run android:open`), u `local.properties` ni o'zi yaratadi |
| Video ochilmaydi | Telefon Sozlamalar → Ilovalar → MaxHospital → Ruxsatlar: kamera va mikrofonni yoqing |
| Oq ekran | `npm run android:sync` ni qayta ishga tushiring. Chrome'da `chrome://inspect` orqali ilovadagi xatolarni ko'ring |
