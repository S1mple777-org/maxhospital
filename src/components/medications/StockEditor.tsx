import { useState } from "react";
import { Package } from "lucide-react";
import { toast } from "sonner";
import { setMedicationStock, stockDaysLeft, type MedicationSchedule } from "@/lib/medications";

/** "📦 12 ta qoldi · ~6 kun" with inline edit. Decreases on every "Ichdim"; warns at ~3 days. */
const StockEditor = ({ s, onSaved }: { s: MedicationSchedule; onSaved: () => void }) => {
  const [editing, setEditing] = useState(false);
  const [count, setCount] = useState(s.stock_count != null ? String(s.stock_count) : "");
  const [perDose, setPerDose] = useState(String(s.per_dose ?? 1));
  const [saving, setSaving] = useState(false);
  const days = stockDaysLeft(s);

  const save = async () => {
    const c = count.trim() === "" ? null : Number(count);
    const p = Number(perDose);
    if (c !== null && (!Number.isFinite(c) || c < 0)) { toast.error("Dori soni noto'g'ri"); return; }
    setSaving(true);
    try { await setMedicationStock(s.id, c, p); setEditing(false); onSaved(); }
    catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  if (editing) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1">Qutida:
          <input type="number" min={0} step={1} value={count} onChange={(e) => setCount(e.target.value)} placeholder="masalan 30"
            className="w-20 rounded-lg border border-input bg-background px-2 py-1" /> ta
        </label>
        <label className="flex items-center gap-1">Bir martada:
          <select value={perDose} onChange={(e) => setPerDose(e.target.value)} className="rounded-lg border border-input bg-background px-2 py-1">
            {["0.5", "1", "2", "3"].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        <button onClick={save} disabled={saving} className="rounded-lg bg-primary px-2.5 py-1 text-primary-foreground disabled:opacity-60">Saqlash</button>
        <button onClick={() => setEditing(false)} className="rounded-lg border border-border px-2.5 py-1">Bekor</button>
      </div>
    );
  }
  return (
    <button onClick={() => setEditing(true)} className={`mt-1 inline-flex items-center gap-1 text-xs ${days !== null && days <= 3 ? "text-destructive font-medium" : "text-muted-foreground hover:text-foreground"}`}>
      <Package className="w-3.5 h-3.5" />
      {s.stock_count == null ? "Qutidagi sonni kiriting (tugashidan oldin ogohlantiramiz)" : `${Number(s.stock_count)} ta qoldi${days !== null ? ` · ~${days} kunga` : ""}${days !== null && days <= 3 ? " — sotib oling" : ""}`}
    </button>
  );
};

export default StockEditor;
