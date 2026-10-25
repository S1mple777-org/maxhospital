import { useEffect, useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { getUpdateState, installLatestApk, subscribeUpdates, type UpdateState } from "@/lib/appUpdate";

/**
 * Faqat ilova ichida va faqat yangi APK kerak bo'lganda ko'rinadi.
 * "Yangilash": APK ilovaning o'zida yuklanadi (foiz bilan), keyin Android o'rnatish oynasi ochiladi.
 * Oddiy sayt yangilanishlari esa orqa fonda, hech qanday oynasiz keladi.
 */
const AppUpdateBanner = () => {
  const [s, setS] = useState<UpdateState>(getUpdateState());
  const [hidden, setHidden] = useState(false);
  useEffect(() => subscribeUpdates(setS), []);
  if (!s.needsApk || hidden) return null;

  const loading = s.apkProgress !== null;
  const update = async () => {
    const r = await installLatestApk();
    if (r === "needs_permission") toast("MaxHospital uchun «Bu manbadan o'rnatish»ni yoqing, so'ng qaytib yana «Yangilash»ni bosing.", { duration: 12_000 });
    else if (r === "started") toast.success("O'rnatish oynasida «O'rnatish»ni bosing.");
    else if (r === "error") toast.error(getUpdateState().error ?? "Yangilab bo'lmadi");
  };

  return (
    <div className="fixed bottom-4 inset-x-4 z-[60] mx-auto max-w-md rounded-2xl border border-primary/30 bg-card p-4 shadow-lg">
      {!loading && <button onClick={() => setHidden(true)} className="absolute top-2 right-2 p-1 text-muted-foreground" aria-label="Yopish"><X className="w-4 h-4" /></button>}
      <p className="text-sm font-semibold text-foreground">Ilovaning yangi versiyasi bor</p>
      <p className="text-xs text-muted-foreground mt-1 pr-4">Yangi imkoniyatlar uchun ilovani yangilang. Ma'lumotlaringiz saqlanib qoladi.</p>
      {loading && (
        <div className="mt-3 h-2 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${s.apkProgress}%` }} />
        </div>
      )}
      <button onClick={update} disabled={loading}
        className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-70">
        {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Yuklanmoqda... {s.apkProgress}%</> : <><Download className="w-4 h-4" /> Yangilash</>}
      </button>
    </div>
  );
};

export default AppUpdateBanner;
