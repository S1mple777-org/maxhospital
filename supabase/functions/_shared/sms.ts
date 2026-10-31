// Eskiz.uz orqali SMS (ESKIZ_EMAIL, ESKIZ_PASSWORD, ESKIZ_FROM — Supabase Secrets).
// Eslatma: Eskiz har bir matn shabloni oldindan tasdiqlanishini talab qiladi (my.eskiz.uz -> Shablonlar).
let token: string | null = null;

async function login(): Promise<string | null> {
  const email = Deno.env.get("ESKIZ_EMAIL"), password = Deno.env.get("ESKIZ_PASSWORD");
  if (!email || !password) return null;
  const form = new FormData();
  form.set("email", email);
  form.set("password", password);
  const res = await fetch("https://notify.eskiz.uz/api/auth/login", { method: "POST", body: form });
  if (!res.ok) { console.error("Eskiz login failed", res.status); return null; }
  const data = await res.json().catch(() => null);
  return data?.data?.token ?? null;
}

export const smsConfigured = () => !!(Deno.env.get("ESKIZ_EMAIL") && Deno.env.get("ESKIZ_PASSWORD"));

/** phone: 998XXXXXXXXX. true — Eskiz qabul qildi. */
export async function sendSms(phone: string, message: string, retry = true): Promise<boolean> {
  token ??= await login();
  if (!token) return false;
  const form = new FormData();
  form.set("mobile_phone", phone);
  form.set("message", message);
  form.set("from", Deno.env.get("ESKIZ_FROM") || "4546");
  const res = await fetch("https://notify.eskiz.uz/api/message/sms/send", {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
  });
  if (res.status === 401 && retry) { token = null; return sendSms(phone, message, false); }
  if (!res.ok) console.error("Eskiz send failed", res.status, await res.text().catch(() => ""));
  return res.ok;
}
