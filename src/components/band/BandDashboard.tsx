import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Area, Bar, BarChart, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Activity, AlertTriangle, BatteryLow, BatteryMedium, Brain, Check, Footprints, HeartPulse, Loader2, MapPin, Moon, Pill, RefreshCw,
  Settings, Siren, Stethoscope, Trash2, Wifi, WifiOff, Wind,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { FamilyMember } from "@/lib/care";
import {
  DEFAULT_BAND_SETTINGS, EVENT_LABELS, fmtDuration, fmtTime, isOnline, loadOverview, removeBand, resolveBandEvent, STRESS_LABEL,
  stressFromHrv, summarizeSleep, timeAgo, updateBand, type BandEvent, type BandOverview, type BandSettings,
} from "@/lib/band";

const EVENT_STYLE: Record<string, string> = {
  sos: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
  fall: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
  hr_high: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  hr_low: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  spo2_low: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  med_missed: "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-300",
  consult_request: "border-primary/40 bg-primary/10 text-primary",
};

const Tile = ({ icon: Icon, label, value, sub, tone = "text-primary" }: {
  icon: typeof Activity; label: string; value: string; sub?: string; tone?: string;
}) => (
  <div className="rounded-xl border border-border bg-card p-3 sm:p-4 min-w-0">
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className={`w-3.5 h-3.5 ${tone}`} /> {label}</div>
    <div className="mt-1 font-display text-xl sm:text-2xl font-bold text-foreground truncate">{value}</div>
    {sub && <div className="text-[11px] text-muted-foreground truncate">{sub}</div>}
  </div>
);

interface Props {
  deviceId: string;
  /** the signed-in user owns the band (can change settings / remove it) */
  canManage: boolean;
  family: FamilyMember[];
  /** bump to reload (e.g. after the simulator sent data) */
  refreshKey?: number;
  onRemoved?: () => void;
}

