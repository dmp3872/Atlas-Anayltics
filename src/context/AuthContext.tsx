import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { UserProfile } from '../lib/types';
import { effectiveRole } from '../lib/roles';

export type ProfileUpdate = Pick<UserProfile,
  'full_name' | 'company_name' | 'phone' | 'website' | 'company_logo' |
  'address_line1' | 'address_line2' | 'city' | 'state' | 'zip' | 'country'
>;

function fallbackProfile(authUser: User): UserProfile {
  const now = new Date().toISOString();
  return {
    id: authUser.id,
    full_name: (authUser.user_metadata?.full_name as string) || authUser.email?.split('@')[0] || 'User',
    role: 'client',
    company_name: '',
    phone: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    zip: '',
    country: 'US',
    prepaid_balance: 0,
    is_first_order: true,
    created_at: now,
    updated_at: now,
  };
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  profileError: string | null;
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
  const [profileError, setProfileError] = useState<string | null>(null);

  async function loadProfile(userId: string) {
    setProfileError(null);
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.warn('Profile fetch failed:', error.message);
      }

      if (data) {
        setProfile({ ...data, role: effectiveRole(data) });
        return;
      }

      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const fullName = (authUser.user_metadata?.full_name as string) || '';
      const { error: upsertError } = await supabase
        .from('user_profiles')
        .upsert({ id: userId, full_name: fullName }, { onConflict: 'id' });

      if (upsertError) {
        console.warn('Profile upsert failed:', upsertError.message);
        setProfile(fallbackProfile(authUser));
        setProfileError('Using a temporary profile — some account data may be limited.');
        return;
      }

      const { data: created, error: refetchError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (created) {
        setProfile({ ...created, role: effectiveRole(created) });
      } else {
        setProfile(fallbackProfile(authUser));
        if (refetchError) setProfileError(refetchError.message);
      }
    } catch (err) {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        setProfile(fallbackProfile(authUser));
        setProfileError(err instanceof Error ? err.message : 'Could not load profile');
      }
    }
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
      company_logo: updates.company_logo ?? '',
      address_line1: updates.address_line1,
      address_line2: updates.address_line2,
      city: updates.city,
      state: updates.state,
      zip: updates.zip,
      country: updates.country,
    };

    let { error } = await supabase.from('user_profiles').upsert(row, { onConflict: 'id' });
    // Gracefully retry without columns that may not exist yet (pending migrations).
    if (error?.message?.includes('website')) {
      delete row.website;
      ({ error } = await supabase.from('user_profiles').upsert(row, { onConflict: 'id' }));
    }
    if (error?.message?.includes('company_logo')) {
      delete row.company_logo;
      ({ error } = await supabase.from('user_profiles').upsert(row, { onConflict: 'id' }));
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
      user, session, profile, loading, profileError,
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
