import { useEffect, useState } from "react";
import { Copy, Download, Loader2, Plus, Watch } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateBandCodes, MAXBAND_PREMIUM_DAYS } from "@/lib/band";

interface CodeRow {
  code: string;
  premium_days: number;
  batch: string | null;
  created_at: string;
  redeemed_at: string | null;
}

/** Owner panel: activation codes printed in MaxBand boxes (each gives Premium for N days). */
const BandCodesAdmin = () => {
  const [rows, setRows] = useState<CodeRow[]>([]);
  const [stats, setStats] = useState({ devices: 0, online: 0, sos30: 0 });
  const [count, setCount] = useState(10);
  const [days, setDays] = useState(MAXBAND_PREMIUM_DAYS);
  const [batch, setBatch] = useState("");
  const [fresh, setFresh] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("band_activation_codes" as any)
      .select("code, premium_days, batch, created_at, redeemed_at").order("created_at", { ascending: false }).limit(500);
    setRows((data as unknown as CodeRow[]) ?? []);
    // Counts only: owners do not see other people's health data.
    const { data: st } = await supabase.rpc("band_admin_stats" as any);
    if (st) setStats(st as any);
  };
  useEffect(() => { void load(); }, []);

  const make = async () => {
    if (!Number.isInteger(count) || count < 1 || count > 500) { toast.error("Soni 1–500"); return; }
    setBusy(true);
    try {
      const codes = await generateBandCodes(count, days, batch.trim());
      setFresh(codes);
      toast.success(`${codes.length} ta kod yaratildi`);
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    const blob = new Blob([`code,premium_days,batch\n${fresh.map((c) => `${c},${days},${batch.trim()}`).join("\n")}\n`], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `maxband-codes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const used = rows.filter((r) => r.redeemed_at).length;
  const input = "px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm w-full mt-1";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ["Kodlar", rows.length], ["Faollashtirilgan", used], ["Ulangan bilaguzuk", stats.devices], ["SOS / yiqilish (30 kun)", stats.sos30],
        ].map(([label, n]) => (
          <div key={label as string} className="bg-card rounded-xl border border-border p-4">
            <div className="text-2xl font-display font-bold text-foreground">{n}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-xl border border-border p-4">
        <h3 className="font-display font-semibold text-foreground flex items-center gap-2 mb-1"><Watch className="w-4 h-4" /> Quti uchun faollashtirish kodlari</h3>
        <p className="text-xs text-muted-foreground mb-3">Har bir MaxBand qutisiga bitta kod bosib qo'yiladi. Xaridor kodni saytga kiritsa, Premium shu muddatga yoqiladi (bir marta).</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-xs text-muted-foreground">Soni
            <input type="number" min={1} max={500} value={count} onChange={(e) => setCount(Number(e.target.value))} className={input} />
          </label>
          <label className="text-xs text-muted-foreground">Premium (kun)
            <input type="number" min={1} max={366} value={days} onChange={(e) => setDays(Number(e.target.value))} className={input} />
          </label>
          <label className="text-xs text-muted-foreground">Partiya (ixtiyoriy)
            <input value={batch} maxLength={60} onChange={(e) => setBatch(e.target.value)} placeholder="Masalan: 2026-noyabr" className={input} />
          </label>
        </div>
        <button onClick={make} disabled={busy} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Kod yaratish
        </button>

        {fresh.length > 0 && (
          <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-sm font-medium text-foreground">Yangi kodlar ({fresh.length})</span>
              <div className="flex gap-2">
                <button onClick={() => { void navigator.clipboard?.writeText(fresh.join("\n")); toast.success("Nusxa olindi"); }} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs"><Copy className="w-3.5 h-3.5" /> Nusxa</button>
                <button onClick={download} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs"><Download className="w-3.5 h-3.5" /> CSV</button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 font-mono text-xs">
              {fresh.map((c) => <span key={c} className="rounded bg-background px-2 py-1 border border-border text-center">{c}</span>)}
            </div>
          </div>
        )}
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs text-muted-foreground">
              <tr><th className="text-left p-2.5">Kod</th><th className="text-left p-2.5">Kun</th><th className="text-left p-2.5">Partiya</th><th className="text-left p-2.5">Holat</th></tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((r) => (
                <tr key={r.code} className="border-t border-border">
                  <td className="p-2.5 font-mono text-xs">{r.code}</td>
                  <td className="p-2.5">{r.premium_days}</td>
                  <td className="p-2.5 text-muted-foreground">{r.batch ?? "—"}</td>
                  <td className="p-2.5">{r.redeemed_at
                    ? <span className="text-xs text-emerald-600 dark:text-emerald-400">Faollashtirilgan {new Date(r.redeemed_at).toLocaleDateString()}</span>
                    : <span className="text-xs text-muted-foreground">Bo'sh</span>}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Hali kod yaratilmagan</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default BandCodesAdmin;
