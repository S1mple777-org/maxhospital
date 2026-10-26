import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Activity, AlertTriangle, Bell, CheckCircle2, ChevronDown, Clock, Dumbbell, HeartPulse, Loader2,
  RefreshCw, ShieldCheck, Stethoscope, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import {
  CONDITION_UZ, GOAL_UZ, LEVEL_UZ, PLACE_UZ, RED_FLAG_UZ, WEEKDAY_UZ,
  archiveFitnessPlan, generatePlan, livePlan, nextTrainingDay, loadMyDoctors, loadMyFitness, logFitnessSession,
  passportDefaults, planDayInfo, riskReasons, saveFitnessPlan, setFitnessReminder, todayTashkent,
  type ActivityLevel, type Condition, type ExerciseItem, type FitnessAnswers, type FitnessPlan,
  type FitnessPlanRow, type FitnessSession, type FitnessSessionRow, type Goal, type MyDoctor, type Place, type RedFlag,
} from "@/lib/fitness";

const DEFAULT: FitnessAnswers = {
  age: 30, sex: null, height_cm: null, weight_kg: null, level: "light", goal: "health",
  days_per_week: 3, minutes_per_session: 30, place: "outdoor", conditions: [], red_flags: [], beta_blocker: false,
};

const card = "bg-card border border-border rounded-2xl p-4 sm:p-5";
const chip = (on: boolean) =>
  `px-3 py-2 rounded-xl border text-sm text-left transition-colors ${on ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-secondary"}`;

function dose(it: ExerciseItem): string {
  if (it.minutes) return `${it.minutes} daqiqa`;
  if (it.sets && it.reps) return `${it.sets} × ${it.reps} marta`;
  if (it.sets && it.seconds) return `${it.sets} × ${it.seconds} soniya`;
  return "";
}

