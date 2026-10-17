import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Activity, Bot, Check, Crown, FlaskConical, Loader2, MessageSquare, Minus, Pill, Send, Siren, Sparkles, Video, Wallet } from "lucide-react";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import {
  DEFAULT_PLANS, formatUzs, loadPlans, loadSubscription, setAutoRenew, subscribe,
  type PlanId, type Subscription, type SubscriptionPlan,
} from "@/lib/medications";
import { DEFAULT_PLAN_LIMITS, loadPlanLimits, type PlanLimitsRow } from "@/lib/planPerks";

const aiText = (n: number | null) => (n === null ? "Cheksiz AI savollar" : `Kuniga ${n} ta AI savol`);

/** Card bullets: the new limits first (numbers come from the owner panel), then reminders. */
function featuresFor(id: "pro" | "premium", l: PlanLimitsRow | undefined): { icon: typeof Check; text: string }[] {
  const perks = l
    ? [
        { icon: Bot, text: aiText(l.ai_daily_questions) },
        { icon: Video, text: `${l.video_free_minutes} daqiqa bepul video qo'ng'iroq` },
        ...(l.health_ai ? [{ icon: Activity, text: "Ko'rsatkichlar AI tahlili va PDF hisobot" }] : []),
        ...(l.lab_reads_monthly > 0 ? [{ icon: FlaskConical, text: `Tahlil natijasini AI o'qiydi — oyiga ${l.lab_reads_monthly} ta` }] : []),
        { icon: Siren, text: `Favqulodda kredit ${formatUzs(l.emergency_credit_uzs)} gacha` },
      ]
    : [];
  return id === "pro"
    ? [
        ...perks,
        { icon: Sparkles, text: "AI retseptdan dori jadvalini tuzadi" },
        { icon: Send, text: "Telegram, sayt va ilovada (internetsiz) dori eslatmalari" },
      ]
    : [
        ...perks,
        { icon: Check, text: "Pro dagi barcha eslatmalar" },
        { icon: MessageSquare, text: "SMS eslatma — internet va Telegram bo'lmasa ham" },
      ];
}

type Cell = string | boolean;
function compareRows(limits: PlanLimitsRow[]): { label: string; cells: Cell[] }[] {
  const by = (id: string) => limits.find((l) => l.plan_id === id);
  const plans = ["free", "pro", "premium"].map(by);
  if (plans.some((p) => !p)) return [];
  const ls = plans as PlanLimitsRow[];
  return [
    { label: "AI-yordamchi savollari", cells: ls.map((l) => (l.ai_daily_questions === null ? "Cheksiz" : `${l.ai_daily_questions} / kun`)) },
    { label: "Shoshilinch belgilar (103) tekshiruvi", cells: [true, true, true] },
    { label: "Bepul video qo'ng'iroq", cells: ls.map((l) => `${l.video_free_minutes} daqiqa`) },
    { label: "Ko'rsatkichlar grafigi", cells: [true, true, true] },
    { label: "Ko'rsatkichlar AI tahlili + PDF", cells: ls.map((l) => l.health_ai) },
    { label: "Tahlil natijasini AI o'qishi", cells: ls.map((l) => (l.lab_reads_monthly > 0 ? `${l.lab_reads_monthly} / oy` : false)) },
    { label: "Favqulodda kredit (qarz)", cells: ls.map((l) => (l.emergency_credit_uzs > 0 ? formatUzs(l.emergency_credit_uzs) : false)) },
    { label: "Dori eslatmalari (Telegram, sayt, ilova)", cells: [false, true, true] },
    { label: "SMS eslatma", cells: [false, false, true] },
  ];
}

