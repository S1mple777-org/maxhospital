import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertTriangle, Droplet, HeartPulse, Loader2, Phone, Pill, Ruler, ShieldAlert, Stethoscope, Syringe, Users } from "lucide-react";
import { loadPassportHistory, loadPublicEmergencyCard, type PassportHistoryItem, type PublicEmergencyCard } from "@/lib/care";

/** Opened by scanning the QR code. No login: an ambulance worker must see it in seconds. */
const PublicEmergencyCardPage = () => {
  const { token } = useParams<{ token: string }>();
  const [card, setCard] = useState<PublicEmergencyCard | null | undefined>(undefined);
  const [history, setHistory] = useState<PassportHistoryItem[]>([]);

  useEffect(() => {
    document.title = "MaxHospital Passport";
    if (!token) { setCard(null); return; }
    loadPublicEmergencyCard(token).then(setCard).catch(() => setCard(null));
    loadPassportHistory(token).then(setHistory).catch(() => setHistory([]));
  }, [token]);

  if (card === undefined) {
    return <div className="min-h-screen flex items-center justify-center bg-white"><Loader2 className="w-8 h-8 animate-spin text-red-600" /></div>;
  }
  if (!card) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white p-6 text-center">
        <ShieldAlert className="w-12 h-12 text-red-600 mb-3" />
        <h1 className="text-xl font-bold text-gray-900">Karta topilmadi yoki o'chirilgan</h1>
        <a href="tel:103" className="mt-6 rounded-xl bg-red-600 px-6 py-3 font-semibold text-white">103 — Tez yordam</a>
      </div>
    );
  }

  const Row = ({ icon: Icon, label, value, strong }: { icon: typeof Pill; label: string; value: string | null; strong?: boolean }) =>
    value ? (
      <div className={`rounded-2xl border p-4 ${strong ? "border-red-300 bg-red-50" : "border-gray-200 bg-white"}`}>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500"><Icon className="w-4 h-4" /> {label}</div>
        <div className={`mt-1 whitespace-pre-line break-words ${strong ? "text-lg font-bold text-red-700" : "text-base text-gray-900"}`}>{value}</div>
      </div>
    ) : null;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="bg-red-600 px-4 py-5 text-white text-center">
        <div className="text-xs font-semibold tracking-widest">MAXHOSPITAL PASSPORT · HEALTH PASSPORT</div>
        <h1 className="mt-2 text-2xl font-bold break-words">{card.full_name || "—"}</h1>
        {card.birth_year && <div className="text-sm opacity-90">{card.birth_year}-yil tug'ilgan</div>}
      </div>
      <div className="mx-auto max-w-lg p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {card.blood_type && (
            <div className="rounded-2xl border border-red-300 bg-white p-4 text-center">
              <Droplet className="w-6 h-6 mx-auto text-red-600" />
              <div className="text-xs text-gray-500 mt-1">Qon guruhi / Blood type</div>
              <div className="text-3xl font-bold text-red-700">{card.blood_type}</div>
            </div>
          )}
          <a href="tel:103" className={`rounded-2xl bg-red-600 p-4 text-center text-white flex flex-col items-center justify-center ${card.blood_type ? "" : "col-span-2"}`}>
            <Phone className="w-6 h-6" />
            <div className="mt-1 text-2xl font-bold">103</div>
            <div className="text-xs">Tez yordam</div>
          </a>
        </div>
        <Row icon={AlertTriangle} label="Allergiya / Allergies" value={card.allergies} strong />
        <Row icon={HeartPulse} label="Kasalliklar / Conditions" value={card.conditions} />
        <Row icon={Pill} label="Dorilar / Medications" value={card.medications} />
        <Row icon={ShieldAlert} label="Qo'shimcha / Notes" value={card.notes} />
        <Row icon={Stethoscope} label="Operatsiyalar / Surgeries" value={card.surgeries} />
        <Row icon={Syringe} label="Emlashlar / Vaccinations" value={card.vaccinations} />
        <Row icon={Users} label="Oilaviy kasalliklar / Family history" value={card.family_history} />
        <Row icon={Ruler} label="Bo'y va vazn / Height, weight"
          value={[card.height_cm ? `${card.height_cm} sm` : null, card.weight_kg ? `${card.weight_kg} kg` : null].filter(Boolean).join(", ") || null} />
        <Row icon={Users} label="Jinsi / Sex" value={card.gender === "male" ? "Erkak / Male" : card.gender === "female" ? "Ayol / Female" : null} />
        <Row icon={ShieldAlert} label="Manzil / Address" value={card.address} />
        <Row icon={ShieldAlert} label="Sug'urta / Insurance" value={card.insurance} />
        <Row icon={ShieldAlert} label="Organ donorligi / Organ donor"
          value={card.organ_donor === null ? null : card.organ_donor ? "Ha / Yes" : "Yo'q / No"} />
        {([
          ["Yaqin odam / Emergency contact", card.contact_name, card.contact_phone],
          ["Ikkinchi yaqin odam / 2nd contact", card.contact2_name, card.contact2_phone],
          ["Davolovchi shifokor / Doctor", card.doctor_name, card.doctor_phone],
        ] as const).map(([label, name, phone]) => (name || phone) && (
          <div key={label} className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</div>
            <div className="mt-1 text-base text-gray-900 break-words">{name}</div>
            {phone && (
              <a href={`tel:${phone.replace(/[^+\d]/g, "")}`} className="mt-2 inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 font-semibold text-white">
                <Phone className="w-4 h-4" /> {phone}
              </a>
            )}
          </div>
        ))}
        {history.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <Stethoscope className="w-4 h-4" /> Konsultatsiyalar tarixi / Medical history ({history.length})
            </div>
            <ol className="mt-3 space-y-3">
              {history.map((h, i) => (
                <li key={i} className="border-l-2 border-red-200 pl-3">
                  <div className="text-xs text-gray-500">
                    {new Date(h.consulted_at).toLocaleDateString()} · {[h.department_name, h.doctor_name, h.doctor_title].filter(Boolean).join(" · ")}
                  </div>
                  <div className="mt-0.5 text-base font-semibold text-gray-900 break-words">{h.diagnosis || "Tashxis yozilmagan"}</div>
                  {h.medicines?.length > 0 && (
                    <ul className="mt-1 text-sm text-gray-800 list-disc pl-5">
                      {h.medicines.map((m, j) => (
                        <li key={j} className="break-words">{[m.name, m.dose, m.frequency, m.duration].filter(Boolean).join(" · ")}</li>
                      ))}
                    </ul>
                  )}
                  {h.notes && <div className="mt-1 text-sm text-gray-600 whitespace-pre-line break-words">{h.notes}</div>}
                </li>
              ))}
            </ol>
          </div>
        )}
        <p className="pt-2 text-center text-xs text-gray-500">
          Bemor o'zi kiritgan va ko'rinishga ruxsat bergan ma'lumot · Yangilangan: {new Date(card.updated_at).toLocaleDateString()} · MaxHospital
        </p>
      </div>
    </div>
  );
};

export default PublicEmergencyCardPage;
