import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Smartphone } from "lucide-react";
import { applyQueuedUpdateNow, checkForUpdate, getUpdateState, openApkDownload, subscribeUpdates, type UpdateState } from "@/lib/appUpdate";
import { isNativeApp } from "@/lib/native";

/** Profil sahifasida (faqat ilovada): versiya, yangilanish holati, qo'lda tekshirish. */
const AppVersionCard = () => {
  const [s, setS] = useState<UpdateState>(getUpdateState());
  useEffect(() => subscribeUpdates(setS), []);
  if (!isNativeApp()) return null;
  return (
    <div className="mt-6 rounded-2xl border border-border bg-card p-4">
      <p className="text-sm font-semibold text-foreground flex items-center gap-2"><Smartphone className="w-4 h-4 text-primary" /> Ilova versiyasi</p>
      <p className="text-xs text-muted-foreground mt-1">
        {s.apkVersion ?? "—"}{s.apkBuild ? ` (${s.apkBuild})` : ""} · sayt {s.webBuild.slice(0, 7)}
      </p>
      <p className="text-xs mt-2 text-foreground">
        {s.needsApk ? "Yangi APK kerak." : s.queued ? "Yangi versiya yuklab olindi: ilova keyingi ochilishda yangilanadi." : s.checking ? "Tekshirilmoqda..." : s.error ? `Tekshirib bo'lmadi: ${s.error}` : "Eng oxirgi versiya."}
      </p>
      <div className="mt-3 flex gap-2">
        {s.needsApk ? (
          <button onClick={openApkDownload} className="flex-1 rounded-xl bg-primary py-2 text-xs font-medium text-primary-foreground">APK ni yangilash</button>
        ) : s.queued ? (
          <button onClick={() => void applyQueuedUpdateNow()} className="flex-1 rounded-xl bg-primary py-2 text-xs font-medium text-primary-foreground">Hozir yangilash</button>
        ) : (
          <button onClick={() => void checkForUpdate()} disabled={s.checking}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border py-2 text-xs font-medium text-foreground disabled:opacity-60">
            {s.checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Yangilanishni tekshirish
          </button>
        )}
      </div>
    </div>
  );
};

export default AppVersionCard;
