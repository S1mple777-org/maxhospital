import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, IdCard, Lock } from "lucide-react";
import { loadConsultationPassport, type ConsultPassport } from "@/lib/care";

type D = NonNullable<ConsultPassport["data"]>;

const ROWS: { key: keyof D; label: string }[] = [
  { key: "conditions", label: "Surunkali kasalliklar" },
  { key: "medications", label: "Doimiy dorilar" },
  { key: "surgeries", label: "Operatsiyalar" },
  { key: "vaccinations", label: "Emlashlar" },
  { key: "family_history", label: "Oilaviy kasalliklar" },
  { key: "notes", label: "Eslatma" },
];

/**
 * Doctor's view during a consultation: the patient's MaxHospital Passport (medical sections only).
 * Shown only if the patient left "show to my doctor" on; the server decides what is returned.
 */
const PassportForDoctor = ({ consultationId }: { consultationId: string }) => {
  const [res, setRes] = useState<ConsultPassport | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let alive = true;
    loadConsultationPassport(consultationId).then((r) => { if (alive) setRes(r); });
    return () => { alive = false; };
  }, [consultationId]);

  if (!res?.available) return null;

  if (!res.shared || !res.data) {
    return (
      <div className="mx-3 sm:mx-4 mt-2 flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <Lock className="w-3.5 h-3.5 shrink-0" /> Bemor passportini shifokorga ko'rsatmaslikni tanlagan. Kerakli ma'lumotni undan so'rang.
      </div>
    );
  }

  const d = res.data;
  const body = [d.age != null ? `${d.age} yosh` : null, d.gender === "male" ? "erkak" : d.gender === "female" ? "ayol" : null,
    d.height_cm ? `${d.height_cm} sm` : null, d.weight_kg ? `${d.weight_kg} kg` : null].filter(Boolean).join(" · ");
  const rows = ROWS.filter((r) => d[r.key]);

  return (
    <div className="mx-3 sm:mx-4 mt-2 rounded-xl border border-primary/30 bg-primary/5">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-2 px-3 py-2 text-left">
        <IdCard className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium text-foreground">MaxHospital Passport</span>
        {d.blood_type && <span className="px-1.5 py-0.5 rounded-md bg-rose-500/10 text-rose-600 text-xs font-semibold">{d.blood_type}</span>}
        {d.allergies && <span className="inline-flex items-center gap-1 text-xs text-amber-700"><AlertTriangle className="w-3.5 h-3.5" /> Allergiya</span>}
        <ChevronDown className={`ml-auto w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 text-sm">
          {body && <p className="text-xs text-muted-foreground">{body}</p>}
          {d.allergies && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Allergiyalar</p>
              <p className="text-foreground whitespace-pre-wrap break-words">{d.allergies}</p>
            </div>
          )}
          {rows.map((r) => (
            <div key={r.key}>
              <p className="text-[11px] text-muted-foreground">{r.label}</p>
              <p className="text-foreground whitespace-pre-wrap break-words">{d[r.key] as string}</p>
            </div>
          ))}
          {!d.allergies && !d.blood_type && rows.length === 0 && (
            <p className="text-xs text-muted-foreground">Bemor passportida hali tibbiy ma'lumot kiritmagan.</p>
          )}
          <p className="text-[10px] text-muted-foreground">Ma'lumotni bemor o'zi kiritgan; tekshirilmagan. Bemor roziligi bilan, faqat shu konsultatsiya uchun.</p>
        </div>
      )}
    </div>
  );
};

export default PassportForDoctor;
