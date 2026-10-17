import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CheckCircle2, Crown, Loader2, Siren, Wallet } from "lucide-react";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatUzs } from "@/lib/medications";
import { loadCredits, PLAN_NAMES, repayDebt, usePlanStatus, type CreditRow } from "@/lib/planPerks";

interface HistoryRow {
  key: string;
  at: string;
  title: string;
  amount: number; // + kirim, - chiqim, 0 = faqat ma'lumot
  note?: string;
}

const WalletPage = () => {
  const { user, profile, loading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { status, refresh } = usePlanStatus(!!user);
  const [credits, setCredits] = useState<CreditRow[]>([]);
  const [consultations, setConsultations] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [paying, setPaying] = useState(false);

  const loadHistory = async () => {
    if (!user) return;
    const [cr, { data: cons }, { data: pays }] = await Promise.all([
      loadCredits(),
      supabase.from("consultations").select("id, price_uzs, status, created_at").eq("patient_id", user.id)
        .order("created_at", { ascending: false }).limit(50),
      supabase.from("subscription_payments" as any).select("id, plan_id, amount_uzs, kind, created_at")
        .order("created_at", { ascending: false }).limit(50),
    ]);
    setCredits(cr);
    setConsultations(cons ?? []);
    setPayments((pays as any[] | null) ?? []);
  };

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate("/auth"); return; }
    void loadHistory();
  }, [user, loading]);

  const balance = Number(profile?.balance_uzs ?? 0);
  const debt = status?.debt_uzs ?? 0;
  const openCredit = credits.find((c) => c.status === "open") ?? null;
  const willPay = Math.min(balance, debt);

  const handleRepay = async () => {
    setPaying(true);
    try {
      const r = await repayDebt();
      toast.success(r.debt_uzs === 0
        ? `Qarz to'liq to'landi (${formatUzs(r.paid_uzs)}). Endi konsultatsiya boshlashingiz mumkin.`
        : `${formatUzs(r.paid_uzs)} to'landi. Qolgan qarz: ${formatUzs(r.debt_uzs)}`);
      await Promise.all([refreshProfile(), refresh(), loadHistory()]);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPaying(false);
    }
  };

  const history = useMemo<HistoryRow[]>(() => {
    const creditByConsultation = new Map(credits.filter((c) => c.consultation_id).map((c) => [c.consultation_id!, c]));
    const rows: HistoryRow[] = [];
    for (const c of consultations) {
      const cr = creditByConsultation.get(c.id);
      const fromBalance = Number(c.price_uzs) - (cr ? Number(cr.amount_uzs) : 0);
      rows.push({
        key: `c-${c.id}`,
        at: c.created_at,
        title: cr ? "Favqulodda konsultatsiya" : "Konsultatsiya",
        amount: -fromBalance,
        note: c.status === "cancelled" ? "Shifokor rad etdi — pul qaytarildi" : cr ? `${formatUzs(cr.amount_uzs)} qarzga` : undefined,
      });
    }
    for (const cr of credits) {
      if (cr.repaid_uzs > 0) {
        rows.push({
          key: `r-${cr.id}`,
          at: cr.settled_at ?? cr.created_at,
          title: cr.status === "repaid" ? "Qarz to'landi" : "Qarzning bir qismi to'landi",
          amount: -Number(cr.repaid_uzs),
        });
      }
    }
    for (const p of payments) {
      rows.push({
        key: `s-${p.id}`,
        at: p.created_at,
        title: `${PLAN_NAMES[p.plan_id as "pro" | "premium"] ?? p.plan_id} obunasi${p.kind === "renewal" ? " (avtomatik)" : ""}`,
        amount: -Number(p.amount_uzs),
      });
    }
    return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60);
  }, [credits, consultations, payments]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center"><Wallet className="w-5 h-5 text-primary" /></div>
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground">Hamyon</h1>
              <p className="text-sm text-muted-foreground">Balans, favqulodda qarz va to'lovlar tarixi</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 mb-6">
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="text-sm text-muted-foreground">Balans</div>
              <div className="text-3xl font-display font-bold text-foreground mt-1">{formatUzs(balance)}</div>
              <p className="text-xs text-muted-foreground mt-2">Balansni to'ldirish uchun administratorga murojaat qiling.</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="text-sm text-muted-foreground">Tarif</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-2xl font-display font-bold text-foreground">{status ? PLAN_NAMES[status.plan] : "…"}</span>
                {status && status.plan !== "free" && <Crown className="w-5 h-5 text-amber-500" />}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Favqulodda kredit limiti: <b className="text-foreground">{formatUzs(status?.limits.emergency_credit_uzs ?? 0)}</b>
              </p>
              <Link to="/pro" className="text-xs text-primary hover:underline">Tariflarni solishtirish</Link>
            </div>
          </div>

          {debt > 0 ? (
            <div className="rounded-2xl border-2 border-destructive/40 bg-destructive/5 p-5 mb-6">
              <div className="flex items-center gap-2 font-semibold text-destructive mb-1">
                <AlertTriangle className="w-5 h-5" /> To'lanmagan favqulodda qarz: {formatUzs(debt)}
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Qarz birinchi navbatda to'lanadi. U to'lanmaguncha yangi konsultatsiya boshlab va obuna sotib olib bo'lmaydi.
                {openCredit && <> Qarz olingan sana: {new Date(openCredit.created_at).toLocaleDateString()}.</>}
              </p>
              {balance > 0 ? (
                <button
                  onClick={handleRepay}
                  disabled={paying}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {paying && <Loader2 className="w-4 h-4 animate-spin" />}
                  {willPay >= debt ? `Qarzni to'lash: ${formatUzs(debt)}` : `Balansdagi ${formatUzs(willPay)} ni qarzga to'lash`}
                </button>
              ) : (
                <p className="text-sm font-medium text-foreground">Qarzni to'lash uchun avval balansni to'ldiring.</p>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card p-5 mb-6 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <div className="font-medium text-foreground">Qarzingiz yo'q</div>
                <p className="text-muted-foreground mt-0.5">
                  <Siren className="w-3.5 h-3.5 inline -mt-0.5 text-amber-600" /> Favqulodda holatda balans yetmasa ham konsultatsiya boshlashingiz
                  mumkin: yetmagan qismi (limitgacha) qarzga yoziladi va keyin shu yerda to'lanadi.
                </p>
              </div>
            </div>
          )}

          <h2 className="font-display font-semibold text-foreground mb-3">To'lovlar tarixi</h2>
          {history.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">Hali to'lovlar yo'q</div>
          ) : (
            <div className="rounded-2xl border border-border bg-card divide-y divide-border">
              {history.map((h) => (
                <div key={h.key} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {h.amount >= 0
                      ? <ArrowDownLeft className="w-4 h-4 text-emerald-600 shrink-0" />
                      : <ArrowUpRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                    <div className="min-w-0">
                      <div className="text-sm text-foreground truncate">{h.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(h.at).toLocaleString()}{h.note ? ` · ${h.note}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className={`text-sm font-semibold shrink-0 ${h.amount > 0 ? "text-emerald-600" : "text-foreground"}`}>
                    {h.amount > 0 ? "+" : h.amount < 0 ? "−" : ""}{formatUzs(Math.abs(h.amount))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default WalletPage;
