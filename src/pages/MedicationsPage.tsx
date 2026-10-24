import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlarmClock, AlertTriangle, Check, CheckCircle2, Clock, Crown, FileUp, Loader2, Pill, Plus,
  SkipForward, Smartphone, Sparkles, StopCircle, Trash2, WifiOff, X,
} from "lucide-react";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { isNativeApp } from "@/lib/native";
import { cachedReminders, syncLocalReminders } from "@/lib/localReminders";
import {
  DEFAULT_ROUTINE, MAX_DAYS, MAX_TIMES_PER_DAY, cleanTimes, deleteSchedule, draftPlanWithAi, fileToBase64,
  loadReminders, loadSchedules, loadSubscription, localTime, markReminder, normalizeTime, planItemErrors,
  saveSchedules, stopSchedule, suggestNextTime, timesPerDay, todayInTashkent,
  type Channel, type MedicationReminder, type MedicationSchedule, type PlanId, type PlanItem, type Routine,
} from "@/lib/medications";
import { loadFamily, RELATIONS, type FamilyMember } from "@/lib/care";

type Source = "prescription" | "upload" | "manual";

const STATUS: Record<MedicationReminder["status"], { label: string; cls: string }> = {
  pending: { label: "Kutilmoqda", cls: "bg-muted text-muted-foreground" },
  sent: { label: "Eslatildi", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  taken: { label: "Ichildi", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  skipped: { label: "O'tkazildi", cls: "bg-slate-500/15 text-slate-600 dark:text-slate-300" },
  missed: { label: "Belgilanmadi", cls: "bg-red-500/10 text-red-700 dark:text-red-400" },
};

const emptyItem = (): PlanItem => ({
  medicine_name: "", dose: "", instructions: "", times: ["08:00"], days: 7,
  start_date: null, needs_confirmation: false, note: "",
});

const inputClass = "w-full px-3 py-2 rounded-xl border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring";

const MedicationsPage = () => {
  const { user, loading } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const native = isNativeApp();

  const [plan, setPlan] = useState<PlanId | null>(null);
  const [schedules, setSchedules] = useState<MedicationSchedule[]>([]);
  const [today, setToday] = useState<MedicationReminder[]>([]);
  const [offline, setOffline] = useState(false);

  // wizard
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [source, setSource] = useState<Source>("prescription");
  const [prescriptionId, setPrescriptionId] = useState<string>(params.get("prescription") ?? "");
  const [pdf, setPdf] = useState<File | null>(null);
  const [routine, setRoutine] = useState<Routine>(DEFAULT_ROUTINE);
  const [note, setNote] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState<PlanItem[] | null>(null);
  const [draftSource, setDraftSource] = useState<Source>("manual");
  const [draftPrescriptionId, setDraftPrescriptionId] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [channels, setChannels] = useState<Channel[]>(native ? ["web", "telegram", "app"] : ["web", "telegram"]);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [family, setFamily] = useState<FamilyMember[]>([]);
  const [forWhom, setForWhom] = useState("");
  useEffect(() => { if (user) loadFamily().then(setFamily); }, [user]);
  const memberName = (id?: string | null) => (id ? family.find((m) => m.id === id)?.full_name : null);

  const scheduleById = useMemo(() => new Map(schedules.map((s) => [s.id, s])), [schedules]);

  const loadAll = async () => {
    if (!user) return;
    if (!navigator.onLine) { setOffline(true); return; }
    const day = todayInTashkent();
    const from = new Date(`${day}T00:00:00+05:00`).toISOString();
    const to = new Date(new Date(from).getTime() + 86_400_000).toISOString();
    try {
      const [sub, sch, rem, rx] = await Promise.all([
        loadSubscription(user.id),
        loadSchedules(),
        loadReminders(from, to),
        supabase.from("prescriptions").select("id, diagnosis, doctor_name, created_at, medicines")
          .eq("patient_id", user.id).order("created_at", { ascending: false }),
      ]);
      setPlan(sub.plan);
      setSchedules(sch);
      setToday(rem);
      setPrescriptions(rx.data ?? []);
      setOffline(false);
      if (params.get("prescription")) setSource("prescription");
    } catch {
      setOffline(true);
    }
  };

  useEffect(() => {
    if (!loading && !user) { navigate("/auth"); return; }
    loadAll();
    const goOnline = () => loadAll();
    const goOffline = () => setOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [user, loading]);

  // ---- today's actions -------------------------------------------------------
  const mark = async (id: string, status: "taken" | "skipped") => {
    try {
      await markReminder(id, status);
      setToday((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
      if (native) void syncLocalReminders();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const stop = async (s: MedicationSchedule) => {
    if (!confirm(`"${s.medicine_name}" eslatmalari to'xtatilsinmi?`)) return;
    try {
      await stopSchedule(s.id);
      toast.success("To'xtatildi");
      await loadAll();
      if (native) void syncLocalReminders();
    } catch (e: any) { toast.error(e.message); }
  };

  const remove = async (s: MedicationSchedule) => {
    if (!confirm(`"${s.medicine_name}" jadvali va tarixi o'chirilsinmi?`)) return;
    try {
      await deleteSchedule(s.id);
      await loadAll();
      if (native) void syncLocalReminders();
    } catch (e: any) { toast.error(e.message); }
  };

  // ---- wizard ------------------------------------------------------------------
  const startDraft = async () => {
    if (source === "manual") {
      setDraft([emptyItem()]); setDraftSource("manual"); setDraftPrescriptionId(null); setWarnings([]);
      return;
    }
    if (source === "prescription" && !prescriptionId) { toast.error("Retseptni tanlang"); return; }
    if (source === "upload") {
      if (!pdf) { toast.error("PDF faylni tanlang"); return; }
      if (pdf.type !== "application/pdf") { toast.error("Faqat PDF fayl"); return; }
      if (pdf.size > 8 * 1024 * 1024) { toast.error("PDF 8 MB dan kichik bo'lsin"); return; }
    }
    setDrafting(true);
    try {
      const res = await draftPlanWithAi({
        prescriptionId: source === "prescription" ? prescriptionId : undefined,
        pdfBase64: source === "upload" && pdf ? await fileToBase64(pdf) : undefined,
        routine, note, language: language as any,
      });
      setDraft(res.items);
      setWarnings(res.warnings);
      setDraftSource(res.source);
      setDraftPrescriptionId(res.prescription_id);
      setConfirmed(false);
    } catch (e: any) {
      if (e.code === "pro_required") navigate("/pro");
      toast.error(e.message);
    } finally {
      setDrafting(false);
    }
  };

  const updateItem = (i: number, patch: Partial<PlanItem>) =>
    setDraft((prev) => prev && prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  // Each time chip is an editable time field: what the user sees is exactly what gets saved.
  const setTimeAt = (i: number, ti: number, value: string) => {
    const t = normalizeTime(value);
    if (!t || !draft) return;
    updateItem(i, { times: draft[i].times.map((x, idx) => (idx === ti ? t : x)) });
  };
  const addTime = (i: number) => {
    if (!draft) return;
    updateItem(i, { times: [...draft[i].times, suggestNextTime(draft[i].times)] });
  };

  const toggleChannel = (c: Channel) =>
    setChannels((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const save = async () => {
    if (!draft) return;
    const errors = draft.flatMap((it, i) => planItemErrors(it).map((e) => `${it.medicine_name || `#${i + 1}`}: ${e}`));
    if (errors.length) { toast.error(errors[0]); return; }
    if (!channels.length) { toast.error("Kamida bitta eslatma usulini tanlang"); return; }
    if (!confirmed) { toast.error("Jadvalni tekshirganingizni tasdiqlang"); return; }
    if (!native && channels.includes("web") && "Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission();
    }
    setSaving(true);
    try {
      const ids = await saveSchedules({
        items: draft.map(({ medicine_name, dose, instructions, times, days, start_date }) =>
          ({ medicine_name, dose, instructions, times: cleanTimes(times), days, start_date: start_date || todayInTashkent() })),
        source: draftSource,
        prescriptionId: draftPrescriptionId,
        channels,
      });
      if (forWhom && ids.length) {
        const { error } = await supabase.rpc("assign_schedules_to_member" as any, { _schedule_ids: ids, _family_member_id: forWhom });
        if (error) toast.error(error.message);
      }
      toast.success("Eslatmalar saqlandi!");
      setDraft(null); setPdf(null); setNote("");
      await loadAll();
      if (native) {
        const r = await syncLocalReminders();
        if (r?.scheduled) toast.success(`Telefonga ${r.scheduled} ta eslatma qo'yildi`);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading || plan === null && !offline) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const isPro = plan === "pro" || plan === "premium";
  const offlineList = offline ? cachedReminders().filter((r) => r.scheduled_at.slice(0, 10) >= todayInTashkent()).slice(0, 30) : [];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-4xl space-y-8">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl bg-hero-gradient flex items-center justify-center shrink-0">
              <AlarmClock className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground">Dori eslatmalari</h1>
              <p className="text-sm text-muted-foreground">AI retseptdan jadval tuzadi, vaqti kelganda eslatamiz.</p>
            </div>
          </div>

          {offline && (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
              <div className="flex items-center gap-2 font-semibold text-foreground mb-2"><WifiOff className="w-4 h-4" /> Internet yo'q</div>
              <p className="text-muted-foreground mb-3">
                Telefonga qo'yilgan eslatmalar baribir chalinadi. "Ichdim" belgilari internet qaytganda yuboriladi.
              </p>
              {offlineList.map((r) => (
                <div key={r.id} className="flex justify-between border-t border-border py-2 text-foreground">
                  <span>{localTime(r.scheduled_at)} · {r.medicine_name}{r.dose ? ` — ${r.dose}` : ""}</span>
                  <span className="text-xs text-muted-foreground">{STATUS[r.status as MedicationReminder["status"]]?.label ?? r.status}</span>
                </div>
              ))}
            </div>
          )}

          {!offline && !isPro && (
            <div className="rounded-3xl border border-primary/40 bg-primary/5 p-6 text-center">
              <Crown className="w-8 h-8 text-primary mx-auto mb-2" />
              <h2 className="font-display text-xl font-bold text-foreground">Pro obuna kerak</h2>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                AI dori jadvali, Telegram, sayt va ilova eslatmalari Pro tarifida. SMS — Premium tarifida.
              </p>
              <Link to="/pro" className="inline-flex items-center gap-2 rounded-xl bg-hero-gradient px-5 py-2.5 text-sm font-semibold text-primary-foreground">
                <Crown className="w-4 h-4" /> Tariflarni ko'rish
              </Link>
            </div>
          )}

          {/* ---------------- Today ---------------- */}
          {!offline && today.length > 0 && (
            <section>
              <h2 className="font-display text-lg font-semibold text-foreground mb-3">Bugun</h2>
              <div className="space-y-2">
                {today.map((r) => {
                  const s = scheduleById.get(r.schedule_id);
                  const canMark = ["pending", "sent", "missed"].includes(r.status)
                    && new Date(r.scheduled_at).getTime() <= Date.now() + 2 * 3600_000;
                  return (
                    <div key={r.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex items-center gap-1.5 text-lg font-semibold text-foreground tabular-nums">
                          <Clock className="w-4 h-4 text-primary" /> {localTime(r.scheduled_at, s?.timezone)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-foreground truncate">{s?.medicine_name ?? "Dori"}</div>
                          <div className="text-xs text-muted-foreground truncate">{[s?.dose, s?.instructions].filter(Boolean).join(" · ")}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                        {canMark && (
                          <>
                            <button onClick={() => mark(r.id, "taken")} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">
                              <Check className="w-3.5 h-3.5" /> Ichdim
                            </button>
                            <button onClick={() => mark(r.id, "skipped")} className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary">
                              <SkipForward className="w-3.5 h-3.5" /> O'tkazish
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ---------------- New plan ---------------- */}
          {!offline && isPro && (
            <section className="rounded-3xl border border-border bg-card p-5 md:p-6 space-y-5">
              <h2 className="font-display text-lg font-semibold text-foreground flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" /> Yangi reja
              </h2>

              {!draft && (
                <>
                  <div className="grid sm:grid-cols-3 gap-2">
                    {([
                      ["prescription", "Saytdagi retsept", Pill],
                      ["upload", "PDF retsept yuklash", FileUp],
                      ["manual", "Qo'lda kiritish", Plus],
                    ] as const).map(([id, label, Icon]) => (
                      <button key={id} onClick={() => setSource(id)}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium ${source === id ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:bg-secondary"}`}>
                        <Icon className="w-4 h-4" /> {label}
                      </button>
                    ))}
                  </div>

                  {source === "prescription" && (
                    prescriptions.length ? (
                      <select value={prescriptionId} onChange={(e) => setPrescriptionId(e.target.value)} className={inputClass}>
                        <option value="">Retseptni tanlang</option>
                        {prescriptions.map((p) => (
                          <option key={p.id} value={p.id}>
                            {new Date(p.created_at).toLocaleDateString()} · {p.diagnosis} · {(p.medicines ?? []).length} ta dori
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-sm text-muted-foreground">Sizda hali saytda yozilgan retsept yo'q. PDF yuklang yoki qo'lda kiriting.</p>
                    )
                  )}

                  {source === "upload" && (
                    <div className="space-y-1">
                      <input type="file" accept="application/pdf" onChange={(e) => setPdf(e.target.files?.[0] ?? null)} className={inputClass} />
                      <p className="text-xs text-muted-foreground">Boshqa klinika bergan retsept (PDF, 8 MB gacha). Skanerlangan bo'lsa ham AI o'qiydi.</p>
                    </div>
                  )}

                  {source !== "manual" && (
                    <>
                      <div>
                        <div className="text-sm font-medium text-foreground mb-2">Kun tartibingiz (AI vaqtlarni shunga moslaydi)</div>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                          {([
                            ["wake", "Uyg'onish"], ["breakfast", "Nonushta"], ["lunch", "Tushlik"], ["dinner", "Kechki ovqat"], ["sleep", "Uxlash"],
                          ] as const).map(([k, label]) => (
                            <label key={k} className="text-xs text-muted-foreground">
                              {label}
                              <input type="time" value={routine[k]} onChange={(e) => setRoutine((r) => ({ ...r, [k]: e.target.value }))} className={`${inputClass} mt-1`} />
                            </label>
                          ))}
                        </div>
                      </div>
                      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500}
                        placeholder="AI ga qo'shimcha: masalan, &quot;ishda 9 dan 18 gacha bo'laman&quot;"
                        className={`${inputClass} resize-none`} />
                    </>
                  )}

                  <button onClick={startDraft} disabled={drafting}
                    className="flex items-center gap-2 rounded-xl bg-hero-gradient px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                    {drafting ? <Loader2 className="w-4 h-4 animate-spin" /> : source === "manual" ? <Plus className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                    {drafting ? "AI retseptni o'qiyapti..." : source === "manual" ? "Jadval yaratish" : "AI bilan reja tuzish"}
                  </button>
                </>
              )}

              {draft && (
                <div className="space-y-4">
                  {warnings.length > 0 && (
                    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground space-y-1">
                      {warnings.map((w, i) => <div key={i} className="flex gap-2"><AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />{w}</div>)}
                    </div>
                  )}

                  {draft.map((it, i) => (
                    <div key={i} className={`rounded-2xl border p-4 space-y-3 ${it.needs_confirmation ? "border-amber-500/50" : "border-border"}`}>
                      <div className="flex items-start gap-2">
                        <div className="grid sm:grid-cols-2 gap-2 flex-1">
                          <input value={it.medicine_name} onChange={(e) => updateItem(i, { medicine_name: e.target.value })} placeholder="Dori nomi" className={inputClass} />
                          <input value={it.dose} onChange={(e) => updateItem(i, { dose: e.target.value })} placeholder="Dozasi (retseptdagidek)" className={inputClass} />
                          <input value={it.instructions} onChange={(e) => updateItem(i, { instructions: e.target.value })} placeholder="Ko'rsatma: ovqatdan keyin..." className={`${inputClass} sm:col-span-2`} />
                        </div>
                        <button onClick={() => setDraft((p) => p && p.filter((_, idx) => idx !== i))} title="Olib tashlash" className="p-2 rounded-lg text-destructive hover:bg-destructive/10">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {it.needs_confirmation && (
                        <div className="flex gap-2 text-xs text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          {it.note || "AI ishonchsiz: chastota yoki muddatni tekshiring."}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        {it.times.map((t, ti) => (
                          <span key={ti} className="inline-flex items-center gap-1 rounded-full bg-primary/10 pl-2 pr-1.5 py-0.5 text-sm font-medium text-primary">
                            <input type="time" value={t} aria-label={`${ti + 1}-vaqt`}
                              onChange={(e) => setTimeAt(i, ti, e.target.value)}
                              onBlur={() => updateItem(i, { times: cleanTimes(it.times) })}
                              className="bg-transparent tabular-nums text-primary focus:outline-none" />
                            {it.times.length > 1 && (
                              <button onClick={() => updateItem(i, { times: it.times.filter((_, idx) => idx !== ti) })} aria-label="O'chirish"><X className="w-3.5 h-3.5" /></button>
                            )}
                          </span>
                        ))}
                        {it.times.length < MAX_TIMES_PER_DAY && (
                          <button onClick={() => addTime(i)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-secondary">
                            <Plus className="w-3.5 h-3.5" /> vaqt
                          </button>
                        )}
                        <select
                          value=""
                          onChange={(e) => e.target.value && updateItem(i, { times: timesPerDay(Number(e.target.value), it.times, routine.wake, routine.sleep) })}
                          className="px-2 py-1 rounded-lg border border-input bg-background text-xs text-muted-foreground"
                        >
                          <option value="">Kuniga N marta…</option>
                          {[1, 2, 3, 4, 6].map((n) => <option key={n} value={n}>{n} marta</option>)}
                        </select>
                      </div>
                      <p className="text-[11px] text-muted-foreground -mt-1">Vaqtni bosib o'zgartiring. Ko'rsatilgan vaqtlar aynan shunday saqlanadi (Toshkent vaqti).</p>

                      <div className="flex flex-wrap gap-3 text-sm">
                        <label className="flex items-center gap-2 text-muted-foreground">
                          Kun:
                          <input type="number" min={1} max={MAX_DAYS} value={it.days}
                            onChange={(e) => updateItem(i, { days: Math.max(1, Math.min(MAX_DAYS, Number(e.target.value) || 1)) })}
                            className="w-20 px-2 py-1 rounded-lg border border-input bg-background text-foreground" />
                        </label>
                        <label className="flex items-center gap-2 text-muted-foreground">
                          Boshlanish:
                          <input type="date" value={it.start_date ?? todayInTashkent()} min={todayInTashkent()}
                            onChange={(e) => updateItem(i, { start_date: e.target.value || null })}
                            className="px-2 py-1 rounded-lg border border-input bg-background text-foreground" />
                        </label>
                      </div>
                    </div>
                  ))}

                  <button onClick={() => setDraft((p) => [...(p ?? []), emptyItem()])} className="flex items-center gap-1.5 text-sm font-medium text-primary">
                    <Plus className="w-4 h-4" /> Dori qo'shish
                  </button>

                  {family.length > 0 && (
                    <label className="block text-sm">
                      <span className="font-medium text-foreground">Kim uchun?</span>
                      <select value={forWhom} onChange={(e) => setForWhom(e.target.value)} className="mt-1 w-full sm:w-auto px-3 py-2 rounded-xl border border-input bg-background text-foreground text-sm">
                        <option value="">O'zim uchun</option>
                        {family.map((m) => <option key={m.id} value={m.id}>{m.full_name} ({RELATIONS[m.relation]})</option>)}
                      </select>
                      <span className="block text-xs text-muted-foreground mt-1">Eslatmada uning ismi ham chiqadi.</span>
                    </label>
                  )}

                  <div>
                    <div className="text-sm font-medium text-foreground mb-2">Qayerga eslatilsin</div>
                    <div className="flex flex-wrap gap-2">
                      {([
                        ["web", "Saytda", true],
                        ["telegram", "Telegram", true],
                        ["app", "Telefon ilovasi (internetsiz ham)", true],
                        ["sms", plan === "premium" ? "SMS" : "SMS (Premium)", plan === "premium"],
                      ] as const).map(([id, label, enabled]) => (
                        <label key={id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${enabled ? "border-border text-foreground cursor-pointer" : "border-border text-muted-foreground opacity-60"}`}>
                          <input type="checkbox" disabled={!enabled} checked={channels.includes(id)} onChange={() => toggleChannel(id)} />
                          {id === "app" && <Smartphone className="w-4 h-4" />} {label}
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Telegram uchun profilda Telegram ulangan bo'lishi kerak. SMS profildagi telefon raqamiga yuboriladi.
                    </p>
                  </div>

                  <label className="flex items-start gap-2 rounded-xl bg-secondary/50 p-3 text-sm text-foreground">
                    <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
                    Jadvalni tekshirdim: dorilar va dozalar shifokor ko'rsatmasiga mos. AI xato qilishi mumkin.
                  </label>

                  <div className="flex gap-2">
                    <button onClick={save} disabled={saving}
                      className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Saqlash
                    </button>
                    <button onClick={() => setDraft(null)} className="rounded-xl border border-border px-5 py-2.5 text-sm text-foreground hover:bg-secondary">Bekor qilish</button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ---------------- Schedules ---------------- */}
          {!offline && schedules.length > 0 && (
            <section>
              <h2 className="font-display text-lg font-semibold text-foreground mb-3">Jadvallarim</h2>
              <div className="space-y-2">
                {schedules.map((s) => {
                  const end = new Date(`${s.start_date}T00:00:00+05:00`);
                  end.setDate(end.getDate() + s.days - 1);
                  return (
                    <div key={s.id} className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 ${s.is_active ? "" : "opacity-60"}`}>
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">{s.medicine_name}{s.dose ? <span className="text-muted-foreground font-normal"> — {s.dose}</span> : null}</div>
                        {memberName((s as any).family_member_id) && <div className="text-xs text-primary">👤 {memberName((s as any).family_member_id)}</div>}
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {s.times.join(", ")} · {new Date(`${s.start_date}T00:00:00+05:00`).toLocaleDateString()} – {end.toLocaleDateString()} · {s.channels.join(", ")}
                          {!s.is_active && " · to'xtatilgan"}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {s.is_active && (
                          <button onClick={() => stop(s)} title="To'xtatish" className="p-2 rounded-lg text-foreground hover:bg-secondary"><StopCircle className="w-4 h-4" /></button>
                        )}
                        <button onClick={() => remove(s)} title="O'chirish" className="p-2 rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default MedicationsPage;
