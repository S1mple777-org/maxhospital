import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Mic, Pause, Play, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { isNativeApp } from "@/lib/native";
import { syncLocalReminders } from "@/lib/localReminders";
import {
  MAX_VOICE_MS, audioUrl, deleteVoiceNote, loadVoiceNotes, loadVoiceTargets, saveVoiceNote, setActiveVoice,
  startRecording, voiceAudio, type Recording, type VoiceNote, type VoiceTarget,
} from "@/lib/medVoice";

const SUGGEST = "Buvijon, dori vaqti bo'ldi! Iltimos, dorini iching. Sizni yaxshi ko'raman.";

/**
 * Yaqinning ovozidagi dori eslatmasi: o'zingiz yoki yaqiningiz uchun ovoz yozing.
 * Dori vaqtida budilnik o'rniga shu ovoz chalinadi.
 */
export default function VoiceNoteCard() {
  const [targets, setTargets] = useState<VoiceTarget[] | null>(null);
  const [target, setTarget] = useState<string>("");
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [rec, setRec] = useState<Recording | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [draft, setDraft] = useState<{ b64: string; durationMs: number; url: string } | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const tick = useRef<number | null>(null);

  const me = targets?.find((t) => t.is_me);
  const cur = targets?.find((t) => t.user_id === target);

  useEffect(() => {
    void loadVoiceTargets().then((t) => { setTargets(t); setTarget(t[0]?.user_id ?? ""); });
    return () => { audio.current?.pause(); if (tick.current) clearInterval(tick.current); };
  }, []);
  useEffect(() => { if (target) void loadVoiceNotes(target).then(setNotes); }, [target]);

  const reload = async () => {
    setNotes(await loadVoiceNotes(target));
    if (isNativeApp() && cur?.is_me) void syncLocalReminders();
  };

  const start = async () => {
    try {
      setDraft(null);
      const r = await startRecording();
      setRec(r); setElapsed(0);
      const t0 = Date.now();
      tick.current = window.setInterval(() => {
        const ms = Date.now() - t0;
        setElapsed(ms);
        if (ms >= MAX_VOICE_MS) void stop(r);
      }, 200);
    } catch {
      toast.error("Mikrofonga ruxsat bering");
    }
  };
  const stop = async (r = rec) => {
    if (!r) return;
    if (tick.current) { clearInterval(tick.current); tick.current = null; }
    setRec(null);
    try {
      const d = await r.stop();
      if (d.durationMs < 700) { toast.error("Juda qisqa — qaytadan yozing"); return; }
      setDraft(d);
    } catch { toast.error("Yozuvni o'qib bo'lmadi"); }
  };

  const play = async (id: string, src?: string) => {
    audio.current?.pause();
    if (playing === id) { setPlaying(null); return; }
    const url = src ?? (await voiceAudio(id).then((b) => (b ? audioUrl(b) : null)));
    if (!url) return;
    const a = new Audio(url);
    audio.current = a; setPlaying(id);
    a.onended = () => setPlaying(null);
    void a.play().catch(() => setPlaying(null));
  };

  const save = async () => {
    if (!draft || !target) return;
    setBusy(true);
    try {
      await saveVoiceNote(target, label || (cur?.is_me ? "O'zim" : "Men"), draft.b64, draft.durationMs);
      toast.success(cur?.is_me ? "Saqlandi" : `${cur?.name} uchun saqlandi — dori vaqtida sizning ovozingiz chalinadi`);
      setDraft(null); setLabel("");
      await reload();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  if (!targets) return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><Mic className="w-4 h-4 text-primary" /> Yaqinning ovozidagi eslatma</h2>
      <p className="text-xs text-muted-foreground mt-1">
        Dori vaqtida budilnik o'rniga yaqiningizning ovozi chalinadi: «Buvijon, dorini iching». Keksalar matndan ko'ra
        farzandi yoki nabirasining ovoziga tezroq javob beradi. Yaqiningiz uchun yozish uchun u sizni «Yaqinlarim»ga qo'shgan bo'lishi kerak.
      </p>

      {targets.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {targets.map((t) => (
            <button key={t.user_id} onClick={() => setTarget(t.user_id)}
              className={`px-3 py-1.5 rounded-lg text-xs border ${t.user_id === target ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"}`}>
              {t.is_me ? "O'zim uchun" : t.name}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 rounded-xl bg-secondary/50 p-3">
        {!rec && !draft && (
          <>
            <p className="text-xs text-muted-foreground mb-2">Masalan: <i>«{SUGGEST}»</i></p>
            <button onClick={start} className="w-full py-2.5 rounded-xl bg-rose-600 text-white text-sm font-medium flex items-center justify-center gap-2">
              <Mic className="w-4 h-4" /> {cur?.is_me ? "Ovoz yozish" : `${cur?.name} uchun ovoz yozish`}
            </button>
          </>
        )}
        {rec && (
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-rose-600 animate-pulse" />
            <span className="flex-1 text-sm tabular-nums">{(elapsed / 1000).toFixed(1)} / {MAX_VOICE_MS / 1000} s</span>
            <button onClick={() => stop()} className="px-3 py-2 rounded-lg bg-foreground text-background text-sm flex items-center gap-1"><Square className="w-4 h-4" /> To'xtatish</button>
          </div>
        )}
        {draft && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <button onClick={() => play("draft", draft.url)} className="p-2 rounded-lg border border-border">{playing === "draft" ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}</button>
              <span className="text-sm text-foreground flex-1">{(draft.durationMs / 1000).toFixed(1)} s</span>
              <button onClick={() => setDraft(null)} className="text-xs text-muted-foreground">Qaytadan</button>
            </div>
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60}
              placeholder={cur?.is_me ? "Nomi (ixtiyoriy)" : "Kim yozdi? (masalan: Nabirangiz Ali)"}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm" />
            <button onClick={save} disabled={busy} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60">
              {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Saqlash"}
            </button>
          </div>
        )}
      </div>

      {notes.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {notes.map((n) => (
            <li key={n.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${n.is_active ? "border-primary bg-primary/5" : "border-border"}`}>
              <button onClick={() => play(n.id)} className="p-1.5 rounded-lg border border-border shrink-0">{playing === n.id ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}</button>
              <span className="flex-1 min-w-0 truncate">{n.label} <span className="text-xs text-muted-foreground">· {(n.duration_ms / 1000).toFixed(0)} s</span></span>
              {n.is_active ? <span className="text-xs text-primary flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Chalinadi</span>
                : cur?.is_me && (
                  <button onClick={async () => { await setActiveVoice(n.id); await reload(); }} className="text-xs text-primary">Tanlash</button>
                )}
              <button onClick={async () => { await deleteVoiceNote(n.id); await reload(); }} className="p-1 text-muted-foreground hover:text-rose-600" aria-label="O'chirish"><Trash2 className="w-4 h-4" /></button>
            </li>
          ))}
          {cur?.is_me && notes.some((n) => n.is_active) && (
            <li><button onClick={async () => { await setActiveVoice(null); await reload(); }} className="text-xs text-muted-foreground">Oddiy budilnik ovoziga qaytish</button></li>
          )}
        </ul>
      )}
      {isNativeApp() && me && <p className="text-[11px] text-muted-foreground mt-2">Telefonda ovoz bilan chalinishi uchun ilova 1.0.31 yoki yangiroq bo'lishi kerak.</p>}
    </section>
  );
}
