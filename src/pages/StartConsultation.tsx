import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Stethoscope, ArrowRight, MessageCircle } from "lucide-react";
import { toast } from "sonner";

const StartConsultation = () => {
  const { user, profile } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [departments, setDepartments] = useState<any[]>([]);
  const [selectedDept, setSelectedDept] = useState<any>(null);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [myConsultations, setMyConsultations] = useState<any[]>([]);

  const getName = (item: any, prefix = "name") =>
    language === "ru" ? item[`${prefix}_ru`] : language === "en" ? item[`${prefix}_en`] : item[`${prefix}_uz`];

  const loadMyConsultations = () => {
    if (!user) return;
    supabase.from("consultations").select("*").eq("patient_id", user.id).in("status", ["pending", "active"]).order("created_at", { ascending: false }).then(({ data }) => {
      if (data) setMyConsultations(data);
      else setMyConsultations([]);
    });
  };

  useEffect(() => {
    if (!user) { navigate("/auth"); return; }
    supabase.from("departments").select("*").eq("is_active", true).then(({ data }) => {
      if (data) setDepartments(data);
    });
    loadMyConsultations();

    // Realtime: remove ended consultations from list
    const channel = supabase
      .channel("my-consultations-live")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "consultations", filter: `patient_id=eq.${user.id}` },
        (payload) => {
          const updated = payload.new as any;
          if (updated.status === "completed" || updated.status === "cancelled") {
            setMyConsultations(prev => prev.filter(c => c.id !== updated.id));
          } else {
            setMyConsultations(prev => prev.map(c => c.id === updated.id ? updated : c));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  useEffect(() => {
    if (!selectedDept) { setDoctors([]); return; }
    supabase
      .from("doctors")
      .select("*")
      .eq("department_id", selectedDept.id)
      .then(async ({ data }) => {
        if (!data) return;
        const withNames = await Promise.all(data.map(async (d: any) => {
          const { data: p } = await supabase.from("profiles").select("full_name, avatar_url").eq("user_id", d.user_id).maybeSingle();
          return { ...d, profile: p };
        }));
        setDoctors(withNames);
      });
  }, [selectedDept]);

  const handleCreate = async () => {
    if (!user || !selectedDoctor || !selectedDept) return;
    const price = Number(selectedDept.price_uzs);
    if (Number(profile?.balance_uzs || 0) < price) {
      toast.error("Balansingizda yetarli mablag' yo'q");
      return;
    }
    setCreating(true);
    const { data, error } = await supabase.from("consultations").insert({
      patient_id: user.id,
      doctor_id: selectedDoctor.id,
      department_id: selectedDept.id,
      price_uzs: price,
    }).select().single();
    setCreating(false);
    if (error) { toast.error(error.message); return; }
    // Deduct balance
    await supabase.from("profiles").update({ balance_uzs: Number(profile!.balance_uzs) - price }).eq("user_id", user.id);
    toast.success("So'rov yuborildi! Shifokor javobini kuting.");
    navigate(`/consultation/${data.id}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-20">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="font-display text-2xl font-bold text-foreground mb-2">Konsultatsiya boshlash</h1>
          <p className="text-muted-foreground text-sm mb-8">Bo'lim va shifokor tanlang</p>

          {/* My active consultations */}
          {myConsultations.length > 0 && (
            <div className="mb-8">
              <h3 className="font-display font-semibold text-foreground mb-3 text-sm">Faol konsultatsiyalaringiz</h3>
              <div className="space-y-2">
                {myConsultations.filter(c => c.status === "pending" || c.status === "active").map(c => (
                  <div key={c.id} onClick={() => navigate(`/consultation/${c.id}`)} className="bg-card rounded-xl border border-border p-4 flex items-center justify-between cursor-pointer hover:bg-secondary/50">
                    <div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.status === "active" ? "bg-green-100 text-green-700" : "bg-warning/10 text-warning"}`}>
                        {c.status === "active" ? "Faol" : "Kutilmoqda"}
                      </span>
                      <p className="text-xs text-muted-foreground mt-1">{new Date(c.created_at).toLocaleString()}</p>
                    </div>
                    <MessageCircle className="w-4 h-4 text-primary" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 1: Select Department */}
          <div className="mb-6">
            <h3 className="font-display font-semibold text-foreground mb-3 text-sm">1. Bo'limni tanlang</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {departments.map(dept => (
                <button
                  key={dept.id}
                  onClick={() => { setSelectedDept(dept); setSelectedDoctor(null); }}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    selectedDept?.id === dept.id
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  {dept.icon_url ? (
                    <img src={dept.icon_url} alt="" className="w-10 h-10 rounded-lg object-cover mb-2" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center mb-2">
                      <Stethoscope className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <p className="font-medium text-foreground text-sm">{getName(dept)}</p>
                  <p className="text-xs text-muted-foreground">{Number(dept.price_uzs).toLocaleString()} UZS</p>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Select Doctor */}
          {selectedDept && (
            <div className="mb-6">
              <h3 className="font-display font-semibold text-foreground mb-3 text-sm">2. Shifokorni tanlang</h3>
              {doctors.length === 0 ? (
                <div className="bg-card rounded-xl border border-border p-8 text-center text-muted-foreground">
                  <p>Bu bo'limda hozir online shifokor yo'q</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {doctors.map(doc => (
                    <button
                      key={doc.id}
                      onClick={() => setSelectedDoctor(doc)}
                      className={`p-4 rounded-xl border text-left transition-all ${
                        selectedDoctor?.id === doc.id
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "border-border bg-card hover:border-primary/40"
                      }`}
                    >
                      <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-hero-gradient flex items-center justify-center text-sm font-bold text-primary-foreground">
                          {doc.profile?.full_name?.[0]?.toUpperCase() || "D"}
                        </div>
                        <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-card ${doc.is_online ? "bg-green-500" : "bg-muted-foreground"}`} />
                      </div>
                      <p className="font-medium text-foreground text-sm">{doc.profile?.full_name || "Shifokor"}</p>
                      <p className="text-xs text-muted-foreground">{doc.title}</p>
                      <p className="text-xs text-muted-foreground">{doc.experience_years} yil tajriba</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Confirm */}
          {selectedDoctor && (
            <div className="bg-card rounded-xl border border-border p-6">
              <h3 className="font-display font-semibold text-foreground mb-3">Tasdiqlash</h3>
              <div className="text-sm text-muted-foreground space-y-1 mb-4">
                <p>Bo'lim: <span className="text-foreground font-medium">{getName(selectedDept)}</span></p>
                <p>Shifokor: <span className="text-foreground font-medium">{selectedDoctor.profile?.full_name}</span></p>
                <p>Narx: <span className="text-foreground font-medium">{Number(selectedDept.price_uzs).toLocaleString()} UZS</span></p>
                <p>Balansingiz: <span className="text-foreground font-medium">{Number(profile?.balance_uzs || 0).toLocaleString()} UZS</span></p>
              </div>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="w-full py-3 rounded-xl bg-hero-gradient text-primary-foreground font-semibold text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {creating ? "Yuborilmoqda..." : "Konsultatsiya boshlash"}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default StartConsultation;
