import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ArrowLeft, Plus, Trash2, FileText, Send } from "lucide-react";
import { toast } from "sonner";
import { generatePrescriptionPdf, type PrescriptionMedicine } from "@/lib/generatePrescriptionPdf";
import { openPdf } from "@/lib/native";
import MeasurementsInput, { type MeasurementValues } from "@/components/ai/MeasurementsInput";
import { isPlausible, METRIC_BY_KEY, type MetricKey } from "@/lib/aiAssistant";

const emptyMedicine = (): PrescriptionMedicine => ({ name: "", dose: "", frequency: "", duration: "" });

const CreatePrescription = () => {
  const { consultationId } = useParams<{ consultationId: string }>();
  const { user, hasRole, loading } = useAuth();
  const navigate = useNavigate();

  const [consultation, setConsultation] = useState<any>(null);
  const [patientName, setPatientName] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [medicines, setMedicines] = useState<PrescriptionMedicine[]>([emptyMedicine()]);
  const [notes, setNotes] = useState("");
  const [doctorInfo, setDoctorInfo] = useState<{ name: string; title: string; department: string }>({ name: "", title: "", department: "" });
  const [submitting, setSubmitting] = useState(false);
  const [measurements, setMeasurements] = useState<MeasurementValues>({});

  useEffect(() => {
    if (!loading && !hasRole("doctor")) { navigate("/"); return; }
    if (!user || !consultationId) return;

    const load = async () => {
      const { data: cons } = await supabase.from("consultations").select("*").eq("id", consultationId).maybeSingle();
      if (!cons) { toast.error("Konsultatsiya topilmadi"); navigate("/doctor-dashboard"); return; }
      setConsultation(cons);

      // Patient name
      const { data: pp } = await supabase.from("profiles").select("full_name").eq("user_id", cons.patient_id).maybeSingle();
      setPatientName(pp?.full_name || "");

      // Doctor info
      const { data: doc } = await supabase.from("doctors").select("id, title, department_id, user_id").eq("user_id", user.id).maybeSingle();
      if (doc) {
        const { data: dp } = await supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle();
        let deptName = "";
        if (doc.department_id) {
          const { data: dept } = await supabase.from("departments").select("name_uz").eq("id", doc.department_id).maybeSingle();
          deptName = dept?.name_uz || "";
        }
        setDoctorInfo({ name: dp?.full_name || "", title: doc.title || "", department: deptName });
      }
    };
    load();
  }, [user, loading, consultationId]);

  const addMedicine = () => setMedicines(prev => [...prev, emptyMedicine()]);
  const removeMedicine = (i: number) => setMedicines(prev => prev.filter((_, idx) => idx !== i));
  const updateMedicine = (i: number, field: keyof PrescriptionMedicine, value: string) => {
    setMedicines(prev => prev.map((m, idx) => idx === i ? { ...m, [field]: value } : m));
  };

  const handleSubmit = async () => {
    if (!diagnosis.trim()) { toast.error("Tashxis kiritilishi shart"); return; }
    if (medicines.some(m => !m.name.trim())) { toast.error("Dori nomi kiritilishi shart"); return; }
    if (!consultation) return;

    const filled = (Object.entries(measurements) as [MetricKey, string][])
      .filter(([, v]) => v !== undefined && String(v).trim() !== "")
      .map(([metric, v]) => ({ metric, value: Number(String(v).replace(",", ".")) }));
    const invalid = filled.find((m) => !isPlausible(m.metric, m.value));
    if (invalid) { toast.error(`${METRIC_BY_KEY[invalid.metric].label.uz}: qiymat noto'g'ri`); return; }

    setSubmitting(true);
    const { data, error } = await supabase.from("prescriptions").insert({
      consultation_id: consultationId!,
      doctor_id: consultation.doctor_id,
      patient_id: consultation.patient_id,
      patient_name: patientName,
      diagnosis: diagnosis.trim(),
      medicines: medicines as any,
      notes: notes.trim() || null,
      doctor_name: doctorInfo.name,
      doctor_title: doctorInfo.title,
      department_name: doctorInfo.department,
    }).select().single();

    if (error) { toast.error(error.message); setSubmitting(false); return; }

    if (filled.length > 0) {
      const { error: mError } = await supabase.from("health_measurements").insert(
        filled.map((m) => ({
          patient_id: consultation.patient_id,
          doctor_id: consultation.doctor_id,
          consultation_id: consultationId!,
          metric: m.metric,
          value: m.value,
          unit: METRIC_BY_KEY[m.metric].unit,
        })),
      );
      if (mError) toast.error("Ko'rsatkichlarni saqlab bo'lmadi: " + mError.message);
    }

    // Notify patient via Telegram
    supabase.functions.invoke("telegram-notify", {
      body: {
        type: "prescription_created",
        user_id: consultation.patient_id,
        data: { prescription_id: data.id, doctor_name: doctorInfo.name },
      },
    }).catch(() => {});

    toast.success("Retsept yaratildi!");
    setSubmitting(false);
    navigate(`/prescription/${data.id}`);
  };

  const handlePreview = () => {
    const pdf = generatePrescriptionPdf({
      id: "PREVIEW",
      patient_name: patientName,
      diagnosis,
      medicines,
      notes: notes || null,
      doctor_name: doctorInfo.name,
      doctor_title: doctorInfo.title,
      department_name: doctorInfo.department,
      created_at: new Date().toISOString(),
    });
    openPdf(pdf, "retsept-korinish.pdf").catch((e) => toast.error(e?.message || "PDF ochilmadi"));
  };

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Yuklanmoqda...</p></div>;

  const inputClass = "w-full px-3 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-20">
        <div className="container mx-auto px-4 max-w-3xl">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
            <ArrowLeft className="w-4 h-4" /> Orqaga
          </button>

          <div className="bg-card rounded-2xl border border-border p-6 md:p-8 card-shadow">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="font-display text-xl font-bold text-foreground">Retsept yozish</h1>
                <p className="text-xs text-muted-foreground">Elektron retsept yaratish</p>
              </div>
            </div>

            {/* Patient & Doctor Info */}
            <div className="grid sm:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Bemor ismi</label>
                <input value={patientName} onChange={e => setPatientName(e.target.value)} className={inputClass} placeholder="Bemor ismi" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Shifokor</label>
                <div className="px-3 py-2.5 rounded-xl bg-secondary/50 text-sm text-foreground">
                  {doctorInfo.name} — {doctorInfo.title}
                </div>
              </div>
            </div>

            {/* Diagnosis */}
            <div className="mb-6">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tashxis *</label>
              <textarea value={diagnosis} onChange={e => setDiagnosis(e.target.value)} rows={2} className={`${inputClass} min-h-[60px]`} placeholder="Kasallik tashxisi..." />
            </div>

            {/* Medicines */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-semibold text-foreground">Dorilar *</label>
                <button onClick={addMedicine} className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Dori qo'shish
                </button>
              </div>
              <div className="space-y-3">
                {medicines.map((m, i) => (
                  <div key={i} className="bg-secondary/30 rounded-xl p-4 relative group">
                    {medicines.length > 1 && (
                      <button onClick={() => removeMedicine(i)} className="absolute top-2 right-2 p-1 rounded-lg text-destructive/60 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <div className="text-xs font-medium text-muted-foreground mb-2">Dori #{i + 1}</div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="col-span-2 sm:col-span-1">
                        <input value={m.name} onChange={e => updateMedicine(i, "name", e.target.value)} placeholder="Dori nomi *" className={inputClass} />
                      </div>
                      <div>
                        <input value={m.dose} onChange={e => updateMedicine(i, "dose", e.target.value)} placeholder="Dozasi" className={inputClass} />
                      </div>
                      <div>
                        <input value={m.frequency} onChange={e => updateMedicine(i, "frequency", e.target.value)} placeholder="Qabul qilish" className={inputClass} />
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <input value={m.duration} onChange={e => updateMedicine(i, "duration", e.target.value)} placeholder="Muddat" className={inputClass} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <MeasurementsInput patientId={consultation?.patient_id} values={measurements} onChange={setMeasurements} />

            {/* Notes */}
            <div className="mb-8">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Qo'shimcha ko'rsatmalar</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={`${inputClass} min-h-[70px]`} placeholder="Parhez, mashqlar, ehtiyotkorlik..." />
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={handlePreview} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-border text-foreground text-sm font-medium hover:bg-secondary transition-colors">
                <FileText className="w-4 h-4" /> Ko'rib chiqish (PDF)
              </button>
              <button onClick={handleSubmit} disabled={submitting} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
                <Send className="w-4 h-4" /> {submitting ? "Yaratilmoqda..." : "Retseptni saqlash"}
              </button>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default CreatePrescription;
