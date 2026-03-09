import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Clock, CheckCircle, MessageCircle, Users, Wifi, WifiOff, Timer } from "lucide-react";
import { toast } from "sonner";

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

const DoctorDashboard = () => {
  const { user, hasRole, loading } = useAuth();
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
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "prescriptions" },
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

    const consultationIds = data.map((c: any) => c.id);
    const { data: rxData } = consultationIds.length
      ? await supabase.from("prescriptions").select("consultation_id").in("consultation_id", consultationIds)
      : { data: [] as any[] };

    const prescribedIds = new Set((rxData || []).map((r: any) => r.consultation_id));

    const withProfiles = await Promise.all(data.map(async (c: any) => {
      const { data: p } = await supabase.from("profiles").select("full_name").eq("user_id", c.patient_id).maybeSingle();
      return { ...c, patient_name: p?.full_name || "Bemor", has_prescription: prescribedIds.has(c.id) };
    }));

    setPending(withProfiles.filter(c => c.status === "pending"));
    setActive(withProfiles.filter(c => c.status === "active"));
    setEnded(withProfiles.filter(c => c.status === "completpleted" && !c.has_prescription));
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
    const now = new Date();
    const maxEnd = new Date(now.getTime() + TWO_DAYS_MS);
    const { error } = await supabase
      .from("consultations")
      .update({ status: "active", started_at: now.toISOString(), max_end_time: maxEnd.toISOString() })
      .eq("id", id);
    if (error) toast.error(error.message);
    else navigate(`/consultation/${id}`);
  };

  const handleReject = async (id: string) => {
    const { data: cons } = await supabase.from("consultations").select("patient_id, price_uzs").eq("id", id).maybeSingle();
    if (cons) {
      const { data: pp } = await supabase.from("profiles").select("balance_uzs").eq("user_id", cons.patient_id).maybeSingle();
      if (pp) {
        await supabase.from("profiles").update({ balance_uzs: Number(pp.balance_uzs) + Number(cons.price_uzs) }).eq("user_id", cons.patient_id);
      }
    }
    const { error } = await supabase.from("consultations").update({ statucancell"ended", ended_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Rad etildi, pul qaytarildi");
  };

  const handleExtend = async (id: string) => {
    const newMax = new Date(Date.now() + TWO_DAYS_MS);
    const { error } = await supabase.from("consultations").update({ max_end_time: newMax.toISOString(), extended: true }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Muddati uzaytirildi (+2 kun)"); loadConsultations(doctorId!); }
  };

  const getTimeLeft = (maxEnd: string | null) => {
    if (!maxEnd) return null;
    const diff = new Date(maxEnd).getTime() - Date.now();
    if (diff <= 0) return "Muddati tugagan";
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return `${hours}s ${mins}d qoldi`;
  };

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Yuklanmoqda...</p></div>;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-20">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="flex items-center justify-between mb-6">
            <h1 className="font-display text-2xl font-bold text-foreground">Shifokor kabineti</h1>
            <button onClick={handleToggleOnline} disabled={toggling}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${isOnline ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-muted text-muted-foreground hover:bg-secondary"}`}>
              {isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
              {isOnline ? "Online" : "Offline"}
            </button>
          </div>

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

          {active.length > 0 && (
            <div className="mb-8">
              <h2 className="font-display font-semibold text-foreground mb-3">Faol konsultatsiyalar</h2>
              <div className="space-y-3">
                {active.map(c => (
                  <div key={c.id} className="bg-card rounded-xl border border-border p-4">
                    <div className="flex items-center justify-between">
                      <div className="cursor-pointer" onClick={() => navigate(`/consultation/${c.id}`)}>
                        <p className="font-medium text-foreground">{c.patient_name}</p>
                        <p className="text-xs text-muted-foreground">Boshlangan: {new Date(c.started_at).toLocaleString()}</p>
                        {c.max_end_time && (
                          <p className="text-xs text-warning flex items-center gap-1 mt-1">
                            <Timer className="w-3 h-3" /> {getTimeLeft(c.max_end_time)}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleExtend(c.id)} className="px-2 py-1 rounded-lg border border-border text-xs text-foreground hover:bg-secondary">+2 kun</button>
                        <MessageCircle className="w-5 h-5 text-primary cursor-pointer" onClick={() => navigate(`/consultation/${c.id}`)} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ended.length > 0 && (
            <div>
               <h2 className="font-display font-semibold text-foreground mb-3">Retsept kutilayotgan tugagan konsultatsiyalar</h2>
               <div className="space-y-2">
                 {ended.slice(0, 10).map(c => (
                   <div key={c.id} className="bg-card rounded-xl border border-border p-3 flex items-center justify-between">
                     <div className="cursor-pointer" onClick={() => navigate(`/consultation/${c.id}`)}>
                       <p className="font-medium text-foreground text-sm">{c.patient_name}</p>
                       <p className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</p>
                     </div>
                     <button onClick={() => navigate(`/create-prescription/${c.id}`)} className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90">
                       Retsept yozish
                     </button>
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