const ProPage = () => {
  const { user, profile, loading, refreshProfile, isOwner } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<SubscriptionPlan[]>(DEFAULT_PLANS);
  const [current, setCurrent] = useState<PlanId>("free");
  const [sub, setSub] = useState<Subscription | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Start with the default tariffs so the page is never empty while loading.
  const [limits, setLimits] = useState<PlanLimitsRow[]>(DEFAULT_PLAN_LIMITS);
  const [notReady, setNotReady] = useState(false);

  const load = async () => {
    const [p, l] = await Promise.all([loadPlans(), loadPlanLimits()]);
    // Bazada tariflar jadvali hali yo'q bo'lsa ham tariflar ko'rinib tursin.
    setNotReady(p.length === 0);
    setPlans(p.length ? p : DEFAULT_PLANS);
    setLimits(l.length === 3 ? l : DEFAULT_PLAN_LIMITS);
    if (user) {
      const s = await loadSubscription(user.id);
      setCurrent(s.plan);
      setSub(s.subscription);
    }
  };

  useEffect(() => { if (!loading) load(); }, [loading, user]);

  const handleSubscribe = async (plan: SubscriptionPlan) => {
    if (!user) { navigate("/auth"); return; }
    if (notReady) {
      toast.info("Obuna tez orada ishga tushadi. Hozircha to'lov qabul qilinmayapti.");
      return;
    }
    const isChange = current !== "free" && current !== plan.id;
    const msg = isChange
      ? `${plan.name} tarifiga o'tish: balansdan ${formatUzs(plan.price_uzs)} yechiladi va yangi ${plan.period_days} kunlik davr hozirdan boshlanadi. Davom etasizmi?`
      : `Balansdan ${formatUzs(plan.price_uzs)} yechiladi (${plan.period_days} kun). Davom etasizmi?`;
    if (!confirm(msg)) return;
    setBusy(plan.id);
    try {
      await subscribe(plan.id);
      toast.success(`${plan.name} faollashtirildi!`);
      await Promise.all([load(), refreshProfile()]);
    } catch (e: any) {
      toast.error(e.message === "Balans yetarli emas" ? "Balans yetarli emas. Balansni to'ldiring." : e.message);
      if (/qarz/i.test(e.message)) navigate("/wallet");
    } finally {
      setBusy(null);
    }
  };

  const toggleRenew = async () => {
    if (!sub) return;
    setBusy("renew");
    try {
      await setAutoRenew(!sub.auto_renew);
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  const active = current !== "free";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary mb-3">
              <Crown className="w-3.5 h-3.5" /> MaxHospital Pro
            </div>
            <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-foreground">Ko'proq AI, ko'proq video, aqlli eslatmalar</h1>
            <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">
              Ko'proq AI savollar, uzunroq bepul video, ko'rsatkichlar va tahlil natijalarini AI bilan tushunish,
              favqulodda kredit va dori eslatmalari — Telegram, sayt, telefon ilovasi yoki SMS orqali.
            </p>
          </div>

          {notReady && isOwner && (
            <div className="mb-6 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-foreground">
              <b>Owner uchun:</b> tariflar jadvali bazada hali yaratilmagan, shuning uchun standart narxlar ko'rsatilmoqda va obuna
              ishlamaydi. Lovable'da <code>drizzle/migrations/0002_medication_reminders.sql</code> va <code>0003_plan_perks.sql</code> migratsiyalarini qo'llang.
            </div>
          )}

          {user && profile && (
            <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <Wallet className="w-5 h-5 text-primary" />
                <div>
                  <div className="text-sm text-muted-foreground">Balans</div>
                  <div className="font-semibold text-foreground">{formatUzs(profile.balance_uzs)}</div>
                </div>
              </div>
              {active && sub && (
                <div className="text-sm text-foreground">
                  Faol tarif: <b>{plans.find((p) => p.id === current)?.name ?? current}</b> ·{" "}
                  {new Date(sub.current_period_end).toLocaleDateString()} gacha
                  <label className="ml-3 inline-flex items-center gap-2 text-muted-foreground cursor-pointer">
                    <input type="checkbox" checked={sub.auto_renew} onChange={toggleRenew} disabled={busy === "renew"} />
                    Avtomatik uzaytirish
                  </label>
                </div>
              )}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            {plans.filter((p) => p.is_active).map((plan) => {
              const mine = current === plan.id;
              const highlight = plan.id === "premium";
              return (
                <div
                  key={plan.id}
                  className={`relative rounded-3xl border p-5 md:p-8 flex flex-col ${highlight ? "border-primary bg-primary/5" : "border-border bg-card"}`}
                >
                  {mine && (
                    <span className="absolute top-4 right-4 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">Sizning tarifingiz</span>
                  )}
                  <h2 className="font-display text-2xl font-bold text-foreground">{plan.name}</h2>
                  <div className="mt-2 mb-6">
                    <span className="text-3xl font-bold text-foreground">{formatUzs(plan.price_uzs)}</span>
                    <span className="text-muted-foreground"> / {plan.period_days} kun</span>
                  </div>
                  <ul className="space-y-3 mb-8 flex-1">
                    {featuresFor(plan.id, limits.find((l) => l.plan_id === plan.id)).map((f) => (
                      <li key={f.text} className="flex items-start gap-3 text-sm text-foreground">
                        <f.icon className="w-4 h-4 text-primary mt-0.5 shrink-0" /> {f.text}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => handleSubscribe(plan)}
                    disabled={busy !== null}
                    className={`w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 ${highlight ? "bg-hero-gradient text-primary-foreground" : "bg-primary text-primary-foreground"}`}
                  >
                    {busy === plan.id && <Loader2 className="w-4 h-4 animate-spin" />}
                    {notReady ? "Tez orada" : !user ? "Kirish va obuna bo'lish" : mine ? "Yana bir davrga uzaytirish" : active ? `${plan.name} ga o'tish` : "Obuna bo'lish"}
                  </button>
                </div>
              );
            })}
          </div>

          {compareRows(limits).length > 0 && (
            <div className="mt-10 rounded-2xl border border-border bg-card overflow-x-auto">
              <table className="w-full min-w-[420px] text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-2 sm:px-4 py-3 font-medium text-muted-foreground">Imkoniyat</th>
                    {["Free", "Pro", "Premium"].map((n, i) => (
                      <th key={n} className={`px-2 sm:px-4 py-3 text-center font-semibold ${(["free", "pro", "premium"] as const)[i] === current ? "text-primary" : "text-foreground"}`}>{n}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {compareRows(limits).map((r) => (
                    <tr key={r.label}>
                      <td className="px-2 sm:px-4 py-2.5 text-foreground">{r.label}</td>
                      {r.cells.map((c, i) => (
                        <td key={i} className="px-2 sm:px-4 py-2.5 text-center text-foreground whitespace-nowrap">
                          {c === true ? <Check className="w-4 h-4 text-primary inline" /> : c === false ? <Minus className="w-4 h-4 text-muted-foreground inline" /> : c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {active && (
            <div className="mt-8 text-center">
              <Link to="/medications" className="inline-flex items-center gap-2 rounded-xl bg-hero-gradient px-6 py-3 text-sm font-semibold text-primary-foreground">
                <Pill className="w-4 h-4" /> Dori eslatmalarini sozlash
              </Link>
            </div>
          )}

          <p className="mt-8 text-center text-xs text-muted-foreground max-w-2xl mx-auto">
            To'lov ichki balansdan yechiladi. Favqulodda qarz bo'lsa, avval uni Hamyon sahifasida to'lash kerak. Avtomatik uzaytirish yoqilgan bo'lsa, davr tugaganda balansda yetarli mablag'
            bo'lsa obuna uzayadi. AI jadvali shifokor ko'rsatmasini almashtirmaydi — dozani har doim retsept bo'yicha tekshiring.
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ProPage;
