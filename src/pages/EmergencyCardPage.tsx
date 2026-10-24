import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Copy, Crown, Eye, EyeOff, FileDown, IdCard, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import QRCode from "qrcode";
import jsPDF from "jspdf";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { usePlanStatus } from "@/lib/planPerks";
import {
  BLOOD_TYPES, emergencyCardUrl, isSectionVisible, loadEmergencyCards, loadFamily, saveEmergencyCard,
  type EmergencyCard, type FamilyMember, type PassportSectionKey,
} from "@/lib/care";
import { isLatinPrintable, pdfSafe } from "@/lib/healthReportPdf";
import { savePdf } from "@/lib/native";

const blank = (memberId: string | null): EmergencyCard => ({
  family_member_id: memberId, blood_type: null, allergies: null, conditions: null, medications: null,
  contact_name: null, contact_phone: null, notes: null, is_enabled: true,
  birth_date: null, gender: null, height_cm: null, weight_kg: null, address: null, surgeries: null, vaccinations: null,
  family_history: null, insurance: null, organ_donor: null, doctor_name: null, doctor_phone: null,
  contact2_name: null, contact2_phone: null, visibility: {},
});

type TextKey = "allergies" | "conditions" | "medications" | "notes" | "surgeries" | "vaccinations" | "family_history";
interface PField { vis: Record<string, boolean>; off: boolean; toggle: (k: PassportSectionKey) => void }

