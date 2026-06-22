import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { UserProfile } from '../lib/types';

export type ProfileUpdate = Pick<UserProfile,
  'full_name' | 'company_name' | 'phone' | 'website' |
  'address_line1' | 'address_line2' | 'city' | 'state' | 'zip' | 'country'
>;

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: ProfileUpdate) => Promise<{ error: Error | null }>;
  updateEmail: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (password: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (data) {
      setProfile(data);
      return;
    }

    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    const fullName = (authUser.user_metadata?.full_name as string) || '';
    await supabase.from('user_profiles').upsert({ id: userId, full_name: fullName });

    const { data: created } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    setProfile(created);
  }

  async function refreshProfile() {
    if (user) await loadProfile(user.id);
  }

  async function updateProfile(updates: ProfileUpdate) {
    if (!user) return { error: new Error('Not signed in') };

    const row: Record<string, string> = {
      id: user.id,
      full_name: updates.full_name,
      company_name: updates.company_name,
      phone: updates.phone,
      website: updates.website ?? '',
      address_line1: updates.address_line1,
      address_line2: updates.address_line2,
      city: updates.city,
      state: updates.state,
      zip: updates.zip,
      country: updates.country,
    };

    let { error } = await supabase.from('user_profiles').upsert(row, { onConflict: 'id' });
    if (error?.message?.includes('website')) {
      const { website: _w, ...withoutWebsite } = row;
      ({ error } = await supabase.from('user_profiles').upsert(withoutWebsite, { onConflict: 'id' }));
    }
    if (error) return { error };

    await supabase.auth.updateUser({ data: { full_name: updates.full_name } });
    await loadProfile(user.id);
    return { error: null };
  }

  async function updateEmail(email: string) {
    const { error } = await supabase.auth.updateUser(
      { email },
      { emailRedirectTo: `${window.location.origin}/dashboard?tab=account` },
    );
    return { error };
  }

  async function updatePassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password });
    return { error };
  }

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  async function signUp(email: string, password: string, fullName: string) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    return { error };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{
      user, session, profile, loading,
      signIn, signUp, signOut, refreshProfile,
      updateProfile, updateEmail, updatePassword,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
