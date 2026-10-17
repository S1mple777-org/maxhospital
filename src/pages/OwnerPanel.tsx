import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Crown, Users, Building2, Wallet, Plus, Trash2, Edit, Save, X, UserPlus, UserMinus, Upload, Image, Megaphone, Pill
} from "lucide-react";
import PlansEditor from "@/components/medications/PlansEditor";

type AdminType = "financial" | "dept_head" | "journalist";

const adminTypeLabels: Record<AdminType, string> = {
  financial: "Moliyaviy admin",
  dept_head: "Bo'lim boshlig'i",
  journalist: "Jurnalist",
};

const OwnerPanel = () => {
  const { user, isOwner, loading } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("admins");
  const [admins, setAdmins] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [forcedSubs, setForcedSubs] = useState<any[]>([]);
  const [newSubUsername, setNewSubUsername] = useState("");
  const [newSubName, setNewSubName] = useState("");

  // Add admin form
  const [searchEmail, setSearchEmail] = useState("");
  const [newAdminType, setNewAdminType] = useState<AdminType>("financial");
  const [newAdminDept, setNewAdminDept] = useState("");
  const [newAdminLimit, setNewAdminLimit] = useState("");

  // Limit form
  const [limitEmail, setLimitEmail] = useState("");
  const [limitAmount, setLimitAmount] = useState("");

  // Dept form
  const [deptForm, setDeptForm] = useState({ name_uz: "", name_ru: "", name_en: "", icon: "stethoscope", price_uzs: 0 });
  const [editingDept, setEditingDept] = useState<string | null>(null);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !isOwner) { navigate("/"); return; }
    if (!loading && user) loadData();
  }, [loading, user]);

  const loadData = async () => {
    // Load admins with their settings
    const { data: allUsers } = await supabase.rpc("staff_list_profiles");
    if (allUsers) setUsers(allUsers);

    const { data: adminRoles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
    if (adminRoles && adminRoles.length > 0) {
      const adminIds = adminRoles.map((r: any) => r.user_id);
      const adminProfiles = (allUsers || []).filter((p: any) => adminIds.includes(p.user_id));
      const { data: adminSettings } = await supabase.from("admin_settings").select("*").in("user_id", adminIds);
      const settingsMap: Record<string, any> = {};
      adminSettings?.forEach((s: any) => { settingsMap[s.user_id] = s; });
      if (adminProfiles) setAdmins(adminProfiles.map((p: any) => ({ ...p, settings: settingsMap[p.user_id] || null })));
    } else {
      setAdmins([]);
    }

    const { data: depts } = await supabase.from("departments").select("*").order("created_at");
    if (depts) setDepartments(depts);

    const { data: subs } = await supabase.from("forced_subscriptions").select("*").order("created_at");
    if (subs) setForcedSubs(subs);
  };

  const handleIconSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Fayl hajmi 2MB dan oshmasligi kerak"); return; }
    setIconFile(file);
    setIconPreview(URL.createObjectURL(file));
  };

  const uploadIcon = async (): Promise<string | null> => {
    if (!iconFile) return null;
    setUploading(true);
    const ext = iconFile.name.split(".").pop();
    const fileName = `${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("department-icons").upload(fileName, iconFile);
    setUploading(false);
    if (error) { toast.error("Rasm yuklashda xatolik: " + error.message); return null; }
    const { data: urlData } = supabase.storage.from("department-icons").getPublicUrl(fileName);
    return urlData.publicUrl;
  };

  const handleAddAdmin = async () => {
    if (!searchEmail) { toast.error("Email kiriting"); return; }
    try {
      const res = await supabase.functions.invoke("find-user-by-email", { body: { email: searchEmail } });
      if (res.error || !res.data?.user_id) { toast.error("Foydalanuvchi topilmadi"); return; }
      const userId = res.data.user_id;

      // Add admin role
      const { error: roleError } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
      if (roleError) {
        if (roleError.code === "23505") toast.error("Bu foydalanuvchi allaqachon admin");
        else toast.error(roleError.message);
        return;
      }

      // Add admin settings
      const settingsData: any = { user_id: userId, admin_type: newAdminType };
      if (newAdminType === "financial") settingsData.monthly_limit = Number(newAdminLimit) || 0;
      if (newAdminType === "dept_head") settingsData.department_id = newAdminDept || null;

      await supabase.from("admin_settings").insert(settingsData);
      toast.success("Admin qo'shildi");
      setSearchEmail(""); setNewAdminLimit(""); setNewAdminDept("");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi");
    }
  };

  const handleRemoveAdmin = async (userId: string) => {
    await supabase.from("admin_settings").delete().eq("user_id", userId);
    const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
    if (error) toast.error(error.message);
    else { toast.success("Admin o'chirildi"); loadData(); }
  };

  const handleAddDept = async () => {
    if (!deptForm.name_uz) { toast.error("Bo'lim nomini kiriting"); return; }
    let icon_url: string | null = null;
    if (iconFile) { icon_url = await uploadIcon(); if (!icon_url && iconFile) return; }
    const { error } = await supabase.from("departments").insert({ ...deptForm, price_uzs: Number(deptForm.price_uzs) || 0, icon_url });
    if (error) toast.error(error.message);
    else {
      toast.success("Bo'lim qo'shildi");
      setDeptForm({ name_uz: "", name_ru: "", name_en: "", icon: "stethoscope", price_uzs: 0 });
      setIconFile(null); setIconPreview(null); loadData();
    }
  };

  const handleUpdateDept = async (id: string) => {
    let icon_url: string | undefined;
    if (iconFile) { const url = await uploadIcon(); if (!url) return; icon_url = url; }
    const updateData: any = { ...deptForm, price_uzs: Number(deptForm.price_uzs) || 0 };
    if (icon_url) updateData.icon_url = icon_url;
    const { error } = await supabase.from("departments").update(updateData).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Bo'lim yangilandi"); setEditingDept(null); setIconFile(null); setIconPreview(null); loadData(); }
  };

  const handleDeleteDept = async (id: string) => {
    const { error } = await supabase.from("departments").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Bo'lim o'chirildi"); loadData(); }
  };

  const handleAddLimit = async () => {
    if (!limitEmail || !limitAmount) { toast.error("Ma'lumotlarni to'ldiring"); return; }
    try {
      const res = await supabase.functions.invoke("find-user-by-email", { body: { email: limitEmail } });
      if (res.error || !res.data?.user_id) { toast.error("Foydalanuvchi topilmadi"); return; }
      // Added on the server in one step, so two top-ups at once cannot overwrite each other.
      const { error } = await supabase.rpc("admin_add_balance", {
        _user_id: res.data.user_id,
        _amount: Number(limitAmount),
      });
      if (error) toast.error(error.message);
      else { toast.success(`${Number(limitAmount).toLocaleString()} UZS qo'shildi`); setLimitEmail(""); setLimitAmount(""); loadData(); }
    } catch { toast.error("Xatolik yuz berdi"); }
  };

  const getDeptName = (dept: any) => language === "ru" ? dept.name_ru : language === "en" ? dept.name_en : dept.name_uz;

  const handleAddForcedSub = async () => {
    if (!newSubUsername) { toast.error("Kanal username kiriting"); return; }
    const username = newSubUsername.replace("@", "");
    const { error } = await supabase.from("forced_subscriptions").insert({
      channel_id: username,
      channel_username: username,
      channel_name: newSubName || username,
      created_by: user!.id,
    });
    if (error) {
      if (error.code === "23505") toast.error("Bu kanal allaqachon qo'shilgan");
      else toast.error(error.message);
      return;
    }
    toast.success("Majburiy obuna qo'shildi");
    setNewSubUsername(""); setNewSubName("");
    loadData();
  };

  const handleRemoveForcedSub = async (id: string) => {
    const { error } = await supabase.from("forced_subscriptions").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Majburiy obuna o'chirildi"); loadData(); }
  };

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="text-muted-foreground">Yuklanmoqda...</div></div>;

  const tabs = [
    { id: "admins", label: "Adminlar", icon: Users },
    { id: "departments", label: "Bo'limlar", icon: Building2 },
    { id: "limits", label: "Limitlar", icon: Wallet },
    { id: "subscriptions", label: "Majburiy obuna", icon: Megaphone },
    { id: "pro-plans", label: "Pro tariflar", icon: Pill },
  ];

  const IconUploader = () => (
    <div className="flex items-center gap-3">
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleIconSelect} className="hidden" />
      <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-input bg-background text-sm text-muted-foreground hover:border-primary hover:text-foreground transition-colors">
        <Upload className="w-4 h-4" />
        {iconFile ? iconFile.name : "Logo yuklash"}
      </button>
      {iconPreview && (
        <div className="w-10 h-10 rounded-lg overflow-hidden border border-border">
          <img src={iconPreview} alt="Preview" className="w-full h-full object-cover" />
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-card border-b border-border px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="container mx-auto px-0 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
              <Crown className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold text-foreground">Owner Panel</h1>
              <p className="text-sm text-muted-foreground">Tizim egasi boshqaruvi</p>
            </div>
          </div>
          <button onClick={() => navigate("/")} className="shrink-0 px-3 sm:px-4 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-secondary">← <span className="hidden sm:inline">Bosh sahifa</span></button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row gap-4 md:gap-6">
          <div className="-mx-4 px-4 md:mx-0 md:px-0 md:w-56 md:shrink-0 overflow-x-auto md:overflow-visible">
            <div role="tablist" className="flex md:flex-col gap-1 w-max md:w-auto bg-card rounded-xl border border-border p-1.5 md:p-2">
              {tabs.map(tab => (
                <button key={tab.id} data-panel-tab role="tab" aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`shrink-0 md:w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${activeTab === tab.id ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary"}`}>
                  <tab.icon className="w-4 h-4" />{tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            {/* Admins Tab */}
            {activeTab === "admins" && (
              <div className="space-y-4">
                <div className="bg-card rounded-xl border border-border p-4">
                  <h3 className="font-display font-semibold text-foreground mb-3">Yangi admin qo'shish</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    <input type="email" value={searchEmail} onChange={(e) => setSearchEmail(e.target.value)} placeholder="Foydalanuvchi emaili" className="px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm" />
                    <select value={newAdminType} onChange={(e) => setNewAdminType(e.target.value as AdminType)} className="px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm">
                      <option value="financial">Moliyaviy admin</option>
                      <option value="dept_head">Bo'lim boshlig'i</option>
                      <option value="journalist">Jurnalist</option>
                    </select>
                  </div>
                  {newAdminType === "financial" && (
                    <div className="mb-3">
                      <input type="number" value={newAdminLimit} onChange={(e) => setNewAdminLimit(e.target.value)} placeholder="Oylik limit (UZS)" className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm" />
                    </div>
                  )}
                  {newAdminType === "dept_head" && (
                    <div className="mb-3">
                      <select value={newAdminDept} onChange={(e) => setNewAdminDept(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm">
                        <option value="">Bo'lim tanlang</option>
                        {departments.map((d: any) => (<option key={d.id} value={d.id}>{getDeptName(d)}</option>))}
                      </select>
                    </div>
                  )}
                  <button onClick={handleAddAdmin} className="px-4 py-2 rounded-lg bg-hero-gradient text-primary-foreground text-sm font-medium">
                    <UserPlus className="w-4 h-4 inline mr-1" /> Qo'shish
                  </button>
                </div>

                <div className="space-y-2">
                  {admins.map((admin: any) => (
                    <div key={admin.id} className="bg-card rounded-xl border border-border p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-foreground break-words">{admin.full_name || "Noma'lum"}</div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                          {admin.settings ? (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              admin.settings.admin_type === "financial" ? "bg-green-100 text-green-700" :
                              admin.settings.admin_type === "dept_head" ? "bg-primary/10 text-primary" :
                              "bg-warning/10 text-warning"
                            }`}>
                              {adminTypeLabels[admin.settings.admin_type as AdminType] || admin.settings.admin_type}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">Admin (eski)</span>
                          )}
                          {admin.settings?.admin_type === "financial" && admin.settings.monthly_limit > 0 && (
                            <span className="text-xs text-muted-foreground">
                              Limit: {Number(admin.settings.month_spent).toLocaleString()}/{Number(admin.settings.monthly_limit).toLocaleString()} UZS
                            </span>
                          )}
                          {admin.settings?.admin_type === "dept_head" && admin.settings.department_id && (
                            <span className="text-xs text-muted-foreground">
                              Bo'lim: {getDeptName(departments.find(d => d.id === admin.settings.department_id) || { name_uz: "-", name_ru: "-", name_en: "-" })}
                            </span>
                          )}
                        </div>
                      </div>
                      <button onClick={() => handleRemoveAdmin(admin.user_id)} className="shrink-0 p-2 rounded-lg text-destructive hover:bg-destructive/10">
                        <UserMinus className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {admins.length === 0 && (
                    <div className="bg-card rounded-xl border border-border p-8 text-center text-muted-foreground">Hali adminlar yo'q</div>
                  )}
                </div>
              </div>
            )}

            {/* Departments Tab */}
            {activeTab === "departments" && (
              <div className="space-y-4">
                <div className="bg-card rounded-xl border border-border p-4">
                  <h3 className="font-display font-semibold text-foreground mb-3">Yangi bo'lim qo'shish</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                    <input value={deptForm.name_uz} onChange={e => setDeptForm(p => ({ ...p, name_uz: e.target.value }))} placeholder="Nomi (UZ)" className="px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm" />
                    <input value={deptForm.name_ru} onChange={e => setDeptForm(p => ({ ...p, name_ru: e.target.value }))} placeholder="Название (RU)" className="px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm" />
                    <input value={deptForm.name_en} onChange={e => setDeptForm(p => ({ ...p, name_en: e.target.value }))} placeholder="Name (EN)" className="px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm" />
                    <input type="number" value={deptForm.price_uzs} onChange={e => setDeptForm(p => ({ ...p, price_uzs: Number(e.target.value) }))} placeholder="Narx (UZS)" className="px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm" />
                  </div>
                  <div className="mb-3"><IconUploader /></div>
                  <button onClick={handleAddDept} disabled={uploading} className="px-4 py-2 rounded-lg bg-hero-gradient text-primary-foreground text-sm font-medium disabled:opacity-50">
                    <Plus className="w-4 h-4 inline mr-1" /> {uploading ? "Yuklanmoqda..." : "Qo'shish"}
                  </button>
                </div>

                <div className="space-y-2">
                  {departments.map((dept: any) => (
                    <div key={dept.id} className="bg-card rounded-xl border border-border p-4">
                      {editingDept === dept.id ? (
                        <div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                            <input value={deptForm.name_uz} onChange={e => setDeptForm(p => ({ ...p, name_uz: e.target.value }))} className="px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm" />
                            <input value={deptForm.name_ru} onChange={e => setDeptForm(p => ({ ...p, name_ru: e.target.value }))} className="px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm" />
                            <input value={deptForm.name_en} onChange={e => setDeptForm(p => ({ ...p, name_en: e.target.value }))} className="px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm" />
                            <input type="number" value={deptForm.price_uzs} onChange={e => setDeptForm(p => ({ ...p, price_uzs: Number(e.target.value) }))} className="px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm" />
                          </div>
                          <div className="mb-3"><IconUploader /></div>
                          <div className="flex gap-2">
                            <button onClick={() => handleUpdateDept(dept.id)} disabled={uploading} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50"><Save className="w-3 h-3 inline mr-1" />{uploading ? "..." : "Saqlash"}</button>
                            <button onClick={() => { setEditingDept(null); setIconFile(null); setIconPreview(null); }} className="px-3 py-1.5 rounded-lg border border-border text-foreground text-xs"><X className="w-3 h-3 inline mr-1" />Bekor</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            {dept.icon_url ? (
                              <div className="w-10 h-10 shrink-0 rounded-lg overflow-hidden border border-border">
                                <img src={dept.icon_url} alt="" className="w-full h-full object-cover" />
                              </div>
                            ) : (
                              <div className="w-10 h-10 shrink-0 rounded-lg bg-secondary flex items-center justify-center">
                                <Image className="w-5 h-5 text-muted-foreground" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="font-medium text-foreground break-words">{getDeptName(dept)}</div>
                              <div className="text-sm text-muted-foreground">{Number(dept.price_uzs).toLocaleString()} UZS</div>
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => { setEditingDept(dept.id); setDeptForm({ name_uz: dept.name_uz, name_ru: dept.name_ru, name_en: dept.name_en, icon: dept.icon, price_uzs: dept.price_uzs }); setIconPreview(dept.icon_url || null); setIconFile(null); }} className="p-2 rounded-lg text-foreground hover:bg-secondary"><Edit className="w-4 h-4" /></button>
                            <button onClick={() => handleDeleteDept(dept.id)} className="p-2 rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Limits Tab */}
            {activeTab === "limits" && (
              <div className="space-y-4">
                <div className="bg-card rounded-xl border border-border p-4">
                  <h3 className="font-display font-semibold text-foreground mb-3">Foydalanuvchiga limit qo'shish</h3>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input type="email" value={limitEmail} onChange={(e) => setLimitEmail(e.target.value)} placeholder="Foydalanuvchi emaili" className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm" />
                    <input type="number" value={limitAmount} onChange={(e) => setLimitAmount(e.target.value)} placeholder="Summa (UZS)" className="w-full sm:w-40 px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm" />
                    <button onClick={handleAddLimit} className="px-4 py-2 rounded-lg bg-hero-gradient text-primary-foreground text-sm font-medium whitespace-nowrap">
                      <Plus className="w-4 h-4 inline mr-1" /> Qo'shish
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "pro-plans" && <PlansEditor />}

            {/* Subscriptions Tab */}
            {activeTab === "subscriptions" && (
              <div className="space-y-4">
                <div className="bg-card rounded-xl border border-border p-4">
                  <h3 className="font-display font-semibold text-foreground mb-3">Majburiy obuna qo'shish</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Foydalanuvchilar botga /start bosganda ushbu kanallarga obuna bo'lishi talab qilinadi.
                    Bot kanalga admin sifatida qo'shilgan bo'lishi kerak.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 mb-3">
                    <input value={newSubUsername} onChange={(e) => setNewSubUsername(e.target.value)} placeholder="@username" className="min-w-0 sm:flex-1 px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm" />
                    <input value={newSubName} onChange={(e) => setNewSubName(e.target.value)} placeholder="Kanal nomi" className="min-w-0 sm:flex-1 px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm" />
                    <button onClick={handleAddForcedSub} className="px-4 py-2 rounded-lg bg-hero-gradient text-primary-foreground text-sm font-medium whitespace-nowrap">
                      <Plus className="w-4 h-4 inline mr-1" /> Qo'shish
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {forcedSubs.map((sub: any) => (
                    <div key={sub.id} className="bg-card rounded-xl border border-border p-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 shrink-0 rounded-lg bg-secondary flex items-center justify-center">
                          <Megaphone className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-foreground break-words">{sub.channel_name}</div>
                          <div className="text-sm text-muted-foreground truncate">@{sub.channel_username}</div>
                        </div>
                      </div>
                      <button onClick={() => handleRemoveForcedSub(sub.id)} className="shrink-0 p-2 rounded-lg text-destructive hover:bg-destructive/10">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {forcedSubs.length === 0 && (
                    <div className="bg-card rounded-xl border border-border p-8 text-center text-muted-foreground">
                      Hali majburiy obunalar yo'q
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OwnerPanel;
