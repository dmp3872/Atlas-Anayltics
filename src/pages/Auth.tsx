import { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, AlertCircle, Shield, FileText, Package, LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import AtlasLogo from '../components/brand/AtlasLogo';

type Mode = 'signin' | 'signup';

export default function Auth() {
  const { user, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'signin') {
        const { error } = await signIn(email, password);
        if (error) setError(error.message);
      } else {
        if (!fullName.trim()) { setError('Please enter your name.'); setLoading(false); return; }
        const { error } = await signUp(email, password, fullName);
        if (error) setError(error.message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function forgotPassword() {
    if (!email) { setError('Enter your email first.'); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth`,
    });
    if (error) setError(error.message);
    else setResetSent(true);
  }

  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col">
      <header className="bg-white border-b border-atlas-border px-6 py-4">
        <Link to="/"><AtlasLogo size="sm" /></Link>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-14 h-14 bg-brand-50 border border-brand-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Shield size={28} className="text-brand-600" />
            </div>
            <h1 className="text-2xl font-bold text-black">Client Portal</h1>
            <p className="text-sm text-neutral-500 mt-2">Access your certificates of analysis, track orders, and manage your account.</p>
          </div>

          <div className="flex bg-neutral-200 p-1 rounded-xl mb-6">
            <button onClick={() => { setMode('signin'); setError(''); }} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${mode === 'signin' ? 'bg-white shadow-sm text-black' : 'text-neutral-600'}`}>
              <LogIn size={15} /> Sign In
            </button>
            <button onClick={() => { setMode('signup'); setError(''); }} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${mode === 'signup' ? 'bg-white shadow-sm text-black' : 'text-neutral-600'}`}>
              <UserPlus size={15} /> Create Account
            </button>
          </div>

          <div className="card p-6">
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-4 text-sm text-red-700">
                <AlertCircle size={15} className="flex-shrink-0 mt-0.5" /> {error}
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
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-field" placeholder="you@company.com" required />
              </div>
              <div>
                <label className="label">Password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="input-field pr-10"
                    placeholder="Enter your password"
                    minLength={mode === 'signup' ? 8 : undefined}
                    required
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
              <button type="submit" disabled={loading} className="btn-primary w-full py-3 gap-2">
                <LogIn size={16} />
                {loading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            </form>
          </div>

          <div className="grid grid-cols-3 gap-4 mt-8 text-center">
            {[
              { icon: FileText, label: 'View Certificates' },
              { icon: Package, label: 'Track Orders' },
              { icon: Shield, label: 'Secure Access' },
            ].map(f => (
              <div key={f.label} className="text-xs text-neutral-500">
                <f.icon size={18} className="mx-auto mb-1.5 text-brand-500" />
                {f.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
