import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CalendarClock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { loadFamily, type FamilyMember } from "@/lib/care";
import { bookConsultation, fmtSlotDay, fmtSlotFull, fmtSlotTime, loadSlots, slotDayKey, type Slot } from "@/lib/booking";

/**
 * Doctor profile: pick a free 30-minute slot inside the doctor's working hours and book it.
 * The price is taken from the balance like a normal consultation; cancelling 2+ hours before refunds it.
 */
const BookingPicker = ({ doctorId, departmentId, doctorUserId }: { doctorId: string; departmentId: string | null; doctorUserId: string }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [family, setFamily] = useState<FamilyMember[]>([]);
  const [forWhom, setForWhom] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSlots(doctorId, 7).then((s) => {
      setSlots(s);
      const firstFree = s.find((x) => !x.taken);
      setDay(firstFree ? slotDayKey(firstFree.slot_at) : null);
    });
    if (departmentId) {
      supabase.from("departments").select("price_uzs").eq("id", departmentId).maybeSingle()
        .then(({ data }) => setPrice(data ? Number((data as any).price_uzs) : null));
    }
  }, [doctorId, departmentId]);

  useEffect(() => { if (user) loadFamily().then(setFamily).catch(() => setFamily([])); }, [user]);

  const days = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots ?? []) {
      const k = slotDayKey(s.slot_at);
      map.set(k, [...(map.get(k) ?? []), s]);
    }
    return [...map.entries()];
  }, [slots]);

  if (user?.id === doctorUserId) return null;            // a doctor doesn't book himself
  if (slots === null) return null;
  if (slots.length === 0) {
    return (
      <div className="bg-card rounded-2xl border border-border p-5 card-shadow mt-6 text-sm text-muted-foreground flex items-center gap-2">
        <CalendarClock className="w-4 h-4 text-primary" /> Vaqtga yozilish: shifokor yaqin 7 kunga ish vaqtini kiritmagan.
      </div>
    );
  }

  const daySlots = days.find(([k]) => k === day)?.[1] ?? [];

  const book = async () => {
    if (!pick) return;
    if (!user) { navigate("/auth"); return; }
    setSaving(true);
    try {
      const id = await bookConsultation(doctorId, pick, forWhom || null);
      toast.success(`Yozildingiz: ${fmtSlotFull(pick)}`);
      navigate(`/consultation/${id}`);
    } catch (e: any) {
      const msg = String(e?.message || "");
      toast.error(msg, msg.includes("mablag") ? { action: { label: "Hamyon", onClick: () => navigate("/wallet") } } : undefined);
      loadSlots(doctorId, 7).then(setSlots);
      setPick(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-5 card-shadow mt-6">
      <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2 mb-1">
        <CalendarClock className="w-5 h-5 text-primary" /> Vaqtga yozilish
      </h2>
      <p className="text-xs text-muted-foreground mb-4">Navbatda kutmang: qulay vaqtni tanlang. Vaqtingizdan 15 daqiqa oldin navbatning boshiga o'tasiz. Toshkent vaqti.</p>

      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
        {days.map(([k, list]) => {
          const free = list.filter((s) => !s.taken).length;
          return (
            <button key={k} onClick={() => { setDay(k); setPick(null); }} disabled={free === 0}
              className={`shrink-0 rounded-xl border px-3 py-2 text-left text-xs disabled:opacity-40 ${day === k ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border"}`}>
              <span className="block font-medium text-foreground">{fmtSlotDay(list[0].slot_at)}</span>
              <span className="text-muted-foreground">{free} ta bo'sh</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-3">
        {daySlots.map((s) => (
          <button key={s.slot_at} disabled={s.taken} onClick={() => setPick(s.slot_at)}
            className={`rounded-lg border py-2 text-sm ${s.taken ? "border-border text-muted-foreground line-through opacity-50" : pick === s.slot_at ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:border-primary/50"}`}>
            {fmtSlotTime(s.slot_at)}
          </button>
        ))}
      </div>

      {pick && (
        <div className="mt-4 rounded-xl bg-secondary/40 p-4 space-y-3">
          <p className="text-sm text-foreground"><b>{fmtSlotFull(pick)}</b>{price !== null && <> · {price.toLocaleString()} UZS</>}</p>
          {family.length > 0 && (
            <select value={forWhom} onChange={(e) => setForWhom(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm">
              <option value="">O'zim uchun</option>
              {family.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          )}
          <p className="text-xs text-muted-foreground">To'lov hozir balansdan yechiladi. Qabulga 2 soatdan ko'p qolganda bekor qilsangiz, pul to'liq qaytadi. Shifokor rad etsa ham qaytadi.</p>
          {user ? (
            <button onClick={book} disabled={saving}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60 inline-flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Yozilish
            </button>
          ) : (
            <Link to="/auth" className="block text-center w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium">Yozilish uchun tizimga kiring</Link>
          )}
        </div>
      )}
    </div>
  );
};

export default BookingPicker;