const BandDashboard = ({ deviceId, canManage, family, refreshKey = 0, onRemoved }: Props) => {
  const [o, setO] = useState<BandOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setO(await loadOverview(deviceId));
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => { void load(); }, [load, refreshKey]);
  useEffect(() => {
    const id = setInterval(() => { void load(); }, 60_000);
    return () => clearInterval(id);
  }, [load]);

  // New SOS / alerts appear without reloading.
  useEffect(() => {
    if (!o?.device.owner_id) return;
    const ch = supabase.channel(`band-events-${deviceId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "band_events", filter: `owner_id=eq.${o.device.owner_id}` }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [o?.device.owner_id, deviceId, load]);

  const sleep = useMemo(() => (o ? summarizeSleep(o.night.sleep, o.night.hr) : null), [o]);
  const stress = useMemo(() => {
    if (!o) return null;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date());
    const t = o.hrv_14d.find((d) => d.day === today)?.avg ?? o.latest.hrv?.v ?? null;
    return stressFromHrv(t, o.hrv_14d.filter((d) => d.day !== today).map((d) => d.avg));
  }, [o]);

  if (error) return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>;
  if (!o) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const d = o.device;
  const settings: BandSettings = { ...DEFAULT_BAND_SETTINGS, ...(d.settings ?? {}) };
  const online = isOnline(d.last_seen_at);
  const stepsToday = o.steps_7d[o.steps_7d.length - 1]?.steps ?? 0;
  const synced = d.plan === "pro" || d.plan === "premium";
  const openEvents = o.events.filter((e) => e.status === "open" && ["sos", "fall"].includes(e.kind));
  const hrData = o.hr_24h.map((p) => ({ ...p, label: fmtTime(p.t), range: [p.min, p.max] }));
  const stepsData = o.steps_7d.map((p) => ({ ...p, label: new Date(`${p.day}T12:00:00+05:00`).toLocaleDateString("uz-UZ", { weekday: "short" }) }));

  const resolve = async (e: BandEvent) => {
    try { await resolveBandEvent(e.id); toast.success("Hal qilindi deb belgilandi"); await load(); } catch (err: any) { toast.error(err.message); }
  };

  return (
    <div className="space-y-4">
      {openEvents.map((e) => (
        <div key={e.id} className="rounded-2xl border-2 border-red-500 bg-red-500/10 p-4 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <Siren className="w-8 h-8 text-red-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-display font-bold text-red-700 dark:text-red-300">{EVENT_LABELS[e.kind]} — {d.wearer}</div>
              <div className="text-sm text-foreground">{fmtTime(e.created_at)} · {timeAgo(e.created_at)}
                {e.lat !== null && e.lng !== null && (
                  <> · <a href={`https://maps.google.com/?q=${e.lat},${e.lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline"><MapPin className="w-3.5 h-3.5" />Xaritada</a></>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <a href="tel:103" className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white">103</a>
              <button onClick={() => resolve(e)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm"><Check className="w-4 h-4 inline" /> Hal qilindi</button>
            </div>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display text-lg font-semibold text-foreground truncate">{d.name}{d.is_virtual && <span className="ml-2 align-middle rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">SIMULYATOR</span>}</div>
          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Taqib yuruvchi: <b className="text-foreground">{d.wearer ?? "—"}</b></span>
            <span className="inline-flex items-center gap-1">{online ? <Wifi className="w-3.5 h-3.5 text-emerald-500" /> : <WifiOff className="w-3.5 h-3.5" />}{timeAgo(d.last_seen_at)}</span>
            {d.battery !== null && <span className="inline-flex items-center gap-1">{d.battery < 20 ? <BatteryLow className="w-3.5 h-3.5 text-red-500" /> : <BatteryMedium className="w-3.5 h-3.5" />}{d.battery}%</span>}
            <span className="font-mono">{d.serial}</span>
          </div>
        </div>
        <div className="flex gap-1">
          <button onClick={() => load()} aria-label="Yangilash" className="p-2 rounded-lg hover:bg-secondary"><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /></button>
          {canManage && <button onClick={() => setEditing((v) => !v)} aria-label="Sozlamalar" className="p-2 rounded-lg hover:bg-secondary"><Settings className="w-4 h-4" /></button>}
        </div>
      </div>

      {editing && canManage && (
        <BandSettingsForm deviceId={deviceId} name={d.name} familyMemberId={d.family_member_id} settings={settings} family={family}
          onSaved={() => { setEditing(false); void load(); }} onRemoved={onRemoved} />
      )}

      {!synced && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
          Tarif Free: bilaguzuk soat, qadam va SOS sifatida ishlaydi. Ko'rsatkichlarni saytga yuborish, dori eslatmalari va ogohlantirishlar Pro/Premium'da.
          {" "}<Link to="/pro" className="underline font-medium">Tariflar</Link>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile icon={HeartPulse} tone="text-rose-500" label="Puls" value={o.latest.hr ? `${Math.round(o.latest.hr.v)}` : "—"}
          sub={o.latest.hr ? `zarba/daq · ${timeAgo(o.latest.hr.t)}` : "ma'lumot yo'q"} />
        <Tile icon={Wind} tone="text-sky-500" label="SpO₂" value={o.latest.spo2 ? `${o.latest.spo2.v}%` : "—"}
          sub={o.latest.spo2 ? timeAgo(o.latest.spo2.t) : "ma'lumot yo'q"} />
        <Tile icon={Footprints} tone="text-emerald-500" label="Qadam (bugun)" value={stepsToday.toLocaleString("uz-UZ")}
          sub={`maqsad ${settings.steps_goal.toLocaleString("uz-UZ")} · ${Math.min(100, Math.round((stepsToday / settings.steps_goal) * 100))}%`} />
        <Tile icon={Pill} tone="text-violet-500" label="Dorilar (bugun)" value={o.meds_today.total ? `${o.meds_today.taken}/${o.meds_today.total}` : "—"}
          sub={o.meds_today.total ? `${o.meds_today.missed} ichilmagan · ${o.meds_today.upcoming} kutilmoqda` : "jadval yo'q"} />
        <Tile icon={Moon} tone="text-indigo-500" label="Kechagi uyqu" value={sleep ? fmtDuration(sleep.asleepMin) : "—"}
          sub={sleep ? `ball ${sleep.score}/100 · ${sleep.awakenings} marta uyg'ongan` : "ma'lumot yo'q"} />
        <Tile icon={Brain} tone="text-amber-500" label="Stress (HRV)" value={stress ? STRESS_LABEL[stress.level] : "—"}
          sub={stress ? `${stress.score}/100${stress.baseline ? ` · sizning me'yor ${stress.baseline} ms` : " · me'yor o'rganilmoqda"}` : "ma'lumot yo'q"} />
        <Tile icon={HeartPulse} tone="text-rose-400" label="Uyqudagi puls" value={sleep?.avgHr ? `${sleep.avgHr}` : "—"}
          sub={sleep ? `${fmtTime(sleep.start)} – ${fmtTime(sleep.end)}` : ""} />
        <Tile icon={AlertTriangle} tone="text-red-500" label="Ogohlantirishlar" value={`${o.events.filter((e) => Date.now() - Date.parse(e.created_at) < 864e5).length}`}
          sub="so'nggi 24 soat" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-sm font-medium text-foreground mb-2">Puls — 24 soat <span className="text-xs text-muted-foreground">(30 daqiqalik o'rtacha va oraliq)</span></div>
          <div className="h-44">
            {hrData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={hrData} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" minTickGap={24} />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" domain={[40, "auto"]} />
                  <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: any, n: string) => [Array.isArray(v) ? `${v[0]}–${v[1]}` : v, n === "range" ? "oraliq" : "o'rtacha"]} />
                  <ReferenceLine y={settings.hr_high} stroke="hsl(var(--destructive))" strokeDasharray="4 4" />
                  <Area type="monotone" dataKey="range" stroke="none" fill="hsl(var(--primary))" fillOpacity={0.15} />
                  <Line type="monotone" dataKey="avg" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : <div className="h-full flex items-center justify-center text-xs text-muted-foreground">Ma'lumot yo'q</div>}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-sm font-medium text-foreground mb-2">Qadamlar — 7 kun</div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stepsData} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: any) => [v, "qadam"]} />
                <ReferenceLine y={settings.steps_goal} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                <Bar dataKey="steps" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-3">
        <div className="text-sm font-medium text-foreground mb-2">Hodisalar</div>
        {o.events.length === 0 ? (
          <div className="text-xs text-muted-foreground py-3 text-center">Hodisa yo'q — hammasi joyida</div>
        ) : (
          <ul className="space-y-1.5">
            {o.events.map((e) => (
              <li key={e.id} className={`rounded-lg border px-3 py-2 text-sm flex flex-wrap items-center gap-x-3 gap-y-1 ${EVENT_STYLE[e.kind] ?? "border-border"}`}>
                <span className="font-medium">{EVENT_LABELS[e.kind]}</span>
                {e.value !== null && ["hr_high", "hr_low"].includes(e.kind) && <span>{Math.round(e.value)} zarba/daq</span>}
                {e.value !== null && e.kind === "spo2_low" && <span>{e.value}%</span>}
                {e.kind === "med_missed" && Array.isArray((e.data as any)?.medicines) && <span>{((e.data as any).medicines as string[]).join(", ")}</span>}
                {e.kind === "consult_request" && <Link to="/start-consultation" className="inline-flex items-center gap-1 underline"><Stethoscope className="w-3.5 h-3.5" />Shifokor tanlash</Link>}
                <span className="ml-auto text-xs opacity-80">{fmtTime(e.created_at)} · {timeAgo(e.created_at)}{e.status === "resolved" ? " · hal qilingan" : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        MaxBand tibbiy asbob emas: puls va SpO₂ optik sensor bilan taxminiy o'lchanadi, stress va uyqu — hisoblangan baho.
        Qon bosimini tonometr bilan o'lchab, "Salomatligim" sahifasiga kiriting. Shubhali holatda shifokorga murojaat qiling yoki 103 ga qo'ng'iroq qiling.
      </p>
    </div>
  );
};

function BandSettingsForm({ deviceId, name, familyMemberId, settings, family, onSaved, onRemoved }: {
  deviceId: string; name: string; familyMemberId: string | null; settings: BandSettings; family: FamilyMember[];
  onSaved: () => void; onRemoved?: () => void;
}) {
  const [f, setF] = useState({ name, member: familyMemberId ?? "", ...settings });
  const [busy, setBusy] = useState(false);
  const input = "w-full mt-1 px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm";
  const num = (k: keyof BandSettings, label: string, min: number, max: number, step = 1) => (
    <label className="text-xs text-muted-foreground">{label}
      <input type="number" min={min} max={max} step={step} value={f[k] as number} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })} className={input} />
    </label>
  );

  const save = async () => {
    setBusy(true);
    try {
      const { name: n, member, ...s } = f;
      await updateBand(deviceId, n, member || null, s as BandSettings);
      toast.success("Saqlandi. Bilaguzuk keyingi sinxronda yangilanadi");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm("Bilaguzuk akkauntdan olib tashlansinmi? Tarix saqlanadi; qayta ulash uchun bilaguzukda yangi kod chiqadi.")) return;
    try { await removeBand(deviceId); toast.success("Olib tashlandi"); onRemoved?.(); } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs text-muted-foreground">Nomi
          <input value={f.name} maxLength={40} onChange={(e) => setF({ ...f, name: e.target.value })} className={input} />
        </label>
        <label className="text-xs text-muted-foreground">Kim taqadi
          <select value={f.member} onChange={(e) => setF({ ...f, member: e.target.value })} className={input}>
            <option value="">Men o'zim</option>
            {family.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {num("hr_high", "Puls yuqori chegara", 90, 200)}
        {num("hr_low", "Puls past chegara", 30, 70)}
        {num("spo2_low", "SpO₂ past chegara, %", 80, 96)}
        {num("steps_goal", "Kunlik qadam maqsadi", 500, 50000, 500)}
        {num("water_interval_min", "Suv eslatmasi, daq (0 = o'chiq)", 0, 480, 15)}
        {num("sedentary_min", "Uzoq o'tirish, daq (0 = o'chiq)", 0, 240, 15)}
        <label className="text-xs text-muted-foreground">Sokin vaqt boshlanishi
          <input type="time" value={f.quiet_from} onChange={(e) => setF({ ...f, quiet_from: e.target.value })} className={input} />
        </label>
        <label className="text-xs text-muted-foreground">Sokin vaqt tugashi
          <input type="time" value={f.quiet_to} onChange={(e) => setF({ ...f, quiet_to: e.target.value })} className={input} />
        </label>
        <label className="text-xs text-muted-foreground flex items-end gap-2 pb-2">
          <input type="checkbox" checked={f.fall_detection} onChange={(e) => setF({ ...f, fall_detection: e.target.checked })} /> Yiqilishni aniqlash
        </label>
      </div>
      <div className="flex flex-wrap justify-between gap-2">
        <button onClick={save} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Saqlash
        </button>
        <button onClick={remove} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" /> Akkauntdan olib tashlash</button>
      </div>
    </div>
  );
}

export default BandDashboard;
