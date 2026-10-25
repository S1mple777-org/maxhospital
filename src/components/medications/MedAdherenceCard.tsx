import { useEffect, useState } from "react";
import { Flame, TrendingUp } from "lucide-react";
import { loadAdherence, type Adherence } from "@/lib/medications";

const WEEKDAY = ["Ya", "Du", "Se", "Ch", "Pa", "Ju", "Sh"];

/** "Bu hafta: 86% · 🔥 4 kun ketma-ket" + 7-day bars + medicines that are skipped most. */
const MedAdherenceCard = ({ refreshKey = 0 }: { refreshKey?: number }) => {
  const [a, setA] = useState<Adherence | null>(null);
  const [days, setDays] = useState(7);
  useEffect(() => { loadAdherence(days).then(setA); }, [days, refreshKey]);
  if (!a || a.total === 0) return null;

  const pct = a.percent ?? 0;
  const color = pct >= 90 ? "text-emerald-600" : pct >= 70 ? "text-amber-600" : "text-destructive";
  const byDay = new Map(a.by_day.map((d) => [d.day, d]));
  const today = new Date();
  const lastDays = Array.from({ length: Math.min(days, 14) }, (_, i) => {
    const d = new Date(today.getTime() - (Math.min(days, 14) - 1 - i) * 86_400_000);
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(d);
    return { key, label: WEEKDAY[d.getDay()], v: byDay.get(key) };
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-4 mb-6">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" /> Dori ichish statistikasi</p>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="text-xs rounded-lg border border-input bg-background px-2 py-1">
          <option value={7}>7 kun</option><option value={30}>30 kun</option>
        </select>
      </div>
      <div className="mt-3 flex items-end gap-4">
        <div>
          <div className={`text-3xl font-display font-bold ${color}`}>{pct}%</div>
          <div className="text-xs text-muted-foreground">{a.taken} / {a.total} ichildi</div>
        </div>
        {a.streak > 0 && (
          <div className="mb-1 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700">
            <Flame className="w-3.5 h-3.5" /> {a.streak} kun ketma-ket
          </div>
        )}
      </div>
      <div className="mt-3 flex items-end gap-1 h-14">
        {lastDays.map(({ key, label, v }) => {
          const h = v && v.total ? Math.max(8, Math.round((v.taken / v.total) * 100)) : 0;
          const full = v && v.total && v.taken === v.total;
          return (
            <div key={key} className="flex-1 flex flex-col items-center gap-1" title={v ? `${v.taken}/${v.total}` : "dori yo'q"}>
              <div className="w-full h-10 rounded bg-muted/50 flex items-end overflow-hidden">
                <div className={`w-full ${full ? "bg-emerald-500" : "bg-amber-500"}`} style={{ height: `${h}%` }} />
              </div>
              <span className="text-[9px] text-muted-foreground">{label}</span>
            </div>
          );
        })}
      </div>
      {a.by_medicine.some((m) => m.percent < 100) && (
        <div className="mt-3 space-y-1">
          {a.by_medicine.filter((m) => m.percent < 100).slice(0, 3).map((m) => (
            <p key={m.name} className="text-xs text-muted-foreground">
              <span className="text-foreground font-medium">{m.name}</span>: {m.taken}/{m.total} ({m.percent}%)
            </p>
          ))}
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">Ichish foizi shifokoringizga ham ko'rinadi (retsept bo'yicha). Bu sizning davolanishingiz samarasini oshiradi.</p>
    </div>
  );
};

export default MedAdherenceCard;
