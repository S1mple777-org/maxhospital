import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlarmClock, Check, Crown, Loader2, MessageSquare, Pill, Send, Smartphone, Sparkles, Wallet } from "lucide-react";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import {
  formatUzs, loadPlans, loadSubscription, setAutoRenew, subscribe,
  type PlanId, type Subscription, type SubscriptionPlan,
} from "@/lib/medications";

const FEATURES: Record<"pro" | "premium", { icon: typeof Check; text: string }[]> = {
  pro: [
    { icon: Sparkles, text: "AI retseptdan dori jadvalini tuzadi" },
    { icon: Pill, text: "Saytdagi va boshqa klinika PDF retseptlari" },
    { icon: Send, text: "Telegram orqali eslatma, \"Ichdim\" tugmasi bilan" },
    { icon: AlarmClock, text: "Saytda eslatma" },
    { icon: Smartphone, text: "Ilovada budilnik — internetsiz ham ishlaydi" },
  ],
  premium: [
    { icon: Check, text: "Pro dagi hamma narsa" },
    { icon: MessageSquare, text: "SMS eslatma — internet va Telegram bo'lmasa ham" },
  ],
};

const ProPage = () => {
  const { user, profile, loading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [current, setCurrent] = useState<PlanId>("free");
  const [sub, setSub] = useState<Subscription | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setPlans(await loadPlans());
    if (user) {
      const s = await loadSubscription(user.id);
      setCurrent(s.plan);
      setSub(s.subscription);
    }
  };

  useEffect(() => { if (!loading) load(); }, [loading, user]);

  const handleSubscribe = async (plan: SubscriptionPlan) => {
    if (!user) { navigate("/auth"); return; }
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
            <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground">Aqlli dori eslatmalari</h1>
            <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">
              AI retseptingizni o'qib, qaysi dorini qachon ichishni rejalashtiradi. Vaqti kelganda Telegram, sayt,
              telefon ilovasi yoki SMS orqali eslatadi.
            </p>
          </div>

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
                  className={`relative rounded-3xl border p-6 md:p-8 flex flex-col ${highlight ? "border-primary bg-primary/5" : "border-border bg-card"}`}
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
                    {FEATURES[plan.id].map((f) => (
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
                    {!user ? "Kirish va obuna bo'lish" : mine ? "Yana bir davrga uzaytirish" : active ? `${plan.name} ga o'tish` : "Obuna bo'lish"}
                  </button>
                </div>
              );
            })}
          </div>

          {active && (
            <div className="mt-8 text-center">
              <Link to="/medications" className="inline-flex items-center gap-2 rounded-xl bg-hero-gradient px-6 py-3 text-sm font-semibold text-primary-foreground">
                <Pill className="w-4 h-4" /> Dori eslatmalarini sozlash
              </Link>
            </div>
          )}

          <p className="mt-8 text-center text-xs text-muted-foreground max-w-2xl mx-auto">
            To'lov ichki balansdan yechiladi. Avtomatik uzaytirish yoqilgan bo'lsa, davr tugaganda balansda yetarli mablag'
            bo'lsa obuna uzayadi. AI jadvali shifokor ko'rsatmasini almashtirmaydi — dozani har doim retsept bo'yicha tekshiring.
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ProPage;
