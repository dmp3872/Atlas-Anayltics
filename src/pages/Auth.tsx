import { useState } from 'react';
import { Navigate, Link, useLocation } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, Shield, FileText, Package, LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { roleHome, resolveUserRole } from '../lib/roles';
import AtlasLogo from '../components/brand/AtlasLogo';

type Mode = 'signin' | 'signup';

export default function Auth() {
  const { user, profile, loading, signIn, signUp } = useAuth();
  const location = useLocation();
  const role = resolveUserRole(profile, user?.email);
  const home = roleHome(role);
  // Prefer role home for staff. Only honor deep-links (e.g. /order-new) — never force clients' /dashboard on admins.
  const requested = (location.state as { from?: string } | null)?.from;
  const clientOnlyPaths = ['/dashboard', '/dashboard/orders', '/dashboard/coas', '/dashboard/api', '/dashboard/submissions'];
  const fromStaffOverride =
    role !== 'client'
    && requested
    && clientOnlyPaths.some(p => requested === p || requested.startsWith(`${p}/`) || requested.startsWith(`${p}?`));
  const destination = fromStaffOverride
    ? home
    : (requested?.startsWith('/') ? requested : home);

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [resetSent, setResetSent] = useState(false);

  // Wait for profile when signed in so staff land on /admin or /lab, not the client portal.
  if (loading || (user && !profile)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user) {
    return <Navigate to={destination} replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    setSubmitting(true);
    try {
      if (mode === 'signin') {
        const { error: signInError } = await signIn(email.trim(), password);
        if (signInError) {
          setError(
            signInError.message.includes('Invalid login')
              ? 'Incorrect email or password. If you are new, use Create Account instead.'
              : signInError.message,
          );
        }
      } else {
        if (!fullName.trim()) {
          setError('Please enter your name.');
          return;
        }
        const { error: signUpError } = await signUp(email.trim(), password, fullName.trim());
        if (signUpError) {
          setError(signUpError.message);
        } else {
          setInfo('Account created. If you are not redirected automatically, sign in with your new credentials.');
          setMode('signin');
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function forgotPassword() {
    if (!email.trim()) {
      setError('Enter your email first.');
      return;
    }
    setError('');
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth`,
    });
    if (resetError) setError(resetError.message);
    else setResetSent(true);
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-white">
      <div className="hidden lg:flex lg:w-[420px] xl:w-[480px] bg-black flex-col justify-between p-10 shrink-0">
        <Link to="/"><AtlasLogo variant="light" size="md" /></Link>
        <div>
          <div className="coa-gold-divider mb-6" />
          <h1 className="text-2xl font-bold text-white tracking-tight">Client Portal</h1>
          <p className="text-sm text-neutral-400 mt-3 leading-relaxed">
            Access certificates of analysis, track orders, and manage your testing account.
          </p>
          <ul className="mt-8 space-y-4 text-sm text-neutral-500">
            {[
              { icon: FileText, text: 'Digital COAs with QR verification' },
              { icon: Package, text: 'Order tracking and prepaid shipping labels' },
              { icon: Shield, text: 'Secure account access' },
            ].map(item => (
              <li key={item.text} className="flex items-center gap-3">
                <item.icon size={16} className="text-brand-500 flex-shrink-0" />
                {item.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-neutral-600">&copy; {new Date().getFullYear()} Atlas Analytics</p>
      </div>

      <div className="flex-1 flex flex-col min-h-screen bg-neutral-50">
        <header className="lg:hidden coa-header-bar px-6 py-4">
          <Link to="/"><AtlasLogo variant="light" size="sm" /></Link>
        </header>

        <div className="flex-1 flex items-center justify-center px-4 py-10 lg:py-12">
          <div className="w-full max-w-md">
            <div className="lg:hidden text-center mb-8">
              <h1 className="text-2xl font-bold text-black">Client Portal</h1>
              <p className="text-sm text-neutral-500 mt-2">Sign in or create a free account</p>
            </div>

            {!isSupabaseConfigured && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4 text-sm text-amber-900">
                <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                <p>Supabase is not configured. Add <code className="text-xs bg-white px-1 rounded">VITE_SUPABASE_URL</code> and <code className="text-xs bg-white px-1 rounded">VITE_SUPABASE_ANON_KEY</code> to your <code className="text-xs bg-white px-1 rounded">.env</code> file.</p>
              </div>
            )}

            <div className="flex border border-atlas-border p-0.5 mb-6 bg-white">
              <button type="button" onClick={() => { setMode('signin'); setError(''); setInfo(''); }} className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${mode === 'signin' ? 'bg-black text-white' : 'text-neutral-600 hover:text-black'}`}>
                <LogIn size={15} /> Sign In
              </button>
              <button type="button" onClick={() => { setMode('signup'); setError(''); setInfo(''); }} className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${mode === 'signup' ? 'bg-black text-white' : 'text-neutral-600 hover:text-black'}`}>
                <UserPlus size={15} /> Create Account
              </button>
            </div>

            <div className="card p-6 border-atlas-border shadow-sm">
              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-4 text-sm text-red-700">
                  <AlertCircle size={15} className="flex-shrink-0 mt-0.5" /> {error}
                </div>
              )}
              {info && (
                <div className="p-3 bg-brand-50 border border-brand-200 rounded-lg mb-4 text-sm text-brand-900">
                  {info}
                </div>
              )}
              {resetSent && (
                <div className="p-3 bg-brand-50 border border-brand-200 rounded-lg mb-4 text-sm text-brand-800">
                  Password reset email sent. Check your inbox.
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'signup' && (
                  <div>
                    <label className="label">Full Name</label>
                    <input value={fullName} onChange={e => setFullName(e.target.value)} className="input-field" placeholder="Jane Smith" required />
                  </div>
                )}
                <div>
                  <label className="label">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-field" placeholder="you@company.com" required autoComplete="email" />
                </div>
                <div>
                  <label className="label">Password</label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="input-field pr-10"
                      placeholder={mode === 'signup' ? 'At least 8 characters' : 'Enter your password'}
                      minLength={mode === 'signup' ? 8 : undefined}
                      required
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                {mode === 'signin' && (
                  <div className="text-right">
                    <button type="button" onClick={forgotPassword} className="text-sm text-brand-700 hover:text-brand-600 font-medium">Forgot password?</button>
                  </div>
                )}
                <button type="submit" disabled={submitting || !isSupabaseConfigured} className="btn-primary w-full py-3 gap-2">
                  <LogIn size={16} />
                  {submitting ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
                </button>
              </form>

              {mode === 'signin' && (
                <p className="text-xs text-neutral-500 mt-4 text-center">
                  Don&apos;t have an account?{' '}
                  <button type="button" onClick={() => { setMode('signup'); setError(''); }} className="text-brand-700 font-medium hover:underline">
                    Create one free
                  </button>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
