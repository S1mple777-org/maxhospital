import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";

type AppRole = "owner" | "admin" | "doctor" | "user";

interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
  balance_uzs: number;
  is_banned: boolean;
  ban_reason: string | null;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  isOwner: boolean;
  isAdmin: boolean;
  isDoctor: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    // Private profile columns are only readable through get_my_profile().
    const [{ data: profileRows }, { data: rolesData }] = await Promise.all([
      supabase.rpc("get_my_profile"),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    const profileData = (profileRows as any[] | null)?.[0];

    if (profileData) setProfile(profileData as Profile);
    if (rolesData) setRoles((rolesData as any[]).map((r) => r.role as AppRole));
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  useEffect(() => {
    // `loading` stays true until the profile and roles are loaded. Before this
    // fix, role-protected pages (admin, owner, doctor) saw no roles on a page
    // refresh and redirected the user to the home page.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session?.user) {
          setUser(session.user);
          if (event === "SIGNED_IN" || event === "USER_UPDATED") {
            // Defer DB calls out of the auth callback (supabase-js recommendation);
            // the short delay also lets the new-user trigger create the profile.
            setTimeout(() => { fetchProfile(session.user.id).finally(() => setLoading(false)); }, 300);
          }
        } else {
          setUser(null);
          setProfile(null);
          setRoles([]);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        await fetchProfile(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setRoles([]);
  };

  const hasRole = (role: AppRole) => roles.includes(role);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        roles,
        loading,
        signOut,
        refreshProfile,
        hasRole,
        isOwner: hasRole("owner"),
        isAdmin: hasRole("admin"),
        isDoctor: hasRole("doctor"),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
