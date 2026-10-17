import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ArrowLeft, Download, FileText, Pill, Calendar, User, Stethoscope, AlarmClock } from "lucide-react";
import { generatePrescriptionPdf, type PrescriptionData, type PrescriptionMedicine } from "@/lib/generatePrescriptionPdf";
import { savePdf } from "@/lib/native";
import { toast } from "sonner";

const PrescriptionView = () => {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [rx, setRx] = useState<PrescriptionData | null>(null);
  const [loadingRx, setLoadingRx] = useState(true);

  useEffect(() => {
    if (!id || !user) return;
    const load = async () => {
      const { data, error } = await supabase.from("prescriptions").select("*").eq("id", id).maybeSingle();
      if (error || !data) { setLoadingRx(false); return; }
      setRx({
        ...data,
        medicines: (data.medicines as unknown as PrescriptionMedicine[]) || [],
      });
      setLoadingRx(false);
    };
    load();
  }, [id, user]);

  const handleDownload = async () => {
    if (!rx) return;
    const pdf = generatePrescriptionPdf(rx);
    try {
      await savePdf(pdf, `retsept-${rx.id.slice(0, 8)}.pdf`);
    } catch (e: any) {
      toast.error(e?.message || "PDF saqlanmadi");
    }
  };

  if (loading || loadingRx) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Yuklanmoqda...</p></div>;
  }

  if (!rx) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 pb-20 text-center">
          <p className="text-muted-foreground">Retsept topilmadi</p>
          <button onClick={() => navigate(-1)} className="mt-4 text-primary text-sm">Orqaga</button>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-20">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="flex items-center justify-between mb-6">
            <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" /> Orqaga
            </button>
            <div className="flex items-center gap-2">
              {rx && (rx as any).patient_id === user?.id && (
                <button onClick={() => navigate(`/medications?prescription=${rx.id}`)} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-foreground text-sm font-medium hover:bg-secondary transition-colors">
                  <AlarmClock className="w-4 h-4" /> Eslatma qo'yish
                </button>
              )}
              <button onClick={handleDownload} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
                <Download className="w-4 h-4" /> PDF yuklash
              </button>
            </div>
          </div>

          {/* Prescription Card */}
          <div className="bg-card rounded-2xl border border-border overflow-hidden card-shadow">
            {/* Header */}
            <div className="bg-primary px-6 py-5 text-primary-foreground">
              <h1 className="font-display text-lg font-bold">MAX HOSPITAL</h1>
              <p className="text-xs opacity-80">Elektron Retsept / E-Prescription</p>
            </div>

            <div className="p-6 md:p-8">
              {/* Info Grid */}
              <div className="grid sm:grid-cols-2 gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Bemor</p>
                    <p className="text-sm font-medium text-foreground">{rx.patient_name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Sana</p>
                    <p className="text-sm font-medium text-foreground">{new Date(rx.created_at).toLocaleDateString("uz-UZ")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Stethoscope className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Shifokor</p>
                    <p className="text-sm font-medium text-foreground">{rx.doctor_name}</p>
                    <p className="text-xs text-muted-foreground">{rx.doctor_title} • {rx.department_name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Retsept №</p>
                    <p className="text-sm font-medium text-foreground font-mono">{rx.id.slice(0, 8).toUpperCase()}</p>
                  </div>
                </div>
              </div>

              {/* Diagnosis */}
              <div className="mb-6">
                <h3 className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Tashxis</h3>
                <div className="bg-secondary/40 rounded-xl p-4">
                  <p className="text-sm text-foreground">{rx.diagnosis}</p>
                </div>
              </div>

              {/* Medicines */}
              <div className="mb-6">
                <h3 className="text-xs font-semibold text-primary uppercase tracking-wider mb-3">Dorilar</h3>
                <div className="space-y-2">
                  {rx.medicines.map((m, i) => (
                    <div key={i} className="bg-secondary/30 rounded-xl p-4 flex items-start gap-3">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Pill className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{m.name}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                          {m.dose && <span className="text-xs text-muted-foreground">Dozasi: <span className="text-foreground font-medium">{m.dose}</span></span>}
                          {m.frequency && <span className="text-xs text-muted-foreground">Qabul: <span className="text-foreground font-medium">{m.frequency}</span></span>}
                          {m.duration && <span className="text-xs text-muted-foreground">Muddat: <span className="text-foreground font-medium">{m.duration}</span></span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              {rx.notes && (
                <div>
                  <h3 className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Qo'shimcha ko'rsatmalar</h3>
                  <div className="bg-accent/30 rounded-xl p-4">
                    <p className="text-sm text-foreground whitespace-pre-wrap">{rx.notes}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default PrescriptionView;
