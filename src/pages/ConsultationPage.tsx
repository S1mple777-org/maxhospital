import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import Navbar from "@/components/Navbar";
import { Send, ArrowLeft, PhoneOff } from "lucide-react";
import { toast } from "sonner";

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
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [consultation, setConsultation] = useState<any>(null);
  const [otherName, setOtherName] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isDoctor = hasRole("doctor");

  useEffect(() => {
    if (!id || !user) return;

    // Load consultation
    const loadConsultation = async () => {
      const { data: cons } = await supabase
        .from("consultations")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (!cons) { navigate("/"); return; }
      setConsultation(cons);

      // Get other participant's name
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

    // Load messages
    supabase
      .from("messages")
      .select("*")
      .eq("consultation_id", id)
      .order("created_at", { ascending: true })
      .then(({ data }) => { if (data) setMessages(data as Message[]); });

    // Realtime subscription
    const channel = supabase
      .channel(`consultation-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `consultation_id=eq.${id}` },
        (payload) => {
          setMessages(prev => [...prev, payload.new as Message]);
        }
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "consultations", filter: `id=eq.${id}` },
        (payload) => {
          setConsultation(payload.new);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim() || !user || !id || sending) return;
    if (consultation?.status === "ended") {
      toast.error("Konsultatsiya tugagan");
      return;
    }
    setSending(true);
    const { error } = await supabase.from("messages").insert({
      consultation_id: id,
      sender_id: user.id,
      content: newMessage.trim(),
      message_type: "text",
    });
    setSending(false);
    if (error) toast.error(error.message);
    else setNewMessage("");
  };

  const handleEndConsultation = async () => {
    if (!id) return;
    const { error } = await supabase
      .from("consultations")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Konsultatsiya tugadi");
  };

  const isEnded = consultation?.status === "ended";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 flex flex-col pt-16 max-w-3xl mx-auto w-full">
        {/* Chat Header */}
        <div className="bg-card border-b border-border px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-secondary text-foreground">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h2 className="font-display font-semibold text-foreground text-sm">{otherName}</h2>
              <span className={`text-xs ${isEnded ? "text-destructive" : "text-green-600"}`}>
                {isEnded ? "Tugagan" : "Faol"}
              </span>
            </div>
          </div>
          {isDoctor && !isEnded && (
            <button
              onClick={handleEndConsultation}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-medium hover:bg-destructive/20"
            >
              <PhoneOff className="w-3.5 h-3.5" />
              Tugatish
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.map((msg) => {
            const isMine = msg.sender_id === user?.id;
            return (
              <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                  isMine
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-secondary text-foreground rounded-bl-md"
                }`}>
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  <span className={`text-[10px] mt-1 block ${isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        {!isEnded ? (
          <div className="bg-card border-t border-border px-4 py-3">
            <div className="flex gap-2">
              <input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                placeholder="Xabar yozing..."
                className="flex-1 px-4 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm focus:ring-2 focus:ring-primary outline-none"
              />
              <button
                onClick={handleSend}
                disabled={!newMessage.trim() || sending}
                className="p-2.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-secondary/50 border-t border-border px-4 py-4 text-center">
            <p className="text-sm text-muted-foreground">Bu konsultatsiya tugagan</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConsultationPage;
