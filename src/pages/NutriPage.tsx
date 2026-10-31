import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Camera, CheckCircle2, Info, Loader2, Minus, Plus, Salad, Search, Settings2, Trash2, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import {
  CAT_UZ, FOODS, FOOD_BY_ID, MEAL_UZ, analyzePhoto, dailyTargets, deleteMeal, judgeMeal, loadMeals, loadProfile,
  mealByTime, saltGrams, saveMeal, saveSettings, shrinkImage, suggestFoods, todayTashkent, totals,
  type FoodCat, type MealItem, type MealKind, type MealRow, type NutriProfile, type NutriSettings, type Totals,
} from "@/lib/nutri";

const card = "bg-card border border-border rounded-2xl p-4";
const ZERO: Totals = { kcal: 0, protein: 0, fat: 0, carbs: 0, sodium: 0, sugar: 0, fiber: 0 };
const VERDICT = {
  good: { icon: CheckCircle2, cls: "text-emerald-700 dark:text-emerald-400 bg-emerald-500/10" },
  warn: { icon: AlertTriangle, cls: "text-amber-700 dark:text-amber-400 bg-amber-500/10" },
  bad: { icon: XCircle, cls: "text-rose-700 dark:text-rose-400 bg-rose-500/10" },
} as const;

function Bar({ label, value, max, unit, warnAt = 1 }: { label: string; value: number; max: number; unit: string; warnAt?: number }) {
  const p = max > 0 ? value / max : 0;
  const cls = p > warnAt ? "bg-rose-500" : p > warnAt * 0.85 ? "bg-amber-500" : "bg-primary";
  return (
    <div>
      <div className="flex justify-between text-xs"><span className="text-foreground font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">{value} / {max} {unit}</span></div>
      <div className="h-2 rounded-full bg-secondary mt-1 overflow-hidden"><div className={`h-full rounded-full ${cls}`} style={{ width: `${Math.min(100, p * 100)}%` }} /></div>
    </div>
  );
}

function sumDay(meals: MealRow[]): Totals {
  return meals.reduce((a, m) => ({
    kcal: a.kcal + m.totals.kcal, protein: a.protein + m.totals.protein, fat: a.fat + m.totals.fat, carbs: Math.round(a.carbs + m.totals.carbs),
    sodium: a.sodium + m.totals.sodium, sugar: Math.round(a.sugar + m.totals.sugar), fiber: Math.round(a.fiber + m.totals.fiber),
  }), { ...ZERO });
}

/** Taom tanlash (qidiruv + bo'limlar). */
function FoodPicker({ onPick, onClose }: { onPick: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<FoodCat | "all">("all");
  const list = FOODS.filter((x) => (cat === "all" || x.cat === cat) && x.name.toLowerCase().includes(q.toLowerCase().trim()));
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full sm:max-w-lg max-h-[85vh] bg-card rounded-t-2xl sm:rounded-2xl p-4 flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-3">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Taom nomi: osh, somsa, lag'mon…"
            className="flex-1 bg-transparent outline-none text-sm" />
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
          {(["all", ...Object.keys(CAT_UZ)] as (FoodCat | "all")[]).map((c) => (
            <button key={c} onClick={() => setCat(c)} className={`shrink-0 px-2.5 py-1 rounded-lg text-xs border ${cat === c ? "border-primary bg-primary/10" : "border-border text-muted-foreground"}`}>
              {c === "all" ? "Hammasi" : CAT_UZ[c]}
            </button>
          ))}
        </div>
        <ul className="overflow-y-auto divide-y divide-border">
          {list.map((x) => (
            <li key={x.id}>
              <button onClick={() => onPick(x.id)} className="w-full flex items-center gap-2 py-2.5 text-left">
                <span className="flex-1 text-sm text-foreground">{x.name}</span>
                <span className="text-xs text-muted-foreground">{x.portionName} · {Math.round((x.kcal * x.portion) / 100)} kkal</span>
              </button>
            </li>
          ))}
          {!list.length && <li className="py-6 text-center text-sm text-muted-foreground">Topilmadi. Eng yaqin taomni tanlang.</li>}
        </ul>
      </div>
    </div>
  );
}

