import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { getUpdateState, openApkDownload, subscribeUpdates, type UpdateState } from "@/lib/appUpdate";

/**
 * Faqat ilova ichida va faqat yangi APK kerak bo'lganda ko'rinadi.
 * Oddiy sayt yangilanishlari orqa fonda, hech qanday oynasiz keladi.
 */
const AppUpdateBanner = () => {
  const [s, setS] = useState<UpdateState>(getUpdateState());
  const [hidden, setHidden] = useState(false);
  useEffect(() => subscribeUpdates(setS), []);
  if (!s.needsApk || hidden) return null;
  return (
    <div className="fixed bottom-4 inset-x-4 z-[60] mx-auto max-w-md rounded-2xl border border-primary/30 bg-card p-4 shadow-lg">
      <button onClick={() => setHidden(true)} className="absolute top-2 right-2 p-1 text-muted-foreground" aria-label="Yopish"><X className="w-4 h-4" /></button>
      <p className="text-sm font-semibold text-foreground">Ilovaning yangi versiyasi bor</p>
      <p className="text-xs text-muted-foreground mt-1 pr-4">Yangi imkoniyatlar uchun ilovani yangilang. Ma'lumotlaringiz saqlanib qoladi.</p>
      <button onClick={openApkDownload}
        className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground">
        <Download className="w-4 h-4" /> Yangilash
      </button>
    </div>
  );
};

export default AppUpdateBanner;