// Defined at module level on purpose: components declared inside the page would remount on every keystroke and steal input focus.
const Group = ({ title }: { title: string }) => (
  <h2 className="sm:col-span-2 mt-2 border-b border-border pb-1 text-sm font-semibold text-foreground">{title}</h2>
);
const Field = ({ k, label, span, vis, off, toggle, hint, children }: PField & { k: PassportSectionKey; label: string; span?: boolean; hint?: [string, string]; children: React.ReactNode }) => {
  const on = isSectionVisible(vis, k);
  return (
    <div className={`text-xs text-muted-foreground ${span ? "sm:col-span-2" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <span>{label}</span>
        <button type="button" disabled={off} onClick={() => toggle(k)} aria-pressed={on}
          title={on ? (hint?.[0] ?? "QR orqali ko'rinadi") : (hint?.[1] ?? "QR orqali yashirilgan")}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${on ? "bg-green-500/10 text-green-700" : "bg-muted text-muted-foreground"}`}>
          {on ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />} {on ? "Ko'rinadi" : "Yashirin"}
        </button>
      </div>
      {children}
    </div>
  );
};
const TextField = ({ k, label, ph, form, setForm, ...f }: PField & { k: TextKey; label: string; ph: string; form: EmergencyCard; setForm: (c: EmergencyCard) => void }) => (
  <Field k={k} label={label} span {...f}>
    <textarea disabled={f.off} value={form[k] ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} rows={2} maxLength={500}
      className="w-full mt-1 px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm resize-none" placeholder={ph} />
  </Field>
);

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
    const doc = new jsPDF({ unit: "mm", format: [86, 150] });
    const t = (x: string | null | undefined) => (x && isLatinPrintable(x) ? pdfSafe(x) : x ? "-" : "-");
    const vis = (k: PassportSectionKey) => isSectionVisible(card.visibility, k);
    doc.setFillColor(200, 30, 45); doc.rect(0, 0, 86, 16, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text("MAXHOSPITAL PASSPORT", 43, 7, { align: "center" });
    doc.setFontSize(7); doc.setFont("helvetica", "normal");
    doc.text("HEALTH PASSPORT · MaxHospital", 43, 12, { align: "center" });
    doc.setTextColor(20, 20, 20);
    doc.setFontSize(11); doc.setFont("helvetica", "bold");
    if (vis("full_name")) doc.text(t(personName), 43, 23, { align: "center", maxWidth: 78 });
    doc.setFontSize(9);
    if (vis("blood_type")) doc.text(`Qon guruhi / Blood: ${card.blood_type ?? "-"}`, 43, 29, { align: "center" });
    doc.addImage(qr, "PNG", 18, 33, 50, 50);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
    let y = 89;
    const row = (label: string, value: string | null) => {
      if (!value || y > 138) return;
      const lines = doc.splitTextToSize(`${label}: ${t(value)}`, 76);
      doc.text(lines.slice(0, 2), 5, y); y += 3.6 * Math.min(lines.length, 2) + 1;
    };
    if (vis("allergies")) row("Allergiya", card.allergies);
    if (vis("conditions")) row("Kasalliklar", card.conditions);
    if (vis("medications")) row("Dorilar", card.medications);
    if (vis("contact")) row("Yaqin odam", [card.contact_name, card.contact_phone].filter(Boolean).join(", ") || null);
    doc.setFontSize(6.5); doc.setTextColor(120, 120, 120);
    doc.text("QR: boshqa ma'lumotlar bemor ruxsati bilan ko'rinadi / Scan the QR code", 43, 146, { align: "center" });
    await savePdf(doc, "maxhospital-passport.pdf");
  };

  const input = "w-full mt-1 px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm";

  const toggleVis = (k: PassportSectionKey) =>
    setForm((f) => ({ ...f, visibility: { ...f.visibility, [k]: !isSectionVisible(f.visibility, k) } }));
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="flex items-start gap-3 mb-6">
            <div className="w-11 h-11 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0"><IdCard className="w-5 h-5 text-red-600" /></div>
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground">MaxHospital Passport</h1>
              <p className="text-sm text-muted-foreground">
                Sog'liq pasportingiz: qon guruhi, allergiya, kasalliklar, operatsiyalar, emlashlar va aloqa ma'lumotlari. QR kodni telefon ekraniga
                yoki hamyoningizga qo'ying — tez yordam xodimi skanerlab ko'radi. Login kerak emas. Qaysi ma'lumot ko'rinishini o'zingiz tanlaysiz.
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
              <p className="text-sm text-muted-foreground mb-4">MaxHospital Passport Pro va Premium tariflarida yaratiladi. Yaratilgan karta obuna tugasa ham ochilaveradi.</p>
              <Link to="/pro" className="inline-flex items-center gap-2 rounded-xl bg-hero-gradient px-5 py-2.5 text-sm font-semibold text-primary-foreground"><Crown className="w-4 h-4" /> Tariflar</Link>
            </div>
          )}

          {cards === null ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (allowed || card) && (
            <div className="grid md:grid-cols-[1fr_280px] gap-6">
              <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                <p className="mb-3 text-xs text-muted-foreground">
                  Har bir bo'limning yonidagi <Eye className="inline w-3.5 h-3.5" /> tugmasi QR ni skanerlaganlarga shu ma'lumot ko'rinishini boshqaradi.
                  Yashirilgan ma'lumot faqat sizga ko'rinadi.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Group title="Shaxsiy" />
                  <Field vis={form.visibility} off={!allowed} toggle={toggleVis} k="full_name" label="Ism-familiya" span>
                    <div className={`${input} bg-muted/40 text-muted-foreground`}>{personName || "—"}</div>
                  </Field>
                  <Field vis={form.visibility} off={!allowed} toggle={toggleVis} k="birth_date" label="Tug'ilgan sana">
                    <input type="date" disabled={!allowed} value={form.birth_date ?? ""} max={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setForm({ ...form, birth_date: e.target.value || null })} className={input} />
                  </Field>
                  <Field vis={form.visibility} off={!allowed} toggle={toggleVis} k="gender" label="Jinsi">
                    <select disabled={!allowed} value={form.gender ?? ""} onChange={(e) => setForm({ ...form, gender: (e.target.value || null) as EmergencyCard["gender"] })} className={input}>
                      <option value="">Ko'rsatilmagan</option>
                      <option value="male">Erkak</option>
                      <option value="female">Ayol</option>
                    </select>
                  </Field>
                  <Field vis={form.visibility} off={!allowed} toggle={toggleVis} k="body" label="Bo'y (sm) va vazn (kg)" span>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="number" inputMode="numeric" min={30} max={260} disabled={!allowed} value={form.height_cm ?? ""} placeholder="Bo'y, sm"
                        onChange={(e) => setForm({ ...form, height_cm: e.target.value ? Number(e.target.value) : null })} className={input} />
                      <input type="number" inputMode="decimal" min={1} max={500} step="0.1" disabled={!allowed} value={form.weight_kg ?? ""} placeholder="Vazn, kg"
                        onChange={(e) => setForm({ ...form, weight_kg: e.target.value ? Number(e.target.value) : null })} className={input} />
                    </div>
                  </Field>
                  <Field vis={form.visibility} off={!allowed} toggle={toggleVis} k="address" label="Yashash manzili" span>
                    <input disabled={!allowed} value={form.address ?? ""} maxLength={200} onChange={(e) => setForm({ ...form, address: e.target.value })} className={input} placeholder="Shahar, tuman, ko'cha" />
                  </Field>

                  <Group title="Favqulodda ma'lumotlar" />
                  <Field vis={form.visibility} off={!allowed} toggle={toggleVis} k="blood_type" label="Qon guruhi" span>
                    <select disabled={!allowed} value={form.blood_type ?? ""} onChange={(e) => setForm({ ...form, blood_type: e.target.value || null })} className={input}>
                      <option value="">Bilmayman</option>
                      {BLOOD_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </Field>
                  <TextField vis={form.visibility} off={!allowed} toggle={toggleVis} form={form} setForm={setForm} k="allergies" label="Allergiyalar" ph="Masalan: penitsillin, yong'oq" />
                  <TextField vis={form.visibility} off={!allowed} toggle={toggleVis} form={form} setForm={setForm} k="conditions" label="Surunkali kasalliklar" ph="Masalan: qandli diabet 2-tur, astma" />
                  <TextField vis={form.visibility} off={!allowed} toggle={toggleVis} form={form} setForm={setForm} k="medications" label="Doimiy ichadigan dorilar" ph="Masalan: Metformin 500 mg kuniga 2 marta" />
                  <TextField vis={form.visibility} off={!allowed} toggle={toggleVis} form={form} setForm={setForm} k="notes" label="Qo'shimcha eslatma" ph="Masalan: yurak stimulyatori bor" />

                  <Group title="Tibbiy tarix" />
                  <TextField vis={form.visibility} off={!allowed} toggle={toggleVis} form={form} setForm={setForm} k="surgeries" label="O'tkazilgan operatsiyalar" ph="Masalan: 2019 — appendektomiya" />
                  <TextField vis={form.visibility} off={!allowed} toggle={toggleVis} form={form} setForm={setForm} k="vaccinations" label="Emlashlar" ph="Masalan: COVID-19 (2022), gepatit B" />
                  <TextField vis={form.visibility} off={!allowed} toggle={toggleVis} form={form} setForm={setForm} k="family_history" label="Oilaviy kasalliklar" ph="Masalan: otasida gipertoniya" />

                  <Group title="Aloqa" />
                  <Field vis={form.visibility} off={!allowed} toggle={toggleVis} k="contact" label="Yaqin odam" span>
                    <div className="grid sm:grid-cols-2 gap-2">
                      <input disabled={!allowed} value={form.contact_name ?? ""} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} maxLength={100} className={input} placeholder="Kim: Onasi — Malika" />
                      <input disabled={!allowed} value={form.contact_phone ?? ""} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} className={input} placeholder="+998 90 123 45 67" inputMode="tel" />
                    </div>
                  </Field>
                  <Field vis={form.visibility} off={!allowed} toggle={toggleVis} k="contact2" label="Ikkinchi yaqin odam" span>
                    <div className="grid sm:grid-cols-2 gap-2">
                      <input disabled={!allowed} value={form.contact2_name ?? ""} onChange={(e) => setForm({ ...form, contact2_name: e.target.value })} maxLength={100} className={input} placeholder="Kim" />
                      <input disabled={!allowed} value={form.contact2_phone ?? ""} onChange={(e) => setForm({ ...form, contact2_phone: e.target.value })} className={input} placeholder="+998 ..." inputMode="tel" />
                    </div>
                  </Field>
                  <Field vis={form.visibility} off={!allowed} toggle={toggleVis} k="doctor" label="Davolovchi shifokor" span>
                    <div className="grid sm:grid-cols-2 gap-2">
                      <input disabled={!allowed} value={form.doctor_name ?? ""} onChange={(e) => setForm({ ...form, doctor_name: e.target.value })} maxLength={100} className={input} placeholder="Ism, mutaxassislik" />
                      <input disabled={!allowed} value={form.doctor_phone ?? ""} onChange={(e) => setForm({ ...form, doctor_phone: e.target.value })} className={input} placeholder="+998 ..." inputMode="tel" />
                    </div>
                  </Field>

                  <Group title="Konsultatsiyalar tarixi" />
                  <Field vis={form.visibility} off={!allowed} toggle={toggleVis} k="history" label="Tashxislar, retseptlar va shifokor izohlari" span>
                    <p className="mt-1 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      Tugagan konsultatsiyalaringiz avtomatik qo'shiladi: sana, bo'lim, shifokor, tashxis, dorilar va shifokor izohi.
                      Qo'lda yozish shart emas. «Ko'rinadi» qilsangiz, QR ni skanerlagan odam butun tarixni ko'radi.
                    </p>
                  </Field>

                  <Group title="Shifokor uchun" />
                  <Field vis={form.visibility} off={!allowed} toggle={toggleVis} k="consult" label="Konsultatsiya paytida passportim shifokorga ko'rinsin" span
                    hint={["Shifokorga ko'rinadi", "Shifokorga yashirilgan"]}>
                    <p className="mt-1 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      Siz bilan konsultatsiya o'tkazayotgan shifokor qon guruhingiz, allergiyalaringiz, kasalliklaringiz, dorilaringiz,
                      operatsiyalaringiz, emlashlaringiz va oilaviy kasalliklaringizni ko'radi, shunda sizdan hammasini qayta so'ramaydi.
                      Manzil, sug'urta, donorlik va yaqinlaringiz raqami ko'rsatilmaydi. Faqat shu konsultatsiya davomida.
                      Bu QR ko'rinishiga bog'liq emas: QR ni yashirsangiz ham, shifokor ko'ra oladi. Istamasangiz «Yashirin» qiling.
                    </p>
                  </Field>

                  <Group title="Boshqa" />
                  <Field vis={form.visibility} off={!allowed} toggle={toggleVis} k="insurance" label="Sug'urta" span>
                    <input disabled={!allowed} value={form.insurance ?? ""} maxLength={100} onChange={(e) => setForm({ ...form, insurance: e.target.value })} className={input} placeholder="Kompaniya va polis raqami" />
                  </Field>
                  <Field vis={form.visibility} off={!allowed} toggle={toggleVis} k="organ_donor" label="Organ donorligi" span>
                    <select disabled={!allowed} value={form.organ_donor === null ? "" : form.organ_donor ? "yes" : "no"}
                      onChange={(e) => setForm({ ...form, organ_donor: e.target.value === "" ? null : e.target.value === "yes" })} className={input}>
                      <option value="">Ko'rsatilmagan</option>
                      <option value="yes">Ha, donor bo'lishga roziman</option>
                      <option value="no">Yo'q</option>
                    </select>
                  </Field>
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
                    <img src={qr} alt="MaxHospital Passport QR kodi" className="mx-auto my-3 w-56 h-56 rounded-lg border border-border bg-white p-2" />
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
            QR orqali faqat siz «Ko'rinadi» deb belgilagan ma'lumot ko'rinadi: retseptlar, tahlillar va boshqa ma'lumotlar hech qachon ko'rinmaydi. Pasportni istalgan vaqtda o'chirib qo'yishingiz yoki yangi QR yaratishingiz mumkin.
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default EmergencyCardPage;
