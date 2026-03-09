import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/Navbar";
import { Send, ArrowLeft, PhoneOff, Star, Timer, Video, Mic, MicOff, VideoOff, FileText } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import DailyIframe from "@daily-co/daily-js";

interface Message {
  id: string;
  sender_id: string;
  content: string | null;
  message_type: string;
  created_at: string;
}

const ConsultationPage = () => {
  const { id } = useParams<{ id: string }>();
  const { user, profile, hasRole } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [consultation, setConsultation] = useState<any>(null);
  const [otherName, setOtherName] = useState("");
  const [sending, setSending] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [ratingValue, setRatingValue] = useState(5);
  const [ratingComment, setRatingComment] = useState("");
  const [hasRated, setHasRated] = useState(false);
  const [submittingRating, setSubmittingRating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isDoctor = hasRole("doctor");

  // Video call state
  const [inCall, setInCall] = useState(false);
  const [joiningCall, setJoiningCall] = useState(false);
  const frameRef = useRef<any>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  // Video time limit state
  const VIDEO_FREE_SECONDS = 600;
  const VIDEO_EXTRA_COST_PER_MIN = 20000;
  const [callElapsed, setCallElapsed] = useState(0);
  const [showExtendPrompt, setShowExtendPrompt] = useState(false);
  const [callPaused, setCallPaused] = useState(false);
  const callStartRef = useRef<number | null>(null);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track consultation ended state locally for immediate UI update
  const [localEnded, setLocalEnded] = useState(false);

  const cleanupCallFrame = useCallback(async (targetFrame?: any) => {
    const activeFrame = targetFrame ?? frameRef.current;

    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }

    if (activeFrame) {
      try { await activeFrame.leave(); } catch (e) {}
      try { await activeFrame.destroy(); } catch (e) {}
    }

    if (!targetFrame || targetFrame === frameRef.current) {
      frameRef.current = null;
    }

    setInCall(false);
  }, []);

  useEffect(() => {
    if (!id || !user) return;
    const loadConsultation = async () => {
      const { data: cons } = await supabase.from("consultations").select("*").eq("id", id).maybeSingle();
      if (!cons) { navigate("/"); return; }
      setConsultation(cons);
      if (cons.status === "completed" || cons.status === "cancellpleted" || cons.status === "cancellpleted" || cons.status === "cancellpleted" || cons.status === "cancelled") setLocalEnded(true);
      const { data: existingRating } = await supabase.from("consultation_ratings").select("id").eq("consultation_id", id).maybeSingle();
      if (existingRating) setHasRated(true);
      const otherId = isDoctor ? cons.patient_id : cons.doctor_id;
      if (isDoctor) {
        const { data: p } = await supabase.from("profiles").select("full_name").eq("user_id", otherId).maybeSingle();
        setOtherName(p?.full_name || "Bemor");
      } else {
        const { data: doc } = await supabase.from("doctors").select("user_id").eq("id", otherId).maybeSingle();
        if (doc) {
          const { data: p } = await supabase.from("profiles").select("full_name").eq("user_id", doc.user_id).maybeSingle();
          setOtherName(p?.full_name || "Shifokor");
        }
      }
    };
    loadConsultation();

    supabase.from("messages").select("*").eq("consultation_id", id).order("created_at", { ascending: true })
      .then(({ data }) => { if (data) setMessages(data as Message[]); });

    const channel = supabase
      .channel(`consultation-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `consultation_id=eq.${id}` },
        (payload) => setMessages(prev => [...prev, payload.new as Message])
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "consultations", filter: `id=eq.${id}` },
        (payload) => {
          ccompleted" || updated.status === "cancellt updated = payload.new as any;
completed" || updated.status === "cancell       setConsultation(updated);completed" || updated.status === "cancell        if (updated.status === "ended") {
            setLocalEnded(true);
            if (!isDoctor) setShowRating(true);
            // Auto-leave video call if active
            void cleanupCallFrame();
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id, user, isDoctor, navigate, cleanupCallFrame]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Auto-end expired consultations - runs for both doctor and patient
  useEffect(() => {
    if (!consultation || consultation.status !== "active" || !consultation.max_end_time) return;
    const maxEnd = new Date(consultation.max_end_time).getTime();

    const checkAndEnd = () => {
      const remaining = maxEnd - Date.now();
      if (remaining <= 0) {
        // Only doctor triggers the DB update to avoid race condition
        if (isDoctor) {
          handleEndConsultation();
        } else {
          // Patient sees it as ended immediately via realtime subscription
          setLocalEnded(true);
        }
      }
    };

    checkAndEnd();
    const interval = setInterval(checkAndEnd, 5000);
    return () => clearInterval(interval);
  }, [consultation?.status, consultation?.max_end_time, isDoctor]);

  // Cleanup video on unmount
  useEffect(() => {
    return () => {
      void cleanupCallFrame();
    };
  }, [cleanupCallFrame]);

  // Video call timer
  useEffect(() => {
    if (inCall && !callPaused) {
      if (!callStartRef.current) callStartRef.current = Date.now() - callElapsed * 1000;
      callTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - (callStartRef.current || Date.now())) / 1000);
        setCallElapsed(elapsed);
          if (elapsed >= VIDEO_FREE_SECONDS && !showExtendPrompt && !callPaused) {
            setShowExtendPrompt(true);
            if (frameRef.current) {
              frameRef.current.setLocalAudio(false);
              frameRef.current.setLocalVideo(false);
            }
            setCallPaused(true);
          }
      }, 1000);
      return () => { if (callTimerRef.current) clearInterval(callTimerRef.current); };
    }
  }, [inCall, callPaused, showExtendPrompt]);

  const handleExtendCall = async () => {
    if (!user) return;
    const { data: prof } = await supabase.from("profiles").select("balance_uzs").eq("user_id", user.id).maybeSingle();
    if (!prof || prof.balance_uzs < VIDEO_EXTRA_COST_PER_MIN) {
      toast.error("Balans yetarli emas! Video qo'ng'iroq tugatiladi.");
      handleLeaveCall();
      return;
    }
    await supabase.from("profiles").update({ balance_uzs: prof.balance_uzs - VIDEO_EXTRA_COST_PER_MIN }).eq("user_id", user.id);
    toast.success(`${VIDEO_EXTRA_COST_PER_MIN.toLocaleString()} UZS yechildi. +1 daqiqa`);
    callStartRef.current = Date.now();
    setCallElapsed(0);
    setShowExtendPrompt(false);
    setCallPaused(false);
    if (frameRef.current) {
      frameRef.current.setLocalAudio(micOn);
      frameRef.current.setLocalVideo(camOn);
    }
  };

  const handleEndCallFromPrompt = () => {
    setShowExtendPrompt(false);
    handleLeaveCall();
  };

completed" || consultation?.status === "cancellonst handleSend = async () => {
    if (!newMessage.trim() || !user ||completed" || consultation?.status === "cancelld || sending) return;
    if (localEnded || consultation?.status === "ended") { toast.error("Konsultatsiya tugagan"); return; }
    setSending(true);
    const { error } = await supabase.from("messages").insert({
      consultation_id: id, sender_id: user.id, content: newMessage.trim(), message_type: "text",
    });
    setSending(false);
    if (error) toast.error(error.message);
    else setNewMessage("");
  };

  const handleEndConsultation = async () => {
    if (!id) return;
    try {
      setLocalEnded(tcomplet);
      await cleanupCallFrame();
      const { error } = await supabase.from("consultations").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", id);
      if (error) {
        toast.error(error.message);
        setLocalEnded(false);
      } else {
        toast.success("Konsultatsiya tugadi");
        if (!isDoctor) {
          // Patient: show rating then redirect home
          setShowRating(true);
        }
        // Doctor stays on page to write prescription
      }
    } catch (err: any) {
      console.error("Error ending consultation:", err);
      toast.error("Konsultatsiyani tugatishda xatolik");
      setLocalEnded(false);
    }
  };

  const handleStartCall = async () => {
    if (!id || joiningCall) return;
    setJoiningCall(true);

    let frame: any = null;
    let mediaStream: MediaStream | null = null;

    try {
      // CRITICAL: Request media permissions FIRST, directly in user gesture context
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch (mediaErr: any) {
        if (mediaErr.name === "NotAllowedError") {
          toast.error("Kamera va mikrofonga ruxsat bering");
        } else {
          toast.error("Kamera/mikrofon topilmadi");
        }
        setJoiningCall(false);
        return;
      }

      if (frameRef.current) {
        await cleanupCallFrame(frameRef.current);
      }

      const res = await supabase.functions.invoke("create-video-room", { body: { consultation_id: id } });
      if (res.error || !res.data?.url) {
        toast.error("Video qo'ng'iroqni boshlashda xatolik");
        mediaStream?.getTracks().forEach(t => t.stop());
        setJoiningCall(false);
        return;
      }

      const { url, token } = res.data;

      // Stop the pre-acquired stream since Daily will create its own
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;

      if (!videoContainerRef.current) {
        toast.error("Video konteyner topilmadi");
        setJoiningCall(false);
        return;
      }

      frame = DailyIframe.createFrame(videoContainerRef.current, {
        iframeStyle: {
          width: "100%",
          height: "100%",
          border: "0",
          borderRadius: "12px",
        },
        showLeaveButton: false,
        showFullscreenButton: true,
      });

      frameRef.current = frame;

      frame.on("left-meeting", () => {
        void cleanupCallFrame(frame);
      });

      frame.on("error", (e: any) => {
        console.error("Daily error:", e);
        if (e?.errorMsg === "account-missing-payment-method") {
          toast.error("Video qo'ng'iroq hozircha mavjud emas. Hisob sozlamalari talab qilinadi.");
        } else {
          toast.error("Video qo'ng'iroq xatoligi");
        }
        void cleanupCallFrame(frame);
      });

      await frame.join({ url, token });
      setInCall(true);
      setCallElapsed(0);
      setCallPaused(false);
      setShowExtendPrompt(false);
      callStartRef.current = Date.now();
    } catch (err: any) {
      mediaStream?.getTracks().forEach(t => t.stop());
      await cleanupCallFrame(frame);
      toast.error(err?.message || "Video xatolik");
    } finally {
      setJoiningCall(false);
    }
  };

  const handleLeaveCall = useCallback(async () => {
    await cleanupCallFrame();
  }, [cleanupCallFrame]);

  const toggleMic = useCallback(() => {
    const frame = frameRef.current;
    if (frame) {
      frame.setLocalAudio(!micOn);
      setMicOn(!micOn);
    }
  }, [micOn]);

  const toggleCam = useCallback(() => {
    const frame = frameRef.current;
    if (frame) {
      frame.setLocalVideo(!camOn);
      setCamOn(!camOn);
    }
  }, [camOn]);

  const handleSubmitRating = async () => {
    if (!id || !user || !consultation) return;
    setSubmittingRating(true);
    const { error } = await supabase.from("consultation_ratings").insert({
      consultation_id: id, patient_id: user.id, doctor_id: consultation.doctor_id, rating: ratingValue, comment: ratingComment.trim() || null,
    });
    setSubmittingRating(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Baholandi!");
    setShowRating(false);
    setHasRated(true);
    const { data: ratings } = await supabase.from("consultation_ratings").select("rating").eq("doctor_id", consultation.doctor_id);
    if (ratings && ratings.length > 0) {
      const avg = ratings.reduce((sum: number, r: any) => sum + r.rating, 0) / ratings.length;
      await supabase.from("doctors").update({ rating: Math.round(avg * 100) / 100 }).eq("id", consultation.doctor_id);
    }
    // Redirect patient home after rating
    navigate("/");
  };

  const isEnded = localEnded || consultation?.status === "ended";

  const getTimeLeft = () => {
    if (!consultation?.max_end_time) return null;
    const diff = new Date(consultation.max_end_time).getTime() - Date.now();
    if (diff <= 0) return "Muddati tugagan";
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    if (hours > 0) return `${hours}s ${mins}d`;
    return `${mins}d ${secs}s`;
  };

  // Live countdown
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!consultation?.max_end_time || isEnded) return;
    const t = setInterval(() => setTick(v => v + 1), 1000);
    return () => clearInterval(t);
  }, [consultation?.max_end_time, isEnded]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 flex flex-col pt-16 max-w-3xl mx-auto w-full">
        {/* Header */}
        <motion.div 
          initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          className="bg-card border-b border-border px-4 py-3 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-secondary text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h2 className="font-display font-semibold text-foreground text-sm">{otherName}</h2>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${isEnded ? "text-destructive" : "text-green-600"}`}>
                  {isEnded ? "✕ Tugagan" : "● Faol"}
                </span>
                {!isEnded && consultation?.max_end_time && (
                  <span className="text-xs text-warning flex items-center gap-1">
                    <Timer className="w-3 h-3" />{getTimeLeft()}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isEnded && !inCall && (
              <motion.button
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                onClick={handleStartCall} disabled={joiningCall}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-100 text-green-700 text-xs font-medium hover:bg-green-200 disabled:opacity-50 transition-colors"
              >
                <Video className="w-3.5 h-3.5" /> {joiningCall ? "..." : "Video"}
              </motion.button>
            )}
            {isDoctor && isEnded && (
              <motion.button
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                onClick={() => navigate(`/create-prescription/${id}`)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
              >
                <FileText className="w-3.5 h-3.5" /> Retsept
              </motion.button>
            )}
            {!isEnded && (
              <motion.button
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                onClick={handleEndConsultation}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-medium hover:bg-destructive/20 transition-colors"
              >
                <PhoneOff className="w-3.5 h-3.5" /> Tugatish
              </motion.button>
            )}
          </div>
        </motion.div>

        {/* Video container - always in DOM for Daily.co createFrame ref */}
        <div
          ref={videoContainerRef}
          id="daily-video"
          className={`${inCall || joiningCall ? "block" : "hidden"} bg-black relative overflow-hidden`}
          style={{ height: inCall ? "50vh" : 0 }}
        >
          {inCall && (
            <>
              {/* Timer display */}
              <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/70 text-white px-3 py-1 rounded-full text-xs font-mono z-20">
                {Math.floor(callElapsed / 60).toString().padStart(2, "0")}:{(callElapsed % 60).toString().padStart(2, "0")} / 10:00
              </div>
              {/* Extend prompt overlay */}
              <AnimatePresence>
                {showExtendPrompt && (
                  <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/80 flex items-center justify-center z-30"
                  >
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                      className="bg-card rounded-2xl p-6 max-w-sm mx-4 text-center space-y-4"
                    >
                      <h3 className="font-semibold text-foreground text-lg">10 daqiqa tugadi!</h3>
                      <p className="text-sm text-muted-foreground">
                        Davom etish uchun har bir qo'shimcha daqiqa uchun <span className="font-bold text-foreground">{VIDEO_EXTRA_COST_PER_MIN.toLocaleString()} UZS</span> to'lanadi.
                      </p>
                      <div className="flex gap-3">
                        <button onClick={handleEndCallFromPrompt}
                          className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground font-medium text-sm">
                          Tugatish
                        </button>
                        <button onClick={handleExtendCall}
                          className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm">
                          Davom etish
                        </button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
              {/* Video controls */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-black/60 rounded-2xl px-4 py-2 z-20">
                <button onClick={toggleMic} className={`p-2.5 rounded-full transition-colors ${micOn ? "bg-secondary text-foreground" : "bg-destructive text-destructive-foreground"}`}>
                  {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </button>
                <button onClick={toggleCam} className={`p-2.5 rounded-full transition-colors ${camOn ? "bg-secondary text-foreground" : "bg-destructive text-destructive-foreground"}`}>
                  {camOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                </button>
                <button onClick={handleLeaveCall} className="p-2.5 rounded-full bg-destructive text-destructive-foreground">
                  <PhoneOff className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Messages */}
        <div className={`flex-1 overflow-y-auto px-4 py-4 space-y-3 ${inCall ? "max-h-[25vh]" : ""}`}>
          {messages.map((msg, i) => {
            const isMine = msg.sender_id === user?.id;
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i > messages.length - 3 ? 0.1 : 0 }}
                className={`flex ${isMine ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${isMine ? "bg-primary text-primary-foreground rounded-br-md" : "bg-secondary text-foreground rounded-bl-md"}`}>
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  <span className={`text-[10px] mt-1 block ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </motion.div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Rating */}
        <AnimatePresence>
          {showRating && !hasRated && !isDoctor && (
            <motion.div
              initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}
              className="bg-card border-t border-border px-4 py-6"
            >
              <h3 className="font-display font-semibold text-foreground text-center mb-3">Shifokorni baholang</h3>
              <div className="flex justify-center gap-1 mb-3">
                {[1, 2, 3, 4, 5].map(s => (
                  <motion.button key={s} onClick={() => setRatingValue(s)} whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.9 }}>
                    <Star className={`w-8 h-8 transition-colors ${s <= ratingValue ? "fill-warning text-warning" : "text-muted"}`} />
                  </motion.button>
                ))}
              </div>
              <textarea value={ratingComment} onChange={e => setRatingComment(e.target.value)} placeholder="Izoh qoldiring (ixtiyoriy)"
                className="w-full px-4 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm mb-3 resize-none h-20 focus:ring-2 focus:ring-primary outline-none" />
              <button onClick={handleSubmitRating} disabled={submittingRating}
                className="w-full py-2.5 rounded-xl bg-hero-gradient text-primary-foreground font-medium text-sm hover:opacity-90 disabled:opacity-50 mb-2">
                {submittingRating ? "Yuborilmoqda..." : "Baholash"}
              </button>
              <button onClick={() => navigate("/")} className="w-full py-2 text-sm text-muted-foreground hover:text-foreground">
                O'tkazib yuborish
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Message Input */}
        {!isEnded ? (
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="bg-card border-t border-border px-4 py-3">
            <div className="flex gap-2">
              <input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                placeholder="Xabar yozing..." className="flex-1 px-4 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm focus:ring-2 focus:ring-primary outline-none transition-shadow" />
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                onClick={handleSend} disabled={!newMessage.trim() || sending} className="p-2.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity">
                <Send className="w-4 h-4" />
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-secondary/50 border-t border-border px-4 py-4 text-center">
            <p className="text-sm text-muted-foreground">Bu konsultatsiya tugagan</p>
            {!hasRated && !isDoctor && (
              <button onClick={() => setShowRating(true)} className="mt-2 text-sm text-primary font-medium hover:underline">Shifokorni baholash</button>
            )}
            {hasRated && !isDoctor && (
              <button onClick={() => navigate("/")} className="mt-2 px-3 py-1.5 rounded-xl bg-secondary text-foreground text-sm font-medium hover:bg-secondary/80">
                Bosh sahifa
              </button>
            )}
            {isDoctor && (
              <button onClick={() => navigate(`/create-prescription/${id}`)} className="mt-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
                <FileText className="w-4 h-4 inline mr-1" /> Retsept yozish
              </button>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default ConsultationPage;
