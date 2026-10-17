// Telefon ekranida (360 px) har bir sahifani ochadi, gorizontal "toshib chiqish"larni topadi va skrinshot oladi.
// Supabase so'rovlari soxta ma'lumot bilan javob beradi, shuning uchun haqiqiy baza kerak emas.
//   BASE_URL=http://localhost:4173 node scripts/mobile-audit.mjs
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:4173";
const OUT = process.env.OUT_DIR || "mobile-audit";
const WIDTH = Number(process.env.WIDTH || 360);
const REF = "mhyiqzeowliasmozvjdk";

const ME = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const exp = Math.floor(now / 1000) + 3600 * 24;
const user = { id: ME, aud: "authenticated", role: "authenticated", email: "nozimakhon.abdulazizova@example.com", user_metadata: { full_name: "Abdurahmonova Nozimaxon" }, app_metadata: {}, created_at: iso(now - 9e9) };
const session = {
  access_token: `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: ME, role: "authenticated", exp, aud: "authenticated", email: user.email })}.sig`,
  refresh_token: "fake-refresh",
  token_type: "bearer",
  expires_in: 3600 * 24,
  expires_at: exp,
  user,
};

const LONG = "Kardiologiya va yurak-qon tomir jarrohligi bo'limi";
const TEXT = "Bemorlar uchun muhim ma'lumot: qon bosimini muntazam o'lchab boring, tuz iste'molini kamaytiring va shifokor tavsiyalariga amal qiling. ".repeat(3);
const METRICS = ["bp_systolic", "bp_diastolic", "pulse", "temperature", "spo2", "glucose", "weight"];

function row(table, i) {
  const id = i === 0 ? ID : `${ID.slice(0, -2)}${String(i).padStart(2, "0")}`;
  const base = {
    id, user_id: ME, patient_id: ME, doctor_id: ID, department_id: ID, consultation_id: ID, author_id: ME, created_by: ME,
    created_at: iso(now - i * 864e5), updated_at: iso(now),
    full_name: "Abdurahmonova Nozimaxon Abdulazizovna", avatar_url: null, phone: "+998 90 123 45 67",
    balance_uzs: 12500000, is_banned: false, ban_reason: null, telegram_chat_id: null, telegram_notifications_enabled: true, two_fa_enabled: false,
    name_uz: LONG, name_ru: "Кардиология и сердечно-сосудистая хирургия", name_en: "Cardiology and cardiovascular surgery",
    price_uzs: 150000, icon: "🫀", icon_url: null, is_active: true,
    title: "Bosh shifokor, kardiolog-jarroh, tibbiyot fanlari nomzodi", experience_years: 15, rating: 4.9, is_online: i % 2 === 0, patients_count: 1240,
    bio_uz: TEXT, bio_ru: TEXT, bio_en: TEXT, workplace: "Toshkent shahar 1-son klinik shifoxonasi", address: "Toshkent sh., Yunusobod tumani, Amir Temur ko'chasi 108-uy", telegram_username: "@dr_abdurahmonov_kardiolog",
    status: i === 0 ? "active" : i === 1 ? "pending" : "completed", started_at: iso(now - 6e5), ended_at: null, max_end_time: iso(now + 36e5), extended: false,
    title_uz: "Yurak salomatligi: har kuni qilinadigan 10 ta oddiy odat", title_ru: "Здоровье сердца: 10 простых привычек", title_en: "Heart health: 10 simple daily habits",
    content_uz: TEXT, content_ru: TEXT, content_en: TEXT, image_url: null, is_published: true,
    diagnosis: "Arterial gipertenziya, II daraja, yurak-qon tomir xavfi yuqori", notes: TEXT.slice(0, 160), patient_name: "Abdurahmonova Nozimaxon Abdulazizovna",
    doctor_name: "Abdurahmonov Abdulla", doctor_title: "Kardiolog", department_name: LONG,
    medicines: [
      { name: "Amlodipin", dose: "5 mg", frequency: "kuniga 1 marta ertalab", duration: "30 kun" },
      { name: "Lizinopril", dose: "10 mg", frequency: "kuniga 2 marta ovqatdan keyin", duration: "14 kun" },
    ],
    content: "Assalomu alaykum, shifokor! Kecha kechqurundan beri boshim og'riyapti va bosimim 160/100 ga chiqdi.", message_type: "text", file_url: null, sender_id: i % 2 ? ME : ID,
    role: "doctor", admin_type: "financial", monthly_limit: 5000000, month_spent: 1200000, month_reset_at: iso(now),
    channel_id: "-1001234567890", channel_name: "MaxHospital rasmiy kanali", channel_username: "@maxhospital_uz_official",
    metric: METRICS[i % METRICS.length], value: [128, 82, 76, 36.7, 97, 5.6, 72][i % 7], measured_at: iso(now - i * 864e5 * 7),
    book_title: "Ichki kasalliklar propedevtikasi", author: "Prof. A. G'. Gadayev", book_author: "Prof. A. G'. Gadayev", page_count: 640, chunk_count: 1820, file_path: "books/x.pdf", error: null,
    plan_id: "pro", amount_uzs: 19000, kind: "new", period_end: iso(now + 30 * 864e5), current_period_end: iso(now + 30 * 864e5), auto_renew: true,
    medicine_name: "Amoksitsillin + klavulan kislotasi", dose: "875 mg / 125 mg", instructions: "ovqatdan keyin, bir stakan suv bilan", times: ["08:00", "14:00", "20:00"],
    start_date: iso(now).slice(0, 10), days: 7, timezone: "Asia/Tashkent", channels: ["web", "telegram", "app"], source: "prescription", prescription_id: ID,
    notify_id: 100 + i, schedule_id: ID, scheduled_at: iso(now + (i - 2) * 36e5), read_at: null, body: TEXT.slice(0, 120),
    amount: 1, repaid_uzs: 0, settled_at: null, comment: "Juda yaxshi shifokor, rahmat!", triage: "doctor", mode: "chat",
    doctors: { user_id: ME, title: "Kardiolog", department_id: ID }, departments: { name_uz: LONG, name_ru: "Кардиология", name_en: "Cardiology", price_uzs: 150000 },
    profiles: { full_name: "Abdurahmonova Nozimaxon Abdulazizovna", avatar_url: null },
  };
  if (table === "user_roles") return { id, user_id: ME, role: ["owner", "admin", "doctor"][i] ?? "admin" };
  if (table === "subscription_plans") return [
    { id: "pro", name: "Pro", price_uzs: 19000, period_days: 30, sms_enabled: false, is_active: true, sort_order: 1 },
    { id: "premium", name: "Premium", price_uzs: 39000, period_days: 30, sms_enabled: true, is_active: true, sort_order: 2 },
  ][i];
  if (table === "plan_limits") return [
    { plan_id: "free", ai_daily_questions: 5, video_free_minutes: 10, health_ai: false, lab_reads_monthly: 0, emergency_credit_uzs: 50000 },
    { plan_id: "pro", ai_daily_questions: 50, video_free_minutes: 20, health_ai: true, lab_reads_monthly: 5, emergency_credit_uzs: 100000 },
    { plan_id: "premium", ai_daily_questions: null, video_free_minutes: 30, health_ai: true, lab_reads_monthly: 20, emergency_credit_uzs: 150000 },
  ][i];
  if (table === "emergency_credits") return { ...base, amount_uzs: 40000, repaid_uzs: 0, status: i === 0 ? "open" : "repaid" };
  return base;
}

