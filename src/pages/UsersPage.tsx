import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Search, ArrowUpDown, Users, Shield, Crown, Stethoscope, User } from "lucide-react";
import { motion } from "framer-motion";

const roleIcons: Record<string, any> = {
  owner: Crown,
  admin: Shield,
  doctor: Stethoscope,
  user: User,
};

const roleColors: Record<string, string> = {
  owner: "bg-warning/10 text-warning",
  admin: "bg-primary/10 text-primary",
  doctor: "bg-green-100 text-green-700",
  user: "bg-muted text-muted-foreground",
};

const UsersPage = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(false);
  const [loading, setLoading] = useState(true);

  const { isAdmin, isOwner, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    // This page lists every user's phone and balance: staff only.
    if (!isAdmin && !isOwner) { navigate("/"); return; }
    const loadUsers = async () => {
      const { data: profiles } = await supabase.rpc("staff_list_profiles");
      if (!profiles) { setLoading(false); return; }
      const { data: allRoles } = await supabase.from("user_roles").select("user_id, role");
      const rolesMap: Record<string, string[]> = {};
      allRoles?.forEach((r: any) => {
        if (!rolesMap[r.user_id]) rolesMap[r.user_id] = [];
        rolesMap[r.user_id].push(r.role);
      });
      setUsers(profiles.map((p: any) => ({ ...p, roles: rolesMap[p.user_id] || ["user"] })));
      setLoading(false);
    };
    loadUsers();
  }, [authLoading, isAdmin, isOwner]);

  const filtered = users
    .filter(u => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (u.full_name || "").toLowerCase().includes(q) || (u.phone || "").includes(q);
    })
    .sort((a, b) => sortAsc ? a.balance_uzs - b.balance_uzs : b.balance_uzs - a.balance_uzs);

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Yuklanmoqda...</p></div>;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-20">
        <div className="container mx-auto px-4 max-w-4xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="font-display text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
              <Users className="w-6 h-6 text-primary" /> Foydalanuvchilar
            </h1>

            <div className="flex gap-3 mb-6">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ism yoki telefon bo'yicha qidiring..." className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm focus:ring-2 focus:ring-primary outline-none" />
              </div>
              <button onClick={() => setSortAsc(!sortAsc)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card text-foreground text-sm hover:bg-secondary">
                <ArrowUpDown className="w-4 h-4" />
                {sortAsc ? "Kam → Ko'p" : "Ko'p → Kam"}
              </button>
            </div>

            <div className="space-y-2">
              {filtered.map((u, i) => (
                <motion.div key={u.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                  className="bg-card rounded-xl border border-border p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-hero-gradient flex items-center justify-center text-sm font-bold text-primary-foreground">
                      {u.full_name?.[0]?.toUpperCase() || "U"}
                    </div>
                    <div>
                      <p className="font-medium text-foreground text-sm">{u.full_name || "Noma'lum"}</p>
                      <p className="text-xs text-muted-foreground">{u.phone || "Telefon yo'q"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1">
                      {u.roles.map((role: string) => {
                        const Icon = roleIcons[role] || User;
                        return (
                          <span key={role} className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${roleColors[role] || roleColors.user}`}>
                            <Icon className="w-3 h-3" /> {role}
                          </span>
                        );
                      })}
                    </div>
                    <div className="text-right min-w-[80px]">
                      <p className="text-sm font-semibold text-foreground">{Number(u.balance_uzs).toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">UZS</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {filtered.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Foydalanuvchilar topilmadi</p>
              </div>
            )}
          </motion.div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default UsersPage;
