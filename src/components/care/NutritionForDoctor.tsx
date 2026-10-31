import { useEffect, useState } from "react";
import { ChevronDown, Lock, Salad } from "lucide-react";
import { FOOD_BY_ID, MEAL_UZ, loadConsultationNutrition, saltGrams, type ConsultNutrition } from "@/lib/nutri";

/** Shifokor konsultatsiyada: bemor ruxsat bergan bo'lsa — so'nggi 7 kunlik ovqatlanish (MaxNutri). */
const NutritionForDoctor = ({ consultationId }: { consultationId: string }) => {
  const [res, setRes] = useState<ConsultNutrition | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { void loadConsultationNutrition(consultationId).then(setRes); }, [consultationId]);
  if (!res?.available) return null;

  const meals = res.meals ?? [];
  const days = [...new Set(meals.map((m) => m.day))];
  const avg = (k: "kcal" | "carbs" | "sodium") => days.length ? Math.round(meals.reduce((a, m) => a + Number(m.totals[k]), 0) / days.length) : 0;

  return (
    <div className="mb-4 rounded-2xl border border-border bg-card p-3">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 text-sm font-semibold text-foreground">
        <Salad className="w-4 h-4 text-emerald-600" /> Ovqatlanish (MaxNutri, 7 kun)
        <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (!res.shared ? (
        <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Bemor ovqatlanish kundaligini ko'rsatishga ruxsat bermagan.</p>
      ) : !meals.length ? (
        <p className="text-xs text-muted-foreground mt-2">So'nggi 7 kunda yozuv yo'q.</p>
      ) : (
        <div className="mt-2 space-y-2 text-xs">
          <p className="text-foreground">Kuniga o'rtacha: <b>{avg("kcal")} kkal</b> · uglevod <b>{avg("carbs")} g</b> · tuz <b>{saltGrams(avg("sodium"))} g</b> ({days.length} kun yozilgan)
            {res.settings?.diabetes ? " · diabet" : ""}{res.settings?.hypertension ? " · gipertoniya" : ""}</p>
          <ul className="max-h-48 overflow-y-auto divide-y divide-border">
            {meals.slice(0, 30).map((m, i) => (
              <li key={i} className="py-1.5 flex gap-2">
                <span className="w-20 shrink-0 text-muted-foreground">{m.day.slice(5)} {MEAL_UZ[m.meal]}</span>
                <span className="flex-1">{m.items.map((x) => FOOD_BY_ID.get(x.food)?.name ?? x.food).join(", ")}</span>
                <span className="tabular-nums text-muted-foreground">{m.totals.kcal} kkal</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

export default NutritionForDoctor;
