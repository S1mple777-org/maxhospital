import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatUzs, loadPlans, type SubscriptionPlan } from "@/lib/medications";

/** Owner panel: Pro / Premium prices and subscriber statistics. */
const PlansEditor = () => {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [stats, setStats] = useState({ active: 0, revenue30: 0 });

  const load = async () => {
    setPlans(await loadPlans());
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
      <p className="text-xs text-muted-foreground">
        Yangi narx keyingi obuna va avtomatik uzaytirishdan boshlab qo'llanadi. Allaqachon to'langan davr o'zgarmaydi.
      </p>
    </div>
  );
};

export default PlansEditor;
