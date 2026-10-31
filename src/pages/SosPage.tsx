import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2, MapPin, MessageSquare, Phone, PhoneCall, Plus, Send, ShieldCheck, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MedFamilyCard from "@/components/medications/MedFamilyCard";
import { useAuth } from "@/contexts/AuthContext";
import { loadEmergencyCards } from "@/lib/care";
import { vibrate } from "@/lib/coachAudio";
import {
  MAX_SOS_CONTACTS, SMS_PRICE_UZS, addSosContact, currentPosition, formatPhone, loadSosContacts, markSafe,
  normalizePhone, removeSosContact, triggerSos, type SosContact, type SosResult,
} from "@/lib/sos";

const HOLD_MS = 2000;
const COUNTDOWN = 5;
type Phase = "idle" | "countdown" | "sending" | "sent";

/**
 * SOS — favqulodda rejim. Tugmani 2 soniya bosib turish -> 5 soniya ichida bekor qilish mumkin ->
 * joylashuv + Passport havolasi yaqinlarga (Telegram, ilova, SMS). 103 ga o'zi qo'ng'iroq qilmaydi.
 */
export default function SosPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("idle");
  const [hold, setHold] = useState(0);         // 0..1
  const [left, setLeft] = useState(COUNTDOWN);
  const [result, setResult] = useState<SosResult | null>(null);
  const [safeDone, setSafeDone] = useState(false);
  const [contacts, setContacts] = useState<SosContact[] | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", relation: "" });
  const holdTimer = useRef<number | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate("/auth"); return; }
    void loadSosContacts().then(setContacts);
  }, [user, loading]);

  // ---- bosib turish ----
  const startHold = () => {
    if (phase !== "idle") return;
    const t0 = performance.now();
    vibrate(30);
    const step = () => {
      const p = Math.min(1, (performance.now() - t0) / HOLD_MS);
      setHold(p);
      if (p >= 1) { holdTimer.current = null; void countdown(); return; }
      holdTimer.current = requestAnimationFrame(step);
    };
    holdTimer.current = requestAnimationFrame(step);
  };
  const endHold = () => {
    if (holdTimer.current) { cancelAnimationFrame(holdTimer.current); holdTimer.current = null; }
    if (phase === "idle") setHold(0);
  };

  const countdown = async () => {
    cancelled.current = false;
    setPhase("countdown");
    vibrate([200, 100, 200]);
    const posP = currentPosition();          // joylashuvni sanoq paytida olamiz
    for (let s = COUNTDOWN; s > 0; s--) {
      if (cancelled.current) return;
      setLeft(s);
      vibrate(80);
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (cancelled.current) return;
    setPhase("sending");
    try {
      const r = await triggerSos(await posP);
      setResult(r);
      setPhase("sent");
      vibrate([400, 150, 400]);
    } catch (e: any) {
      toast.error(e.message || "Yuborib bo'lmadi");
      setPhase("idle"); setHold(0);
    }
  };

  const cancel = () => { cancelled.current = true; setPhase("idle"); setHold(0); toast("SOS bekor qilindi"); };

  const safe = async () => {
    if (!result) return;
    try { await markSafe(result.event_id); setSafeDone(true); toast.success("Yaqinlaringizga «xavfsizman» xabari yuborildi"); }
    catch (e: any) { toast.error(e.message); }
  };

  // ---- kontaktlar ----
  const add = async () => {
    const phone = normalizePhone(form.phone);
    if (!form.name.trim()) return toast.error("Ismni yozing");
    if (!phone) return toast.error("Raqam +998 XX XXX XX XX ko'rinishida bo'lsin");
    try { await addSosContact({ ...form, phone }); setForm({ name: "", phone: "", relation: "" }); setContacts(await loadSosContacts()); }
    catch (e: any) { toast.error(e.message); }
  };
  const importPassport = async () => {
    const card = (await loadEmergencyCards()).find((c) => !c.family_member_id) as any;
    const list = [[card?.contact_name, card?.contact_phone], [card?.contact2_name, card?.contact2_phone]]
      .map(([n, p]) => ({ name: (n as string) || "Yaqinim", phone: normalizePhone(p as string) }))
      .filter((x): x is { name: string; phone: string } => !!x.phone);
    if (!list.length) return toast.error("Passport'da favqulodda kontakt raqami yo'q");
    let n = 0;
    for (const c of list) { try { await addSosContact({ ...c, relation: "" }); n++; } catch { /* takroriy */ } }
    setContacts(await loadSosContacts());
    toast.success(`${n} ta raqam qo'shildi`);
  };

  const r = 96, circ = 2 * Math.PI * r;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-xl space-y-5">
          {phase !== "sent" ? (
            <div className="bg-card border border-border rounded-3xl p-6 text-center">
              <h1 className="text-xl font-bold text-foreground">SOS — favqulodda yordam</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Tugmani <b>2 soniya bosib turing</b>. Joylashuvingiz va tibbiy kartangiz yaqinlaringizga yuboriladi.
              </p>

              <div className="relative w-56 h-56 mx-auto my-6 select-none">
                <svg viewBox="0 0 220 220" className="absolute inset-0 w-full h-full -rotate-90">
                  <circle cx="110" cy="110" r={r} fill="none" stroke="currentColor" className="text-rose-500/15" strokeWidth="12" />
                  <circle cx="110" cy="110" r={r} fill="none" stroke="currentColor" className="text-rose-600" strokeWidth="12"
                    strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - (phase === "idle" ? hold : 1))} />
                </svg>
                {phase === "idle" && (
                  <button
                    onPointerDown={startHold} onPointerUp={endHold} onPointerLeave={endHold} onPointerCancel={endHold}
                    onContextMenu={(e) => e.preventDefault()}
                    className="absolute inset-5 rounded-full bg-rose-600 text-white text-5xl font-black shadow-xl shadow-rose-600/40 active:scale-95 transition-transform touch-none"
                    aria-label="SOS — 2 soniya bosib turing">
                    SOS
                  </button>
                )}
                {phase === "countdown" && (
                  <div className="absolute inset-5 rounded-full bg-rose-600 text-white flex flex-col items-center justify-center animate-pulse">
                    <span className="text-6xl font-black tabular-nums">{left}</span>
                    <span className="text-xs mt-1">soniyadan keyin yuboriladi</span>
                  </div>
                )}
                {phase === "sending" && (
                  <div className="absolute inset-5 rounded-full bg-rose-600 text-white flex flex-col items-center justify-center">
                    <Loader2 className="w-10 h-10 animate-spin" /><span className="text-sm mt-2">Yuborilmoqda…</span>
                  </div>
                )}
              </div>

              {phase === "countdown" && (
                <button onClick={cancel} className="w-full py-3.5 rounded-2xl border-2 border-foreground/20 text-foreground font-semibold flex items-center justify-center gap-2">
                  <X className="w-5 h-5" /> Bekor qilish
                </button>
              )}
              {phase === "idle" && (
                <a href="tel:103" className="inline-flex items-center gap-2 text-sm text-rose-600 font-medium">
                  <PhoneCall className="w-4 h-4" /> Tez yordamga o'zim qo'ng'iroq qilaman (103)
                </a>
              )}
            </div>
          ) : result && (
            <div className="bg-card border border-rose-500/40 rounded-3xl p-6 space-y-4">
              <div className="text-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
                <h1 className="text-xl font-bold text-foreground mt-2">Yordam so'rovi yuborildi</h1>
              </div>
              <ul className="text-sm space-y-1.5">
                <li className="flex items-center gap-2"><Send className="w-4 h-4 text-primary" /> Telegram: {result.telegram} kishi</li>
                <li className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary" /> Ilova/sayt: {result.app} kishi</li>
                <li className="flex items-center gap-2"><MessageSquare className="w-4 h-4 text-primary" /> SMS: {result.sms} ta
                  {result.sms_failed > 0 && <span className="text-amber-600">({result.sms_failed} tasi yuborilmadi)</span>}
                  {result.cost > 0 && <span className="text-muted-foreground">· {result.cost.toLocaleString("ru-RU")} so'm{result.debt > 0 ? `, shundan ${result.debt.toLocaleString("ru-RU")} so'm qarzga` : ""}</span>}
                </li>
                <li className="flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> {result.location ? "Joylashuv yuborildi" : "Joylashuv aniqlanmadi (ruxsat bering)"}</li>
              </ul>
              {result.app + result.sms === 0 && (
                <p className="text-sm text-rose-600">Hech kimga yetkazilmadi — pastda yaqinlaringizni qo'shing. Ahvolingiz og'ir bo'lsa, 103 ga qo'ng'iroq qiling.</p>
              )}
              <a href="tel:103" className="w-full py-3.5 rounded-2xl bg-rose-600 text-white font-semibold flex items-center justify-center gap-2">
                <Phone className="w-5 h-5" /> 103 — Tez yordamga qo'ng'iroq
              </a>
              {!safeDone ? (
                <button onClick={safe} className="w-full py-3 rounded-2xl border border-emerald-600/50 text-emerald-700 dark:text-emerald-400 font-medium">
                  ✅ Men xavfsizman — yaqinlarimga xabar berish
                </button>
              ) : <p className="text-sm text-center text-emerald-700">Yaqinlaringizga «xavfsiz» xabari ketdi.</p>}
              <button onClick={() => { setPhase("idle"); setHold(0); setResult(null); setSafeDone(false); }} className="w-full text-xs text-muted-foreground">Yopish</button>
            </div>
          )}

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><MessageSquare className="w-4 h-4 text-primary" /> SMS oladiganlar</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Ilovasi yo'q yaqinlaringiz (ota-ona, qo'shni) SMS oladi: joylashuv, telefoningiz va tibbiy karta havolasi.
              Har bir SMS ~{SMS_PRICE_UZS} so'm; balans yetmasa, qarzga yoziladi va keyin Hamyon'dan to'lanadi.
            </p>
            <div className="mt-3 space-y-2">
              {contacts === null ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : contacts.map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                  <span className="flex-1 min-w-0 truncate"><b>{c.name}</b>{c.relation ? ` · ${c.relation}` : ""}</span>
                  <span className="text-muted-foreground tabular-nums">{formatPhone(c.phone)}</span>
                  <button onClick={async () => { await removeSosContact(c.id); setContacts(await loadSosContacts()); }} className="p-1 text-muted-foreground hover:text-rose-600" aria-label="O'chirish"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            {contacts && contacts.length < MAX_SOS_CONTACTS && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ism" maxLength={60}
                  className="px-3 py-2 rounded-lg border border-input bg-background text-sm" />
                <input value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })} placeholder="Kim (onam, akam…)" maxLength={40}
                  className="px-3 py-2 rounded-lg border border-input bg-background text-sm" />
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+998 90 123 45 67" inputMode="tel"
                  className="col-span-2 px-3 py-2 rounded-lg border border-input bg-background text-sm" />
                <button onClick={add} className="py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-1"><Plus className="w-4 h-4" /> Qo'shish</button>
                <button onClick={importPassport} className="py-2 rounded-lg border border-border text-sm">Passport'dan olish</button>
              </div>
            )}
          </section>

          <MedFamilyCard note="Ilovada ro'yxatdan o'tgan yaqinlaringiz SOS'ni Telegram va ilovada bepul oladi (dori ichilmasa ham xabar olishadi). Email orqali taklif qiling — ular qabul qilishi kerak." />

          <p className="text-xs text-muted-foreground">
            MaxBand taqsangiz, bilaguzukdagi SOS tugmasi va yiqilish aniqlanishi ham shu ro'yxatga xabar beradi. <Link to="/emergency-card" className="text-primary">Tibbiy kartangizni (Passport)</Link> to'ldirib qo'ying — SOS xabarida shifokorlar uchun havola bo'ladi.
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
