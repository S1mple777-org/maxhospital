import { useEffect, useState } from "react";
import { CalendarClock, Hourglass, Loader2, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { CANCEL_BEFORE_MS, cancelBooking, fmtSlotFull, fmtWait, loadQueueStatus, type QueueStatus } from "@/lib/booking";

/**
 * Patient view of a consultation that has not started yet:
 *  - booked for later: the time and a cancel button (2+ hours before);
 *  - in the live queue: position and estimated wait, refreshed every 20 seconds.
 */
const QueueStatusBanner = ({ consultationId, onCancelled }: { consultationId: string; onCancelled?: () => void }) => {
  const [q, setQ] = useState<QueueStatus | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => loadQueueStatus(consultationId).then((r) => { if (alive) setQ(r); });
    void load();
    const t = setInterval(load, 20_000);
    return () => { alive = false; clearInterval(t); };
  }, [consultationId]);

  if (!q?.found || q.status !== "pending") return null;

  if (q.booked && q.scheduled_at && q.position === undefined) {
    const canCancel = Date.parse(q.scheduled_at) - Date.now() > CANCEL_BEFORE_MS;
    const cancel = async () => {
      if (!confirm("Yozuvni bekor qilasizmi? Pul balansingizga qaytadi.")) return;
      setCancelling(true);
      try {
        await cancelBooking(consultationId);
        toast.success("Yozuv bekor qilindi, pul qaytarildi");
        onCancelled?.();
      } catch (e: any) {
        toast.error(e.message);
      } finally {
        setCancelling(false);
      }
    };
    return (
      <div className="mx-3 sm:mx-4 mt-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
        <p className="text-sm font-medium text-foreground flex items-center gap-2"><CalendarClock className="w-4 h-4 text-primary" /> Qabul vaqti: {fmtSlotFull(q.scheduled_at)}</p>
        <p className="text-xs text-muted-foreground mt-1">Vaqtingizdan 15 daqiqa oldin navbatning boshiga o'tasiz. Bir soat oldin eslatma keladi. Shu sahifada shifokorga yozib qo'yishingiz mumkin.</p>
        {canCancel ? (
          <button onClick={cancel} disabled={cancelling} className="mt-2 text-xs text-destructive font-medium hover:underline inline-flex items-center gap-1 disabled:opacity-60">
            {cancelling && <Loader2 className="w-3 h-3 animate-spin" />} Yozuvni bekor qilish
          </button>
        ) : <p className="mt-2 text-[11px] text-muted-foreground">Qabulga 2 soatdan kam qoldi, endi bekor qilib bo'lmaydi.</p>}
      </div>
    );
  }

  const ahead = q.ahead ?? 0;
  return (
    <div className="mx-3 sm:mx-4 mt-2 rounded-xl border border-warning/40 bg-warning/5 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-warning/15 flex items-center justify-center shrink-0">
          <span className="text-lg font-bold text-foreground">{q.position ?? 1}</span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground flex items-center gap-1.5"><Hourglass className="w-3.5 h-3.5" /> Navbatdagi o'rningiz: {q.position ?? 1}</p>
          <p className="text-xs text-muted-foreground">
            {ahead === 0 && !q.busy ? "Siz birinchisiz, shifokor tez orada qabul qiladi." : `Oldingizda ${ahead} kishi${q.busy ? " va hozir qabul ketyapti" : ""}. Taxminiy kutish: ${fmtWait(q.estimate_minutes ?? 0)}.`}
          </p>
        </div>
      </div>
      {!q.doctor_online && (
        <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5"><WifiOff className="w-3.5 h-3.5" /> Shifokor hozir offline. U kirishi bilan navbat davom etadi.</p>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">Sahifani yopsangiz ham bo'ladi: shifokor qabul qilganda saytda va Telegramda xabar keladi. Taxmin shifokorning oxirgi qabullari davomiyligidan hisoblanadi.</p>
    </div>
  );
};

export default QueueStatusBanner;
