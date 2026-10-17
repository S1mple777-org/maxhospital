import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ArrowLeft, FileText, Download, Pill, AlarmClock, Scale } from "lucide-react";
import { generatePrescriptionPdf, type PrescriptionData, type PrescriptionMedicine } from "@/lib/generatePrescriptionPdf";
import { savePdf } from "@/lib/native";
import { toast } from "sonner";

const MyPrescriptions = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [prescriptions, setPrescriptions] = useState<PrescriptionData[]>([]);
  const [loadingRx, setLoadingRx] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("prescriptions")
        .select("*")
        .eq("patient_id", user.id)
        .order("created_at", { ascending: false });
      if (data) {
        setPrescriptions(data.map(d => ({
          ...d,
          medicines: (d.medicines as unknown as PrescriptionMedicine[]) || [],
        })));
      }
      setLoadingRx(false);
    };
    load();
  }, [user]);

  const handleDownload = async (rx: PrescriptionData) => {
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

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-20">
        <div className="container mx-auto px-4 max-w-3xl">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
            <ArrowLeft className="w-4 h-4" /> Orqaga
          </button>

          <h1 className="font-display text-2xl font-bold text-foreground mb-6">Mening retseptlarim</h1>

          {prescriptions.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Pill className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Hozircha retseptlar yo'q</p>
            </div>
          ) : (
            <div className="space-y-3">
              {prescriptions.map(rx => (
                <div key={rx.id} className="bg-card rounded-xl border border-border p-4 flex items-center justify-between hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate(`/prescription/${rx.id}`)}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{rx.diagnosis}</p>
                      <p className="text-xs text-muted-foreground">Dr. {rx.doctor_name} • {new Date(rx.created_at).toLocaleDateString("uz-UZ")}</p>
                      <p className="text-xs text-primary mt-0.5">{rx.medicines.length} ta dori</p>
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); navigate(`/second-opinion?consultation=${(rx as any).consultation_id}`); }} title="Ikkinchi fikr (Premium)" className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
                    <Scale className="w-4 h-4" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); navigate(`/medications?prescription=${rx.id}`); }} title="Dori eslatmasi qo'yish" className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
                    <AlarmClock className="w-4 h-4" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleDownload(rx); }} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default MyPrescriptions;
