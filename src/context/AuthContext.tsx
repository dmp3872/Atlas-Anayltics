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

function temporaryProfile(userId: string, email?: string | null): UserProfile {
  const now = new Date().toISOString();
  return {
    id: userId,
    full_name: email?.split('@')[0] || 'User',
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
      if (!authUser) {
        // Session exists but user lookup failed — keep a minimal local profile
        // so sign-in can proceed instead of spinning forever.
        setProfile(temporaryProfile(userId));
        setProfileError('Could not verify account details. Some features may be limited.');
        return;
      }

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
      } else {
        setProfile(temporaryProfile(userId));
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

    let cancelled = false;
    // Never leave the app on the spinner if auth/profile network calls hang.
    const watchdog = window.setTimeout(() => {
      if (!cancelled) {
        console.warn('Auth bootstrap timed out — clearing loading state.');
        setLoading(false);
      }
    }, 8000);

    void supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        if (cancelled) return;
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await loadProfile(session.user.id);
        } else {
          setProfile(null);
        }
      })
      .catch(err => {
        console.warn('Auth getSession failed:', err);
        if (!cancelled) {
          setSession(null);
          setUser(null);
          setProfile(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
        window.clearTimeout(watchdog);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      // INITIAL_SESSION duplicates getSession — skip to avoid a second loading lock.
      if (event === 'INITIAL_SESSION') return;

      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        // Keep loading true until role/profile is known so Auth doesn't send admins to /dashboard.
        setLoading(true);
        void loadProfile(session.user.id)
          .catch(err => console.warn('Profile load failed:', err))
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      window.clearTimeout(watchdog);
      subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string) {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error('Sign in failed') };
    }
  }

  async function signUp(email: string, password: string, fullName: string) {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      return { error };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error('Sign up failed') };
    }
  }

  async function signOut() {
    // Clear local auth immediately so Log Out always leaves the portal even if
    // the network call to Supabase hangs or fails.
    setSession(null);
    setUser(null);
    setProfile(null);
    setProfileError(null);
    setLoading(false);

    try {
      const result = await Promise.race([
        supabase.auth.signOut({ scope: 'global' }),
        new Promise<{ error: Error }>(resolve => {
          window.setTimeout(() => resolve({ error: new Error('Sign out timed out') }), 4000);
        }),
      ]);
      if (result && 'error' in result && result.error) {
        await supabase.auth.signOut({ scope: 'local' });
      }
    } catch {
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        /* local clear best-effort */
      }
    }
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
