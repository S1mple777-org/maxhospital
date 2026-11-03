import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Earnings {
  is_doctor: boolean; pct?: number; accrued_uzs?: number; paid_uzs?: number; month_uzs?: number; count?: number;
  recent?: { created_at: string; gross_uzs: number; share_pct: number; amount_uzs: number; status: "accrued" | "paid" }[];
}

const uzs = (n: number | undefined) => `${Number(n ?? 0).toLocaleString("ru-RU")} so'm`;

/** Shifokor kabinetida: maosh hisobi — har bir yakunlangan konsultatsiya narxining ulushi (hozir 35%). */
const DoctorEarnings = () => {
  const [e, setE] = useState<Earnings | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    void (supabase as any).rpc("my_doctor_earnings").then(({ data }: any) => setE(data ?? null));
  }, []);
  if (!e?.is_doctor) return null;

  return (
    <div className="mb-6 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Wallet className="w-5 h-5 text-emerald-600" />
        <h3 className="font-display font-semibold text-foreground">Maosh hisobim</h3>
        <span className="ml-auto text-xs text-muted-foreground">Har konsultatsiyadan {e.pct ?? 35}%</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-secondary p-3">
          <p className="text-[11px] text-muted-foreground">Hisoblangan</p>
          <p className="text-sm font-bold text-foreground">{uzs(e.accrued_uzs)}</p>
        </div>
        <div className="rounded-xl bg-secondary p-3">
          <p className="text-[11px] text-muted-foreground">Shu oy</p>
          <p className="text-sm font-bold text-foreground">{uzs(e.month_uzs)}</p>
        </div>
        <div className="rounded-xl bg-secondary p-3">
          <p className="text-[11px] text-muted-foreground">To'langan</p>
          <p className="text-sm font-bold text-foreground">{uzs(e.paid_uzs)}</p>
        </div>
      </div>
      {!!e.recent?.length && (
        <>
          <button onClick={() => setOpen(!open)} className="mt-3 text-xs text-primary font-medium hover:underline">
            {open ? "Yashirish" : `So'nggi yozuvlar (${e.count})`}
          </button>
          {open && (
            <ul className="mt-2 max-h-56 overflow-y-auto divide-y divide-border text-xs">
              {e.recent.map((r, i) => (
                <li key={i} className="py-1.5 flex gap-2 items-center">
                  <span className="w-20 shrink-0 text-muted-foreground">{new Date(r.created_at).toLocaleDateString("uz-UZ")}</span>
                  <span className="flex-1 text-muted-foreground">{uzs(r.gross_uzs)} × {r.share_pct}%</span>
                  <span className="font-semibold text-foreground">+{uzs(r.amount_uzs)}</span>
                  <span className={r.status === "paid" ? "text-emerald-600" : "text-amber-600"}>{r.status === "paid" ? "to'langan" : "hisoblangan"}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {!e.recent?.length && <p className="mt-3 text-xs text-muted-foreground">Hozircha yozuv yo'q. Konsultatsiya yakunlangach ulush shu yerda paydo bo'ladi.</p>}
    </div>
  );
};

export default DoctorEarnings;
