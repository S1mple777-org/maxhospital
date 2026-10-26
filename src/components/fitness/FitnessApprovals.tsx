import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Check, ChevronDown, X } from "lucide-react";
import { toast } from "sonner";
import {
  CONDITION_UZ, GOAL_UZ, LEVEL_UZ, WEEKDAY_UZ, generatePlan, loadDoctorFitness, reviewFitnessPlan,
  type DoctorFitnessRow,
} from "@/lib/fitness";

function Row({ r, onDone }: { r: DoctorFitnessRow; onDone: () => void }) {
  const [open, setOpen] = useState(r.status === "pending_doctor");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const plan = useMemo(() => generatePlan(r.questionnaire), [r.questionnaire]);
  const q = r.questionnaire;
  const w1 = plan.weeks[0], w3 = plan.weeks[2];

  const review = async (approve: boolean) => {
    if (!approve && !note.trim()) { toast.error("Rad etish sababini yozing"); return; }
    setBusy(true);
    try { await reviewFitnessPlan(r.plan_id, approve, note); toast.success(approve ? "Tasdiqlandi" : "Rad etildi"); onDone(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className={`bg-card rounded-xl border p-3 ${r.status === "pending_doctor" ? "border-amber-500/50" : r.last_pain ? "border-rose-500/50" : "border-border"}`}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 text-left">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground truncate flex items-center gap-1.5">
            {r.last_pain && <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}{r.patient_name}
          </p>
          <p className="text-xs text-muted-foreground">
            {r.status === "pending_doctor" ? "⏳ Tasdiq kutmoqda" : `Faol · ${r.sessions} ta mashq${r.avg_rpe ? ` · o'rtacha qiyinlik ${r.avg_rpe}/10` : ""}`}
          </p>
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-3 space-y-2 text-xs text-muted-foreground">
          {r.risk_reasons.length > 0 && <p className="text-amber-700 dark:text-amber-400"><b>Xavf:</b> {r.risk_reasons.join(", ")}</p>}
          <p><b className="text-foreground">Bemor:</b> {q.age} yosh{q.height_cm && q.weight_kg ? `, ${q.height_cm} sm / ${q.weight_kg} kg` : ""} · {LEVEL_UZ[q.level]} · maqsad: {GOAL_UZ[q.goal]}</p>
          {q.conditions.length > 0 && <p><b className="text-foreground">Kasalliklar:</b> {q.conditions.map((c) => CONDITION_UZ[c]).join(", ")}{q.beta_blocker ? " · beta-bloker" : ""}</p>}
          <p><b className="text-foreground">Reja:</b> {plan.days.map((d) => WEEKDAY_UZ[d]).join(", ")} · aerob {w1.aerobic_minutes_week}→{w3.aerobic_minutes_week} daq/hafta · RPE ≤ {plan.intensity.rpe[1]}{plan.intensity.hr ? ` · puls ${plan.intensity.hr[0]}–${plan.intensity.hr[1]}` : " · puls zonasiz"}</p>
          <p><b className="text-foreground">Kuch mashqlari:</b> {[...new Set(w1.sessions.flatMap((s) => s.items.filter((i) => i.kind === "strength").map((i) => i.name)))].join(", ") || "—"}</p>
          {r.status === "pending_doctor" && (
            <>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000}
                placeholder="Izoh bemorga (rad etishda majburiy). Masalan: «Puls 110 dan oshmasin»"
                className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm resize-none" />
              <div className="flex gap-2">
                <button disabled={busy} onClick={() => review(true)} className="flex-1 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium flex items-center justify-center gap-1 disabled:opacity-60"><Check className="w-4 h-4" /> Tasdiqlash</button>
                <button disabled={busy} onClick={() => review(false)} className="flex-1 py-2 rounded-lg border border-rose-500/50 text-rose-600 text-sm font-medium flex items-center justify-center gap-1 disabled:opacity-60"><X className="w-4 h-4" /> Rad etish</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Shifokor kabineti: bemorlarning fitness rejalarini tasdiqlash va kuzatish. */
const FitnessApprovals = () => {
  const [rows, setRows] = useState<DoctorFitnessRow[] | null>(null);
  const load = () => loadDoctorFitness().then(setRows);
  useEffect(() => { load(); }, []);
  if (!rows || rows.length === 0) return null;
  const pending = rows.filter((r) => r.status === "pending_doctor").length;
  return (
    <div className="mb-8">
      <h2 className="font-display font-semibold text-foreground mb-3 flex items-center gap-2">
        <Activity className="w-4 h-4 text-primary" /> Fitness rejalar
        {pending > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700">{pending} ta tasdiq kutmoqda</span>}
      </h2>
      <div className="space-y-2">{rows.map((r) => <Row key={r.plan_id} r={r} onDone={load} />)}</div>
    </div>
  );
};

export default FitnessApprovals;
