import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Activity, ArrowRight, HeartPulse, IdCard, Loader2, Pill, Trophy, Users } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { BADGES, loadMaxScore, nextTip, scoreColor, scoreLabel, type MaxScore } from "@/lib/maxScore";

const WD = ["Ya", "Du", "Se", "Ch", "Pa", "Ju", "Sh"];

export function ScoreRing({ score, size = 140 }: { score: number; size?: number }) {
  const r = 52, c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="currentColor" strokeWidth="10" className="text-secondary" />
        <circle cx="60" cy="60" r={r} fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} className={scoreColor(score)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-black tabular-nums ${scoreColor(score)}`} style={{ fontSize: size * 0.3 }}>{score}</span>
        <span className="text-[11px] text-muted-foreground">{scoreLabel(score)}</span>
      </div>
    </div>
  );
}

export default function MaxScorePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [s, setS] = useState<MaxScore | null | undefined>(undefined);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate("/auth"); return; }
    void loadMaxScore().then(setS);
  }, [user, loading]);

  const t = s?.today;
  const tip = t ? nextTip(t) : null;
  const parts = t ? [
    { icon: Pill, label: "Dori", w: 35, v: t.meds?.value ?? null, note: t.meds ? `${t.meds.taken}/${t.meds.due} ichildi` : "Bugun dori yo'q" },
    { icon: Activity, label: "Harakat", w: 30, v: t.move.value, note: t.move.fitness ? "MaxFitness mashqi bajarildi" : `${t.move.steps.toLocaleString("ru-RU")} qadam` },
    { icon: HeartPulse, label: "Nazorat", w: 20, v: t.check ? 1 : 0, note: t.check ? "O'lchov kiritilgan" : "Bugun o'lchov yo'q" },
    { icon: IdCard, label: "Passport", w: 15, v: t.passport ? 1 : 0, note: t.passport ? "To'ldirilgan" : "To'ldirilmagan" },
  ] : [];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-2xl space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">MaxScore</h1>
            <p className="text-sm text-muted-foreground">Kunlik sog'liq odatlaringiz bali: dori, harakat, nazorat va Passport. Bu tashxis emas — g'amxo'rlik o'lchovi.</p>
          </div>

          {s === undefined ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          : !s || !t ? <p className="text-sm text-muted-foreground">Ballni hisoblab bo'lmadi. Keyinroq urinib ko'ring.</p>
          : (
            <>
              <div className="bg-card border border-border rounded-2xl p-5 flex flex-col sm:flex-row items-center gap-5">
                <ScoreRing score={t.score} />
                <div className="flex-1 w-full space-y-2">
                  <p className="text-sm text-foreground">Haftalik o'rtacha: <b>{s.avg7}</b> · Ketma-ket 70+: <b>{s.streak} kun</b> {s.streak >= 3 ? "🔥" : ""}</p>
                  {tip && (
                    <Link to={tip.to} className="flex items-center gap-2 rounded-xl bg-primary/10 p-3 text-sm text-foreground hover:bg-primary/15">
                      <span className="flex-1"><b>Ballni oshirish:</b> {tip.text}</span><ArrowRight className="w-4 h-4 text-primary" />
                    </Link>
                  )}
                </div>
              </div>

              <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
                {parts.map((p) => (
                  <div key={p.label}>
                    <div className="flex items-center gap-2 text-sm">
                      <p.icon className="w-4 h-4 text-primary" /><span className="font-medium text-foreground flex-1">{p.label}</span>
                      <span className="text-xs text-muted-foreground">{p.note}</span>
                      <span className="w-12 text-right text-xs tabular-nums">{p.v === null ? "—" : `${Math.round(p.v * p.w)}/${p.w}`}</span>
                    </div>
                    <div className="h-2 rounded-full bg-secondary mt-1.5 overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${(p.v ?? 0) * 100}%` }} />
                    </div>
                  </div>
                ))}
                <p className="text-[11px] text-muted-foreground">Dori bo'lmagan kunda qolgan qismlar 100 ballga moslanadi.</p>
              </div>

              <div className="bg-card border border-border rounded-2xl p-4">
                <h2 className="text-sm font-semibold text-foreground mb-3">So'nggi 7 kun</h2>
                <div className="flex items-end gap-2 h-32">
                  {s.week.map((d) => (
                    <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] tabular-nums text-muted-foreground">{d.score}</span>
                      <div className="w-full rounded-t-md bg-primary/80" style={{ height: `${Math.max(4, d.score)}%` }} />
                      <span className="text-[10px] text-muted-foreground">{WD[new Date(`${d.day}T12:00:00`).getDay()]}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-card border border-border rounded-2xl p-4">
                <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-500" /> Yutuqlar</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.entries(BADGES).map(([k, b]) => {
                    const got = s.badges.includes(k);
                    return (
                      <div key={k} className={`rounded-xl border p-3 text-center ${got ? "border-amber-400/60 bg-amber-400/10" : "border-border opacity-50"}`}>
                        <div className={`text-2xl ${got ? "" : "grayscale"}`}>{b.icon}</div>
                        <p className="text-xs font-semibold text-foreground mt-1">{b.title}</p>
                        <p className="text-[10px] text-muted-foreground">{b.text}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-card border border-border rounded-2xl p-4">
                <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Oila reytingi</h2>
                {s.family.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Yaqinlaringizni qo'shing (Dori eslatmasi yoki SOS sahifasidagi «Yaqinlarim») — kim o'z sog'lig'iga ko'proq g'amxo'rlik qilayotganini birga kuzatasiz.</p>
                ) : (
                  <ol className="space-y-1.5">
                    {[{ name: "Men", today: t.score, avg7: s.avg7, me: true }, ...s.family.map((f) => ({ ...f, me: false }))]
                      .sort((a, b) => b.avg7 - a.avg7)
                      .map((f, i) => (
                        <li key={`${f.name}-${i}`} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${f.me ? "bg-primary/10" : "bg-secondary/50"}`}>
                          <span className="w-5 text-center">{["🥇", "🥈", "🥉"][i] ?? i + 1}</span>
                          <span className="flex-1 font-medium text-foreground">{f.name}</span>
                          <span className="text-xs text-muted-foreground">bugun {f.today}</span>
                          <span className={`font-bold tabular-nums ${scoreColor(f.avg7)}`}>{f.avg7}</span>
                        </li>
                      ))}
                  </ol>
                )}
                <p className="text-[11px] text-muted-foreground mt-2">Reytingda faqat ism va ball ko'rinadi — dorilar va o'lchovlar sir saqlanadi.</p>
              </div>
            </>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
