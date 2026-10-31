import { useEffect, useState } from "react";
import { Loader2, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { acceptGuardian, inviteGuardian, loadGuardianLinks, removeGuardianLink, type GuardianLink } from "@/lib/band";

/**
 * Yaqinlar: dori 30 daqiqada ichilmasa (eslatmaga "Ichdim" bosilmasa) ular Telegram va saytda xabar oladi.
 * MaxBand oila nazorati bilan bir xil ro'yxat (band_guardians): bir marta qo'shiladi, ikkalasida ishlaydi.
 */
const MedFamilyCard = ({ note }: { note?: string } = {}) => {
  const { user } = useAuth();
  const [links, setLinks] = useState<{ mine: GuardianLink[]; watching: GuardianLink[] } | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => { if (user) setLinks(await loadGuardianLinks(user.id).catch(() => ({ mine: [], watching: [] }))); };
  useEffect(() => { void load(); }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!user || !links) return null;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e: any) { toast.error(e?.message || "Xatolik"); } finally { setBusy(null); }
  };
  const pendingForMe = links.watching.filter((l) => l.status === "pending");

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Yaqinlarim</h2>
      <p className="text-xs text-muted-foreground mt-1">
        {note ?? <>Dorini 30 daqiqa ichida «Ichdim» deb belgilamasangiz, yaqiningizga Telegram va saytda xabar boradi:
        «Onangiz soat 8:00 dagi dorini ichmadi». Avval o'zingizga 10 daqiqadan keyin qayta eslatiladi. Premium tarifda.</>}
      </p>

      {pendingForMe.length > 0 && (
        <div className="mt-3 space-y-2">
          {pendingForMe.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-2 rounded-xl bg-primary/5 p-2 text-sm">
              <span className="min-w-0 truncate"><b>{(l as any).other_name ?? "Foydalanuvchi"}</b> sizni yaqini sifatida qo'shmoqchi</span>
              <span className="flex gap-1 shrink-0">
                <button onClick={() => run(`a-${l.id}`, async () => { await acceptGuardian(l.id); toast.success("Qabul qilindi"); await load(); })}
                  className="rounded-lg bg-primary px-2.5 py-1 text-xs text-primary-foreground">Qabul</button>
                <button onClick={() => run(`r-${l.id}`, async () => { await removeGuardianLink(l.id); await load(); })}
                  className="rounded-lg border border-border px-2.5 py-1 text-xs">Rad</button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 space-y-1.5">
        {links.mine.map((l) => (
          <div key={l.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">{(l as any).other_name ?? "Foydalanuvchi"} <span className="text-xs text-muted-foreground">· {l.status === "accepted" ? "xabar oladi" : "taklif kutilmoqda"}</span></span>
            <button onClick={() => run(`d-${l.id}`, async () => { await removeGuardianLink(l.id); await load(); })} aria-label="O'chirish"
              className="p-1 rounded text-destructive hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Yaqiningizning emaili (MaxHospital akkaunti)"
          className="flex-1 min-w-0 rounded-xl border border-input bg-background px-3 py-2 text-sm" />
        <button disabled={!email.trim() || busy === "invite"}
          onClick={() => run("invite", async () => { await inviteGuardian(email); setEmail(""); toast.success("Taklif yuborildi. Yaqiningiz uni qabul qilishi kerak."); await load(); })}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
          {busy === "invite" ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Qo'shish
        </button>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Yaqiningiz Telegram'ni profilida ulagan bo'lsa, xabar Telegramga ham keladi. Bu ro'yxat MaxBand oila nazorati bilan umumiy.</p>
    </section>
  );
};

export default MedFamilyCard;