function SessionList({ s }: { s: FitnessSession }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ol className="space-y-1.5">
      {s.items.map((it, i) => (
        <li key={`${it.id}-${i}`} className="rounded-xl border border-border">
          <button onClick={() => setOpen(open === `${i}` ? null : `${i}`)} className="w-full flex items-center gap-3 px-3 py-2 text-left">
            <span className="w-6 h-6 rounded-full bg-secondary text-xs flex items-center justify-center shrink-0">{i + 1}</span>
            <span className="flex-1 text-sm text-foreground">{it.name}</span>
            <span className="text-xs font-medium text-primary whitespace-nowrap">{dose(it)}</span>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open === `${i}` ? "rotate-180" : ""}`} />
          </button>
          {open === `${i}` && (
            <p className="px-3 pb-3 pl-12 text-xs text-muted-foreground">
              {it.how}{it.note ? ` ${it.note}.` : ""}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

function PlanDetails({ plan, defaultWeek = 0 }: { plan: FitnessPlan; defaultWeek?: number }) {
  const [week, setWeek] = useState(defaultWeek);
  const w = plan.weeks[week];
  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        {plan.weeks.map((x, i) => (
          <button key={x.week} onClick={() => setWeek(i)} className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${i === week ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
            {x.week}-hafta
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Aerob mashq: haftasiga <b className="text-foreground">{w.aerobic_minutes_week} daqiqa</b>
        {week === 3 ? " · yengillashtirilgan hafta (tana tiklanadi)" : ""}
      </p>
      {w.sessions.map((s, i) => (
        <div key={i}>
          <p className="text-sm font-semibold text-foreground mb-2">
            {WEEKDAY_UZ[plan.days[i]]} — {s.label} <span className="text-xs font-normal text-muted-foreground">· ~{s.total_minutes} daq</span>
          </p>
          <SessionList s={s} />
        </div>
      ))}
    </div>
  );
}

function SafetyCard({ plan }: { plan: FitnessPlan }) {
  return (
    <div className={card}>
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3"><HeartPulse className="w-4 h-4 text-rose-500" /> Qanchalik qattiq?</h3>
      <ul className="text-sm text-muted-foreground space-y-1.5">
        <li>• {plan.intensity.talk_test}</li>
        <li>• His-tuyg'u bo'yicha: 10 ballik shkalada <b className="text-foreground">{plan.intensity.rpe[0]}–{plan.intensity.rpe[1]}</b> (yengil-o'rtacha)</li>
        {plan.intensity.hr
          ? <li>• Puls: <b className="text-foreground">{plan.intensity.hr[0]}–{plan.intensity.hr[1]}</b> zarba/daqiqa (MaxBand yoki soat bilan kuzating)</li>
          : <li>• Puls zonasi berilmadi — yuklamani his-tuyg'u bo'yicha boshqaring.</li>}
      </ul>
      {plan.precautions.length > 0 && (
        <>
          <h4 className="text-xs font-semibold text-foreground mt-4 mb-2">Siz uchun ehtiyot choralari</h4>
          <ul className="text-xs text-muted-foreground space-y-1.5">{plan.precautions.map((p) => <li key={p}>• {p}</li>)}</ul>
        </>
      )}
      <div className="mt-4 rounded-xl bg-rose-500/10 border border-rose-500/30 p-3">
        <p className="text-xs font-semibold text-rose-700 dark:text-rose-400 mb-1">Darhol to'xtating, agar:</p>
        <p className="text-xs text-rose-700/90 dark:text-rose-300">{plan.stop_signs.join(" · ")}. Ko'krak og'rig'i o'tmasa — <b>103</b>.</p>
      </div>
      {plan.who_note && <p className="text-xs text-muted-foreground mt-3">ℹ️ {plan.who_note}</p>}
      <p className="text-[11px] text-muted-foreground mt-3">Manba: {plan.sources.join("; ")}. Reja shifokor maslahati o'rnini bosmaydi.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Anketa
// ---------------------------------------------------------------------------
function Questionnaire({ initial, onDone }: { initial: FitnessAnswers; onDone: (a: FitnessAnswers) => void }) {
  const [a, setA] = useState<FitnessAnswers>(initial);
  const set = <K extends keyof FitnessAnswers>(k: K, v: FitnessAnswers[K]) => setA((x) => ({ ...x, [k]: v }));
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const num = (v: string) => (v === "" ? null : Number(v));
  const valid = a.age >= 14 && a.age <= 100;

  return (
    <div className="space-y-4">
      <div className={card}>
        <h3 className="text-sm font-semibold text-foreground mb-1">1. Siz haqingizda</h3>
        <p className="text-xs text-muted-foreground mb-3">Passport'dan olindi — tekshirib chiqing.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <label className="text-xs text-muted-foreground">Yosh
            <input type="number" min={14} max={100} value={a.age || ""} onChange={(e) => set("age", Number(e.target.value))}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm" /></label>
          <label className="text-xs text-muted-foreground">Bo'y (sm)
            <input type="number" value={a.height_cm ?? ""} onChange={(e) => set("height_cm", num(e.target.value))}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm" /></label>
          <label className="text-xs text-muted-foreground">Vazn (kg)
            <input type="number" value={a.weight_kg ?? ""} onChange={(e) => set("weight_kg", num(e.target.value))}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm" /></label>
          <label className="text-xs text-muted-foreground">Jins
            <select value={a.sex ?? ""} onChange={(e) => set("sex", (e.target.value || null) as FitnessAnswers["sex"])}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm">
              <option value="">—</option><option value="male">Erkak</option><option value="female">Ayol</option>
            </select></label>
        </div>
        {!valid && <p className="text-xs text-destructive mt-2">Yosh 14 dan 100 gacha bo'lsin.</p>}
      </div>

      <div className={card}>
        <h3 className="text-sm font-semibold text-foreground mb-3">2. Hozir qanchalik harakat qilasiz?</h3>
        <div className="grid sm:grid-cols-2 gap-2">
          {(Object.keys(LEVEL_UZ) as ActivityLevel[]).map((k) => (
            <button key={k} onClick={() => set("level", k)} className={chip(a.level === k)}>{LEVEL_UZ[k]}</button>
          ))}
        </div>
        <h3 className="text-sm font-semibold text-foreground mt-4 mb-3">Maqsadingiz</h3>
        <div className="grid sm:grid-cols-2 gap-2">
          {(Object.keys(GOAL_UZ) as Goal[]).map((k) => (
            <button key={k} onClick={() => set("goal", k)} className={chip(a.goal === k)}>{GOAL_UZ[k]}</button>
          ))}
        </div>
        <div className="grid sm:grid-cols-3 gap-3 mt-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Haftasiga necha kun?</p>
            <div className="flex gap-1">{[2, 3, 4, 5, 6].map((n) => (
              <button key={n} onClick={() => set("days_per_week", n)} className={`flex-1 ${chip(a.days_per_week === n)} text-center px-0`}>{n}</button>
            ))}</div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Bir mashg'ulot</p>
            <div className="flex gap-1">{[15, 30, 45, 60].map((n) => (
              <button key={n} onClick={() => set("minutes_per_session", n)} className={`flex-1 ${chip(a.minutes_per_session === n)} text-center px-0`}>{n}′</button>
            ))}</div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Qayerda?</p>
            <select value={a.place} onChange={(e) => set("place", e.target.value as Place)}
              className="w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground text-sm">
              {(Object.keys(PLACE_UZ) as Place[]).map((k) => <option key={k} value={k}>{PLACE_UZ[k]}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className={card}>
        <h3 className="text-sm font-semibold text-foreground mb-3">3. Sog'lig'ingiz</h3>
        <div className="grid sm:grid-cols-2 gap-2">
          {(Object.keys(CONDITION_UZ) as Condition[]).filter((k) => k !== "pregnancy" || a.sex !== "male").map((k) => (
            <button key={k} onClick={() => set("conditions", toggle(a.conditions, k))} className={chip(a.conditions.includes(k))}>
              {a.conditions.includes(k) ? "✓ " : ""}{CONDITION_UZ[k]}
            </button>
          ))}
        </div>
        <label className="flex items-start gap-2 mt-3 text-sm text-foreground">
          <input type="checkbox" checked={a.beta_blocker} onChange={(e) => set("beta_blocker", e.target.checked)} className="mt-1" />
          <span>Pulsni sekinlashtiruvchi dori ichaman <span className="text-xs text-muted-foreground">(bisoprolol, metoprolol, konkor...)</span></span>
        </label>
      </div>

      <div className={card}>
        <h3 className="text-sm font-semibold text-foreground mb-1">4. Xavfsizlik savollari</h3>
        <p className="text-xs text-muted-foreground mb-3">Birortasiga "Ha" bo'lsa, rejani avval shifokoringiz tasdiqlaydi.</p>
        <div className="space-y-2">
          {(Object.keys(RED_FLAG_UZ) as RedFlag[]).filter((k) => k !== "pregnant" || a.sex !== "male").map((k) => {
            const yes = a.red_flags.includes(k);
            return (
              <div key={k} className="flex items-center gap-3">
                <p className="flex-1 text-sm text-foreground">{RED_FLAG_UZ[k]}</p>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => yes || set("red_flags", [...a.red_flags, k])} className={`px-3 py-1 rounded-lg text-xs border ${yes ? "border-rose-500 bg-rose-500/10 text-rose-700" : "border-border text-muted-foreground"}`}>Ha</button>
                  <button onClick={() => yes && set("red_flags", a.red_flags.filter((x) => x !== k))} className={`px-3 py-1 rounded-lg text-xs border ${!yes ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"}`}>Yo'q</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <button disabled={!valid} onClick={() => onDone(a)}
        className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-50 flex items-center justify-center gap-2">
        <Activity className="w-4 h-4" /> Rejani tuzish
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bugungi mashq
// ---------------------------------------------------------------------------
function TodayCard({ row, sessions, onLogged }: { row: FitnessPlanRow; sessions: FitnessSessionRow[]; onLogged: () => void }) {
  const plan = useMemo(() => livePlan(row), [row]);
  const today = todayTashkent();
  const info = planDayInfo(plan, row.start_date, today);
  const logged = sessions.find((s) => s.day === today);
  const [rpe, setRpe] = useState(5);
  const [pain, setPain] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const notStarted = today < row.start_date;
  const daysIn = Math.floor((Date.parse(today) - Date.parse(row.start_date)) / 86_400_000);
  const weekDone = sessions.filter((s) => s.week === info.week).length;

  const submit = async () => {
    setBusy(true);
    try {
      const r = await logFitnessSession(row.id, today, rpe, pain, note);
      if (r.reason === "pain") toast.warning("Yuklama kamaytirildi. Og'riq davom etsa, shifokorga murojaat qiling.");
      else if (r.reason === "hard") toast.info("O'tgan hafta og'ir bo'ldi — reja biroz yengillashtirildi.");
      else if (r.reason === "easy") toast.success("Zo'r! O'tgan hafta oson o'tdi — reja biroz oshirildi.");
      else toast.success("Bajarildi! Barakalla 💪");
      setAsking(false); onLogged();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className={card}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2"><Dumbbell className="w-5 h-5 text-primary" /> Bugungi mashq</h3>
        <span className="text-xs text-muted-foreground">{info.week}/4-hafta · {weekDone}/{plan.days.length} bajarildi</span>
      </div>
      {daysIn >= 28 && (
        <p className="text-xs rounded-xl bg-primary/10 text-foreground p-3 mb-3">🎉 4 haftalik reja tugadi. Pastdagi "Yangi reja" tugmasi bilan keyingi bosqichni tuzing — yuklama natijalaringizga moslab oshadi.</p>
      )}
      {notStarted ? (
        <p className="text-sm text-muted-foreground">Reja {row.start_date} dan boshlanadi.</p>
      ) : !info.isTraining ? (
        <p className="text-sm text-muted-foreground">Bugun dam olish kuni. Xohlasangiz 15–20 daqiqa sekin yuring. Keyingi mashq: {WEEKDAY_UZ[nextTrainingDay(plan.days, info.weekday)]}.</p>
      ) : (
        <>
          <p className="text-sm font-medium text-foreground mb-2">{plan.weeks[info.week - 1].sessions[info.sessionIndex].label}</p>
          <SessionList s={plan.weeks[info.week - 1].sessions[info.sessionIndex]} />
          {logged ? (
            <p className="mt-4 text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Bajarildi · qiyinlik {logged.rpe}/10{logged.pain ? " · og'riq qayd etildi" : ""}
            </p>
          ) : !asking ? (
            <button onClick={() => setAsking(true)} className="w-full mt-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium">✅ Bajarildi</button>
          ) : (
            <div className="mt-4 rounded-xl border border-border p-3 space-y-3">
              <div>
                <p className="text-sm text-foreground mb-1">Qanchalik qiyin bo'ldi? <b>{rpe}/10</b></p>
                <input type="range" min={1} max={10} value={rpe} onChange={(e) => setRpe(Number(e.target.value))} className="w-full" />
                <div className="flex justify-between text-[11px] text-muted-foreground"><span>juda oson</span><span>o'rtacha</span><span>juda og'ir</span></div>
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={pain} onChange={(e) => setPain(e.target.checked)} /> Mashq paytida og'riq bo'ldi
              </label>
              {pain && (
                <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} placeholder="Qayerda og'ridi?"
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm resize-none" />
              )}
              <button onClick={submit} disabled={busy} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60">
                {busy ? "Saqlanmoqda..." : "Saqlash"}
              </button>
            </div>
          )}
        </>
      )}
      <p className="text-[11px] text-muted-foreground mt-3">Reja sizga moslashadi: og'ir bo'lsa yengillashadi, oson bo'lsa asta oshadi. Joriy yuklama: {Math.round(Number(row.adapt_factor) * 100)}%.</p>
    </div>
  );
}

function ReminderCard({ row, onChange }: { row: FitnessPlanRow; onChange: () => void }) {
  const [time, setTime] = useState(row.reminder_time.slice(0, 5));
  const save = async (enabled: boolean, t = time) => {
    try { await setFitnessReminder(row.id, enabled, t); toast.success(enabled ? `Eslatma: mashq kunlari soat ${t}` : "Eslatma o'chirildi"); onChange(); }
    catch (e: any) { toast.error(e.message); }
  };
  return (
    <div className={`${card} flex items-center gap-3`}>
      <Bell className="w-5 h-5 text-primary shrink-0" />
      <div className="flex-1">
        <p className="text-sm text-foreground">Mashq kunlari eslatma (Telegram + sayt)</p>
        <p className="text-xs text-muted-foreground">{row.reminder_enabled ? "Yoqilgan" : "O'chirilgan"}</p>
      </div>
      <input type="time" value={time} onChange={(e) => setTime(e.target.value)} onBlur={() => row.reminder_enabled && time !== row.reminder_time.slice(0, 5) && save(true)}
        className="px-2 py-1.5 rounded-lg border border-input bg-background text-foreground text-sm" />
      <button onClick={() => save(!row.reminder_enabled)} className="text-xs px-3 py-1.5 rounded-lg border border-border text-foreground">
        {row.reminder_enabled ? "O'chirish" : "Yoqish"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
export default function FitnessPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(true);
  const [row, setRow] = useState<FitnessPlanRow | null>(null);
  const [sessions, setSessions] = useState<FitnessSessionRow[]>([]);
  const [mode, setMode] = useState<"view" | "form" | "preview">("view");
  const [answers, setAnswers] = useState<FitnessAnswers>(DEFAULT);
  const [doctors, setDoctors] = useState<MyDoctor[]>([]);
  const [doctorId, setDoctorId] = useState<string>("");
  const [reminder, setReminder] = useState("08:00");
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    const r = await loadMyFitness();
    setRow(r.plan); setSessions(r.sessions); setBusy(false);
    return r.plan;
  };

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate("/auth"); return; }
    (async () => {
      const [p, defs, docs] = await Promise.all([reload(), passportDefaults(), loadMyDoctors()]);
      setDoctors(docs);
      if (docs[0]) setDoctorId(docs[0].id);
      setAnswers((x) => ({ ...x, ...Object.fromEntries(Object.entries(defs).filter(([, v]) => v !== undefined && v !== null)) }));
      if (!p) setMode("form");
    })();
  }, [user, loading]);

  const preview = useMemo(() => (mode === "preview" ? generatePlan(answers) : null), [mode, answers]);
  const needsDoctor = preview ? riskReasons(answers).length > 0 : false;

  const save = async () => {
    if (!preview) return;
    if (needsDoctor && !doctorId) { toast.error("Shifokorni tanlang"); return; }
    setSaving(true);
    try {
      const r = await saveFitnessPlan(answers, preview, doctorId || null, reminder);
      toast.success(r.status === "pending_doctor" ? "Reja shifokorga yuborildi. Tasdiqlagach xabar olasiz." : "Reja tayyor! Bugundan boshlang 💪");
      await reload(); setMode("view"); window.scrollTo({ top: 0 });
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const stop = async () => {
    if (!row || !confirm("Rejani to'xtatasizmi?")) return;
    try { await archiveFitnessPlan(row.id); await reload(); setMode("form"); } catch (e: any) { toast.error(e.message); }
  };

  const startNew = () => {
    if (row) setAnswers(row.questionnaire);
    setMode("form"); window.scrollTo({ top: 0 });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-2xl space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Activity className="w-6 h-6 text-primary" /> Fitness reja</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Kasalliklaringiz, yoshingiz va dorilaringizga moslangan shaxsiy 4 haftalik reja. Xavf bo'lsa — shifokoringiz tasdiqlaydi.
            </p>
          </div>

          {busy || loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : mode === "form" ? (
            <>
              {row && <button onClick={() => setMode("view")} className="text-sm text-primary">← Joriy rejaga qaytish</button>}
              <Questionnaire initial={answers} onDone={(a) => { setAnswers(a); setMode("preview"); window.scrollTo({ top: 0 }); }} />
            </>
          ) : mode === "preview" && preview ? (
            <>
              <button onClick={() => setMode("form")} className="text-sm text-primary">← Anketani o'zgartirish</button>
              <div className={card}>
                <h3 className="text-base font-semibold text-foreground mb-1">Sizning rejangiz</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Mashq kunlari: {preview.days.map((d) => WEEKDAY_UZ[d]).join(", ")} · har biri ~{answers.minutes_per_session} daqiqa
                </p>
                <PlanDetails plan={preview} />
              </div>
              <SafetyCard plan={preview} />
              <div className={card}>
                {needsDoctor ? (
                  <>
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2"><Stethoscope className="w-4 h-4 text-amber-500" /> Shifokor tasdig'i kerak</h3>
                    <p className="text-xs text-muted-foreground mb-3">Sabab: {riskReasons(answers).join(", ")}. Shifokor rejani ko'rib, tasdiqlagach boshlaysiz.</p>
                    {doctors.length ? (
                      <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm mb-3">
                        {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}{d.title ? ` — ${d.title}` : ""}</option>)}
                      </select>
                    ) : (
                      <p className="text-sm text-foreground mb-3">Hali hech bir shifokor bilan konsultatsiya o'tkazmagansiz. <Link to="/start-consultation" className="text-primary font-medium">Konsultatsiya boshlash →</Link></p>
                    )}
                  </>
                ) : doctors.length > 0 && (
                  <label className="block text-xs text-muted-foreground mb-3">Shifokoringiz kuzatib borsinmi? (ixtiyoriy)
                    <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm">
                      <option value="">Yo'q</option>
                      {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </label>
                )}
                <label className="flex items-center gap-2 text-sm text-foreground mb-3"><Clock className="w-4 h-4 text-muted-foreground" /> Eslatma vaqti
                  <input type="time" value={reminder} onChange={(e) => setReminder(e.target.value)} className="ml-auto px-2 py-1.5 rounded-lg border border-input bg-background text-sm" />
                </label>
                <button onClick={save} disabled={saving || (needsDoctor && !doctors.length)}
                  className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-50">
                  {saving ? "Saqlanmoqda..." : needsDoctor ? "Shifokorga yuborish" : "Rejani boshlash"}
                </button>
              </div>
            </>
          ) : row ? (
            <>
              {row.status === "pending_doctor" && (
                <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 flex gap-3">
                  <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Shifokor tasdig'ini kutmoqda</p>
                    <p className="text-xs text-muted-foreground mt-1">Tasdiqlangach Telegram va saytda xabar olasiz. Sabab: {row.risk_reasons.join(", ")}.</p>
                  </div>
                </div>
              )}
              {row.status === "rejected" && (
                <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 flex gap-3">
                  <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Shifokor bu rejani tasdiqlamadi</p>
                    {row.doctor_note && <p className="text-sm text-foreground mt-1">"{row.doctor_note}"</p>}
                    <p className="text-xs text-muted-foreground mt-1">Shifokor tavsiyasiga ko'ra anketani o'zgartirib, yangi reja tuzing.</p>
                  </div>
                </div>
              )}
              {row.status === "active" && row.doctor_note && (
                <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-foreground">
                  <b>Shifokor izohi:</b> {row.doctor_note}
                </div>
              )}
              {row.status === "active" && <TodayCard row={row} sessions={sessions} onLogged={reload} />}
              {row.status === "active" && <ReminderCard row={row} onChange={reload} />}
              <div className={card}>
                <h3 className="text-sm font-semibold text-foreground mb-3">To'liq reja</h3>
                <PlanDetails plan={livePlan(row)} defaultWeek={Math.min(3, Math.max(0, planDayInfo(livePlan(row), row.start_date, todayTashkent()).week - 1))} />
              </div>
              <SafetyCard plan={livePlan(row)} />
              {sessions.length > 0 && (
                <div className={card}>
                  <h3 className="text-sm font-semibold text-foreground mb-2">Bajarilganlar</h3>
                  <ul className="text-sm divide-y divide-border">
                    {sessions.slice(0, 14).map((s) => (
                      <li key={s.id} className="py-1.5 flex justify-between text-muted-foreground">
                        <span>{s.day} · {s.week}-hafta</span>
                        <span className={s.pain ? "text-rose-600" : ""}>{s.rpe}/10{s.pain ? " · og'riq" : ""}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={startNew} className="flex-1 py-2.5 rounded-xl border border-primary/40 text-primary text-sm font-medium flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4" /> Yangi reja</button>
                {row.status !== "rejected" && <button onClick={stop} className="px-4 py-2.5 rounded-xl border border-border text-muted-foreground text-sm">To'xtatish</button>}
              </div>
            </>
          ) : null}

          <p className="text-[11px] text-muted-foreground flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Reja JSST tavsiyalari asosida kod bilan tuziladi va shifokor maslahati o'rnini bosmaydi.</p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
