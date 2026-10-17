import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Users, UserPlus, FileText, BarChart3, ShieldBan, Search, Ban, CheckCircle, Plus, Trash2, BookOpen
} from "lucide-react";
import BooksManager from "@/components/ai/BooksManager";

const AdminPanel = () => {
  const { user, isAdmin, isOwner, loading } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("stats");
  const [adminSettings, setAdminSettings] = useState<any>(null);
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
    // Load admin settings for current user
    if (!isOwner) {
      const { data: settings } = await supabase.from("admin_settings").select("*").eq("user_id", user!.id).maybeSingle();
      setAdminSettings(settings);
    }

    const [profilesRes, doctorsRes, deptsRes, postsRes, consultationsRes] = await Promise.all([
      supabase.rpc("staff_list_profiles"),
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
      const docsWithProfiles = await Promise.all(doctorsRes.data.map(async (d: any) => {
        const { data: p } = await supabase.from("profiles").select("full_name, avatar_url").eq("user_id", d.user_id).maybeSingle();
        const dept = deptsRes.data?.find((dep: any) => dep.id === d.department_id);
        return { ...d, profileData: p, deptData: dept };
      }));
      // Filter doctors for dept_head
      if (adminSettings?.admin_type === "dept_head" && adminSettings.department_id) {
        setDoctors(docsWithProfiles.filter(d => d.department_id === adminSettings.department_id));
      } else {
        setDoctors(docsWithProfiles);
      }
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

  // Determine what tabs this admin can see
  const adminType = adminSettings?.admin_type;
  const canSeeStats = isOwner || !adminType;
  const canSeeUsers = isOwner || adminType === "financial" || adminType === "dept_head" || !adminType;
  const canSeeDoctors = isOwner || adminType === "dept_head" || !adminType;
  const canSeePosts = isOwner || adminType === "journalist" || !adminType;
  const canSeeBanned = isOwner || adminType === "financial" || !adminType;
  const canSeeBooks = isOwner || !adminType;

  const handleBanUser = async (userId: string, ban: boolean, reason?: string) => {
    const { error } = await supabase.from("profiles").update({ is_banned: ban, ban_reason: ban ? (reason || "Admin tomonidan bloklangan") : null }).eq("user_id", userId);
    if (error) toast.error(error.message);
    else { toast.success(ban ? "Bloklandi" : "Blokdan chiqarildi"); loadData(); }
  };

  const handleCreatePost = async () => {
    if (!newPost.title_uz || !newPost.content_uz) { toast.error("Sarlavha va matn kiritilishi shart"); return; }
    const { error } = await supabase.from("posts").insert({ ...newPost, author_id: user!.id });
    if (error) { toast.error(error.message); return; }
    toast.success("Post yaratildi");
    setNewPost({ title_uz: "", title_ru: "", title_en: "", content_uz: "", content_ru: "", content_en: "" });
    loadData();
    // Send Telegram notification to all linked users
    try {
      await supabase.functions.invoke("telegram-notify", {
        body: { type: "new_post", data: { title: newPost.title_uz } },
      });
    } catch (e) {
      console.error("Telegram notify error:", e);
    }
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
      const res = await supabase.functions.invoke("find-user-by-email", { body: { email: newDoctorEmail } });
      if (res.error || !res.data?.user_id) { toast.error("Foydalanuvchi topilmadi"); setAddingDoctor(false); return; }
      const { data: existing } = await supabase.from("doctors").select("id").eq("user_id", res.data.user_id).maybeSingle();
      if (existing) { toast.error("Bu foydalanuvchi allaqachon shifokor"); setAddingDoctor(false); return; }
      const { error } = await supabase.from("doctors").insert({ user_id: res.data.user_id, department_id: newDoctorDept, title: newDoctorTitle || "Shifokor" });
      if (error) { toast.error(error.message); setAddingDoctor(false); return; }
      await supabase.from("user_roles").insert({ user_id: res.data.user_id, role: "doctor" });
      toast.success("Doktor qo'shildi");
      setNewDoctorEmail(""); setNewDoctorDept(""); setNewDoctorTitle("");
      loadData();
    } catch (err: any) { toast.error(err.message || "Xatolik"); } finally { setAddingDoctor(false); }
  };

  const handleRemoveDoctor = async (doctor: any) => {
    await supabase.from("doctors").delete().eq("id", doctor.id);
    await supabase.from("user_roles").delete().eq("user_id", doctor.user_id).eq("role", "doctor");
    toast.success("Doktor o'chirildi"); loadData();
  };

  const getDeptName = (dept: any) => {
    if (!dept) return "-";
    return language === "ru" ? dept.name_ru : language === "en" ? dept.name_en : dept.name_uz;
  };

  const filteredUsers = users.filter(u => u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || u.phone?.includes(searchQuery));

  // Departments that this admin can manage
  const availableDepts = adminSettings?.admin_type === "dept_head" && adminSettings.department_id
    ? departments.filter(d => d.id === adminSettings.department_id)
    : departments;

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="text-muted-foreground">Yuklanmoqda...</div></div>;

  const allTabs = [
    { id: "stats", label: "Statistika", icon: BarChart3, visible: canSeeStats },
    { id: "users", label: "Foydalanuvchilar", icon: Users, visible: canSeeUsers },
    { id: "doctors", label: "Shifokorlar", icon: UserPlus, visible: canSeeDoctors },
    { id: "posts", label: "Postlar", icon: FileText, visible: canSeePosts },
    { id: "banned", label: "Ban list", icon: ShieldBan, visible: canSeeBanned },
    { id: "books", label: "AI kutubxona", icon: BookOpen, visible: canSeeBooks },
  ];
  const tabs = allTabs.filter(t => t.visible);

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-card border-b border-border px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="container mx-auto px-0 flex items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-bold text-foreground">Admin Panel</h1>
            <p className="text-sm text-muted-foreground">
              {adminType === "financial" ? "Moliyaviy admin" : adminType === "dept_head" ? "Bo'lim boshlig'i" : adminType === "journalist" ? "Jurnalist" : "Tizimni boshqarish"}
            </p>
          </div>
          <button onClick={() => navigate("/")} className="shrink-0 px-3 sm:px-4 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-secondary">← <span className="hidden sm:inline">Bosh sahifa</span></button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row gap-4 md:gap-6">
          <div className="-mx-4 px-4 md:mx-0 md:px-0 md:w-56 md:shrink-0 overflow-x-auto md:overflow-visible">
            <div role="tablist" className="flex md:flex-col gap-1 w-max md:w-auto bg-card rounded-xl border border-border p-1.5 md:p-2">
              {tabs.map(tab => (
                <button key={tab.id} data-panel-tab role="tab" aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} className={`shrink-0 md:w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${activeTab === tab.id ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary"}`}>
                  <tab.icon className="w-4 h-4" />{tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            {activeTab === "stats" && canSeeStats && (
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

            {activeTab === "users" && canSeeUsers && (
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

            {activeTab === "doctors" && canSeeDoctors && (
              <div className="space-y-4">
                <div className="bg-card rounded-xl border border-border p-4">
                  <h3 className="font-display font-semibold text-foreground mb-3">Yangi doktor qo'shish (email orqali)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <input type="email" value={newDoctorEmail} onChange={(e) => setNewDoctorEmail(e.target.value)} placeholder="Foydalanuvchi emaili" className="px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm" />
                    <select value={newDoctorDept} onChange={(e) => setNewDoctorDept(e.target.value)} className="px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm">
                      <option value="">Bo'lim tanlang</option>
                      {availableDepts.map((d: any) => (<option key={d.id} value={d.id}>{getDeptName(d)}</option>))}
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

            {activeTab === "posts" && canSeePosts && (
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
                        <h4 className="font-medium text-foreground text-sm">{language === "ru" ? p.title_ru : language === "en" ? p.title_en : p.title_uz}</h4>
                        <p className="text-xs text-muted-foreground mt-1">{new Date(p.created_at).toLocaleDateString()}</p>
                      </div>
                      <button onClick={() => handleDeletePost(p.id)} className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "books" && canSeeBooks && <BooksManager departments={departments} />}

            {activeTab === "banned" && canSeeBanned && (
              <div className="space-y-2">
                {bannedUsers.length === 0 ? (
                  <div className="bg-card rounded-xl border border-border p-8 text-center text-muted-foreground">Bloklangan foydalanuvchilar yo'q</div>
                ) : (
                  bannedUsers.map((u: any) => (
                    <div key={u.id} className="bg-card rounded-xl border border-border p-4 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-foreground">{u.full_name || "Noma'lum"}</div>
                        {u.ban_reason && <p className="text-xs text-destructive mt-1">Sabab: {u.ban_reason}</p>}
                      </div>
                      <button onClick={() => handleBanUser(u.user_id, false)} className="px-3 py-1 rounded-lg bg-green-100 text-green-700 text-xs font-medium hover:bg-green-200">Unban</button>
                    </div>
                  ))
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
