import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatUzs, loadPlans, type SubscriptionPlan } from "@/lib/medications";
import { loadPlanLimits, PLAN_NAMES, type PlanLimitsRow } from "@/lib/planPerks";

/** Owner panel: Pro / Premium prices, Free / Pro / Premium limits and subscriber statistics. */
const PlansEditor = () => {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [stats, setStats] = useState({ active: 0, revenue30: 0 });
  const [limits, setLimits] = useState<PlanLimitsRow[]>([]);
  const [debtStats, setDebtStats] = useState({ open: 0, total: 0 });

  const load = async () => {
    setPlans(await loadPlans());
    setLimits(await loadPlanLimits());
    const { data: credits } = await supabase.from("emergency_credits" as any).select("amount_uzs, repaid_uzs").eq("status", "open").limit(10000);
    const open = ((credits ?? []) as any[]);
    setDebtStats({ open: open.length, total: open.reduce((s, c) => s + Number(c.amount_uzs) - Number(c.repaid_uzs), 0) });
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [{ count }, { data: payments }] = await Promise.all([
      supabase.from("subscriptions" as any).select("user_id", { count: "exact", head: true })
        .eq("status", "active").gt("current_period_end", new Date().toISOString()),
      supabase.from("subscription_payments" as any).select("amount_uzs").gte("created_at", since).limit(10000),
    ]);
    setStats({
      active: count ?? 0,
      revenue30: ((payments ?? []) as any[]).reduce((s, p) => s + Number(p.amount_uzs), 0),
    });
  };

  useEffect(() => { load(); }, []);

  const update = (id: string, patch: Partial<SubscriptionPlan>) =>
    setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const save = async (p: SubscriptionPlan) => {
    if (!p.name.trim() || p.price_uzs < 0 || p.period_days < 1 || p.period_days > 366) {
      toast.error("Nom, narx (≥ 0) va muddat (1–366 kun) to'g'ri bo'lsin");
      return;
    }
    setSaving(p.id);
    const { error } = await (supabase.from("subscription_plans" as any) as any)
      .update({ name: p.name.trim(), price_uzs: p.price_uzs, period_days: p.period_days, is_active: p.is_active, updated_at: new Date().toISOString() })
      .eq("id", p.id);
    setSaving(null);
    if (error) toast.error(error.message);
    else { toast.success(`${p.name} saqlandi`); load(); }
  };

  const updateLimit = (id: string, patch: Partial<PlanLimitsRow>) =>
    setLimits((prev) => prev.map((l) => (l.plan_id === id ? { ...l, ...patch } : l)));

  const saveLimits = async (l: PlanLimitsRow) => {
    const ints = [l.video_free_minutes, l.lab_reads_monthly, l.emergency_credit_uzs, l.ai_daily_questions ?? 0];
    if (ints.some((n) => !Number.isInteger(n) || n < 0) || l.video_free_minutes > 240) {
      toast.error("Qiymatlar butun va musbat bo'lsin (video ≤ 240 daqiqa)");
      return;
    }
    setSaving(`limits-${l.plan_id}`);
    const { error } = await (supabase.from("plan_limits" as any) as any)
      .update({
        ai_daily_questions: l.ai_daily_questions,
        video_free_minutes: l.video_free_minutes,
        health_ai: l.health_ai,
        lab_reads_monthly: l.lab_reads_monthly,
        emergency_credit_uzs: l.emergency_credit_uzs,
        updated_at: new Date().toISOString(),
      })
      .eq("plan_id", l.plan_id);
    setSaving(null);
    if (error) toast.error(error.message);
    else { toast.success(`${PLAN_NAMES[l.plan_id]} limitlari saqlandi`); load(); }
  };

  const inputClass = "px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="text-2xl font-display font-bold text-foreground">{stats.active}</div>
          <div className="text-sm text-muted-foreground">Faol obunachilar</div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="text-2xl font-display font-bold text-foreground">{formatUzs(stats.revenue30)}</div>
          <div className="text-sm text-muted-foreground">Obuna tushumi (30 kun)</div>
        </div>
      </div>

      {plans.map((p) => (
        <div key={p.id} className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-semibold text-foreground">{p.id === "premium" ? "Premium (SMS bilan)" : "Pro"}</h3>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={p.is_active} onChange={(e) => update(p.id, { is_active: e.target.checked })} /> Sotuvda
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-xs text-muted-foreground">Nomi
              <input value={p.name} onChange={(e) => update(p.id, { name: e.target.value })} className={`${inputClass} w-full mt-1`} />
            </label>
            <label className="text-xs text-muted-foreground">Narx (so'm)
              <input type="number" min={0} step={1000} value={p.price_uzs} onChange={(e) => update(p.id, { price_uzs: Number(e.target.value) })} className={`${inputClass} w-full mt-1`} />
            </label>
            <label className="text-xs text-muted-foreground">Muddat (kun)
              <input type="number" min={1} max={366} value={p.period_days} onChange={(e) => update(p.id, { period_days: Number(e.target.value) })} className={`${inputClass} w-full mt-1`} />
            </label>
          </div>
          <button onClick={() => save(p)} disabled={saving === p.id} className="mt-3 px-4 py-2 rounded-lg bg-hero-gradient text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50">
            {saving === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Saqlash
          </button>
        </div>
      ))}
      <h3 className="font-display font-semibold text-foreground pt-4">Tarif limitlari</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="text-2xl font-display font-bold text-foreground">{debtStats.open}</div>
          <div className="text-sm text-muted-foreground">To'lanmagan favqulodda qarzlar</div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="text-2xl font-display font-bold text-foreground">{formatUzs(debtStats.total)}</div>
          <div className="text-sm text-muted-foreground">Qarzlar jami</div>
        </div>
      </div>
      {limits.map((l) => (
        <div key={l.plan_id} className="bg-card rounded-xl border border-border p-4">
          <h4 className="font-display font-semibold text-foreground mb-3">{PLAN_NAMES[l.plan_id]}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="text-xs text-muted-foreground">AI savollar / kun
              <div className="flex items-center gap-2 mt-1">
                <input type="number" min={0} disabled={l.ai_daily_questions === null} value={l.ai_daily_questions ?? ""}
                  onChange={(e) => updateLimit(l.plan_id, { ai_daily_questions: Number(e.target.value) })} className={`${inputClass} w-full disabled:opacity-40`} />
                <label className="flex items-center gap-1 whitespace-nowrap">
                  <input type="checkbox" checked={l.ai_daily_questions === null}
                    onChange={(e) => updateLimit(l.plan_id, { ai_daily_questions: e.target.checked ? null : 20 })} /> cheksiz
                </label>
              </div>
            </div>
            <label className="text-xs text-muted-foreground">Bepul video (daqiqa)
              <input type="number" min={0} max={240} value={l.video_free_minutes}
                onChange={(e) => updateLimit(l.plan_id, { video_free_minutes: Number(e.target.value) })} className={`${inputClass} w-full mt-1`} />
            </label>
            <label className="text-xs text-muted-foreground">Tahlil o'qish / oy (0 = yo'q)
              <input type="number" min={0} value={l.lab_reads_monthly}
                onChange={(e) => updateLimit(l.plan_id, { lab_reads_monthly: Number(e.target.value) })} className={`${inputClass} w-full mt-1`} />
            </label>
            <label className="text-xs text-muted-foreground">Favqulodda kredit (so'm)
              <input type="number" min={0} step={10000} value={l.emergency_credit_uzs}
                onChange={(e) => updateLimit(l.plan_id, { emergency_credit_uzs: Number(e.target.value) })} className={`${inputClass} w-full mt-1`} />
            </label>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={l.health_ai} onChange={(e) => updateLimit(l.plan_id, { health_ai: e.target.checked })} />
            Ko'rsatkichlar AI tahlili va PDF hisobot
          </label>
          <button onClick={() => saveLimits(l)} disabled={saving === `limits-${l.plan_id}`} className="mt-3 px-4 py-2 rounded-lg bg-hero-gradient text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50">
            {saving === `limits-${l.plan_id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Saqlash
          </button>
        </div>
      ))}

      <p className="text-xs text-muted-foreground">
        Yangi narx keyingi obuna va avtomatik uzaytirishdan boshlab qo'llanadi. Allaqachon to'langan davr o'zgarmaydi.
      </p>
    </div>
  );
};

export default PlansEditor;
