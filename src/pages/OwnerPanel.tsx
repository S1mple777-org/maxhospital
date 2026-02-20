import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Crown, Users, Building2, Wallet, Plus, Trash2, Edit, Save, X, UserPlus, UserMinus, Upload, Image
} from "lucide-react";

const OwnerPanel = () => {
  const { user, isOwner, loading } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("admins");
  const [admins, setAdmins] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [searchEmail, setSearchEmail] = useState("");
  const [limitAmount, setLimitAmount] = useState("");
  const [limitEmail, setLimitEmail] = useState("");

  // Dept form
  const [deptForm, setDeptForm] = useState({ name_uz: "", name_ru: "", name_en: "", icon: "stethoscope", price_uzs: 0 });
  const [editingDept, setEditingDept] = useState<string | null>(null);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !isOwner) {
      navigate("/");
      return;
    }
    if (!loading && user) loadData();
  }, [loading, user]);

  const loadData = async () => {
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    
    if (adminRoles && adminRoles.length > 0) {
      const adminIds = adminRoles.map((r: any) => r.user_id);
      const { data: adminProfiles } = await supabase
        .from("profiles")
        .select("*")
        .in("user_id", adminIds);
      if (adminProfiles) setAdmins(adminProfiles);
    } else {
      setAdmins([]);
    }

    const { data: depts } = await supabase.from("departments").select("*").order("created_at");
    if (depts) setDepartments(depts);

    const { data: allUsers } = await supabase.from("profiles").select("*");
    if (allUsers) setUsers(allUsers);
  };

  const handleIconSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Fayl hajmi 2MB dan oshmasligi kerak");
      return;
    }
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
    if (!searchEmail) { toast.error("Foydalanuvchi ID kiriting"); return; }
    const matchedUser = users.find(u => u.user_id === searchEmail || u.full_name?.toLowerCase().includes(searchEmail.toLowerCase()));
    if (!matchedUser) { toast.error("Foydalanuvchi topilmadi"); return; }
    const { error } = await supabase.from("user_roles").insert({ user_id: matchedUser.user_id, role: "admin" });
    if (error) {
      if (error.code === "23505") toast.error("Bu foydalanuvchi allaqachon admin");
      else toast.error(error.message);
    } else {
      toast.success("Admin qo'shildi");
      setSearchEmail("");
      loadData();
    }
  };

  const handleRemoveAdmin = async (userId: string) => {
    const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
    if (error) toast.error(error.message);
    else { toast.success("Admin o'chirildi"); loadData(); }
  };

  const handleAddDept = async () => {
    if (!deptForm.name_uz) { toast.error("Bo'lim nomini kiriting"); return; }
    let icon_url: string | null = null;
    if (iconFile) {
      icon_url = await uploadIcon();
      if (!icon_url && iconFile) return; // upload failed
    }
    const { error } = await supabase.from("departments").insert({
      ...deptForm,
      price_uzs: Number(deptForm.price_uzs) || 0,
      icon_url,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Bo'lim qo'shildi");
      setDeptForm({ name_uz: "", name_ru: "", name_en: "", icon: "stethoscope", price_uzs: 0 });
      setIconFile(null);
      setIconPreview(null);
      loadData();
    }
  };

  const handleUpdateDept = async (id: string) => {
    let icon_url: string | undefined;
    if (iconFile) {
      const url = await uploadIcon();
      if (!url) return;
      icon_url = url;
    }
    const updateData: any = {
      ...deptForm,
      price_uzs: Number(deptForm.price_uzs) || 0,
    };
    if (icon_url) updateData.icon_url = icon_url;
    const { error } = await supabase.from("departments").update(updateData).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Bo'lim yangilandi");
      setEditingDept(null);
      setIconFile(null);
      setIconPreview(null);
      loadData();
    }
  };

  const handleDeleteDept = async (id: string) => {
    const { error } = await supabase.from("departments").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Bo'lim o'chirildi"); loadData(); }
  };

  const handleAddLimit = async () => {
    if (!limitEmail || !limitAmount) { toast.error("Ma'lumotlarni to'ldiring"); return; }
    const foundUser = users.find(u => u.full_name?.toLowerCase().includes(limitEmail.toLowerCase()) || u.user_id === limitEmail);
    if (!foundUser) { toast.error("Foydalanuvchi topilmadi"); return; }
    const newBalance = Number(foundUser.balance_uzs) + Number(limitAmount);
    const { error } = await supabase.from("profiles").update({ balance_uzs: newBalance }).eq("user_id", foundUser.user_id);
    if (error) toast.error(error.message);
    else {
      toast.success(`${Number(limitAmount).toLocaleString()} UZS qo'shildi`);
      setLimitEmail("");
      setLimitAmount("");
      loadData();
    }
  };

  const getDeptName = (dept: any) => language === "ru" ? dept.name_ru : language === "en" ? dept.name_en : dept.name_uz;

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="text-muted-foreground">Yuklanmoqda...</div></div>;

  const tabs = [
    { id: "admins", label: "Adminlar", icon: Users },
    { id: "departments", label: "Bo'limlar", icon: Building2 },
    { id: "limits", label: "Limitlar", icon: Wallet },
  ];

  const IconUploader = () => (
    <div className="flex items-center gap-3">
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleIconSelect} className="hidden" />
      <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-input bg-background text-sm text-muted-foreground hover:border-primary hover:text-foreground transition-colors">
        <Upload className="w-4 h-4" />
        {iconFile ? iconFile.name : "Logo yuklash"}
      </button>
      {(iconPreview) && (
        <div className="w-10 h-10 rounded-lg overflow-hidden border border-border">
          <img src={iconPreview} alt="Preview" className="w-full h-full object-cover" />
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-card border-b border-border px-6 py-4">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
              <Crown className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold text-foreground">Owner Panel</h1>
              <p className="text-sm text-muted-foreground">Tizim egasi boshqaruvi</p>
            </div>
          </div>
          <button onClick={() => navigate("/")} className="px-4 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-secondary">
            ← Bosh sahifa
          </button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="flex gap-6">
          <div className="w-56 shrink-0">
            <div className="bg-card rounded-xl border border-border p-2 space-y-1">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === tab.id ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary"
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
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
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={searchEmail}
                      onChange={(e) => setSearchEmail(e.target.value)}
                      placeholder="Foydalanuvchi ismi yoki ID"
                      className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm"
                    />
                    <button onClick={handleAddAdmin} className="px-4 py-2 rounded-lg bg-hero-gradient text-primary-foreground text-sm font-medium">
                      <UserPlus className="w-4 h-4 inline mr-1" /> Qo'shish
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {admins.map((admin: any) => (
                    <div key={admin.id} className="bg-card rounded-xl border border-border p-4 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-foreground">{admin.full_name || "Noma'lum"}</div>
                        <div className="text-xs text-muted-foreground">ID: {admin.user_id}</div>
                      </div>
                      <button onClick={() => handleRemoveAdmin(admin.user_id)} className="p-2 rounded-lg text-destructive hover:bg-destructive/10">
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
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                    <input value={deptForm.name_uz} onChange={e => setDeptForm(p => ({ ...p, name_uz: e.target.value }))} placeholder="Nomi (UZ)" className="px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm" />
                    <input value={deptForm.name_ru} onChange={e => setDeptForm(p => ({ ...p, name_ru: e.target.value }))} placeholder="Название (RU)" className="px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm" />
                    <input value={deptForm.name_en} onChange={e => setDeptForm(p => ({ ...p, name_en: e.target.value }))} placeholder="Name (EN)" className="px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm" />
                    <input type="number" value={deptForm.price_uzs} onChange={e => setDeptForm(p => ({ ...p, price_uzs: Number(e.target.value) }))} placeholder="Narx (UZS)" className="px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm" />
                  </div>
                  <div className="mb-3">
                    <IconUploader />
                  </div>
                  <button onClick={handleAddDept} disabled={uploading} className="px-4 py-2 rounded-lg bg-hero-gradient text-primary-foreground text-sm font-medium disabled:opacity-50">
                    <Plus className="w-4 h-4 inline mr-1" /> {uploading ? "Yuklanmoqda..." : "Qo'shish"}
                  </button>
                </div>

                <div className="space-y-2">
                  {departments.map((dept: any) => (
                    <div key={dept.id} className="bg-card rounded-xl border border-border p-4">
                      {editingDept === dept.id ? (
                        <div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                            <input value={deptForm.name_uz} onChange={e => setDeptForm(p => ({ ...p, name_uz: e.target.value }))} className="px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm" />
                            <input value={deptForm.name_ru} onChange={e => setDeptForm(p => ({ ...p, name_ru: e.target.value }))} className="px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm" />
                            <input value={deptForm.name_en} onChange={e => setDeptForm(p => ({ ...p, name_en: e.target.value }))} className="px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm" />
                            <input type="number" value={deptForm.price_uzs} onChange={e => setDeptForm(p => ({ ...p, price_uzs: Number(e.target.value) }))} className="px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm" />
                          </div>
                          <div className="mb-3">
                            <IconUploader />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleUpdateDept(dept.id)} disabled={uploading} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50"><Save className="w-3 h-3 inline mr-1" />{uploading ? "..." : "Saqlash"}</button>
                            <button onClick={() => { setEditingDept(null); setIconFile(null); setIconPreview(null); }} className="px-3 py-1.5 rounded-lg border border-border text-foreground text-xs"><X className="w-3 h-3 inline mr-1" />Bekor</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {dept.icon_url ? (
                              <div className="w-10 h-10 rounded-lg overflow-hidden border border-border">
                                <img src={dept.icon_url} alt="" className="w-full h-full object-cover" />
                              </div>
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                                <Image className="w-5 h-5 text-muted-foreground" />
                              </div>
                            )}
                            <div>
                              <div className="font-medium text-foreground">{getDeptName(dept)}</div>
                              <div className="text-sm text-muted-foreground">{Number(dept.price_uzs).toLocaleString()} UZS</div>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => { setEditingDept(dept.id); setDeptForm({ name_uz: dept.name_uz, name_ru: dept.name_ru, name_en: dept.name_en, icon: dept.icon, price_uzs: dept.price_uzs }); setIconPreview(dept.icon_url || null); setIconFile(null); }}
                              className="p-2 rounded-lg text-foreground hover:bg-secondary"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDeleteDept(dept.id)} className="p-2 rounded-lg text-destructive hover:bg-destructive/10">
                              <Trash2 className="w-4 h-4" />
                            </button>
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
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={limitEmail}
                      onChange={(e) => setLimitEmail(e.target.value)}
                      placeholder="Foydalanuvchi ismi yoki ID"
                      className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm"
                    />
                    <input
                      type="number"
                      value={limitAmount}
                      onChange={(e) => setLimitAmount(e.target.value)}
                      placeholder="Summa (UZS)"
                      className="w-40 px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm"
                    />
                    <button onClick={handleAddLimit} className="px-4 py-2 rounded-lg bg-hero-gradient text-primary-foreground text-sm font-medium">
                      <Wallet className="w-4 h-4 inline mr-1" /> Qo'shish
                    </button>
                  </div>
                </div>

                <div className="bg-card rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-secondary/50">
                        <th className="text-left px-4 py-3 font-medium text-foreground">Ism</th>
                        <th className="text-right px-4 py-3 font-medium text-foreground">Balans (UZS)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u: any) => (
                        <tr key={u.id} className="border-b border-border last:border-0">
                          <td className="px-4 py-3 font-medium text-foreground">{u.full_name || "Noma'lum"}</td>
                          <td className="px-4 py-3 text-right text-foreground font-medium">{Number(u.balance_uzs).toLocaleString()} UZS</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
