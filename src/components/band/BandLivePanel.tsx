import { useEffect, useState } from "react";
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { HeartPulse, Watch, Wind } from "lucide-react";
import { EVENT_LABELS, fmtTime, loadConsultationLive, timeAgo, type LiveData } from "@/lib/band";

/**
 * Doctor's view during an active consultation: the patient's MaxBand pulse and SpO2,
 * refreshed every 15 seconds (the band switches to live mode while the consultation is active).
 */
const BandLivePanel = ({ consultationId }: { consultationId: string }) => {
  const [data, setData] = useState<LiveData | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = () => loadConsultationLive(consultationId, 60).then((d) => { if (alive) setData(d); }).catch(() => { if (alive) setData(null); });
    void load();
    const id = setInterval(load, 15_000);
    return () => { alive = false; clearInterval(id); };
  }, [consultationId]);

  if (!data?.available || !data.device) return null;
  const hr = (data.readings ?? []).filter((r) => r.k === "hr").map((r) => ({ t: fmtTime(r.t), v: r.v }));
  const spo2 = (data.readings ?? []).filter((r) => r.k === "spo2");
  const lastHr = hr[hr.length - 1]?.v;
  const lastSpo2 = spo2[spo2.length - 1]?.v;

  return (
    <div className="mx-3 sm:mx-4 mt-2 rounded-xl border border-primary/30 bg-primary/5">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-2 px-3 py-2 text-left">
        <Watch className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium text-foreground">MaxBand jonli</span>
        <span className="inline-flex items-center gap-1 text-sm text-rose-600"><HeartPulse className="w-3.5 h-3.5" />{lastHr ? Math.round(lastHr) : "—"}</span>
        <span className="inline-flex items-center gap-1 text-sm text-sky-600"><Wind className="w-3.5 h-3.5" />{lastSpo2 ? `${lastSpo2}%` : "—"}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">{timeAgo(data.device.last_seen_at)}{data.device.is_virtual ? " · simulyator" : ""}</span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          <div className="h-28">
            {hr.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hr} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
                  <XAxis dataKey="t" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" minTickGap={30} />
                  <YAxis tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" domain={["auto", "auto"]} />
                  <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: any) => [v, "puls"]} />
                  <ReferenceLine y={100} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="v" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : <div className="h-full flex items-center justify-center text-xs text-muted-foreground">So'nggi 1 soatda puls ma'lumoti yo'q</div>}
          </div>
          {!!data.events?.length && (
            <div className="mt-1 text-[11px] text-muted-foreground">
              Bugun: {data.events.slice(0, 3).map((e) => `${EVENT_LABELS[e.kind]} (${fmtTime(e.created_at)})`).join(", ")}
            </div>
          )}
          <div className="mt-1 text-[10px] text-muted-foreground">Bilaguzuk ko'rsatkichlari taxminiy; tashxis uchun klinik o'lchov kerak.</div>
        </div>
      )}
    </div>
  );
};

export default BandLivePanel;
