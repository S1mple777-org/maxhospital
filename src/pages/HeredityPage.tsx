import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, CalendarClock, Dna, Loader2, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { loadEmergencyCards } from "@/lib/care";
import { supabase } from "@/integrations/supabase/client";
import {
  DISEASE_UZ, LEVEL_UZ, RELATIVE_UZ, assessHeredity,
  type Disease, type FamilyCase, type Person, type Relative, type RiskLevel,
} from "../../supabase/functions/_shared/heredity.ts";

const db = supabase as any;

// Oila daraxti: yuqorida bobo-buvilar, o'rtada ota-ona, pastda aka-uka va farzandlar
const TREE: Relative[][] = [
  ["gf_father", "gm_father", "gf_mother", "gm_mother"],
  ["father", "mother", "uncle_aunt"],
  ["brother", "sister"],
  ["son", "daughter"],
];

const LEVEL_CLS: Record<RiskLevel, string> = {
  high: "border-rose-500/50 bg-rose-500/10",
  increased: "border-amber-500/50 bg-amber-500/10",
  average: "border-border bg-card",
};
const LEVEL_DOT: Record<RiskLevel, string> = { high: "bg-rose-600", increased: "bg-amber-500", average: "bg-emerald-500" };

export default function HeredityPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [cases, setCases] = useState<FamilyCase[] | null>(null);
  const [person, setPerson] = useState<Person>({ age: null, sex: null, bmi: null });
  const [edit, setEdit] = useState<Relative | null>(null);
  const [draft, setDraft] = useState<{ disease: Disease | ""; age: string }>({ disease: "", age: "" });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate("/auth"); return; }
    (async () => {
      const [{ data }, cards] = await Promise.all([
        db.from("family_history").select("cases").eq("user_id", user.id).maybeSingle(),
        loadEmergencyCards(),
      ]);
      setCases((data?.cases as FamilyCase[]) ?? []);
      const c = cards.find((x) => !x.family_member_id);
      if (c) {
        const age = c.birth_date ? Math.floor((Date.now() - Date.parse(c.birth_date)) / (365.25 * 864e5)) : null;
        const bmi = c.height_cm && c.weight_kg ? Number(c.weight_kg) / (Number(c.height_cm) / 100) ** 2 : null;
        setPerson({ age, sex: c.gender ?? null, bmi });
      }
    })();
  }, [user, loading]);

  const risks = useMemo(() => (cases ? assessHeredity(cases, person) : []), [cases, person]);
  const of = (r: Relative) => (cases ?? []).filter((c) => c.relative === r);

  const add = () => {
    if (!edit || !draft.disease) return;
    const age = draft.age ? Math.round(Number(draft.age)) : null;
    if (age !== null && (age < 1 || age > 110)) return toast.error("Yosh 1–110");
    setCases((cs) => [...(cs ?? []).filter((c) => !(c.relative === edit && c.disease === draft.disease)), { relative: edit, disease: draft.disease as Disease, age }]);
    setDraft({ disease: "", age: "" }); setDirty(true);
  };
  const remove = (c: FamilyCase) => { setCases((cs) => (cs ?? []).filter((x) => x !== c)); setDirty(true); };

  const save = async () => {
    if (!user || !cases) return;
    setSaving(true);
    const { error } = await db.from("family_history").upsert({ user_id: user.id, cases, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) toast.error(error.message); else { toast.success("Saqlandi"); setDirty(false); }
  };

  const year = (startAge: number | null) =>
    startAge === null || person.age === null ? null : new Date().getFullYear() + (startAge - person.age);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-3xl space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Dna className="w-6 h-6 text-primary" /> Irsiy xavf xaritasi</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Oilangizda qanday kasalliklar bo'lganini belgilang — qaysi kasallik xavfi sizda yuqoriroq va qachon qanday tekshiruvdan o'tish
              kerakligini ko'rasiz. Ma'lumot faqat sizga ko'rinadi.
            </p>
          </div>

          {cases === null ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div> : (
            <>
              <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
                <h2 className="text-sm font-semibold text-foreground">Oila daraxti</h2>
                {TREE.map((row, i) => (
                  <div key={i} className={`grid gap-2 ${row.length === 4 ? "grid-cols-2 sm:grid-cols-4" : row.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                    {row.map((r) => {
                      const list = of(r);
                      return (
                        <button key={r} onClick={() => { setEdit(r); setDraft({ disease: "", age: "" }); }}
                          className={`rounded-xl border p-2.5 text-left transition-colors ${list.length ? "border-rose-400/50 bg-rose-500/5" : "border-border hover:bg-secondary"}`}>
                          <p className="text-xs font-semibold text-foreground">{RELATIVE_UZ[r]}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                            {list.length ? list.map((c) => DISEASE_UZ[c.disease].split(" (")[0].split(" /")[0]).join(", ") : "+ kasallik qo'shish"}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                ))}
                <div className="rounded-xl border-2 border-primary/50 bg-primary/5 p-2.5 text-center text-xs font-semibold text-foreground">
                  Siz{person.age !== null ? ` · ${person.age} yosh` : ""}{person.sex ? ` · ${person.sex === "male" ? "erkak" : "ayol"}` : ""}
                  {person.age === null && <span className="block font-normal text-muted-foreground"><Link to="/emergency-card" className="text-primary">Passport</Link>'da tug'ilgan sana va jinsni kiriting — muddatlar aniqroq chiqadi</span>}
                </div>
                {dirty && (
                  <button onClick={save} disabled={saving} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60">
                    <Save className="w-4 h-4" /> {saving ? "Saqlanmoqda..." : "Saqlash"}
                  </button>
                )}
              </div>

              {edit && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setEdit(null)}>
                  <div className="w-full sm:max-w-md bg-card rounded-t-2xl sm:rounded-2xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-foreground">{RELATIVE_UZ[edit]}</h3>
                      <button onClick={() => setEdit(null)} className="p-1"><X className="w-5 h-5" /></button>
                    </div>
                    {of(edit).map((c) => (
                      <div key={c.disease} className="flex items-center gap-2 rounded-lg bg-secondary/60 px-3 py-2 text-sm">
                        <span className="flex-1">{DISEASE_UZ[c.disease]}{c.age ? ` · ${c.age} yoshda` : ""}</span>
                        <button onClick={() => remove(c)} className="text-muted-foreground hover:text-rose-600"><X className="w-4 h-4" /></button>
                      </div>
                    ))}
                    <select value={draft.disease} onChange={(e) => setDraft({ ...draft, disease: e.target.value as Disease })}
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm">
                      <option value="">Kasallikni tanlang…</option>
                      {(Object.keys(DISEASE_UZ) as Disease[]).map((d) => <option key={d} value={d}>{DISEASE_UZ[d]}</option>)}
                    </select>
                    <input value={draft.age} onChange={(e) => setDraft({ ...draft, age: e.target.value })} type="number" inputMode="numeric"
                      placeholder="Necha yoshida aniqlangan? (bilsangiz)" className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm" />
                    <button onClick={add} disabled={!draft.disease} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-1 disabled:opacity-50">
                      <Plus className="w-4 h-4" /> Qo'shish
                    </button>
                    <p className="text-[11px] text-muted-foreground">Yosh muhim: masalan, otada infarkt 55 yoshdan oldin bo'lsa, bu sizda xavfni ancha oshiradi.</p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-foreground">Sizning xaritangiz</h2>
                {risks.map((r) => {
                  const y = year(r.startAge);
                  return (
                    <div key={r.id} className={`rounded-2xl border p-4 ${LEVEL_CLS[r.level]}`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${LEVEL_DOT[r.level]}`} />
                        <p className="flex-1 font-semibold text-foreground text-sm">{r.title}</p>
                        <span className="text-xs font-medium text-muted-foreground">{LEVEL_UZ[r.level]}</span>
                      </div>
                      {r.why.length > 0 && <p className="text-xs text-muted-foreground mt-1">Sabab: {r.why.join(", ")}</p>}
                      <p className="text-sm text-foreground mt-2">{r.action}</p>
                      <p className={`text-xs mt-2 flex items-center gap-1.5 ${r.now ? "text-rose-700 dark:text-rose-400 font-medium" : "text-muted-foreground"}`}>
                        <CalendarClock className="w-3.5 h-3.5" />
                        {r.now ? "Hozir — shifokor bilan gaplashing" : y ? `${r.startAge} yoshdan (${y}-yil)` : `${r.startAge} yoshdan`}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">Manba: {r.source}</p>
                    </div>
                  );
                })}
              </div>

              {risks.some((r) => r.level !== "average" && r.now) && (
                <Link to="/start-consultation" className="block w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium text-center">
                  Natijani shifokor bilan muhokama qilish
                </Link>
              )}
              <p className="text-[11px] text-muted-foreground flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Bu tashxis emas: xalqaro tavsiyalar asosidagi taxminiy yo'l xarita. Tekshiruv vaqtini shifokoringiz bilan aniqlang.
              </p>
            </>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
