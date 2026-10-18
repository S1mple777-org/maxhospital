import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Activity, Database, HeartPulse, Loader2, Pill, Play, QrCode, Siren, Square, Stethoscope, AlertTriangle, Wind } from "lucide-react";
import { toast } from "sonner";
import type { FamilyMember } from "@/lib/care";
import {
  claimBand, demoHistory, deviceEvent, devicePairStart, deviceSync, fmtTime, simIdentity, type SyncReply,
} from "@/lib/band";

type Reading = { k: string; v: number; t: number };
const now = () => Math.floor(Date.now() / 1000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A virtual MaxBand in the browser. It talks to the same device API as the real band
 * (pair code, sync, SOS), so the whole chain can be shown without hardware.
 */
const BandSimulator = ({ family, onData }: { family: FamilyMember[]; onData: () => void }) => {
  const [{ token, serial }] = useState(simIdentity);
  const [state, setState] = useState<"off" | "pairing" | "on">("off");
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [member, setMember] = useState("");
  const [reply, setReply] = useState<SyncReply | null>(null);
  const [hr, setHr] = useState(74);
  const [spo2, setSpo2] = useState(97);
  const [steps, setSteps] = useState(0);
  const [battery, setBattery] = useState(92);
  const [screen, setScreen] = useState<"main" | "qr">("main");
  const [qr, setQr] = useState<string | null>(null);
  const [fall, setFall] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const queue = useRef<Reading[]>([]);
  const acks = useRef<{ id: string; s: "taken" | "skipped" }[]>([]);
  const tick = useRef(0);
  const hrRef = useRef(hr); hrRef.current = hr;
  const spo2Ref = useRef(spo2); spo2Ref.current = spo2;

  const sync = useCallback(async (extra: Reading[] = []) => {
    tick.current++;
    const t = now();
    const walk = Math.random() < 0.3 ? Math.round(40 + Math.random() * 80) : Math.round(Math.random() * 10);
    setSteps((s) => s + walk);
    const readings: Reading[] = [
      ...queue.current.splice(0),
      ...extra,
      { k: "hr", v: Math.round(hrRef.current + (Math.random() * 4 - 2)), t },
      { k: "steps", v: walk, t },
      ...(tick.current % 3 === 1 ? [{ k: "spo2", v: spo2Ref.current, t }] : []),
      ...(tick.current % 6 === 1 ? [{ k: "hrv", v: Math.round(38 + Math.random() * 12), t }] : []),
    ];
    const sentAcks = acks.current.splice(0);
    try {
      const r = await deviceSync(token, { battery, readings, acks: sentAcks });
      if (!r.claimed) { setState("pairing"); setPairCode(r.pair_code ?? null); return r; }
      setReply(r);
      if (r.alerts?.length) toast.warning("Bilaguzuk: xavfli ko'rsatkich — xabar yuborildi");
      onData();
      return r;
    } catch (e: any) {
      // Like the real band: keep unsent data and retry on the next sync.
      queue.current.unshift(...readings.slice(0, 600));
      acks.current.unshift(...sentAcks);
      if (!/too_fast|429/.test(e.message)) toast.error(`Sinxron: ${e.message}`);
      return null;
    }
  }, [token, battery, onData]);

  const start = async () => {
    setBusy("start");
    try {
      const r = await devicePairStart(token, serial);
      if (r.claimed) { setState("on"); await sync(); }
      else { setPairCode(r.pair_code ?? null); setState("pairing"); }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  const pair = async () => {
    if (!pairCode) return;
    setBusy("pair");
    try {
      await claimBand(pairCode, member || null, "MaxBand (simulyator)");
      toast.success("Bilaguzuk ulandi");
      setState("on");
      await sleep(400);
      await sync();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  // Regular sync, like the real band (every 5 minutes there; 10 s here so the demo is visible).
  useEffect(() => {
    if (state !== "on") return;
    const id = setInterval(() => { void sync(); setBattery((b) => Math.max(5, b - 0.05)); }, reply?.live ? 15_000 : 10_000);
    return () => clearInterval(id);
  }, [state, sync, reply?.live]);

  useEffect(() => {
    if (reply?.qr_url) QRCode.toDataURL(reply.qr_url, { margin: 1, width: 160, color: { dark: "#ffffff", light: "#000000" } }).then(setQr).catch(() => setQr(null));
    else setQr(null);
  }, [reply?.qr_url]);

  // Fall: 10-second countdown in the demo (30 s on the real band), then SOS goes out.
  useEffect(() => {
    if (fall === null) return;
    if (fall <= 0) {
      setFall(null);
      void sendEvent("fall");
      return;
    }
    const id = setTimeout(() => setFall((f) => (f === null ? null : f - 1)), 1000);
    return () => clearTimeout(id);
  }, [fall]);

  const position = () => new Promise<{ lat: number; lng: number } | null>((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve(null), { timeout: 5000, maximumAge: 300_000 });
  });

  async function sendEvent(kind: "sos" | "fall" | "consult_request") {
    setBusy(kind);
    try {
      const pos = kind === "consult_request" ? null : await position();
      const r = await deviceEvent(token, kind, pos?.lat, pos?.lng);
      toast.success(kind === "consult_request" ? "Murojaat yuborildi" : `${kind === "sos" ? "SOS" : "Yiqilish"} xabari ${r.notified} ta manzilga yuborildi`);
      onData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  const dangerPulse = async () => {
    setHr(150);
    const t = now();
    setBusy("hr");
    await sync([{ k: "hr", v: 146, t: t - 120 }, { k: "hr", v: 152, t: t - 60 }]);
    setBusy(null);
  };

  const lowSpo2 = async () => {
    setSpo2(88);
    const t = now();
    setBusy("spo2");
    await sync([{ k: "spo2", v: 87, t: t - 300 }, { k: "spo2", v: 88, t: t - 5 }]);
    setBusy(null);
  };

  const loadHistory = async () => {
    setBusy("history");
    const all = demoHistory();
    try {
      for (let i = 0; i < all.length; i += 550) {
        await sync(all.slice(i, i + 550));
        await sleep(3500); // the server accepts one sync per ~3 s from a band
      }
      toast.success("2 kunlik namunaviy ma'lumot yuborildi");
    } finally {
      setBusy(null);
    }
  };

  const nextMed = reply?.reminders?.[0];
  const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  const btn = "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-50";

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-col md:flex-row gap-5">
        {/* The band */}
        <div className="flex flex-col items-center shrink-0">
          <div className="w-10 h-14 rounded-t-xl bg-zinc-700" />
          <div className="relative w-44 h-52 rounded-[2rem] bg-zinc-900 border-4 border-zinc-700 shadow-xl flex items-center justify-center">
            <div className="w-36 h-40 rounded-2xl bg-black text-white font-mono text-[11px] p-2.5 flex flex-col">
              {state === "off" && <div className="m-auto text-zinc-500 text-center">MaxBand<br />o'chiq</div>}
              {state === "pairing" && (
                <div className="m-auto text-center">
                  <div className="text-zinc-400">Saytda kiriting:</div>
                  <div className="text-2xl tracking-widest mt-1">{pairCode ?? "------"}</div>
                  <div className="text-zinc-500 mt-1">maxband</div>
                </div>
              )}
              {state === "on" && fall !== null && (
                <div className="m-auto text-center text-amber-300">
                  <div>YIQILDINGIZMI?</div>
                  <div className="text-3xl my-1">{fall}</div>
                  <div className="text-zinc-400">bekor: tugma</div>
                </div>
              )}
              {state === "on" && fall === null && screen === "qr" && (
                qr ? <img src={qr} alt="Favqulodda karta QR" className="m-auto w-28 h-28" /> : <div className="m-auto text-center text-zinc-400">Favqulodda karta<br />yaratilmagan</div>
              )}
              {state === "on" && fall === null && screen === "main" && (
                <>
                  <div className="flex justify-between text-zinc-400"><span>{reply?.live ? "● LIVE" : reply?.plan?.toUpperCase() ?? ""}</span><span>{Math.round(battery)}%</span></div>
                  <div className="text-3xl text-center mt-1">{clock}</div>
                  <div className="flex justify-between mt-1"><span className="text-rose-400">♥ {hr}</span><span className="text-sky-300">O₂ {spo2}%</span></div>
                  <div className="text-emerald-300">{steps} qadam</div>
                  <div className="mt-auto border-t border-zinc-700 pt-1 text-violet-300 truncate">
                    {nextMed ? `${fmtTime(nextMed.at * 1000)} ${nextMed.name}` : "Dori yo'q"}
                  </div>
                </>
              )}
            </div>
            <button aria-label="Yon tugma" title="Yon tugma: ekran / yiqilishni bekor qilish"
              onClick={() => (fall !== null ? setFall(null) : setScreen((s) => (s === "main" ? "qr" : "main")))}
              className="absolute -right-2.5 top-16 w-2 h-8 rounded bg-zinc-500 hover:bg-zinc-400" />
          </div>
          <div className="w-10 h-14 rounded-b-xl bg-zinc-700" />
          <div className="mt-2 text-[10px] text-muted-foreground font-mono">{serial}</div>
        </div>

        {/* Controls */}
        <div className="flex-1 min-w-0 space-y-3">
          <div>
            <h3 className="font-display font-semibold text-foreground">Bilaguzuk simulyatori</h3>
            <p className="text-xs text-muted-foreground">Haqiqiy MaxBand bilan bir xil protokol: ulash kodi, sinxron, SOS. Ma'lumotlar bazaga tushadi va "SIMULYATOR" deb belgilanadi.</p>
          </div>

          {state === "off" && (
            <button onClick={start} disabled={!!busy} className={`${btn} bg-hero-gradient text-primary-foreground text-sm px-4`}>
              {busy === "start" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Yoqish
            </button>
          )}

          {state === "pairing" && (
            <div className="rounded-xl border border-border p-3 space-y-2">
              <div className="text-sm text-foreground">Bilaguzuk ekranida kod: <b className="font-mono tracking-widest">{pairCode ?? "—"}</b></div>
              <label className="text-xs text-muted-foreground block">Kim taqadi
                <select value={member} onChange={(e) => setMember(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg border border-input bg-background text-sm">
                  <option value="">Men o'zim</option>
                  {family.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                </select>
              </label>
              <div className="flex gap-2">
                <button onClick={pair} disabled={!pairCode || !!busy} className={`${btn} bg-primary text-primary-foreground`}>
                  {busy === "pair" && <Loader2 className="w-4 h-4 animate-spin" />} Kodni kiritib ulash
                </button>
                {!pairCode && <button onClick={start} className={`${btn} border border-border`}>Yangi kod</button>}
              </div>
            </div>
          )}

          {state === "on" && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-xs text-muted-foreground">Puls: <b className="text-foreground">{hr}</b>
                  <input type="range" min={35} max={170} value={hr} onChange={(e) => setHr(Number(e.target.value))} className="w-full" />
                </label>
                <label className="text-xs text-muted-foreground">SpO₂: <b className="text-foreground">{spo2}%</b>
                  <input type="range" min={82} max={100} value={spo2} onChange={(e) => setSpo2(Number(e.target.value))} className="w-full" />
                </label>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button onClick={() => sendEvent("sos")} disabled={!!busy} className={`${btn} bg-red-600 text-white`}>
                  {busy === "sos" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Siren className="w-4 h-4" />} SOS (3 s bosish)
                </button>
                <button onClick={() => setFall(10)} disabled={!!busy || fall !== null || reply?.settings?.fall_detection === false} className={`${btn} bg-amber-500 text-white`}>
                  <AlertTriangle className="w-4 h-4" /> Yiqilish
                </button>
                <button onClick={dangerPulse} disabled={!!busy} className={`${btn} border border-rose-500/50 text-rose-600`}>
                  {busy === "hr" ? <Loader2 className="w-4 h-4 animate-spin" /> : <HeartPulse className="w-4 h-4" />} Puls 150
                </button>
                <button onClick={lowSpo2} disabled={!!busy} className={`${btn} border border-sky-500/50 text-sky-600`}>
                  {busy === "spo2" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wind className="w-4 h-4" />} SpO₂ 88%
                </button>
                <button onClick={() => sendEvent("consult_request")} disabled={!!busy} className={`${btn} border border-primary/50 text-primary`}>
                  <Stethoscope className="w-4 h-4" /> Shifokorga
                </button>
                <button onClick={() => setScreen((s) => (s === "main" ? "qr" : "main"))} className={`${btn} border border-border`}>
                  <QrCode className="w-4 h-4" /> QR karta
                </button>
              </div>

              {reply?.reminders?.length ? (
                <div className="rounded-xl border border-border p-3">
                  <div className="text-xs font-medium text-foreground mb-1.5 flex items-center gap-1.5"><Pill className="w-3.5 h-3.5" /> Bilaguzukdagi dori eslatmalari</div>
                  <ul className="space-y-1">
                    {reply.reminders.slice(0, 4).map((r) => (
                      <li key={r.id} className="flex items-center gap-2 text-xs">
                        <span className="font-mono">{fmtTime(r.at * 1000)}</span><span className="truncate flex-1">{r.name} {r.dose}</span>
                        {r.at * 1000 <= Date.now() + 2 * 3600_000 && (
                          <button onClick={() => { acks.current.push({ id: r.id, s: "taken" }); void sync(); }} className="rounded bg-emerald-600 px-2 py-0.5 text-white">Ichdim</button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <button onClick={loadHistory} disabled={!!busy} className={`${btn} border border-border text-foreground`}>
                  {busy === "history" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />} Namunaviy tarix (2 kun)
                </button>
                <button onClick={() => setState("off")} className={`${btn} border border-border text-foreground`}><Square className="w-4 h-4" /> To'xtatish</button>
                <span className="inline-flex items-center gap-1"><Activity className="w-3.5 h-3.5" /> {reply?.live ? "Jonli rejim (shifokor ko'ryapti): 15 s" : "Sinxron: har 10 s"}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BandSimulator;