export default function NutriPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [meals, setMeals] = useState<MealRow[] | null>(null);
  const [settings, setSettings] = useState<NutriSettings | null>(null);
  const [profile, setProfile] = useState<NutriProfile | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  // Yangi ovqat
  const [draft, setDraft] = useState<MealItem[] | null>(null);
  const [draftMeal, setDraftMeal] = useState<MealKind>(mealByTime());
  const [source, setSource] = useState<"photo" | "manual">("manual");
  const [preview, setPreview] = useState<string | null>(null);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);

  const reload = async () => setMeals(await loadMeals(7));

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate("/auth"); return; }
    void reload();
    void loadProfile().then((r) => { setSettings(r.settings); setProfile(r.profile); if (!r.saved) setShowSettings(true); });
  }, [user, loading]);

  const prof = useMemo(() => (profile && settings ? { ...profile, ...settings } : null), [profile, settings]);
  const targets = useMemo(() => (prof ? dailyTargets(prof) : null), [prof]);
  const today = todayTashkent();
  const todayMeals = (meals ?? []).filter((m) => m.day === today);
  const eaten = sumDay(todayMeals);
  const dTotals = draft ? totals(draft) : null;
  const verdicts = draft && prof && targets ? judgeMeal(draft, prof, targets) : [];
  const suggestions = prof && targets ? suggestFoods(eaten, targets, prof, 6) : [];

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setSource("photo"); setUnknown([]); setDraftMeal(mealByTime());
    try {
      const img = await shrinkImage(file);
      setPreview(img.preview); setDraft([]);
      const r = await analyzePhoto(img.data, img.mimeType);
      if (!r.is_food) { toast.error("Rasmda ovqat topilmadi"); setDraft(null); setPreview(null); return; }
      setDraft(r.items); setUnknown(r.unknown);
      if (!r.items.length) toast("Taomni tanimadim — ro'yxatdan tanlang");
    } catch (e: any) {
      toast.error(e.message); setDraft([]);
    } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const setGrams = (i: number, g: number) => setDraft((d) => d!.map((x, j) => (j === i ? { ...x, grams: Math.max(10, Math.round(g)) } : x)));

  const save = async () => {
    if (!draft?.length || !dTotals) return;
    setBusy(true);
    try { await saveMeal(draftMeal, draft, dTotals, source); toast.success("Kundalikka yozildi"); setDraft(null); setPreview(null); await reload(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const saveS = async (s: NutriSettings) => {
    try { await saveSettings(s); setSettings(s); setShowSettings(false); toast.success("Saqlandi"); } catch (e: any) { toast.error(e.message); }
  };

  const week = useMemo(() => {
    const days: { day: string; t: Totals }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date(Date.now() - i * 864e5));
      days.push({ day: d, t: sumDay((meals ?? []).filter((m) => m.day === d)) });
    }
    return days;
  }, [meals]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-2xl space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Salad className="w-6 h-6 text-emerald-600" /> MaxNutri</h1>
              <p className="text-sm text-muted-foreground mt-1">Ovqatingizni suratga oling — osh, somsa, lag'mon… Kaloriya, uglevod va tuzni hisoblab, sog'lig'ingizga qanday ta'sir qilishini aytamiz.</p>
            </div>
            <button onClick={() => setShowSettings(!showSettings)} className="p-2 rounded-lg border border-border" aria-label="Sozlamalar"><Settings2 className="w-5 h-5" /></button>
          </div>

          {showSettings && settings && (
            <div className={`${card} space-y-3`}>
              <h2 className="text-sm font-semibold text-foreground">Siz uchun me'yor</h2>
              <div className="grid grid-cols-3 gap-1.5">
                {([["lose", "Vazn tashlash"], ["keep", "Vaznni saqlash"], ["gain", "Vazn olish"]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setSettings({ ...settings, goal: k })} className={`py-2 rounded-lg text-xs border ${settings.goal === k ? "border-primary bg-primary/10" : "border-border text-muted-foreground"}`}>{l}</button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {([["low", "Kam harakat"], ["medium", "O'rtacha"], ["high", "Faol"]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setSettings({ ...settings, activity: k })} className={`py-2 rounded-lg text-xs border ${settings.activity === k ? "border-primary bg-primary/10" : "border-border text-muted-foreground"}`}>{l}</button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.diabetes} onChange={(e) => setSettings({ ...settings, diabetes: e.target.checked })} /> Qandli diabet</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.hypertension} onChange={(e) => setSettings({ ...settings, hypertension: e.target.checked })} /> Yuqori qon bosimi</label>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={settings.share_with_doctor} onChange={(e) => setSettings({ ...settings, share_with_doctor: e.target.checked })} />
                <span>Konsultatsiya paytida shifokorim so'nggi 7 kunlik ovqatlanishimni ko'rsin</span></label>
              {profile && !profile.weight_kg && <p className="text-xs text-amber-600">Passport'da bo'y, vazn va tug'ilgan sanani kiriting — kaloriya me'yori aniqroq bo'ladi.</p>}
              <button onClick={() => saveS(settings)} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium">Saqlash</button>
            </div>
          )}

          {/* Bugun */}
          {targets && meals && (
            <div className={`${card} space-y-2.5`}>
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-foreground">Bugun</h2>
                <span className="text-xs text-muted-foreground">qoldi: <b className="text-foreground">{Math.max(0, targets.kcal - eaten.kcal)} kkal</b></span>
              </div>
              <Bar label="Kaloriya" value={eaten.kcal} max={targets.kcal} unit="kkal" />
              <Bar label={settings?.diabetes ? "Uglevod (diabet)" : "Uglevod"} value={eaten.carbs} max={targets.carbsMax} unit="g" />
              <Bar label="Tuz" value={saltGrams(eaten.sodium)} max={5} unit="g" warnAt={1} />
              <Bar label="Qo'shilgan shakar" value={eaten.sugar} max={targets.sugarMax} unit="g" />
              <Bar label="Oqsil" value={Math.round(eaten.protein)} max={targets.protein} unit="g" warnAt={99} />
            </div>
          )}

          {/* Qo'shish */}
          {!draft && (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => fileRef.current?.click()} className="py-4 rounded-2xl bg-emerald-600 text-white font-semibold flex flex-col items-center gap-1">
                <Camera className="w-6 h-6" /> Suratga olish
              </button>
              <button onClick={() => { setSource("manual"); setPreview(null); setUnknown([]); setDraftMeal(mealByTime()); setDraft([]); setPicker(true); }}
                className="py-4 rounded-2xl border border-border text-foreground font-medium flex flex-col items-center gap-1">
                <Search className="w-6 h-6" /> Ro'yxatdan tanlash
              </button>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />

          {draft && (
            <div className={`${card} space-y-3`}>
              <div className="flex items-center gap-2">
                <select value={draftMeal} onChange={(e) => setDraftMeal(e.target.value as MealKind)} className="px-2 py-1.5 rounded-lg border border-input bg-background text-sm">
                  {(Object.keys(MEAL_UZ) as MealKind[]).map((k) => <option key={k} value={k}>{MEAL_UZ[k]}</option>)}
                </select>
                <span className="flex-1" />
                <button onClick={() => { setDraft(null); setPreview(null); }} className="p-1"><X className="w-5 h-5" /></button>
              </div>
              {preview && <img src={preview} alt="Ovqat" className="w-full max-h-64 object-cover rounded-xl" />}
              {busy && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Taomlar aniqlanmoqda…</p>}
              {unknown.length > 0 && <p className="text-xs text-amber-600">Bazada yo'q: {unknown.join(", ")} — eng yaqinini «Taom qo'shish» orqali tanlang.</p>}

              {draft.map((it, i) => {
                const fd = FOOD_BY_ID.get(it.food)!;
                const p = it.grams / fd.portion;
                return (
                  <div key={i} className="rounded-xl border border-border p-3">
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-sm font-medium text-foreground">{fd.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{Math.round((fd.kcal * it.grams) / 100)} kkal</span>
                      <button onClick={() => setDraft(draft.filter((_, j) => j !== i))} className="text-muted-foreground"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <button onClick={() => setGrams(i, it.grams - fd.portion / 4)} className="p-1.5 rounded-lg border border-border"><Minus className="w-3.5 h-3.5" /></button>
                      <span className="flex-1 text-center text-xs text-muted-foreground">{it.grams} g · {Math.round(p * 100) / 100} × {fd.portionName}</span>
                      <button onClick={() => setGrams(i, it.grams + fd.portion / 4)} className="p-1.5 rounded-lg border border-border"><Plus className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                );
              })}
              <button onClick={() => setPicker(true)} className="w-full py-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground flex items-center justify-center gap-1"><Plus className="w-4 h-4" /> Taom qo'shish</button>

              {dTotals && draft.length > 0 && (
                <>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {[["kkal", dTotals.kcal], ["uglevod", `${dTotals.carbs} g`], ["tuz", `${saltGrams(dTotals.sodium)} g`], ["oqsil", `${dTotals.protein} g`]].map(([l, v]) => (
                      <div key={l as string} className="rounded-xl bg-secondary/60 py-2"><div className="text-sm font-bold text-foreground">{v}</div><div className="text-[10px] text-muted-foreground">{l}</div></div>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    {verdicts.map((v, i) => {
                      const V = VERDICT[v.level];
                      return <p key={i} className={`text-sm rounded-xl px-3 py-2 flex gap-2 ${V.cls}`}><V.icon className="w-4 h-4 shrink-0 mt-0.5" />{v.text}</p>;
                    })}
                  </div>
                  <button onClick={save} disabled={busy} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-60">Kundalikka yozish</button>
                  <p className="text-[11px] text-muted-foreground">Qiymatlar an'anaviy retseptlar bo'yicha taxminiy. Porsiyani +/− bilan to'g'rilang.</p>
                </>
              )}
            </div>
          )}
          {picker && <FoodPicker onClose={() => setPicker(false)} onPick={(id) => { const fd = FOOD_BY_ID.get(id)!; setDraft((d) => [...(d ?? []), { food: id, grams: fd.portion }]); setPicker(false); }} />}

          {/* Tavsiyalar */}
          {!draft && suggestions.length > 0 && targets && eaten.kcal < targets.kcal && (
            <div className={card}>
              <h2 className="text-sm font-semibold text-foreground mb-2">Bugun yana nima yesam bo'ladi?</h2>
              <div className="grid grid-cols-2 gap-2">
                {suggestions.map(({ food, reason }) => (
                  <div key={food.id} className="rounded-xl bg-secondary/50 p-2.5">
                    <p className="text-sm font-medium text-foreground">{food.name}</p>
                    <p className="text-[11px] text-muted-foreground">{food.portionName} · {Math.round((food.kcal * food.portion) / 100)} kkal · {reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bugungi kundalik */}
          {todayMeals.length > 0 && (
            <div className={card}>
              <h2 className="text-sm font-semibold text-foreground mb-2">Bugun yeganlarim</h2>
              <ul className="space-y-2">
                {todayMeals.map((m) => (
                  <li key={m.id} className="flex items-start gap-2 text-sm">
                    <span className="w-24 shrink-0 text-xs text-muted-foreground pt-0.5">{MEAL_UZ[m.meal]}</span>
                    <span className="flex-1 text-foreground">{m.items.map((i) => FOOD_BY_ID.get(i.food)?.name ?? i.food).join(", ")}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{m.totals.kcal} kkal</span>
                    <button onClick={async () => { await deleteMeal(m.id); await reload(); }} className="text-muted-foreground"><Trash2 className="w-3.5 h-3.5" /></button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Hafta */}
          {targets && meals && meals.length > 0 && (
            <div className={card}>
              <h2 className="text-sm font-semibold text-foreground mb-3">7 kun: kaloriya va tuz</h2>
              <div className="flex items-end gap-2 h-28">
                {week.map(({ day, t }) => {
                  const h = Math.min(100, (t.kcal / targets.kcal) * 80);
                  const salty = saltGrams(t.sodium) > 5;
                  return (
                    <div key={day} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] text-muted-foreground tabular-nums">{t.kcal || ""}</span>
                      <div className={`w-full rounded-t-md ${salty ? "bg-rose-500/80" : "bg-emerald-500/80"}`} style={{ height: `${Math.max(3, h)}%` }} title={`Tuz ${saltGrams(t.sodium)} g`} />
                      <span className="text-[10px] text-muted-foreground">{day.slice(8)}</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">Qizil — o'sha kuni tuz 5 g dan oshgan.</p>
            </div>
          )}

          {targets && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer flex items-center gap-1"><Info className="w-3.5 h-3.5" /> Me'yor qanday hisoblandi</summary>
              <ul className="mt-2 space-y-1 list-disc pl-5">{targets.basis.map((b) => <li key={b}>{b}</li>)}</ul>
              <p className="mt-2">Taom qiymatlari — an'anaviy retseptlar bo'yicha taxminiy. AI faqat rasmdagi taomni taniydi, raqamlar jadvaldan hisoblanadi. Bu tibbiy parhez emas: maxsus parhez kerak bo'lsa, shifokoringiz bilan maslahatlashing.</p>
            </details>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
