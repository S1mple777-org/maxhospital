import { useEffect, useMemo, useRef, useState } from "react";
import { Headphones, Loader2, Pause, Play, SkipForward, Volume2, X } from "lucide-react";
import { CoachAudio, keepScreenOn, vibrate, wait } from "@/lib/coachAudio";
import {
  P, SECONDS_PER_REP, coachSteps, stepPhrases, type CoachStep,
} from "../../../supabase/functions/_shared/coach.ts";
import type { FitnessSession } from "@/lib/fitness";

type Phase = "intro" | "loading" | "running" | "done";

/**
 * MaxFitness ovozli murabbiy: mashg'ulotni boshidan oxirigacha o'zbekcha ovoz, taymer,
 * takrorlarni sanash va signal bilan olib boradi. Tugaganda onFinish chaqiriladi
 * (sahifa "Qanchalik qiyin bo'ldi?" so'rovini ochadi).
 */
export default function CoachPlayer({ session, onClose, onFinish }: {
  session: FitnessSession; onClose: () => void; onFinish?: () => void;
}) {
  const steps = useMemo(() => coachSteps(session), [session]);
  const phrases = useMemo(() => stepPhrases(steps), [steps]);
  const [phase, setPhase] = useState<Phase>("intro");
  const [progress, setProgress] = useState({ done: 0, total: phrases.length });
  const [voiceOk, setVoiceOk] = useState(true);
  const [idx, setIdx] = useState(0);
  const [big, setBig] = useState<string>("");     // katta raqam: soniya yoki takror
  const [paused, setPaused] = useState(false);

  const audio = useRef<CoachAudio | null>(null);
  const run = useRef({ id: 0, paused: false, skip: false });
  const releaseWake = useRef<() => void>(() => undefined);

  useEffect(() => () => {
    run.current.id++;
    audio.current?.close();
    releaseWake.current();
  }, []);

  /** Pauza bo'lsa kutadi; to'xtatilgan bo'lsa (yopildi/o'tkazildi) false. */
  const alive = async (id: number) => {
    while (run.current.paused && run.current.id === id) await wait(200);
    return run.current.id === id && !run.current.skip;
  };

  const tick = async (id: number, seconds: number, cues: { at: number; say: string }[] = []) => {
    const a = audio.current!;
    for (let t = 0; t < seconds; t++) {
      if (!(await alive(id))) return;
      const left = seconds - t;
      setBig(left >= 60 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : String(left));
      const cue = cues.find((c) => c.at === t);
      if (cue && t > 0) void a.say(cue.say);
      else if (left <= 3) a.beep(left === 1 ? 1320 : 880);
      await wait(1000);
    }
  };

  const playStep = async (id: number, st: CoachStep) => {
    const a = audio.current!;
    if (st.kind === "say") {
      setBig("");
      await a.say(st.text);
    } else if (st.kind === "timer" || st.kind === "rest") {
      await tick(id, st.seconds, st.kind === "timer" ? st.cues : []);
      a.beep(660, 250); vibrate(200);
    } else if (st.kind === "count") {
      for (let n = 1; n <= st.reps; n++) {
        if (!(await alive(id))) return;
        setBig(String(n));
        const started = performance.now();
        await a.say(P.count(n));
        await wait(Math.max(0, SECONDS_PER_REP * 1000 - (performance.now() - started)));
      }
      vibrate(150);
    }
  };

  const loop = async (from: number) => {
    const id = ++run.current.id;
    for (let i = from; i < steps.length; i++) {
      run.current.skip = false;
      setIdx(i);
      await playStep(id, steps[i]);
      if (run.current.id !== id) return;
      if (run.current.skip) { audio.current?.stop(); continue; }
    }
    setPhase("done");
    vibrate([200, 100, 200]);
    releaseWake.current();
  };

  const start = async () => {
    audio.current = new CoachAudio();
    await audio.current.resume();
    setPhase("loading");
    releaseWake.current = await keepScreenOn();
    const ok = await audio.current.preload(phrases, (done, total) => setProgress({ done, total }));
    setVoiceOk(ok >= phrases.length * 0.8);
    setPhase("running");
    void loop(0);
  };

  const togglePause = async () => {
    const p = !run.current.paused;
    run.current.paused = p;
    setPaused(p);
    if (p) await audio.current?.suspend(); else await audio.current?.resume();
  };

  const skip = () => {
    // Joriy mashqni (item) butunlay o'tkazib, keyingisining boshiga
    const cur = steps[idx]?.item;
    const next = steps.findIndex((s, i) => i > idx && s.item !== cur);
    audio.current?.stop();
    run.current.paused = false; setPaused(false);
    void audio.current?.resume();
    void loop(next < 0 ? steps.length : next);
  };

  const close = () => {
    if (phase === "running" && !confirm("Mashqni to'xtatasizmi?")) return;
    onClose();
  };

  const st = steps[idx];
  const item = st && st.item >= 0 ? session.items[st.item] : null;
  const itemNo = st ? Math.max(0, Math.min(session.items.length, st.item + 1)) : 0;
  const pct = Math.round((idx / Math.max(1, steps.length - 1)) * 100);

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col" role="dialog" aria-label="Ovozli murabbiy">
      <div className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 border-b border-border">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><Headphones className="w-5 h-5 text-primary" /> MaxFitness murabbiy</div>
        <button onClick={close} className="p-2 rounded-lg hover:bg-secondary" aria-label="Yopish"><X className="w-5 h-5" /></button>
      </div>

      {phase === "intro" && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
          <Volume2 className="w-14 h-14 text-primary" />
          <h2 className="text-xl font-bold text-foreground">{session.label}</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            Murabbiy har bir mashqni o'zbek tilida tushuntiradi, vaqtni hisoblaydi va takrorlarni sanab turadi.
            Ovozni baland qiling, telefonni yoningizga qo'ying. ~{session.total_minutes} daqiqa.
          </p>
          <button onClick={start} className="w-full max-w-xs py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2">
            <Play className="w-5 h-5" /> Boshlash
          </button>
        </div>
      )}

      {phase === "loading" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-foreground">Murabbiy ovozi tayyorlanmoqda… {progress.done}/{progress.total}</p>
          <p className="text-xs text-muted-foreground">Birinchi marta biroz vaqt oladi, keyin darhol ochiladi.</p>
        </div>
      )}

      {(phase === "running" || phase === "done") && st && (
        <>
          <div className="h-1.5 bg-secondary"><div className="h-full bg-primary transition-all" style={{ width: `${phase === "done" ? 100 : pct}%` }} /></div>
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
            {phase === "done" ? (
              <>
                <div className="text-6xl">🎉</div>
                <h2 className="text-2xl font-bold text-foreground">Barakalla!</h2>
                <p className="text-sm text-muted-foreground">Bugungi mashq tugadi. Endi qanchalik qiyin bo'lganini belgilang — reja sizga moslashadi.</p>
                <button onClick={() => { onFinish?.(); onClose(); }} className="mt-2 w-full max-w-xs py-3 rounded-2xl bg-primary text-primary-foreground font-semibold">
                  Natijani belgilash
                </button>
              </>
            ) : (
              <>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {st.kind === "rest" ? "Dam olish" : item ? `${itemNo}/${session.items.length}-mashq` : "Kirish"}
                </p>
                <h2 className="text-2xl font-bold text-foreground leading-tight">{st.title}</h2>
                <div className={`font-bold tabular-nums leading-none my-4 ${st.kind === "count" ? "text-primary text-[7rem]" : "text-foreground text-[5.5rem]"}`} aria-live="polite">
                  {big || (st.kind === "say" ? "🔊" : "")}
                </div>
                {st.kind === "count" && <p className="text-sm text-muted-foreground">marta · jami {st.reps}</p>}
                {item && st.kind === "say" && <p className="text-sm text-muted-foreground max-w-md">{item.how}</p>}
                {!voiceOk && <p className="text-xs text-amber-600 max-w-sm">Ovozning bir qismi yuklanmadi (internet). Ekran va signal bo'yicha davom eting.</p>}
              </>
            )}
          </div>
          {phase === "running" && (
            <div className="grid grid-cols-2 gap-3 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              <button onClick={togglePause} className="py-3.5 rounded-2xl border border-border text-foreground font-medium flex items-center justify-center gap-2">
                {paused ? <><Play className="w-5 h-5" /> Davom etish</> : <><Pause className="w-5 h-5" /> Pauza</>}
              </button>
              <button onClick={skip} className="py-3.5 rounded-2xl border border-border text-foreground font-medium flex items-center justify-center gap-2">
                <SkipForward className="w-5 h-5" /> Keyingisi
              </button>
              <p className="col-span-2 text-[11px] text-center text-muted-foreground">Ko'krakda og'riq, kuchli hansirash yoki bosh aylansa — darhol to'xtating.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
