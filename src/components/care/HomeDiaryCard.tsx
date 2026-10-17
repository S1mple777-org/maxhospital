import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Crown, Home, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { METRIC_BY_KEY, type Lang, type MetricKey } from "@/lib/aiAssistant";
import { addHomeMeasurements, deleteMeasurement, type HomeAlert } from "@/lib/care";

const FIELDS: MetricKey[] = ["bp_systolic", "bp_diastolic", "pulse", "glucose", "temperature", "spo2", "weight"];
const SHORT: Partial<Record<MetricKey, string>> = {
  bp_systolic: "Bosim (yuqori)", bp_diastolic: "Bosim (pastki)", pulse: "Puls", glucose: "Qand", temperature: "Harorat", spo2: "SpO₂", weight: "Vazn",
};

interface Row { id?: string; metric: string; value: number; measured_at: string; source?: string }

/** Pro / Premium: the patient enters home readings; dangerous values are flagged at once. */
const HomeDiaryCard = ({ enabled, language, rows, onSaved }: { enabled: boolean; language: Lang; rows: Row[]; onSaved: () => void }) => {
  const [values, setValues] = useState<Partial<Record<MetricKey, string>>>({});
  const [saving, setSaving] = useState(false);
  const [alerts, setAlerts] = useState<HomeAlert[]>([]);
  const recent = rows.filter((r) => r.source === "home").slice(-12).reverse();

  if (!enabled) {
    return (
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
        <div className="flex items-center gap-2 font-semibold text-foreground"><Home className="w-5 h-5 text-primary" /> Uy o'lchovlari kundaligi</div>
        <p className="text-sm text-muted-foreground mt-1">
          Bosim, qand, puls va boshqalarni uyda o'zingiz kiriting. Xavfli qiymat bo'lsa, sayt va Telegram darhol ogohlantiradi.
          Haftalik AI hisobot ham shu ma'lumotlardan tuziladi.
        </p>
        <Link to="/pro" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-hero-gradient px-4 py-2 text-sm font-semibold text-primary-foreground">
          <Crown className="w-4 h-4" /> Pro va Premium'da
        </Link>
      </div>
    );
  }

  const submit = async () => {
    const items = FIELDS.filter((k) => (values[k] ?? "").trim() !== "").map((k) => ({ metric: k, value: Number(values[k]!.replace(",", ".")) }));
    if (!items.length) { toast.error("Kamida bitta ko'rsatkich kiriting"); return; }
    setSaving(true);
    try {
      const r = await addHomeMeasurements({ items, language });
      setAlerts(r.alerts);
      setValues({});
      if (r.alerts.some((a) => a.level === "danger")) toast.error("Xavfli ko'rsatkich! Pastdagi tavsiyani o'qing.");
      else if (r.alerts.length) toast.warning("Ko'rsatkich me'yordan chiqdi");
      else toast.success("Saqlandi");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id?: string) => {
    if (!id || !confirm("Bu o'lchov o'chirilsinmi?")) return;
    try { await deleteMeasurement(id); onSaved(); } catch (e: any) { toast.error(e.message); }
  };

  const danger = alerts.some((a) => a.level === "danger");

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2 font-semibold text-foreground mb-3"><Home className="w-5 h-5 text-primary" /> Uy o'lchovi qo'shish</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {FIELDS.map((k) => (
          <label key={k} className="text-xs text-muted-foreground">
            {SHORT[k]} <span className="opacity-70">({METRIC_BY_KEY[k].unit})</span>
            <input
              inputMode="decimal"
              value={values[k] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
              placeholder={METRIC_BY_KEY[k].normal ? `${METRIC_BY_KEY[k].normal![0]}–${METRIC_BY_KEY[k].normal![1]}` : ""}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm"
            />
          </label>
        ))}
      </div>
      <button onClick={submit} disabled={saving} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Saqlash
      </button>

      {alerts.length > 0 && (
        <div className={`mt-3 rounded-xl border p-3 text-sm ${danger ? "border-red-500/50 bg-red-500/10" : "border-amber-500/50 bg-amber-500/10"}`}>
          <div className={`flex items-center gap-2 font-semibold ${danger ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}>
            <AlertTriangle className="w-4 h-4" /> {danger ? "Xavfli ko'rsatkich" : "Me'yordan chiqdi"}
          </div>
          <ul className="mt-1 text-foreground">
            {alerts.map((a) => <li key={a.metric}>• {METRIC_BY_KEY[a.metric].label[language]}: {a.value} {METRIC_BY_KEY[a.metric].unit}</li>)}
          </ul>
          <p className="mt-1 text-muted-foreground">
            {danger
              ? "O'zingizni yomon his qilsangiz, darhol 103 ga qo'ng'iroq qiling. Aks holda bugunoq shifokorga murojaat qiling."
              : "O'lchovni 15–30 daqiqadan keyin takrorlang. Qiymat yana shunday bo'lsa, shifokor bilan maslahatlashing."}
          </p>
          {danger && <a href="tel:103" className="mt-2 inline-flex rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white">103 ga qo'ng'iroq</a>}
        </div>
      )}

      {recent.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-medium text-muted-foreground mb-1">Oxirgi uy o'lchovlari</div>
          <div className="divide-y divide-border rounded-xl border border-border">
            {recent.map((r) => {
              const def = METRIC_BY_KEY[r.metric as MetricKey];
              return (
                <div key={r.id ?? `${r.metric}-${r.measured_at}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate text-foreground">{def?.label[language] ?? r.metric}: <b>{r.value}</b> {def?.unit}</span>
                  <span className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                    {new Date(r.measured_at).toLocaleString([], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    <button onClick={() => remove(r.id)} aria-label="O'chirish" className="p-1 rounded text-destructive hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5" /></button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeDiaryCard;
