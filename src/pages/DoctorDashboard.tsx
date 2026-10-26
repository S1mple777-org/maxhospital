import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Clock, CheckCircle, MessageCircle, Users, Wifi, WifiOff, Timer, Crown, Zap, Scale, HelpCircle, CalendarClock } from "lucide-react";
import { isFutureBooking, loadSecondOpinionRequests, orderQueue } from "@/lib/care";
import { fmtSlotFull, notifyPatientCalled } from "@/lib/booking";
import { toast } from "sonner";
import TreatmentOverview from "@/components/care/TreatmentOverview";
import FitnessApprovals from "@/components/fitness/FitnessApprovals";

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

const DoctorDashboard = () => {
  const { user, hasRole, loading } = useAuth();
  const navigate = useNavigate();
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [toggling, setToggling] = useState(false);
  // All pending requests; split below into the live queue and bookings for later.
  const [pendingAll, setPendingAll] = useState<any[]>([]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const pending = orderQueue(pendingAll.filter((c) => !isFutureBooking(c, now)));
  const upcoming = pendingAll.filter((c) => isFutureBooking(c, now))
    .sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at));
  const [active, setActive] = useState<any[]>([]);
  const [ended, setEnded] = useState<any[]>([]);
  const [followups, setFollowups] = useState<any[]>([]);
  const [opinionCount, setOpinionCount] = useState(0);

  useEffect(() => {
    if (!doctorId) return;
    loadSecondOpinionRequests()
      .then((rows) => setOpinionCount(rows.filter((r) => r.status === "pending").length))
      .catch(() => setOpinionCount(0));
  }, [doctorId]);

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

    // Oila a'zosi uchun ochilgan konsultatsiyalarda bemor — o'sha a'zo.
    const memberIds = [...new Set(data.map((c: any) => c.family_member_id).filter(Boolean))];
    const { data: members } = memberIds.length
      ? await supabase.from("family_members" as any).select("id, full_name").in("id", memberIds)
      : { data: [] as any[] };
    const memberName = new Map(((members as any[]) || []).map((m: any) => [m.id, m.full_name]));

    const withProfiles = await Promise.all(data.map(async (c: any) => {
      const { data: p } = await supabase.from("profiles").select("full_name").eq("user_id", c.patient_id).maybeSingle();
      const owner = p?.full_name || "Bemor";
      const member = c.family_member_id ? memberName.get(c.family_member_id) : null;
      return {
        ...c,
        patient_name: member || owner,
        account_name: member ? owner : null,
        has_prescription: prescribedIds.has(c.id),
      };
    }));

    setPendingAll(withProfiles.filter(c => c.status === "pending"));
    setActive(withProfiles.filter(c => c.status === "active"));
    setEnded(withProfiles.filter(c => c.status === "completed" && !c.has_prescription));
    setFollowups(withProfiles.filter(c => c.status === "completed" && c.followup_until && new Date(c.followup_until).getTime() > Date.now()));
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
    if (error) { toast.error(error.message); return; }
    void notifyPatientCalled(id);   // Telegram: "Shifokor sizni kutmoqda"
    navigate(`/consultation/${id}`);
  };

  const handleReject = async (id: string) => {
    // Rejecting and refunding happen together on the server. Before, the
    // refund was done from the doctor's browser and was silently blocked.
    const { error } = await supabase.rpc("reject_consultation", { _consultation_id: id });
    if (error) toast.error(error.message);
    else { toast.success("Rad etildi, pul qaytarildi"); loadConsultations(doctorId!); }
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

          {opinionCount > 0 && (
            <Link to="/second-opinion" className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 hover:bg-primary/10">
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Scale className="w-5 h-5 text-primary" /> Ikkinchi fikr so'rovlari: {opinionCount} ta kutmoqda
              </span>
              <span className="text-xs text-primary">Ko'rish →</span>
            </Link>
          )}

          {pending.length > 0 && (
            <div className="mb-8">
              <h2 className="font-display font-semibold text-foreground mb-3">Yangi so'rovlar <span className="text-xs font-normal text-muted-foreground">(navbat tartibida)</span></h2>
              <div className="space-y-3">
                {pending.map((c, i) => (
                  <div key={c.id} className={`bg-card rounded-xl border p-4 flex items-center justify-between gap-3 ${c.queue_first ? "border-amber-500/60" : "border-border"}`}>
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="shrink-0 w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-foreground">{i + 1}</span>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground break-words">{c.patient_name}</p>
                        {c.account_name && <p className="text-xs text-muted-foreground">Akkaunt: {c.account_name}</p>}
                        <p className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString()}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className="text-xs text-primary">{Number(c.price_uzs).toLocaleString()} UZS</span>
                          {c.scheduled_at && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"><CalendarClock className="w-3 h-3" /> Yozuv: {fmtSlotFull(c.scheduled_at)}</span>}
                          {c.queue_first && <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400"><Zap className="w-3 h-3" /> Birinchi navbat</span>}
                          {!c.queue_first && c.queue_boost > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"><Crown className="w-3 h-3" /> Ustuvor</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => handleAccept(c.id)} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium">Qabul</button>
                      <button onClick={() => handleReject(c.id)} className="px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-medium">Rad</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {upcoming.length > 0 && (
            <div className="mb-8">
              <h2 className="font-display font-semibold text-foreground mb-3 flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-primary" /> Vaqtga yozilganlar <span className="text-xs font-normal text-muted-foreground">({upcoming.length})</span>
              </h2>
              <p className="text-xs text-muted-foreground mb-3">Har bir yozuv vaqtidan 15 daqiqa oldin yuqoridagi navbatning boshiga chiqadi. Bemorga 1 soat oldin eslatma boradi.</p>
              <div className="space-y-2">
                {upcoming.map((c) => (
                  <div key={c.id} className="bg-card rounded-xl border border-border p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{fmtSlotFull(c.scheduled_at)}</p>
                      <p className="text-sm text-foreground break-words">{c.patient_name}</p>
                      {c.account_name && <p className="text-xs text-muted-foreground">Akkaunt: {c.account_name}</p>}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => navigate(`/consultation/${c.id}`)} className="px-3 py-1.5 rounded-lg border border-border text-xs text-foreground hover:bg-secondary">Chat</button>
                      <button onClick={() => { if (confirm("Yozuvni rad etasizmi? Bemorga pul qaytariladi.")) void handleReject(c.id); }} className="px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-medium">Rad</button>
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

          <FitnessApprovals />
          <TreatmentOverview />

          {followups.length > 0 && (
            <div className="mb-8">
              <h2 className="font-display font-semibold text-foreground mb-3 flex items-center gap-2"><HelpCircle className="w-4 h-4 text-primary" /> Bepul savol vaqtidagi bemorlar</h2>
              <div className="space-y-3">
                {followups.map(c => (
                  <div key={c.id} onClick={() => navigate(`/consultation/${c.id}`)} className="bg-card rounded-xl border border-border p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-secondary/50">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground break-words">{c.patient_name}</p>
                      <p className="text-xs text-muted-foreground">Savol berish {new Date(c.followup_until).toLocaleString()} gacha ochiq</p>
                    </div>
                    <MessageCircle className="w-5 h-5 text-primary shrink-0" />
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
