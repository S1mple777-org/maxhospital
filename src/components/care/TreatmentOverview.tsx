import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, HeartPulse } from "lucide-react";
import { answerInfo, loadDoctorOverview, type OverviewRow } from "@/lib/treatment";

/** Doctor dashboard: how patients are doing after the prescriptions (last 30 days). */
const TreatmentOverview = () => {
  const [rows, setRows] = useState<OverviewRow[] | null>(null);
  useEffect(() => { loadDoctorOverview(30).then(setRows); }, []);
  if (!rows || rows.length === 0) return null;

  const answered = rows.filter((r) => r.answer);
  const count = (a: string) => answered.filter((r) => r.answer === a).length;

  return (
    <div className="mb-8">
      <h2 className="font-display font-semibold text-foreground mb-3 flex items-center gap-2"><HeartPulse className="w-4 h-4 text-primary" /> Davolanish natijalari <span className="text-xs font-normal text-muted-foreground">(so'nggi 30 kun)</span></h2>
      <div className="grid grid-cols-4 gap-2 mb-3 text-center">
        {[
          { label: "😀 Yaxshi", v: count("better") },
          { label: "😐 O'zgarmadi", v: count("same") },
          { label: "😟 Yomon", v: count("worse") },
          { label: "Javobsiz", v: rows.length - answered.length },
        ].map((s) => (
          <div key={s.label} className="bg-card rounded-xl border border-border p-2">
            <div className="text-lg font-bold text-foreground">{s.v}</div>
            <div className="text-[11px] text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {rows.slice(0, 12).map((r) => {
          const info = answerInfo(r.answer);
          const total = r.doses_taken + r.doses_skipped + r.doses_missed;
          return (
            <Link key={r.checkin_id} to={`/prescription/${r.prescription_id}`}
              className={`block bg-card rounded-xl border p-3 hover:bg-secondary/50 ${r.answer === "worse" ? "border-rose-500/50" : "border-border"}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-foreground truncate flex items-center gap-1.5">
                  {r.answer === "worse" && <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}{r.patient_name}
                </p>
                <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${info ? info.cls : "border-border text-muted-foreground"}`}>
                  {info ? `${info.emoji} ${info.label}` : "Javob kutilmoqda"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">{r.seq === 1 ? "3" : "7"}-kun · {r.diagnosis}</p>
              {r.note && <p className="text-xs text-foreground mt-1 break-words">«{r.note}»</p>}
              {total > 0 && <p className="text-[11px] text-muted-foreground mt-1">Dorilar: {r.doses_taken}/{total} ichildi{r.doses_skipped ? `, ${r.doses_skipped} o'tkazildi` : ""}</p>}
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default TreatmentOverview;
