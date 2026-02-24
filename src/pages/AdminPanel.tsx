import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Users, UserPlus, FileText, BarChart3, ShieldBan, ShieldCheck,
  Trash2, Plus, Search, Ban, CheckCircle
} from "lucide-react";

const AdminPanel = () => {
  const { user, isAdmin, isOwner, loading } = useAuth();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("stats");
  const [users, setUsers] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [bannedUsers, setBannedUsers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [stats, setStats] = useState({ users: 0, doctors: 0, consultations: 0, posts: 0 });

  const [newPost, setNewPost] = useState({ title_uz: "", title_ru: "", title_en: "", content_uz: "", content_ru: "", content_en: "" });
  const [newDoctorEmail, setNewDoctorEmail] = useState("");
  const [newDoctorDept, setNewDoctorDept] = useState("");
  const [newDoctorTitle, setNewDoctorTitle] = useState("");
  const [addingDoctor, setAddingDoctor] = useState(false);

  useEffect(() => {
    if (!loading && !isAdmin && !isOwner) { navigate("/"); return; }
    if (!loading && user) loadData();
  }, [loading, user]);

  const loadData = async () => {
    const [profilesRes, doctorsRes, deptsRes, postsRes, consultationsRes] = await Promise.all([
      supabase.from("profiles").select("*"),
      supabase.from("doctors").select("*"),
      supabase.from("departments").select("*"),
      supabase.from("posts").select("*").order("created_at", { ascending: false }),
      supabase.from("consultations").select("id"),
    ]);

    if (profilesRes.data) {
      setUsers(profilesRes.data);
      setBannedUsers(profilesRes.data.filter((u: any) => u.is_banned));
      setStats(prev => ({ ...prev, users: profilesRes.data!.length }));
    }
    if (doctorsRes.data) {
      // Fetch profiles for doctors
      const docsWithProfiles = await Promise.all(doctorsRes.data.map(async (d: any) => {
        const { data: p } = await supabase.from("profiles").select("full_name, avatar_url").eq("user_id", d.user_id).maybeSingle();
        const dept = deptsRes.data?.find((dep: any) => dep.id === d.department_id);
        return { ...d, profileData: p, deptData: dept };
      }));
      setDoctors(docsWithProfiles);
      setStats(prev => ({ ...prev, doctors: doctorsRes.data!.length }));
    }
    if (deptsRes.data) setDepartments(deptsRes.data);
    if (postsRes.data) {
      setPosts(postsRes.data);
      setStats(prev => ({ ...prev, posts: postsRes.data!.length }));
    }
    if (consultationsRes.data) {
      setStats(prev => ({ ...prev, consultations: consultationsRes.data!.length }));
    }
  };

  const handleBanUser = async (userId: string, ban: boolean, reason?: string) => {
    const { error } = await supabase.from("profiles").update({ is_banned: ban, ban_reason: ban ? (reason || "Admin tomonidan bloklangan") : null }).eq("user_id", userId);
    if (error) toast.error(error.message);
    else { toast.success(ban ? "Foydalanuvchi bloklandi" : "Foydalanuvchi blokdan chiqarildi"); loadData(); }
  };

  const handleCreatePost = async () => {
    if (!newPost.title_uz || !newPost.content_uz) { toast.error("Sarlavha va matn kiritilishi shart"); return; }
    const { error } = await supabase.from("posts").insert({ ...newPost, author_id: user!.id });
    if (error) toast.error(error.message);
    else { toast.success("Post yaratildi"); setNewPost({ title_uz: "", title_ru: "", title_en: "", content_uz: "", content_ru: "", content_en: "" }); loadData(); }
  };

  const handleDeletePost = async (id: string) => {
    const { error } = await supabase.from("posts").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Post o'chirildi"); loadData(); }
  };

  const handleAddDoctor = async () => {
    if (!newDoctorEmail || !newDoctorDept) { toast.error("Email va bo'lim tanlang"); return; }
    setAddingDoctor(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await supabase.functions.invoke("find-user-by-email", {
        body: { email: newDoctorEmail },
      });
      if (res.error) { toast.error("Foydalanuvchi topilmadi"); setAddingDoctor(false); return; }
      const result = res.data;
      if (!result?.user_id) { toast.error("Foydalanuvchi topilmadi"); setAddingDoctor(false); return; }

      // Check if already a doctor
      const { data: existing } = await supabase.from("doctors").select("id").eq("user_id", result.user_id).maybeSingle();
      if (existing) { toast.error("Bu foydalanuvchi allaqachon shifokor"); setAddingDoctor(false); return; }

      const { error } = await supabase.from("doctors").insert({
        user_id: result.user_id,
        department_id: newDoctorDept,
        title: newDoctorTitle || "Shifokor",
      });
      if (error) { toast.error(error.message); setAddingDoctor(false); return; }

      await supabase.from("user_roles").insert({ user_id: result.user_id, role: "doctor" });
      toast.success("Doktor qo'shildi");
      setNewDoctorEmail(""); setNewDoctorDept(""); setNewDoctorTitle("");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Xatolik yuz berdi");
    } finally {
      setAddingDoctor(false);
    }
  };

  const handleRemoveDoctor = async (doctor: any) => {
    await supabase.from("doctors").delete().eq("id", doctor.id);
    await supabase.from("user_roles").delete().eq("user_id", doctor.user_id).eq("role", "doctor");
    toast.success("Doktor o'chirildi");
    loadData();
  };

  const getDeptName = (dept: any) => {
    if (!dept) return "-";
    return language === "ru" ? dept.name_ru : language === "en" ? dept.name_en : dept.name_uz;
  };

  const filteredUsers = users.filter(u =>
    u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || u.phone?.includes(searchQuery)
  );

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="text-muted-foreground">Yuklanmoqda...</div></div>;

  const tabs = [
    { id: "stats", label: "Statistika", icon: BarChart3 },
    { id: "users", label: "Foydalanuvchilar", icon: Users },
    { id: "doctors", label: "Shifokorlar", icon: UserPlus },
    { id: "posts", label: "Postlar", icon: FileText },
    { id: "banned", label: "Ban list", icon: ShieldBan },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-card border-b border-border px-6 py-4">
        <div className="container mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-bold text-foreground">Admin Panel</h1>
            <p className="text-sm text-muted-foreground">Tizimni boshqarish</p>
          </div>
          <button onClick={() => navigate("/")} className="px-4 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-secondary">← Bosh sahifa</button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="flex gap-6">
          <div className="w-56 shrink-0">
            <div className="bg-card rounded-xl border border-border p-2 space-y-1">
              {tabs.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary"}`}>
                  <tab.icon className="w-4 h-4" />{tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            {activeTab === "stats" && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Foydalanuvchilar", value: stats.users, icon: Users, color: "from-blue-400 to-cyan-400" },
                  { label: "Shifokorlar", value: stats.doctors, icon: UserPlus, color: "from-teal-400 to-emerald-400" },
                  { label: "Konsultatsiyalar", value: stats.consultations, icon: BarChart3, color: "from-purple-400 to-violet-400" },
                  { label: "Postlar", value: stats.posts, icon: FileText, color: "from-amber-400 to-orange-400" },
                ].map((stat, i) => (
                  <div key={i} className="bg-card rounded-xl p-5 border border-border">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center mb-3`}>
                      <stat.icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-2xl font-display font-bold text-foreground">{stat.value}</div>
                    <div className="text-sm text-muted-foreground">{stat.label}</div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "users" && (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Qidirish..." className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm focus:ring-2 focus:ring-primary outline-none" />
                </div>
                <div className="bg-card rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border bg-secondary/50">
                      <th className="text-left px-4 py-3 font-medium text-foreground">Ism</th>
                      <th className="text-left px-4 py-3 font-medium text-foreground">Balans</th>
                      <th className="text-left px-4 py-3 font-medium text-foreground">Holat</th>
                      <th className="text-right px-4 py-3 font-medium text-foreground">Amallar</th>
                    </tr></thead>
                    <tbody>
                      {filteredUsers.map((u: any) => (
                        <tr key={u.id} className="border-b border-border last:border-0">
                          <td className="px-4 py-3"><div className="font-medium text-foreground">{u.full_name || "Noma'lum"}</div></td>
                          <td className="px-4 py-3 text-muted-foreground">{Number(u.balance_uzs).toLocaleString()} UZS</td>
                          <td className="px-4 py-3">
                            {u.is_banned ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-destructive/10 text-destructive font-medium"><Ban className="w-3 h-3" /> Bloklangan</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 font-medium"><CheckCircle className="w-3 h-3" /> Faol</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => handleBanUser(u.user_id, !u.is_banned)} className={`px-3 py-1 rounded-lg text-xs font-medium ${u.is_banned ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-destructive/10 text-destructive hover:bg-destructive/20"}`}>
                              {u.is_banned ? "Unban" : "Ban"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === "doctors" && (
              <div className="space-y-4">
                <div className="bg-card rounded-xl border border-border p-4">
                  <h3 className="font-display font-semibold text-foreground mb-3">Yangi doktor qo'shish (email orqali)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <input type="email" value={newDoctorEmail} onChange={(e) => setNewDoctorEmail(e.target.value)} placeholder="Foydalanuvchi emaili" className="px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm" />
                    <select value={newDoctorDept} onChange={(e) => setNewDoctorDept(e.target.value)} className="px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm">
                      <option value="">Bo'lim tanlang</option>
                      {departments.map((d: any) => (<option key={d.id} value={d.id}>{getDeptName(d)}</option>))}
                    </select>
                    <input type="text" value={newDoctorTitle} onChange={(e) => setNewDoctorTitle(e.target.value)} placeholder="Unvon (masalan: Kardiolog)" className="px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm" />
                  </div>
                  <button onClick={handleAddDoctor} disabled={addingDoctor} className="mt-3 px-4 py-2 rounded-lg bg-hero-gradient text-primary-foreground text-sm font-medium disabled:opacity-50">
                    <Plus className="w-4 h-4 inline mr-1" /> {addingDoctor ? "Qidirilmoqda..." : "Qo'shish"}
                  </button>
                </div>

                <div className="bg-card rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border bg-secondary/50">
                      <th className="text-left px-4 py-3 font-medium text-foreground">Ism</th>
                      <th className="text-left px-4 py-3 font-medium text-foreground">Bo'lim</th>
                      <th className="text-left px-4 py-3 font-medium text-foreground">Unvon</th>
                      <th className="text-left px-4 py-3 font-medium text-foreground">Holat</th>
                      <th className="text-right px-4 py-3 font-medium text-foreground">Amal</th>
                    </tr></thead>
                    <tbody>
                      {doctors.map((d: any) => (
                        <tr key={d.id} className="border-b border-border last:border-0">
                          <td className="px-4 py-3 font-medium text-foreground">{d.profileData?.full_name || "Noma'lum"}</td>
                          <td className="px-4 py-3 text-muted-foreground">{getDeptName(d.deptData)}</td>
                          <td className="px-4 py-3 text-muted-foreground">{d.title}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${d.is_online ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                              {d.is_online ? "Online" : "Offline"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => handleRemoveDoctor(d)} className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === "posts" && (
              <div className="space-y-4">
                <div className="bg-card rounded-xl border border-border p-4">
                  <h3 className="font-display font-semibold text-foreground mb-3">Yangi post</h3>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <input value={newPost.title_uz} onChange={e => setNewPost(p => ({ ...p, title_uz: e.target.value }))} placeholder="Sarlavha (UZ)" className="px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm" />
                    <input value={newPost.title_ru} onChange={e => setNewPost(p => ({ ...p, title_ru: e.target.value }))} placeholder="Заголовок (RU)" className="px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm" />
                    <input value={newPost.title_en} onChange={e => setNewPost(p => ({ ...p, title_en: e.target.value }))} placeholder="Title (EN)" className="px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm" />
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <textarea value={newPost.content_uz} onChange={e => setNewPost(p => ({ ...p, content_uz: e.target.value }))} placeholder="Matn (UZ)" rows={3} className="px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm resize-none" />
                    <textarea value={newPost.content_ru} onChange={e => setNewPost(p => ({ ...p, content_ru: e.target.value }))} placeholder="Текст (RU)" rows={3} className="px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm resize-none" />
                    <textarea value={newPost.content_en} onChange={e => setNewPost(p => ({ ...p, content_en: e.target.value }))} placeholder="Content (EN)" rows={3} className="px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm resize-none" />
                  </div>
                  <button onClick={handleCreatePost} className="px-4 py-2 rounded-lg bg-hero-gradient text-primary-foreground text-sm font-medium"><Plus className="w-4 h-4 inline mr-1" /> Post yaratish</button>
                </div>
                <div className="space-y-3">
                  {posts.map((p: any) => (
                    <div key={p.id} className="bg-card rounded-xl border border-border p-4 flex items-start justify-between">
                      <div>
                        <h4 className="font-medium text-foreground">{language === "ru" ? p.title_ru : language === "en" ? p.title_en : p.title_uz}</h4>
                        <p className="text-sm text-muted-foreground line-clamp-1 mt-1">{language === "ru" ? p.content_ru : language === "en" ? p.content_en : p.content_uz}</p>
                        <span className="text-xs text-muted-foreground mt-1 block">{new Date(p.created_at).toLocaleDateString()}</span>
                      </div>
                      <button onClick={() => handleDeletePost(p.id)} className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "banned" && (
              <div className="space-y-4">
                <h3 className="font-display font-semibold text-foreground">Ban list</h3>
                {bannedUsers.length === 0 ? (
                  <div className="bg-card rounded-xl border border-border p-8 text-center text-muted-foreground">
                    <ShieldCheck className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                    <p>Hech kim bloklanmagan</p>
                  </div>
                ) : (
                  <div className="bg-card rounded-xl border border-border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-border bg-secondary/50">
                        <th className="text-left px-4 py-3 font-medium text-foreground">Ism</th>
                        <th className="text-left px-4 py-3 font-medium text-foreground">Sabab</th>
                        <th className="text-right px-4 py-3 font-medium text-foreground">Amal</th>
                      </tr></thead>
                      <tbody>
                        {bannedUsers.map((u: any) => (
                          <tr key={u.id} className="border-b border-border last:border-0">
                            <td className="px-4 py-3 font-medium text-foreground">{u.full_name || "Noma'lum"}</td>
                            <td className="px-4 py-3 text-muted-foreground">{u.ban_reason || "-"}</td>
                            <td className="px-4 py-3 text-right">
                              <button onClick={() => handleBanUser(u.user_id, false)} className="px-3 py-1 rounded-lg text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200">Unban</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
