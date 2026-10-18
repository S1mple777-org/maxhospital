import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BellRing, Brain, Check, Crown, Eye, Footprints, Gift, HeartPulse, Link2, Loader2, MapPin, Moon, Pill, QrCode, ShieldCheck,
  Siren, Stethoscope, Trash2, UserPlus, Users, Watch, X,
} from "lucide-react";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BandDashboard from "@/components/band/BandDashboard";
import BandSimulator from "@/components/band/BandSimulator";
import { useAuth } from "@/contexts/AuthContext";
import { usePlanStatus } from "@/lib/planPerks";
import { formatUzs } from "@/lib/medications";
import { loadFamily, type FamilyMember } from "@/lib/care";
import {
  acceptGuardian, claimBand, inviteGuardian, loadBands, loadGuardianLinks, MAXBAND_PREMIUM_DAYS, MAXBAND_PRICE_UZS,
  redeemBandCode, removeGuardianLink, reportLocation, timeAgo, type BandDevice, type GuardianLink,
} from "@/lib/band";

const TIERS = [
  {
    name: "Free", note: "obunasiz", items: [
      { icon: Watch, text: "Soat, qadam, suv va harakat eslatmasi" },
      { icon: Siren, text: "SOS va yiqilish xabari — har doim bepul" },
    ],
  },
  {
    name: "Pro", note: "19 000 so'm / oy", items: [
      { icon: Pill, text: "Dori eslatmasi bilakda, \"Ichdim\" tugmasi" },
      { icon: HeartPulse, text: "Puls, SpO₂, uyqu, stress saytda" },
      { icon: BellRing, text: "Xavfli puls / SpO₂ ogohlantirishi" },
      { icon: QrCode, text: "Ekranda QR favqulodda karta" },
      { icon: Stethoscope, text: "\"Shifokorga murojaat\" tugmasi" },
    ],
  },
  {
    name: "Premium", note: "qutida 3 oy sovg'a", items: [
      { icon: Eye, text: "Oila nazorati: farzand ko'rsatkichlarni ko'radi" },
      { icon: Pill, text: "Dori ichilmasa oilaga xabar" },
      { icon: Stethoscope, text: "Shifokor konsultatsiyada jonli ko'radi" },
      { icon: Siren, text: "SOS shifokorga ham boradi" },
    ],
  },
];

const LOCATION_KEY = "maxband-share-location";

