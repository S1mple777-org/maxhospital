// MaxHospital SOS: favqulodda xabar matnlari va SMS narxi. Toza modul (sayt, server, testlar).
//
// Qoida (foydalanuvchi talabi): SOS 103 ga avtomatik qo'ng'iroq QILMAYDI. Xabar yaqinlarga ketadi:
//   • ilovada ro'yxatdan o'tgan yaqinlar (band_guardians) — Telegram + ilova bildirishnomasi (bepul);
//   • telefon raqami kiritilgan yaqinlar (sos_contacts) — SMS (pullik; balans yetmasa qarzga yoziladi).
// 103 ga qo'ng'iroq tugmasi ekranda bor, lekin uni foydalanuvchining o'zi bosadi.

export type SosKind = "sos" | "fall" | "safe";

/** Bir SMS bo'lagi narxi (so'm). Server SOS_SMS_PRICE_UZS bilan o'zgartirishi mumkin. */
export const SMS_PRICE_UZS = 250;
export const MAX_SOS_CONTACTS = 5;

/** Uzbek mobil raqam -> 998XXXXXXXXX yoki null. */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  if (/^998\d{9}$/.test(d)) return d;
  if (/^\d{9}$/.test(d)) return `998${d}`;
  return null;
}

export const formatPhone = (p: string) =>
  /^998\d{9}$/.test(p) ? `+998 ${p.slice(3, 5)} ${p.slice(5, 8)} ${p.slice(8, 10)} ${p.slice(10)}` : p;

/** SMS faqat lotin (GSM) belgilari bilan: o'/g' tutuq belgilari oddiy ' ga, qolgani olib tashlanadi. */
export function smsAscii(s: string): string {
  return s.normalize("NFKD").replace(/[ʻʼ‘’`´]/g, "'").replace(/[^\x20-\x7E\n]/g, "");
}

/** SMS bo'laklari soni (GSM-7: 160 belgi, ko'p bo'lakli — 153). */
export function smsSegments(text: string): number {
  const n = text.length;
  return n <= 160 ? 1 : Math.ceil(n / 153);
}

export interface SosContext {
  name: string;
  at: string;               // ISO
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null; // metr
  phone?: string | null;
  cardUrl?: string | null;  // Passport (favqulodda tibbiy karta)
  source: "app" | "band";
}

const tashkentTime = (iso: string) =>
  new Intl.DateTimeFormat("uz-UZ", { timeZone: "Asia/Tashkent", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

export const mapUrl = (lat: number, lng: number) => `https://maps.google.com/?q=${lat.toFixed(5)},${lng.toFixed(5)}`;

const hasLoc = (c: SosContext) => c.lat !== null && c.lat !== undefined && c.lng !== null && c.lng !== undefined;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const WHAT: Record<SosKind, (c: SosContext) => string> = {
  sos: (c) => c.source === "band" ? "MaxBand SOS tugmasini bosdi — yordam kerak!" : "SOS tugmasini bosdi — yordam kerak!",
  fall: () => "MaxBand yiqilishni aniqladi va bekor qilinmadi.",
  safe: () => "Xavf o'tdi: «Men xavfsizman» deb belgiladi.",
};

/** Telegram (HTML) va ilova bildirishnomasi matni. */
export function sosMessage(kind: SosKind, c: SosContext): { title: string; plain: string; html: string } {
  const title = kind === "safe" ? `✅ ${c.name} xavfsiz` : `${kind === "fall" ? "⚠️ Yiqilish" : "🆘 SOS"} — ${c.name}`;
  const lines = [`${c.name} ${WHAT[kind](c)}`, `Vaqt: ${tashkentTime(c.at)}`];
  const html = [`<b>${esc(title)}</b>`, "", esc(`${c.name} ${WHAT[kind](c)}`), `🕐 ${tashkentTime(c.at)} (Toshkent)`];
  if (kind !== "safe") {
    if (hasLoc(c)) {
      const url = mapUrl(c.lat!, c.lng!);
      const acc = c.accuracy ? ` (±${Math.round(c.accuracy)} m)` : "";
      lines.push(`Joylashuv: ${url}${acc}`);
      html.push(`📍 <a href="${url}">Xaritada ochish</a>${esc(acc)}`);
    } else {
      lines.push("Joylashuv aniqlanmadi.");
      html.push("📍 Joylashuv aniqlanmadi");
    }
    if (c.phone) { lines.push(`Telefon: +${c.phone}`); html.push(`📞 +${esc(c.phone)}`); }
    if (c.cardUrl) { lines.push(`Tibbiy karta: ${c.cardUrl}`); html.push(`🩺 <a href="${c.cardUrl}">Tibbiy karta (qon guruhi, allergiya, dorilar)</a>`); }
    const tail = "Darhol bog'laning. Ahvoli og'ir bo'lsa 103 ga qo'ng'iroq qiling.";
    lines.push("", tail);
    html.push("", `<b>${esc(tail)}</b>`);
  }
  return { title, plain: lines.join("\n"), html: html.join("\n") };
}

/** SMS matni: qisqa, lotincha, iloji boricha 1–2 bo'lak. */
export function sosSms(kind: SosKind, c: SosContext): string {
  const name = smsAscii(c.name).slice(0, 30);
  if (kind === "safe") return `MaxHospital: ${name} xavfsiz. SOS bekor qilindi.`;
  const parts = [
    `MaxHospital SOS! ${name} ${kind === "fall" ? "yiqildi (MaxBand)" : "yordam so'radi"}.`,
    hasLoc(c) ? `Joy: ${mapUrl(c.lat!, c.lng!)}` : "Joy noma'lum.",
    c.phone ? `Tel: +${c.phone}` : "",
    c.cardUrl ? `Karta: ${c.cardUrl}` : "",
  ].filter(Boolean);
  return smsAscii(parts.join(" "));
}

/** To'lov: balansdan, yetmagani qarzga. */
export function splitCharge(balance: number, cost: number): { fromBalance: number; toDebt: number } {
  const fromBalance = Math.max(0, Math.min(balance, cost));
  return { fromBalance, toDebt: cost - fromBalance };
}
