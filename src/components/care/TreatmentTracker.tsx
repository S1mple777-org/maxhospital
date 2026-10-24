import { useEffect, useState } from "react";
import { HeartPulse, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ANSWERS, answerCheckin, answerInfo, loadCheckins, type Checkin, type CheckinAnswer } from "@/lib/treatment";

/**
 * "Davolanish kuzatuvi" on the prescription page: 3rd and 7th day check-ins.
 * Patient answers with one tap; the prescribing doctor sees the result.
 */
const TreatmentTracker = ({ prescriptionId, isPatient }: { prescriptionId: string; isPatient: boolean }) => {
  const [items, setItems] = useState<Checkin[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = () => loadCheckins(prescriptionId).then(setItems);
  useEffect(() => { void reload(); }, [prescriptionId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!items || items.length === 0) return null;

  const answer = async (c: Checkin, a: CheckinAnswer) => {
    setBusy(c.id + a);
    const r = await answerCheckin(c.id, a);
    setBusy(null);
    if (r === "error") toast.error("Javob yuborilmadi. Qayta urinib ko'ring.");
    else {
      toast.success(a === "worse" ? "Shifokorga xabar berildi" : "Rahmat, javobingiz shifokorga yetdi");
      void reload();
    }
  };

  const now = Date.now();
  return (
    <div className="mt-6 bg-card rounded-2xl border border-border p-5 card-shadow">
      <h2 className="font-display font-semibold text-foreground flex items-center gap-2 mb-1"><HeartPulse className="w-4 h-4 text-primary" /> Davolanish kuzatuvi</h2>
      <p className="text-xs text-muted-foreground mb-4">
        {isPatient ? "Retseptdan keyin ahvolingiz qanday o'zgarayotganini shifokorga bildirib turing." : "Bemorning davolanish davomidagi javoblari."}
      </p>
      <div className="space-y-3">
        {items.map((c) => {
          const due = new Date(c.due_at).getTime() <= now;
          const info = answerInfo(c.answer);
          const days = c.seq === 1 ? 3 : 7;
          return (
            <div key={c.id} className="rounded-xl bg-secondary/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">{days}-kun</p>
                {info ? (
                  <span className={`text-xs px-2 py-1 rounded-full border ${info.cls}`}>{info.emoji} {info.label}</span>
                ) : (
                  <span className="text-xs text-muted-foreground">{due ? "Javob kutilmoqda" : `${new Date(c.due_at).toLocaleDateString("uz-UZ")} da so'raladi`}</span>
                )}
              </div>
              {info && c.answered_at && <p className="text-xs text-muted-foreground mt-1">{new Date(c.answered_at).toLocaleString("uz-UZ")}</p>}
              {c.note && <p className="text-sm text-foreground mt-1 break-words">«{c.note}»</p>}
              {isPatient && due && !c.answer && (
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {ANSWERS.map((a) => (
                    <button key={a.key} disabled={!!busy} onClick={() => answer(c, a.key)}
                      className={`rounded-xl border px-2 py-2 text-xs font-medium disabled:opacity-60 ${a.cls}`}>
                      {busy === c.id + a.key ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : <><span className="block text-lg leading-none mb-1">{a.emoji}</span>{a.label}</>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TreatmentTracker;
