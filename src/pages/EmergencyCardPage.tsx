import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Copy, Crown, FileDown, IdCard, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";
import jsPDF from "jspdf";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { usePlanStatus } from "@/lib/planPerks";
import {
  BLOOD_TYPES, emergencyCardUrl, loadEmergencyCards, loadFamily, saveEmergencyCard, type EmergencyCard, type FamilyMember,
} from "@/lib/care";
import { isLatinPrintable, pdfSafe } from "@/lib/healthReportPdf";
import { savePdf } from "@/lib/native";

const blank = (memberId: string | null): EmergencyCard => ({
  family_member_id: memberId, blood_type: null, allergies: null, conditions: null, medications: null,
  contact_name: null, contact_phone: null, notes: null, is_enabled: true,
});

const EmergencyCardPage = () => {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { status } = usePlanStatus(!!user);
  const [family, setFamily] = useState<FamilyMember[]>([]);
  const [cards, setCards] = useState<EmergencyCard[] | null>(null);
  const [who, setWho] = useState<string>(params.get("member") ?? "");
  const [form, setForm] = useState<EmergencyCard>(blank(null));
  const [qr, setQr] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [f, c] = await Promise.all([loadFamily(), loadEmergencyCards()]);
    setFamily(f);
    setCards(c);
  };
  useEffect(() => {
    if (loading) return;
    if (!user) { navigate("/auth"); return; }
    void load();
  }, [user, loading]);

  const card = useMemo(() => (cards ?? []).find((c) => (c.family_member_id ?? "") === who) ?? null, [cards, who]);
  useEffect(() => { setForm(card ? { ...card } : blank(who || null)); }, [card, who]);

  const url = card?.token ? emergencyCardUrl(card.token) : "";
  useEffect(() => {
    if (!url) { setQr(""); return; }
    QRCode.toDataURL(url, { width: 480, margin: 1, errorCorrectionLevel: "M" }).then(setQr).catch(() => setQr(""));
  }, [url]);

  const allowed = !!status?.limits.emergency_card;
  const personName = who ? family.find((m) => m.id === who)?.full_name ?? "" : profile?.full_name ?? "";

  const save = async (regenerate = false) => {
    setSaving(true);
    try {
      await saveEmergencyCard({ ...form, family_member_id: who || null }, regenerate);
      toast.success(regenerate ? "Yangi QR yaratildi. Eski QR endi ishlamaydi." : "Karta saqlandi");
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = async () => {
    if (!qr || !card) return;
    const doc = new jsPDF({ unit: "mm", format: [86, 140] });
    const t = (s: string | null | undefined) => (s && isLatinPrintable(s) ? pdfSafe(s) : s ? "-" : "-");
    doc.setFillColor(200, 30, 45); doc.rect(0, 0, 86, 16, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text("FAVQULODDA TIBBIY KARTA", 43, 7, { align: "center" });
    doc.setFontSize(7); doc.setFont("helvetica", "normal");
    doc.text("EMERGENCY MEDICAL CARD · MaxHospital", 43, 12, { align: "center" });
    doc.setTextColor(20, 20, 20);
    doc.setFontSize(11); doc.setFont("helvetica", "bold");
    doc.text(t(personName), 43, 23, { align: "center", maxWidth: 78 });
    doc.setFontSize(9);
    doc.text(`Qon guruhi / Blood: ${card.blood_type ?? "-"}`, 43, 29, { align: "center" });
    doc.addImage(qr, "PNG", 18, 33, 50, 50);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
    let y = 89;
    const row = (label: string, value: string | null) => {
      if (!value) return;
      const lines = doc.splitTextToSize(`${label}: ${t(value)}`, 76);
      doc.text(lines.slice(0, 3), 5, y); y += 3.6 * Math.min(lines.length, 3) + 1;
    };
    row("Allergiya", card.allergies);
    row("Kasalliklar", card.conditions);
    row("Dorilar", card.medications);
    row("Yaqin odam", [card.contact_name, card.contact_phone].filter(Boolean).join(", ") || null);
    doc.setFontSize(6.5); doc.setTextColor(120, 120, 120);
    doc.text("QR kodni telefon kamerasi bilan skanerlang / Scan the QR code", 43, 136, { align: "center" });
    await savePdf(doc, "favqulodda-karta.pdf");
  };

  const input = "w-full mt-1 px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="flex items-start gap-3 mb-6">
            <div className="w-11 h-11 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0"><IdCard className="w-5 h-5 text-red-600" /></div>
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground">Favqulodda tibbiy karta</h1>
              <p className="text-sm text-muted-foreground">
                Qon guruhi, allergiya, kasalliklar va yaqin odam raqami. QR kodni telefon ekraniga yoki hamyoningizga qo'ying —
                tez yordam xodimi skanerlab, darhol ko'radi. Login kerak emas.
              </p>
            </div>
          </div>

          {family.length > 0 && (
            <div className="-mx-4 px-4 overflow-x-auto mb-4">
              <div className="flex gap-2 w-max">
                {[{ id: "", full_name: "O'zim" }, ...family].map((m) => (
                  <button key={m.id} onClick={() => setWho(m.id)}
                    className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap border ${who === m.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-foreground"}`}>
                    {m.full_name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {status && !allowed && !card && (
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center mb-6">
              <Crown className="w-8 h-8 mx-auto text-amber-500 mb-2" />
              <p className="text-sm text-muted-foreground mb-4">Favqulodda karta Pro va Premium tariflarida yaratiladi. Yaratilgan karta obuna tugasa ham ochilaveradi.</p>
              <Link to="/pro" className="inline-flex items-center gap-2 rounded-xl bg-hero-gradient px-5 py-2.5 text-sm font-semibold text-primary-foreground"><Crown className="w-4 h-4" /> Tariflar</Link>
            </div>
          )}

          {cards === null ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (allowed || card) && (
            <div className="grid md:grid-cols-[1fr_280px] gap-6">
              <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-xs text-muted-foreground">Qon guruhi
                    <select disabled={!allowed} value={form.blood_type ?? ""} onChange={(e) => setForm({ ...form, blood_type: e.target.value || null })} className={input}>
                      <option value="">Bilmayman</option>
                      {BLOOD_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-muted-foreground">Yaqin odam telefoni
                    <input disabled={!allowed} value={form.contact_phone ?? ""} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} className={input} placeholder="+998 90 123 45 67" inputMode="tel" />
                  </label>
                  <label className="text-xs text-muted-foreground sm:col-span-2">Yaqin odam (kim)
                    <input disabled={!allowed} value={form.contact_name ?? ""} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} maxLength={100} className={input} placeholder="Masalan: Onasi — Malika" />
                  </label>
                  {([
                    ["allergies", "Allergiyalar", "Masalan: penitsillin, yong'oq"],
                    ["conditions", "Surunkali kasalliklar", "Masalan: qandli diabet 2-tur, astma"],
                    ["medications", "Doimiy ichadigan dorilar", "Masalan: Metformin 500 mg kuniga 2 marta"],
                    ["notes", "Qo'shimcha", "Masalan: yurak stimulyatori bor"],
                  ] as const).map(([k, label, ph]) => (
                    <label key={k} className="text-xs text-muted-foreground sm:col-span-2">{label}
                      <textarea disabled={!allowed} value={(form as any)[k] ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} rows={2} maxLength={500} className={`${input} resize-none`} placeholder={ph} />
                    </label>
                  ))}
                </div>
                <label className="mt-3 flex items-center gap-2 text-sm text-foreground">
                  <input type="checkbox" disabled={!allowed} checked={form.is_enabled} onChange={(e) => setForm({ ...form, is_enabled: e.target.checked })} />
                  QR orqali ko'rish yoqilgan
                </label>
                {allowed && (
                  <button onClick={() => save(false)} disabled={saving} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />} Saqlash
                  </button>
                )}
              </div>

              <div className="rounded-2xl border border-red-500/30 bg-card p-4 text-center h-fit">
                {card && qr ? (
                  <>
                    <div className="text-sm font-semibold text-foreground break-words">{personName}</div>
                    {!card.is_enabled && <div className="mt-1 text-xs text-destructive">QR o'chirilgan</div>}
                    <img src={qr} alt="Favqulodda karta QR kodi" className="mx-auto my-3 w-56 h-56 rounded-lg border border-border bg-white p-2" />
                    <div className="grid gap-2">
                      <button onClick={downloadPdf} className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white"><FileDown className="w-4 h-4" /> Karta PDF (chop etish)</button>
                      <button onClick={() => { navigator.clipboard?.writeText(url); toast.success("Havola nusxalandi"); }} className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-foreground hover:bg-secondary"><Copy className="w-4 h-4" /> Havolani nusxalash</button>
                      <a href={url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Tez yordam ko'radigan sahifa →</a>
                      {allowed && (
                        <button onClick={() => { if (confirm("Yangi QR yaratilsa, eski QR (chop etilgan karta) ishlamay qoladi. Davom etasizmi?")) void save(true); }}
                          className="inline-flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><RefreshCw className="w-3.5 h-3.5" /> Yangi QR (eskisini bekor qilish)</button>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="py-8 text-sm text-muted-foreground"><ShieldAlert className="w-8 h-8 mx-auto mb-2 text-red-500" />Ma'lumotlarni saqlang — QR kod shu yerda paydo bo'ladi.</div>
                )}
              </div>
            </div>
          )}
          <p className="mt-6 text-xs text-muted-foreground">
            QR orqali faqat shu kartadagi ma'lumot ko'rinadi: retseptlar, tahlillar va boshqa ma'lumotlar ko'rinmaydi. Kartani istalgan vaqtda o'chirib qo'yishingiz yoki yangi QR yaratishingiz mumkin.
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default EmergencyCardPage;
