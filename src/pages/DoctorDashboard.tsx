import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Clock, CheckCircle, MessageCircle, Users, XCircle, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";

const DoctorDashboard = () => {
  const { user, hasRole, loading } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [pending, setPending] = useState<any[]>([]);
  const [active, setActive] = useState<any[]>([]);
  const [ended, setEnded] = useState<any[]>([]);

  useEffect(() => {
    if (!loading && !hasRole("doctor")) { navigate("/"); return; }
    if (!user) return;

    const loadDoctor = async () => {
      const { data: doc } = await supabase.from("doctors").select("id, is_online").eq("user_id", user.id).maybeSingle();
      if (!doc) return;
      setDoctorId(doc.id);
      setIsOnline(doc.is_online);
      loadConsultations(doc.id);
    };
    loadDoctor();
  }, [user, loading]);

  useEffect(() => {
    if (!doctorId) return;
    const channel = supabase
      .channel("doctor-consultations")
      .on("postgres_changes", { event: "*", schema: "public", table: "consultations", filter: `doctor_id=eq.${doctorId}` },
        () => loadConsultations(doctorId)
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [doctorId]);

  const loadConsultations = async (docId: string) => {
    const { data } = await supabase
      .from("consultations")
      .select("*")
      .eq("doctor_id", docId)
      .order("created_at", { ascending: false });
    if (!data) return;

    const withProfiles = await Promise.all(data.map(async (c: any) => {
      const { data: p } = await supabase.from("profiles").select("full_name").eq("user_id", c.patient_id).maybeSingle();
      return { ...c, patient_name: p?.full_name || "Bemor" };
    }));

    setPending(withProfiles.filter(c => c.status === "pending"));
    setActive(withProfiles.filter(c => c.status === "active"));
    setEnded(withProfiles.filter(c => c.status === "ended"));
  };

  const handleToggleOnline = async () => {
    if (!doctorId) return;
    setToggling(true);
    const newStatus = !isOnline;
    const { error } = await supabase.from("doctors").update({ is_online: newStatus }).eq("id", doctorId);
    setToggling(false);
    if (error) { toast.error(error.message); return; }
    setIsOnline(newStatus);
    toast.success(newStatus ? "Siz onlinesiz" : "Siz offlinesiz");
  };

  const handleAccept = async (id: string) => {
    const { error } = await supabase
      .from("consultations")
      .update({ status: "active", started_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error(error.message);
    else navigate(`/consultation/${id}`);
  };

  const handleReject = async (id: string) => {
    // Refund patient
    const { data: cons } = await supabase.from("consultations").select("patient_id, price_uzs").eq("id", id).maybeSingle();
    if (cons) {
      const { data: patientProfile } = await supabase.from("profiles").select("balance_uzs").eq("user_id", cons.patient_id).maybeSingle();
      if (patientProfile) {
        await supabase.from("profiles").update({ balance_uzs: Number(patientProfile.balance_uzs) + Number(cons.price_uzs) }).eq("user_id", cons.patient_id);
      }
    }
    const { error } = await supabase
      .from("consultations")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Rad etildi, pul qaytarildi");
  };

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Yuklanmoqda...</p></div>;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-20">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="flex items-center justify-between mb-6">
            <h1 className="font-display text-2xl font-bold text-foreground">Shifokor kabineti</h1>
            <button
              onClick={handleToggleOnline}
              disabled={toggling}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                isOnline
                  ? "bg-green-100 text-green-700 hover:bg-green-200"
                  : "bg-muted text-muted-foreground hover:bg-secondary"
              }`}
            >
              {isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
              {isOnline ? "Online" : "Offline"}
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-card rounded-xl p-4 border border-border text-center">
              <Clock className="w-6 h-6 text-warning mx-auto mb-2" />
              <div className="text-2xl font-bold text-foreground">{pending.length}</div>
              <p className="text-xs text-muted-foreground">Kutilmoqda</p>
            </div>
            <div className="bg-card rounded-xl p-4 border border-border text-center">
              <MessageCircle className="w-6 h-6 text-primary mx-auto mb-2" />
              <div className="text-2xl font-bold text-foreground">{active.length}</div>
              <p className="text-xs text-muted-foreground">Faol</p>
            </div>
            <div className="bg-card rounded-xl p-4 border border-border text-center">
              <CheckCircle className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
              <div className="text-2xl font-bold text-foreground">{ended.length}</div>
              <p className="text-xs text-muted-foreground">Tugagan</p>
            </div>
          </div>

          {/* Pending */}
          {pending.length > 0 && (
            <div className="mb-8">
              <h2 className="font-display font-semibold text-foreground mb-3">Yangi so'rovlar</h2>
              <div className="space-y-3">
                {pending.map(c => (
                  <div key={c.id} className="bg-card rounded-xl border border-border p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-foreground">{c.patient_name}</p>
                      <p className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString()}</p>
                      <p className="text-xs text-primary mt-1">{Number(c.price_uzs).toLocaleString()} UZS</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleAccept(c.id)} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium">Qabul</button>
                      <button onClick={() => handleReject(c.id)} className="px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-medium">Rad</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active */}
          {active.length > 0 && (
            <div className="mb-8">
              <h2 className="font-display font-semibold text-foreground mb-3">Faol konsultatsiyalar</h2>
              <div className="space-y-3">
                {active.map(c => (
                  <div key={c.id} className="bg-card rounded-xl border border-border p-4 flex items-center justify-between cursor-pointer hover:bg-secondary/50" onClick={() => navigate(`/consultation/${c.id}`)}>
                    <div>
                      <p className="font-medium text-foreground">{c.patient_name}</p>
                      <p className="text-xs text-muted-foreground">Boshlangan: {new Date(c.started_at).toLocaleString()}</p>
                    </div>
                    <MessageCircle className="w-5 h-5 text-primary" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ended */}
          {ended.length > 0 && (
            <div>
              <h2 className="font-display font-semibold text-foreground mb-3">Tugagan konsultatsiyalar</h2>
              <div className="space-y-2">
                {ended.slice(0, 10).map(c => (
                  <div key={c.id} className="bg-card rounded-xl border border-border p-3 flex items-center justify-between opacity-60">
                    <div>
                      <p className="font-medium text-foreground text-sm">{c.patient_name}</p>
                      <p className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">Tugagan</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pending.length === 0 && active.length === 0 && ended.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Hozircha konsultatsiyalar yo'q</p>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default DoctorDashboard;
