import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { UserRole } from '@/types';

interface UserProfile {
  id: string;
  email: string;
  username: string;
  fullName: string;
  businessName: string;
  idstaff: string;
  role: UserRole;
}

interface AuthContextType {
  user: UserProfile | null;
  profile: UserProfile | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    businessName: string,
  ) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('user_roles').select('role').eq('user_id', userId).limit(1),
  ]);
  if (!profile) return null;
  return {
    id: profile.id,
    email: profile.email || '',
    username: profile.username || '',
    fullName: profile.full_name || '',
    businessName: profile.business_name || '',
    idstaff: profile.idstaff || '',
    role: (roles?.[0]?.role || 'client') as UserRole,
  };
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Restore existing session on mount
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) {
        fetchProfile(data.session.user.id).then((p) => {
          setUser(p);
          setIsLoading(false);
        });
      } else {
        setIsLoading(false);
      }
    });

    // React to sign-in / sign-out / token refresh
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) {
        fetchProfile(s.user.id).then(setUser);
      } else {
        setUser(null);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: new Error(error.message) };
    return { error: null };
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    businessName: string,
  ) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          business_name: businessName,
          username: email.split('@')[0],
        },
      },
    });
    if (error) return { error: new Error(error.message) };
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile: user,
        session,
        isAuthenticated: !!user,
        isLoading,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
