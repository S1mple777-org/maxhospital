import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Crown, IdCard, Loader2, Pencil, Plus, Stethoscope, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { usePlanStatus } from "@/lib/planPerks";
import {
  addFamilyMember, ageOf, deleteFamilyMember, loadFamily, RELATIONS, updateFamilyMember, type FamilyMember, type Relation,
} from "@/lib/care";

const EMPTY: Omit<FamilyMember, "id"> = { full_name: "", relation: "parent", birth_date: null, gender: null, notes: null };

const FamilyPage = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { status } = usePlanStatus(!!user);
  const [members, setMembers] = useState<FamilyMember[] | null>(null);
  const [form, setForm] = useState<Omit<FamilyMember, "id">>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => loadFamily().then(setMembers);
  useEffect(() => {
    if (loading) return;
    if (!user) { navigate("/auth"); return; }
    void load();
  }, [user, loading]);

  const limit = status?.limits.family_members ?? 0;
  const count = members?.length ?? 0;

  const startAdd = () => { setForm(EMPTY); setEditing(null); setOpen(true); };
  const startEdit = (m: FamilyMember) => {
    setForm({ full_name: m.full_name, relation: m.relation, birth_date: m.birth_date, gender: m.gender, notes: m.notes });
    setEditing(m.id);
    setOpen(true);
  };

  const save = async () => {
    if (form.full_name.trim().length < 2) { toast.error("Ism-familiyani kiriting"); return; }
    setSaving(true);
    try {
      if (editing) await updateFamilyMember(editing, form);
      else await addFamilyMember(form);
      toast.success("Saqlandi");
      setOpen(false);
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (m: FamilyMember) => {
    if (!confirm(`${m.full_name} o'chirilsinmi? Uning konsultatsiyalari va retseptlari saqlanib qoladi.`)) return;
    try { await deleteFamilyMember(m.id); await load(); } catch (e: any) { toast.error(e.message); }
  };

  const input = "w-full mt-1 px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center"><Users className="w-5 h-5 text-primary" /></div>
              <div>
                <h1 className="font-display text-2xl font-bold text-foreground">Oila profili</h1>
                <p className="text-sm text-muted-foreground">Farzand yoki ota-onangiz uchun shu akkauntdan konsultatsiya va dori eslatmasi</p>
              </div>
            </div>
            {limit > 0 && count < limit && (
              <button onClick={startAdd} className="inline-flex items-center justify-center gap-2 rounded-xl bg-hero-gradient px-4 py-2.5 text-sm font-semibold text-primary-foreground">
                <Plus className="w-4 h-4" /> A'zo qo'shish ({count}/{limit})
              </button>
            )}
          </div>

          {status && limit === 0 && (
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center mb-6">
              <Crown className="w-8 h-8 mx-auto text-amber-500 mb-2" />
              <h2 className="font-display font-semibold text-foreground">Premium imkoniyati</h2>
              <p className="text-sm text-muted-foreground mt-1 mb-4">Premium tarifda bitta akkauntga 4 tagacha oila a'zosini qo'shib, ular uchun konsultatsiya, dori eslatmasi va favqulodda karta yuritasiz.</p>
              <Link to="/pro" className="inline-flex items-center gap-2 rounded-xl bg-hero-gradient px-5 py-2.5 text-sm font-semibold text-primary-foreground"><Crown className="w-4 h-4" /> Tariflar</Link>
            </div>
          )}

          {open && (
            <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-semibold text-foreground">{editing ? "Tahrirlash" : "Yangi oila a'zosi"}</h3>
                <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-secondary"><X className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-xs text-muted-foreground sm:col-span-2">Ism-familiya
                  <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={input} placeholder="Masalan: Karimova Malika" />
                </label>
                <label className="text-xs text-muted-foreground">Kim bo'ladi
                  <select value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value as Relation })} className={input}>
                    {Object.entries(RELATIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <label className="text-xs text-muted-foreground">Tug'ilgan sana
                  <input type="date" value={form.birth_date ?? ""} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setForm({ ...form, birth_date: e.target.value || null })} className={input} />
                </label>
                <label className="text-xs text-muted-foreground">Jinsi
                  <select value={form.gender ?? ""} onChange={(e) => setForm({ ...form, gender: (e.target.value || null) as FamilyMember["gender"] })} className={input}>
                    <option value="">—</option><option value="female">Ayol</option><option value="male">Erkak</option>
                  </select>
                </label>
                <label className="text-xs text-muted-foreground sm:col-span-2">Izoh (ixtiyoriy)
                  <textarea value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} maxLength={500} className={`${input} resize-none`} placeholder="Masalan: qandli diabet, insulin oladi" />
                </label>
              </div>
              <button onClick={save} disabled={saving} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Saqlash
              </button>
            </div>
          )}

          {members === null ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : members.length === 0 ? (
            limit > 0 && <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">Hali oila a'zolari qo'shilmagan</div>
          ) : (
            <div className="space-y-3">
              {members.map((m) => {
                const age = ageOf(m.birth_date);
                return (
                  <div key={m.id} className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-foreground break-words">{m.full_name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {RELATIONS[m.relation]}{age !== null ? ` · ${age} yosh` : ""}{m.gender ? ` · ${m.gender === "female" ? "ayol" : "erkak"}` : ""}
                        </div>
                        {m.notes && <div className="text-xs text-muted-foreground mt-1 break-words">{m.notes}</div>}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => startEdit(m)} aria-label="Tahrirlash" className="p-2 rounded-lg hover:bg-secondary"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => remove(m)} aria-label="O'chirish" className="p-2 rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link to="/start-consultation" className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"><Stethoscope className="w-3.5 h-3.5" /> Konsultatsiya</Link>
                      <Link to={`/emergency-card?member=${m.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-400"><IdCard className="w-3.5 h-3.5" /> Favqulodda karta</Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <p className="mt-6 text-xs text-muted-foreground">
            Konsultatsiya boshlashda "Kim uchun?" maydonidan oila a'zosini tanlang. Dori eslatmalarini ham u uchun belgilash mumkin — eslatmada uning ismi chiqadi.
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default FamilyPage;
