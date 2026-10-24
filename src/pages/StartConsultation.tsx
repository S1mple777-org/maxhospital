import { useEffect, useState } from "react";
import { fmtSlotFull } from "@/lib/booking";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Stethoscope, ArrowRight, MessageCircle, Siren, Wallet, Phone, Zap, Crown, Users } from "lucide-react";
import { emergencyQuote, isDebtError, queueFirstPrice, startConsultationOnCredit, usePlanStatus } from "@/lib/planPerks";
import { loadFamily, RELATIONS, type FamilyMember } from "@/lib/care";
import { formatUzs } from "@/lib/medications";
import { toast } from "sonner";

// Pending / active, or finished but still inside the free follow-up window.
const isOpenForPatient = (c: any) =>
  c.status === "pending" || c.status === "active"
  || (c.status === "completed" && !!c.followup_until && new Date(c.followup_until).getTime() > Date.now());

const StartConsultation = () => {
  const { user, profile, loading, refreshProfile } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [departments, setDepartments] = useState<any[]>([]);
  const [selectedDept, setSelectedDept] = useState<any>(null);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [myConsultations, setMyConsultations] = useState<any[]>([]);
  const { status: planStatus, refresh: refreshPlan } = usePlanStatus(!!user);
  const [family, setFamily] = useState<FamilyMember[]>([]);
  const [forWhom, setForWhom] = useState<string>(""); // "" = o'zim
  const [first, setFirst] = useState(false);
  useEffect(() => { if (user) loadFamily().then(setFamily); }, [user]);

  const getName = (item: any, prefix = "name") =>
    language === "ru" ? item[`${prefix}_ru`] : language === "en" ? item[`${prefix}_en`] : item[`${prefix}_uz`];

  const loadMyConsultations = () => {
    if (!user) return;
    supabase.from("consultations").select("*").eq("patient_id", user.id).in("status", ["pending", "active", "completed"]).order("created_at", { ascending: false }).limit(30).then(({ data }) => {
      setMyConsultations((data ?? []).filter(isOpenForPatient));
    });
  };

  useEffect(() => {
    if (loading) return; // wait for the session before deciding
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
          if (!isOpenForPatient(updated)) {
            setMyConsultations(prev => prev.filter(c => c.id !== updated.id));
          } else {
            setMyConsultations(prev => prev.map(c => c.id === updated.id ? updated : c));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, loading]);

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

  const price = selectedDept ? Number(selectedDept.price_uzs) : 0;
  const balance = Number(profile?.balance_uzs || 0);
  const firstPrice = planStatus ? queueFirstPrice(planStatus) : null;
  const firstFee = first && firstPrice ? firstPrice : 0;
  const total = price + firstFee;
  const quote = emergencyQuote({
    price,
    balance,
    creditLimit: planStatus?.limits.emergency_credit_uzs ?? 0,
    debt: planStatus?.debt_uzs ?? 0,
  });

  const handleCreate = async () => {
    if (!user || !selectedDoctor || !selectedDept) return;
    if (quote.status === "debt") {
      toast.error("Avval favqulodda qarzni to'lang");
      navigate("/wallet");
      return;
    }
    if (balance < total) {
      toast.error("Balansingizda yetarli mablag' yo'q");
      return;
    }
    setCreating(true);
    // Price check, payment and creation happen together on the server.
    const { data: consultationId, error } = await supabase.rpc("create_consultation" as any, {
      _doctor_id: selectedDoctor.id,
      _first: first,
      _family_member_id: forWhom || null,
    });
    setCreating(false);
    if (error || !consultationId) {
      toast.error(error?.message || "Xatolik yuz berdi");
      if (error && isDebtError(error.message)) navigate("/wallet");
      return;
    }
    await Promise.all([refreshProfile(), refreshPlan()]);
    toast.success(first ? "So'rov navbatning boshiga qo'yildi! Shifokor javobini kuting." : "So'rov yuborildi! Shifokor javobini kuting.");
    navigate(`/consultation/${consultationId}`);
  };

  const handleCreateOnCredit = async () => {
    if (!user || !selectedDoctor || quote.status !== "ok") return;
    const ok = confirm(
      `Favqulodda konsultatsiya: balansdagi ${formatUzs(quote.fromBalance)} ishlatiladi, qolgan ${formatUzs(quote.credit)} qarzga yoziladi.\n\n` +
      "Qarz to'lanmaguncha yangi konsultatsiya va obuna olib bo'lmaydi. Davom etasizmi?",
    );
    if (!ok) return;
    setCreating(true);
    try {
      const consultationId = await startConsultationOnCredit(selectedDoctor.id, forWhom || null);
      await Promise.all([refreshProfile(), refreshPlan()]);
      toast.success("Favqulodda so'rov yuborildi! Shifokor javobini kuting.");
      navigate(`/consultation/${consultationId}`);
    } catch (e: any) {
      toast.error(e.message);
      void refreshPlan();
    } finally {
      setCreating(false);
    }
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
                {myConsultations.filter(isOpenForPatient).map(c => (
                  <div key={c.id} onClick={() => navigate(`/consultation/${c.id}`)} className="bg-card rounded-xl border border-border p-4 flex items-center justify-between cursor-pointer hover:bg-secondary/50">
                    <div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.status === "active" ? "bg-green-100 text-green-700" : c.status === "completed" ? "bg-primary/10 text-primary" : "bg-warning/10 text-warning"}`}>
                        {c.status === "active" ? "Faol" : c.status === "completed" ? "Bepul savol vaqti" : c.scheduled_at ? "Vaqtga yozilgan" : "Navbatda"}
                      </span>
                      <p className="text-xs text-muted-foreground mt-1">
                        {c.status === "pending" && c.scheduled_at ? `📅 Qabul: ${fmtSlotFull(c.scheduled_at)}` : new Date(c.created_at).toLocaleString()}
                      </p>
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
                {firstFee > 0 && <p>Birinchi navbat: <span className="text-foreground font-medium">{formatUzs(firstFee)}</span></p>}
                <p>Balansingiz: <span className="text-foreground font-medium">{Number(profile?.balance_uzs || 0).toLocaleString()} UZS</span></p>
              </div>

              {family.length > 0 && (
                <label className="block mb-4 text-sm">
                  <span className="flex items-center gap-1.5 font-medium text-foreground mb-1.5"><Users className="w-4 h-4 text-primary" /> Kim uchun?</span>
                  <select value={forWhom} onChange={(e) => setForWhom(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm">
                    <option value="">O'zim uchun</option>
                    {family.map((m) => <option key={m.id} value={m.id}>{m.full_name} ({RELATIONS[m.relation]})</option>)}
                  </select>
                </label>
              )}

              {planStatus && (planStatus.limits.queue_boost > 0 || firstPrice !== null) ? (
                <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm space-y-2">
                  {planStatus.limits.queue_boost > 0 && (
                    <p className="flex items-start gap-2 text-foreground">
                      <Crown className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      Ustuvor navbat: so'rovingiz shifokor ro'yxatida {planStatus.limits.queue_boost} o'ringa oldinga o'tadi.
                    </p>
                  )}
                  {firstPrice !== null && (
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input type="checkbox" checked={first} onChange={(e) => setFirst(e.target.checked)} className="mt-1" />
                      <span>
                        <span className="flex items-center gap-1 font-medium text-foreground"><Zap className="w-4 h-4 text-amber-500" /> Birinchi navbatga yozilish</span>
                        <span className="block text-xs text-muted-foreground">
                          {firstPrice === 0
                            ? `Bu oy bepul: ${planStatus.limits.queue_first_monthly - planStatus.usage.queue_first_month} / ${planStatus.limits.queue_first_monthly} qoldi.`
                            : `Oylik bepul limit tugadi — ${formatUzs(firstPrice)} (platforma xizmati).`}
                        </span>
                      </span>
                    </label>
                  )}
                </div>
              ) : planStatus?.plan === "free" ? (
                <p className="mb-4 text-xs text-muted-foreground">
                  <Link to="/pro" className="text-primary hover:underline">Pro va Premium</Link>da so'rovingiz navbatda oldinga o'tadi va kerak bo'lsa birinchi navbatga yozilasiz.
                </p>
              ) : null}
              {quote.status === "debt" ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
                  <p className="text-destructive font-medium mb-2">
                    Sizda {formatUzs(planStatus?.debt_uzs ?? 0)} favqulodda qarz bor. Yangi konsultatsiyadan oldin uni to'lang.
                  </p>
                  <Link to="/wallet" className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-xs font-semibold text-destructive-foreground">
                    <Wallet className="w-4 h-4" /> Hamyonga o'tish va qarzni to'lash
                  </Link>
                </div>
              ) : (
                <button
                  onClick={handleCreate}
                  disabled={creating || balance < total}
                  className="w-full py-3 rounded-xl bg-hero-gradient text-primary-foreground font-semibold text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {creating ? "Yuborilmoqda..." : "Konsultatsiya boshlash"}
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}

              {(quote.status === "ok" || quote.status === "limit") && (
                <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
                  <div className="flex items-center gap-2 font-semibold text-foreground mb-1">
                    <Siren className="w-4 h-4 text-amber-600" /> Balans yetmayapti. Favqulodda holatmi?
                  </div>
                  {quote.status === "ok" ? (
                    <>
                      <p className="text-muted-foreground mb-3">
                        Balansdagi {formatUzs(quote.fromBalance)} ishlatiladi, qolgan <b className="text-foreground">{formatUzs(quote.credit)}</b> qarzga
                        yoziladi. Qarzni keyin Hamyon sahifasida, keyingi konsultatsiyadan oldin to'laysiz.
                      </p>
                      <button
                        onClick={handleCreateOnCredit}
                        disabled={creating}
                        className="w-full py-2.5 rounded-xl bg-amber-500 text-white font-semibold text-sm hover:bg-amber-600 disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <Siren className="w-4 h-4" /> Favqulodda: qarzga boshlash
                      </button>
                    </>
                  ) : (
                    <p className="text-muted-foreground">
                      Bu bo'lim uchun {formatUzs(quote.credit)} kerak, sizning favqulodda kredit limitingiz{" "}
                      {formatUzs(planStatus?.limits.emergency_credit_uzs ?? 0)}.{" "}
                      <Link to="/pro" className="text-primary hover:underline">Pro va Premium'da limit kattaroq</Link>.
                    </p>
                  )}
                  <a href="tel:103" className="mt-3 flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-400">
                    <Phone className="w-3.5 h-3.5" /> Hayot uchun xavfli holatda darhol 103 ga qo'ng'iroq qiling
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default StartConsultation;
