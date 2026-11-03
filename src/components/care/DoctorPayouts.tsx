import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Row { doctor_id: string; name: string; amount: number; count: number }
const db = supabase as any;
const uzs = (n: number) => `${n.toLocaleString("ru-RU")} so'm`;

/** Owner/admin: shifokorlarga hisoblangan ulush — pulni bergach "To'landi" deb belgilanadi. */
const DoctorPayouts = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: earn } = await db.from("doctor_earnings").select("doctor_id, amount_uzs").eq("status", "accrued");
    const by = new Map<string, { amount: number; count: number }>();
    for (const e of earn ?? []) {
      const cur = by.get(e.doctor_id) ?? { amount: 0, count: 0 };
      by.set(e.doctor_id, { amount: cur.amount + Number(e.amount_uzs), count: cur.count + 1 });
    }
    const ids = [...by.keys()];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: docs } = await db.from("doctors").select("id, user_id").in("id", ids);
      const { data: profs } = await db.from("profiles").select("user_id, full_name").in("user_id", (docs ?? []).map((d: any) => d.user_id));
      const pn = new Map<string, string>((profs ?? []).map((p: any) => [p.user_id, p.full_name]));
      for (const d of docs ?? []) names.set(d.id, pn.get(d.user_id) ?? "Shifokor");
    }
    setRows(ids.map((id) => ({ doctor_id: id, name: names.get(id) ?? "Shifokor", ...by.get(id)! })).sort((a, b) => b.amount - a.amount));
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const pay = async (r: Row) => {
    if (!window.confirm(`${r.name}ga ${uzs(r.amount)} to'langanini tasdiqlaysizmi?`)) return;
    setBusy(r.doctor_id);
    const { error } = await db.rpc("mark_doctor_earnings_paid", { _doctor_id: r.doctor_id });
    setBusy(null);
    if (error) toast.error(error.message); else { toast.success("To'langan deb belgilandi"); void load(); }
  };

  return (
    <div>
      <h2 className="font-display text-xl font-bold text-foreground mb-1">Shifokorlar maoshi</h2>
      <p className="text-sm text-muted-foreground mb-4">Har yakunlangan konsultatsiya narxining ulushi hisoblanadi. Pulni shifokorga bergach, "To'landi" bosing.</p>
      {loading ? <p className="text-sm text-muted-foreground">Yuklanmoqda...</p> : !rows.length ? (
        <p className="text-sm text-muted-foreground">To'lanmagan hisob yo'q.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {rows.map((r) => (
            <li key={r.doctor_id} className="p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{r.name}</p>
                <p className="text-xs text-muted-foreground">{r.count} ta konsultatsiya</p>
              </div>
              <span className="text-sm font-bold text-foreground">{uzs(r.amount)}</span>
              <button disabled={busy === r.doctor_id} onClick={() => pay(r)} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50">To'landi</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default DoctorPayouts;
