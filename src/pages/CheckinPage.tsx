import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { CheckCircle2, HeartPulse, Loader2 } from "lucide-react";
import { ANSWERS, answerCheckinByToken, answerInfo, getCheckinByToken, type CheckinAnswer, type CheckinPageInfo } from "@/lib/treatment";

/** Public page opened from the Telegram message: one tap, no login. The token in the link is the key. */
const CheckinPage = () => {
  const { token = "" } = useParams();
  const [params] = useSearchParams();
  const pre = params.get("a");
  const [info, setInfo] = useState<CheckinPageInfo | null>(null);
  const [choice, setChoice] = useState<CheckinAnswer | null>(ANSWERS.some((a) => a.key === pre) ? (pre as CheckinAnswer) : null);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  useEffect(() => { getCheckinByToken(token).then(setInfo); }, [token]);

  const send = async () => {
    if (!choice) return;
    setState("sending");
    const r = await answerCheckinByToken(token, choice, note);
    if (r === "error") { setState("error"); return; }
    setState("done");
    setInfo((i) => (i ? { ...i, answered: true, answer: i.answer ?? choice } : i));
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 card-shadow text-center">
        <HeartPulse className="w-8 h-8 mx-auto text-primary mb-2" />
        <h1 className="font-display text-lg font-bold text-foreground mb-1">MaxHospital · Davolanish kuzatuvi</h1>
        {children}
      </div>
    </div>
  );

  if (!info) return shell(<Loader2 className="w-5 h-5 animate-spin mx-auto mt-4 text-muted-foreground" />);
  if (!info.found) return shell(<p className="text-sm text-muted-foreground mt-3">Havola topilmadi yoki hali vaqti kelmagan.</p>);

  const final = choice ?? info.answer ?? null;
  if (state === "done" || info.answered) {
    const a = answerInfo(info.answer ?? final);
    return shell(
      <>
        <CheckCircle2 className="w-6 h-6 mx-auto text-green-600 mt-3" />
        <p className="text-sm text-foreground mt-2">Javobingiz shifokorga yetkazildi{a ? `: ${a.emoji} ${a.label}` : ""}. Rahmat!</p>
        {(info.answer ?? final) === "worse" ? (
          <p className="text-xs text-muted-foreground mt-3">Shifokorga xabar berildi. Ahvolingiz og'ir bo'lsa, darhol <b>103</b> ga qo'ng'iroq qiling.</p>
        ) : <p className="text-xs text-muted-foreground mt-3">Tez tuzalib ketishingizni tilaymiz.</p>}
        <Link to="/start-consultation" className="inline-block mt-4 text-sm text-primary font-medium hover:underline">Shifokorga savol berish →</Link>
      </>,
    );
  }

  return shell(
    <>
      <p className="text-sm text-muted-foreground mt-2">
        {info.doctor_name} yozgan retseptga {info.days} kun bo'ldi. Ahvolingiz qanday?
      </p>
      <div className="grid grid-cols-3 gap-2 mt-4">
        {ANSWERS.map((a) => (
          <button key={a.key} onClick={() => setChoice(a.key)} aria-pressed={choice === a.key}
            className={`rounded-xl border px-2 py-3 text-xs font-medium ${a.cls} ${choice === a.key ? "ring-2 ring-primary" : "opacity-80"}`}>
            <span className="block text-2xl leading-none mb-1">{a.emoji}</span>{a.label}
          </button>
        ))}
      </div>
      {choice && (
        <>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3}
            placeholder={choice === "worse" ? "Nima yomonlashdi? (ixtiyoriy)" : "Shifokorga izoh (ixtiyoriy)"}
            className="w-full mt-4 px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm resize-none" />
          <button onClick={send} disabled={state === "sending"}
            className="w-full mt-3 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60">
            {state === "sending" ? "Yuborilmoqda..." : "Shifokorga yuborish"}
          </button>
          {state === "error" && <p className="text-xs text-destructive mt-2">Yuborib bo'lmadi. Qayta urinib ko'ring.</p>}
        </>
      )}
    </>,
  );
};

export default CheckinPage;