const ROWS = { user_roles: 3, subscription_plans: 2, plan_limits: 3, health_measurements: 14, messages: 6 };

const planStatus = {
  plan: "free",
  limits: { ai_daily_questions: 5, video_free_minutes: 10, health_ai: true, lab_reads_monthly: 5, emergency_credit_uzs: 50000 },
  usage: { ai_today: 2, lab_month: 1 },
  debt_uzs: 40000,
  credit: { id: ID, consultation_id: ID, amount_uzs: 40000, repaid_uzs: 0, created_at: iso(now) },
};

async function handle(route) {
  const req = route.request();
  const url = new URL(req.url());
  const p = url.pathname;
  // CORS: "Authorization" sarlavhasi "*" bilan ruxsat etilmaydi, shuning uchun so'ralganini qaytaramiz.
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": req.headers()["access-control-request-headers"] || "authorization, apikey, content-type, x-client-info, prefer, range, accept-profile, content-profile",
    "access-control-allow-methods": "GET, POST, PATCH, PUT, DELETE, HEAD, OPTIONS",
    "access-control-expose-headers": "content-range",
  };
  const json = (body, headers = {}) => route.fulfill({ status: 200, contentType: "application/json", headers: { ...cors, ...headers }, body: JSON.stringify(body) });
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
  if (p.startsWith("/auth/v1/user")) return json(user);
  if (p.startsWith("/auth/v1/token")) return json(session);
  if (p.startsWith("/auth/v1/")) return json({});
  if (p.startsWith("/functions/v1/")) return json({});
  if (p.startsWith("/storage/v1/")) return json([]);
  if (p.startsWith("/rest/v1/rpc/")) {
    const fn = p.split("/").pop();
    if (fn === "get_my_profile" || fn === "staff_list_profiles") return json(Array.from({ length: fn === "get_my_profile" ? 1 : 6 }, (_, i) => row("profiles", i)));
    if (fn === "my_plan_status") return json(planStatus);
    if (fn === "get_public_phone") return json("+998 90 123 45 67");
    return json(null);
  }
  if (p.startsWith("/rest/v1/")) {
    const table = p.split("/").pop();
    const n = ROWS[table] ?? 4;
    const rows = Array.from({ length: n }, (_, i) => row(table, i));
    const single = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
    const range = { "content-range": `0-${n - 1}/${n}` };
    if (req.method() === "HEAD") return route.fulfill({ status: 200, headers: { ...cors, ...range } });
    return json(single ? rows[0] : rows, range);
  }
  return route.continue();
}

