import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Crown, Loader2, Scale, Send } from "lucide-react";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePlanStatus } from "@/lib/planPerks";
import { METRIC_BY_KEY, type MetricKey } from "@/lib/aiAssistant";
import {
  answerSecondOpinion, loadMySecondOpinions, loadSecondOpinionRequests, requestSecondOpinion, VERDICTS,
  type SecondOpinion, type SecondOpinionRequest,
} from "@/lib/care";

type Verdict = "agree" | "partly" | "disagree";

/** Doctor side: requests from other doctors' patients (no patient name), answer with a verdict. */
const DoctorRequests = () => {
  const [rows, setRows] = useState<SecondOpinionRequest[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { verdict: Verdict; text: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const load = () => loadSecondOpinionRequests().then(setRows).catch((e) => { toast.error(e.message); setRows([]); });
  useEffect(() => { void load(); }, []);

  const submit = async (id: string) => {
    const d = drafts[id];
    if (!d || d.text.trim().length < 20) { toast.error("Javob kamida 20 belgi bo'lsin"); return; }
    setBusy(id);
    try { await answerSecondOpinion(id, d.verdict, d.text); toast.success("Javob yuborildi"); await load(); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(null); }
  };

  if (rows === null) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!rows.length) return <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">Hozircha ikkinchi fikr so'rovlari yo'q</div>;

  return (
    <div className="space-y-4">
      {rows.map((r) => {
        const d = drafts[r.id] ?? { verdict: "agree" as Verdict, text: "" };
        return (
          <div key={r.id} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()} · {r.department_name ?? "—"}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.status === "pending" ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"}`}>
                {r.status === "pending" ? "Kutmoqda" : "Javob berilgan"}
              </span>
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              Birinchi shifokor: {r.original_doctor_title ?? "—"}{r.patient_birth_year ? ` · bemor ${r.patient_birth_year}-yil tug'ilgan` : ""}
            </div>
            <div className="mt-3 rounded-xl bg-secondary/50 p-3 text-sm">
              <div><span className="text-muted-foreground">Tashxis:</span> <b className="text-foreground">{r.diagnosis ?? "—"}</b></div>
              {(r.medicines ?? []).length > 0 && (
                <ul className="mt-1 text-foreground">
                  {(r.medicines ?? []).map((m, i) => <li key={i}>• {m.name} {m.dose} {m.frequency ? `— ${m.frequency}` : ""} {m.duration ? `(${m.duration})` : ""}</li>)}
                </ul>
              )}
              {r.notes && <div className="mt-1 text-muted-foreground break-words">Izoh: {r.notes}</div>}
              {(r.measurements ?? []).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(r.measurements ?? []).slice(0, 8).map((m, i) => (
                    <span key={i} className="rounded-full bg-background px-2 py-0.5 text-xs text-foreground border border-border">
                      {METRIC_BY_KEY[m.metric as MetricKey]?.label.uz ?? m.metric}: {m.value} {m.unit}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {r.question && <div className="mt-2 text-sm text-foreground"><span className="text-muted-foreground">Bemor savoli:</span> {r.question}</div>}

            {r.status === "pending" ? (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(VERDICTS) as Verdict[]).map((v) => (
                    <button key={v} onClick={() => setDrafts({ ...drafts, [r.id]: { ...d, verdict: v } })}
                      className={`rounded-full px-3 py-1 text-xs font-medium border ${d.verdict === v ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground"}`}>
                      {VERDICTS[v].label}
                    </button>
                  ))}
                </div>
                <textarea value={d.text} onChange={(e) => setDrafts({ ...drafts, [r.id]: { ...d, text: e.target.value } })} rows={4} maxLength={4000}
                  placeholder="Tashxis va davolash bo'yicha fikringiz: nima to'g'ri, nimani o'zgartirish yoki qo'shimcha tekshirish kerak"
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm resize-none" />
                <button onClick={() => submit(r.id)} disabled={busy === r.id} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                  {busy === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Javob yuborish
                </button>
              </div>
            ) : (
              <div className="mt-3 text-sm">
                {r.verdict && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${VERDICTS[r.verdict].cls}`}>{VERDICTS[r.verdict].label}</span>}
                <p className="mt-1 text-foreground whitespace-pre-line">{r.answer}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

/** Patient side: pick a finished consultation with a prescription and ask another doctor. */
const PatientRequests = () => {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const { status, refresh } = usePlanStatus(!!user);
  const [rx, setRx] = useState<any[] | null>(null);
  const [mine, setMine] = useState<SecondOpinion[]>([]);
  const [chosen, setChosen] = useState<string>(params.get("consultation") ?? "");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [{ data }, so] = await Promise.all([
      supabase.from("prescriptions").select("id, consultation_id, diagnosis, doctor_name, created_at").order("created_at", { ascending: false }).limit(30),
      loadMySecondOpinions(),
    ]);
    setRx(data ?? []);
    setMine(so);
  };
  useEffect(() => { if (user) void load(); }, [user]);

  const limit = status?.limits.second_opinions_monthly ?? 0;
  const left = Math.max(0, limit - (status?.usage.second_opinions_month ?? 0));
  const asked = new Set(mine.map((m) => m.consultation_id));

  const submit = async () => {
    if (!chosen) { toast.error("Retseptni tanlang"); return; }
    setBusy(true);
    try {
      await requestSecondOpinion(chosen, question);
      toast.success("So'rov yuborildi. Boshqa shifokor ko'rib chiqqach, xabar keladi.");
      setQuestion(""); setChosen("");
      await Promise.all([load(), refresh()]);
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      {status && limit === 0 ? (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
          <Crown className="w-8 h-8 mx-auto text-amber-500 mb-2" />
          <p className="text-sm text-muted-foreground mb-4">Ikkinchi fikr Premium tarifida: oyiga 1 marta boshqa shifokor tashxis va retseptingizni bepul ko'rib chiqadi.</p>
          <Link to="/pro" className="inline-flex items-center gap-2 rounded-xl bg-hero-gradient px-5 py-2.5 text-sm font-semibold text-primary-foreground"><Crown className="w-4 h-4" /> Tariflar</Link>
        </div>
      ) : status && (
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="font-display font-semibold text-foreground">Yangi so'rov</h2>
            <span className="text-xs text-muted-foreground">Bu oy qolgan: {left} / {limit}</span>
          </div>
          {rx === null ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : rx.length === 0 ? (
            <p className="text-sm text-muted-foreground">Hali retseptlaringiz yo'q.</p>
          ) : (
            <>
              <select value={chosen} onChange={(e) => setChosen(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm">
                <option value="">Retseptni tanlang</option>
                {rx.filter((r) => !asked.has(r.consultation_id)).map((r) => (
                  <option key={r.id} value={r.consultation_id}>{new Date(r.created_at).toLocaleDateString()} · {r.diagnosis} · {r.doctor_name}</option>
                ))}
              </select>
              <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} maxLength={1000}
                placeholder="Nimani aniqlashtirmoqchisiz? (ixtiyoriy) Masalan: dori dozasi to'g'rimi, qo'shimcha tekshiruv kerakmi?"
                className="mt-2 w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground text-sm resize-none" />
              <button onClick={submit} disabled={busy || left === 0} className="mt-2 inline-flex items-center gap-2 rounded-xl bg-hero-gradient px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scale className="w-4 h-4" />} Ikkinchi fikr so'rash
              </button>
            </>
          )}
        </div>
      )}

      {mine.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-display font-semibold text-foreground">Mening so'rovlarim</h2>
          {mine.map((m) => {
            const r = rx?.find((x) => x.consultation_id === m.consultation_id);
            return (
              <div key={m.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{r ? `${r.diagnosis} · ${r.doctor_name}` : "Retsept"}</span>
                  {m.status === "pending"
                    ? <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">Shifokor ko'rib chiqmoqda</span>
                    : m.verdict && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${VERDICTS[m.verdict].cls}`}>{VERDICTS[m.verdict].label}</span>}
                </div>
                {m.question && <p className="mt-1 text-xs text-muted-foreground">Savolingiz: {m.question}</p>}
                {m.answer && <p className="mt-2 text-sm text-foreground whitespace-pre-line">{m.answer}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const SecondOpinionPage = () => {
  const { user, loading, hasRole } = useAuth();
  const navigate = useNavigate();
  const isDoctor = hasRole("doctor");
  const [tab, setTab] = useState<"doctor" | "patient">("patient");
  useEffect(() => {
    if (loading) return;
    if (!user) navigate("/auth");
    else if (isDoctor) setTab("doctor");
  }, [user, loading, isDoctor]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="flex items-start gap-3 mb-6">
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Scale className="w-5 h-5 text-primary" /></div>
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground">Ikkinchi fikr</h1>
              <p className="text-sm text-muted-foreground">Boshqa shifokor tashxis va retseptni mustaqil ko'rib chiqadi va o'z xulosasini yozadi.</p>
            </div>
          </div>
          {isDoctor && (
            <div className="mb-4 inline-flex rounded-xl border border-border bg-card p-1">
              <button onClick={() => setTab("doctor")} className={`px-3 py-1.5 rounded-lg text-sm ${tab === "doctor" ? "bg-primary text-primary-foreground" : "text-foreground"}`}>Shifokor sifatida</button>
              <button onClick={() => setTab("patient")} className={`px-3 py-1.5 rounded-lg text-sm ${tab === "patient" ? "bg-primary text-primary-foreground" : "text-foreground"}`}>Bemor sifatida</button>
            </div>
          )}
          {user && (tab === "doctor" && isDoctor ? <DoctorRequests /> : <PatientRequests />)}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default SecondOpinionPage;
