import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/** Owner/admin: Eskiz ulanishini sinash. Faqat "Bu Eskiz dan test" matni yuboriladi, pul yechilmaydi. */
const SmsTest = () => {
  const [phone, setPhone] = useState("998");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<string | null>(null);

  const run = async () => {
    setBusy(true); setRes(null);
    const { data, error } = await supabase.functions.invoke("sms-test", { body: { phone } });
    setBusy(false);
    if (error) { let m = error.message; try { m = (await (error as any).context?.json())?.error ?? m; } catch { /* keep */ } setRes(`Xato: ${m}`); toast.error(m); return; }
    if (!data?.configured) setRes(data?.error ?? "Eskiz sozlanmagan");
    else setRes(data.ok ? "Eskiz so'rovni qabul qildi (SMS yo'lda). Telefonni tekshiring." : "Eskiz rad etdi. Supabase loglarini ko'ring (sms-test).");
  };

  return (
    <div className="max-w-md">
      <h2 className="font-display text-xl font-bold text-foreground mb-1">SMS sinovi (Eskiz)</h2>
      <p className="text-sm text-muted-foreground mb-4">Faqat "Bu Eskiz dan test" matni yuboriladi. Foydalanuvchilarga SMS bormaydi va pul yechilmaydi.</p>
      <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" placeholder="998901234567"
        className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm mb-3" />
      <button onClick={run} disabled={busy} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
        {busy ? "Yuborilmoqda..." : "Test SMS yuborish"}
      </button>
      {res && <p className="mt-3 text-sm text-foreground">{res}</p>}
    </div>
  );
};

export default SmsTest;