const MaxBandPage = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { status, refresh } = usePlanStatus(!!user);
  const [bands, setBands] = useState<BandDevice[] | null>(null);
  const [family, setFamily] = useState<FamilyMember[]>([]);
  const [links, setLinks] = useState<{ mine: GuardianLink[]; watching: GuardianLink[] }>({ mine: [], watching: [] });
  const [selected, setSelected] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [code, setCode] = useState("");
  const [pair, setPair] = useState({ code: "", member: "", name: "" });
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [shareLocation, setShareLocation] = useState(() => {
    try { return localStorage.getItem(LOCATION_KEY) === "1"; } catch { return false; }
  });

  const load = useCallback(async () => {
    if (!user) return;
    const [b, f, l] = await Promise.all([loadBands(), loadFamily(), loadGuardianLinks(user.id)]);
    setBands(b);
    setFamily(f);
    setLinks(l);
    setSelected((s) => (s && b.some((x) => x.id === s) ? s : b[0]?.id ?? null));
  }, [user]);

  useEffect(() => {
    if (loading) return;
    if (user) void load();
  }, [user, loading, load]);

  // Share the phone's location for SOS messages while this page is open (opt-in).
  useEffect(() => {
    try { localStorage.setItem(LOCATION_KEY, shareLocation ? "1" : "0"); } catch { /* ignore */ }
    if (!shareLocation || !user || !("geolocation" in navigator)) return;
    const send = () => navigator.geolocation.getCurrentPosition(
      (p) => { void reportLocation(p.coords.latitude, p.coords.longitude).catch(() => undefined); },
      () => { setShareLocation(false); toast.error("Joylashuvga ruxsat berilmadi"); },
      { timeout: 10_000, maximumAge: 120_000 },
    );
    send();
    const id = setInterval(send, 5 * 60_000);
    return () => clearInterval(id);
  }, [shareLocation, user]);

  const plan = status?.plan ?? "free";
  const mine = (bands ?? []).filter((b) => b.owner_id === user?.id);
  const watched = (bands ?? []).filter((b) => b.owner_id !== user?.id);
  const pendingForMe = links.watching.filter((l) => l.status === "pending");
  const input = "w-full mt-1 px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm";

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  const redeem = () => run("redeem", async () => {
    const r = await redeemBandCode(code);
    toast.success(`Premium ${new Date(r.period_end).toLocaleDateString()} gacha faollashtirildi`);
    setCode("");
    await refresh();
  });

  const doPair = () => run("pair", async () => {
    const id = await claimBand(pair.code, pair.member || null, pair.name);
    toast.success("Bilaguzuk ulandi");
    setPair({ code: "", member: "", name: "" });
    await load();
    setSelected(id);
  });

  const invite = () => run("invite", async () => {
    await inviteGuardian(email);
    toast.success("Taklif yuborildi. U MaxBand sahifasida qabul qilishi kerak");
    setEmail("");
    await load();
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-5xl space-y-6">
          {/* Product */}
          <section className="rounded-3xl border border-border bg-card overflow-hidden">
            <div className="p-5 sm:p-8 bg-gradient-to-br from-primary/10 via-transparent to-transparent">
              <div className="flex flex-col sm:flex-row gap-5 sm:items-center">
                <div className="w-16 h-16 rounded-2xl bg-hero-gradient flex items-center justify-center shrink-0"><Watch className="w-8 h-8 text-primary-foreground" /></div>
                <div className="flex-1 min-w-0">
                  <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">MaxBand</h1>
                  <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                    MaxHospital'ga ulangan aqlli bilaguzuk: dori vaqtini bilakda eslatadi, puls va SpO₂ ni kuzatadi, yiqilishni sezadi,
                    SOS bosilsa oila va shifokorga joylashuv bilan xabar yuboradi.
                  </p>
                </div>
                <div className="sm:text-right">
                  <div className="font-display text-2xl font-bold text-foreground">{formatUzs(MAXBAND_PRICE_UZS)}</div>
                  <div className="inline-flex items-center gap-1 mt-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                    <Gift className="w-3.5 h-3.5" /> + {MAXBAND_PREMIUM_DAYS / 30} oy Premium sovg'a
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-6">
                {TIERS.map((t) => (
                  <div key={t.name} className={`rounded-2xl border p-4 ${t.name === "Premium" ? "border-primary/50 bg-primary/5" : "border-border bg-background/60"}`}>
                    <div className="flex items-baseline justify-between">
                      <span className="font-display font-semibold text-foreground">{t.name}</span>
                      <span className="text-[11px] text-muted-foreground">{t.note}</span>
                    </div>
                    <ul className="mt-2 space-y-1.5">
                      {t.items.map((i) => (
                        <li key={i.text} className="flex items-start gap-2 text-sm text-foreground"><i.icon className="w-4 h-4 mt-0.5 text-primary shrink-0" />{i.text}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><Moon className="w-3.5 h-3.5" /> Uyqu tahlili</span>
                <span className="inline-flex items-center gap-1.5"><Brain className="w-3.5 h-3.5" /> Stress (HRV)</span>
                <span className="inline-flex items-center gap-1.5"><Footprints className="w-3.5 h-3.5" /> Qadam va faollik</span>
                <span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Haftalik AI hisobotda</span>
              </div>
            </div>
          </section>

          {!user && !loading && (
            <div className="rounded-2xl border border-border bg-card p-6 text-center">
              <p className="text-sm text-muted-foreground mb-3">Bilaguzukni ulash va qutidagi kodni faollashtirish uchun tizimga kiring.</p>
              <button onClick={() => navigate("/auth")} className="rounded-xl bg-hero-gradient px-5 py-2.5 text-sm font-semibold text-primary-foreground">Kirish</button>
            </div>
          )}

          {user && (
            <>
              {pendingForMe.map((l) => (
                <div key={l.id} className="rounded-2xl border border-primary/40 bg-primary/5 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <Users className="w-6 h-6 text-primary shrink-0" />
                  <div className="flex-1 text-sm text-foreground"><b>{l.other_name ?? "Foydalanuvchi"}</b> sizni MaxBand kuzatuvchisi bo'lishga taklif qildi: SOS, yiqilish va xavfli ko'rsatkichlar haqida xabar olasiz.</div>
                  <div className="flex gap-2">
                    <button onClick={() => run(`acc-${l.id}`, async () => { await acceptGuardian(l.id); toast.success("Qabul qilindi"); await load(); })}
                      className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"><Check className="w-4 h-4" /> Qabul qilish</button>
                    <button onClick={() => run(`rej-${l.id}`, async () => { await removeGuardianLink(l.id); await load(); })}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm"><X className="w-4 h-4" /> Rad etish</button>
                  </div>
                </div>
              ))}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-border bg-card p-4">
                  <h2 className="font-display font-semibold text-foreground flex items-center gap-2"><Gift className="w-4 h-4 text-amber-500" /> Qutidagi kod</h2>
                  <p className="text-xs text-muted-foreground mt-1">Kodni kiriting — Premium {MAXBAND_PREMIUM_DAYS} kunga yoqiladi (joriy obunangiz kunlari saqlanadi).</p>
                  <div className="flex gap-2 mt-3">
                    <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="MXB-XXXX-XXXX" maxLength={13}
                      className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm font-mono tracking-wider" />
                    <button onClick={redeem} disabled={busy === "redeem" || code.trim().length < 13} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                      {busy === "redeem" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Faollashtirish"}
                    </button>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">Joriy tarif: <b className="text-foreground">{plan === "free" ? "Free" : plan === "pro" ? "Pro" : "Premium"}</b> · <Link to="/pro" className="underline">Tariflar</Link></div>
                </div>

                <div className="rounded-2xl border border-border bg-card p-4">
                  <h2 className="font-display font-semibold text-foreground flex items-center gap-2"><Link2 className="w-4 h-4 text-primary" /> Bilaguzukni ulash</h2>
                  <p className="text-xs text-muted-foreground mt-1">Bilaguzukni Wi-Fi'ga ulang — ekranida 6 xonali kod chiqadi. O'sha kodni shu yerga kiriting.</p>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <label className="text-xs text-muted-foreground">Kod
                      <input value={pair.code} inputMode="numeric" maxLength={6} onChange={(e) => setPair({ ...pair, code: e.target.value.replace(/\D/g, "") })} placeholder="123456" className={`${input} font-mono tracking-widest`} />
                    </label>
                    <label className="text-xs text-muted-foreground">Kim taqadi
                      <select value={pair.member} onChange={(e) => setPair({ ...pair, member: e.target.value })} className={input}>
                        <option value="">Men o'zim</option>
                        {family.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                      </select>
                    </label>
                  </div>
                  <button onClick={doPair} disabled={busy === "pair" || pair.code.length !== 6} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                    {busy === "pair" && <Loader2 className="w-4 h-4 animate-spin" />} Ulash
                  </button>
                  {family.length === 0 && <div className="mt-2 text-[11px] text-muted-foreground">Ota-onangiz uchun: avval <Link to="/family" className="underline">Oila profili</Link>ga qo'shing (Premium).</div>}
                </div>
              </div>

              {/* Dashboards */}
              <section className="rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-wrap gap-2 mb-4">
                  {bands === null && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
                  {mine.map((b) => (
                    <button key={b.id} onClick={() => setSelected(b.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${selected === b.id ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
                      <Watch className="w-4 h-4" />{b.name}{b.family_member_id ? ` · ${family.find((f) => f.id === b.family_member_id)?.full_name ?? ""}` : ""}
                    </button>
                  ))}
                  {watched.map((b) => (
                    <button key={b.id} onClick={() => setSelected(b.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${selected === b.id ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
                      <Eye className="w-4 h-4" />{links.watching.find((l) => l.wearer_id === b.owner_id)?.other_name ?? "Kuzatuv"} · {b.name}
                    </button>
                  ))}
                </div>
                {selected ? (
                  <BandDashboard key={selected} deviceId={selected} canManage={mine.some((b) => b.id === selected)} family={family}
                    refreshKey={refreshKey} onRemoved={() => { setSelected(null); void load(); }} />
                ) : bands !== null && (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    Hali bilaguzuk ulanmagan. Haqiqiy bilaguzuk bo'lmasa, pastdagi simulyator bilan sinab ko'ring.
                  </div>
                )}
              </section>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-border bg-card p-4">
                  <h2 className="font-display font-semibold text-foreground flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Oila nazorati <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">Premium</span></h2>
                  <p className="text-xs text-muted-foreground mt-1">Farzandingiz (yoki boshqa yaqin) o'z akkauntidan sizning ko'rsatkichlaringizni ko'radi va SOS, yiqilish, ichilmagan dori haqida xabar oladi.</p>
                  {plan === "premium" ? (
                    <div className="flex gap-2 mt-3">
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="farzand@email.com" className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm" />
                      <button onClick={invite} disabled={busy === "invite" || !email.includes("@")} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">
                        {busy === "invite" ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Taklif
                      </button>
                    </div>
                  ) : (
                    <Link to="/pro" className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-hero-gradient px-3 py-2 text-sm font-medium text-primary-foreground"><Crown className="w-4 h-4" /> Premium</Link>
                  )}
                  {links.mine.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {links.mine.map((l) => (
                        <li key={l.id} className="flex items-center gap-2 text-sm">
                          <span className="flex-1 truncate text-foreground">{l.other_name ?? "Foydalanuvchi"}</span>
                          <span className={`text-[11px] ${l.status === "accepted" ? "text-emerald-600" : "text-muted-foreground"}`}>{l.status === "accepted" ? "kuzatmoqda" : "kutilmoqda"}</span>
                          <button onClick={() => run(`rm-${l.id}`, async () => { await removeGuardianLink(l.id); await load(); })} aria-label="O'chirish" className="p-1 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {links.watching.filter((l) => l.status === "accepted").length > 0 && (
                    <div className="mt-3 text-xs text-muted-foreground">
                      Siz kuzatayotganlar: {links.watching.filter((l) => l.status === "accepted").map((l) => l.other_name ?? "—").join(", ")}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-border bg-card p-4">
                  <h2 className="font-display font-semibold text-foreground flex items-center gap-2"><MapPin className="w-4 h-4 text-red-500" /> SOS uchun joylashuv</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Bilaguzukda GPS yo'q (batareyani tejash uchun). Yoqsangiz, telefoningiz bu sahifa yoki ilova ochiq paytda joylashuvni 5 daqiqada bir yuboradi —
                    SOS xabarida "oxirgi ma'lum joy" sifatida ko'rsatiladi. Kuzatuvchilar joylashuvni faqat SOS paytida ko'radi.
                  </p>
                  <label className="mt-3 flex items-center gap-2 text-sm text-foreground">
                    <input type="checkbox" checked={shareLocation} onChange={(e) => setShareLocation(e.target.checked)} /> Joylashuvni ulashish
                  </label>
                  {mine.some((b) => !b.family_member_id && b.last_location_at) && (
                    <div className="mt-1 text-[11px] text-muted-foreground">Oxirgi: {timeAgo(mine.find((b) => b.last_location_at)?.last_location_at ?? null)}</div>
                  )}
                </div>
              </div>

              <BandSimulator family={family} onData={() => { setRefreshKey((k) => k + 1); if (!bands?.length) void load(); }} />

              <p className="text-xs text-muted-foreground">
                Qurilma qismlari, ulash sxemasi va bilaguzuk dasturi:{" "}
                <a href="https://github.com/S1mple777-org/maxhospital/blob/main/hardware/maxband/README.md" target="_blank" rel="noreferrer" className="underline">hardware/maxband</a>.
              </p>
            </>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default MaxBandPage;