const ROUTES = [
  "/", "/auth", "/profile", "/departments", `/departments/${ID}`, "/doctors", `/doctors/${ID}`, "/news", `/news/${ID}`,
  "/start-consultation", `/consultation/${ID}`, "/doctor-dashboard", "/users", `/create-prescription/${ID}`, `/prescription/${ID}`,
  "/my-prescriptions", "/ai-assistant", "/health", "/pro", "/medications", "/wallet", "/lab-results", "/admin", "/owner",
];
const ONLY = process.env.ROUTES ? process.env.ROUTES.split(",") : null;

function measure() {
  const vw = document.documentElement.clientWidth;
  const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  const clippedBy = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll|hidden|clip)/.test(cs.overflowX)) {
        const r = p.getBoundingClientRect();
        if (r.right <= vw + 1 && r.left >= -1) return true;
      }
    }
    return false;
  };
  const out = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && (r.right > vw + 1 || r.left < -1);
  };
  const offenders = [];
  for (const el of document.body.querySelectorAll("*")) {
    if (!out(el) || clippedBy(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.position === "fixed" && cs.visibility === "hidden") continue;
    const parent = el.parentElement;
    if (parent && parent !== document.body && out(parent) && !clippedBy(parent)) continue;
    const r = el.getBoundingClientRect();
    offenders.push({
      tag: el.tagName.toLowerCase(),
      cls: String(el.className?.baseVal ?? el.className ?? "").slice(0, 140),
      text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 70),
      left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width),
    });
  }
  return { vw, sw, offenders: offenders.slice(0, 12) };
}

const slug = (s) => s.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home";

fs.mkdirSync(path.join(OUT, "shots"), { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 780 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true });
await ctx.addInitScript(({ key, s }) => {
  try { localStorage.setItem(key, JSON.stringify(s)); } catch { /* ignore */ }
}, { key: `sb-${REF}-auth-token`, s: session });
await ctx.route(/\.(supabase\.co|lovable\.cloud)\//, handle);

const report = [];
async function check(page, name) {
  await page.waitForTimeout(1200);
  const m = await page.evaluate(measure);
  const file = `shots/${slug(name)}.jpg`;
  await page.screenshot({ path: path.join(OUT, file), fullPage: true, type: "jpeg", quality: 70 });
  report.push({ name, ...m, file });
  const bad = m.sw > m.vw + 1 || m.offenders.length > 0;
  console.log(`${bad ? "✗" : "✓"} ${name}  scrollWidth=${m.sw} (viewport ${m.vw})  offenders=${m.offenders.length}`);
  if (bad) {
    for (const o of m.offenders.slice(0, 5)) console.log(`    <${o.tag} class="${o.cls}"> right=${o.right} w=${o.width} "${o.text}"`);
    console.log(`::warning title=Mobile overflow ${name}::scrollWidth ${m.sw} > ${m.vw}; ${m.offenders.slice(0, 3).map((o) => `<${o.tag}.${o.cls.split(" ").slice(0, 4).join(".")}> "${o.text.slice(0, 30)}"`).join(" | ")}`);
  }
}

for (const r of ROUTES) {
  if (ONLY && !ONLY.includes(r)) continue;
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`    [pageerror] ${r}: ${e.message.slice(0, 160)}`));
  page.on("requestfailed", (q) => { if (/supabase\.co|lovable\.cloud/.test(q.url())) console.log(`    [requestfailed] ${q.method()} ${q.url().slice(0, 100)} ${q.failure()?.errorText}`); });
  try {
    await page.goto(BASE + r, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    await check(page, r);
    // Panellarning har bir bo'limi (tab) alohida tekshiriladi.
    if (r === "/admin" || r === "/owner") {
      const tabs = page.locator('[data-panel-tab], .w-56 button');
      const count = await tabs.count();
      for (let i = 0; i < count; i++) {
        const label = ((await tabs.nth(i).textContent()) || `tab${i}`).trim();
        await tabs.nth(i).click().catch(() => {});
        await check(page, `${r}#${label}`);
      }
    }
    if (r === "/") {
      await page.locator("nav button.md\\:hidden").first().click().catch(() => {});
      await check(page, "/#mobile-menu");
    }
  } catch (e) {
    console.log(`    [error] ${r}: ${e.message}`);
  }
  await page.close();
}
await browser.close();

fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
const bad = report.filter((x) => x.sw > x.vw + 1 || x.offenders.length);
fs.writeFileSync(path.join(OUT, "README.md"), [
  `# Mobile audit (${WIDTH}px)`, "", `${report.length - bad.length}/${report.length} sahifa ekranga sig'adi.`, "",
  ...report.map((x) => `- ${x.sw > x.vw + 1 || x.offenders.length ? "✗" : "✓"} \`${x.name}\` — scrollWidth ${x.sw}, [skrinshot](${x.file})`),
].join("\n"));
console.log(`\n${report.length - bad.length}/${report.length} pages fit at ${WIDTH}px`);
