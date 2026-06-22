import { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { FlaskConical, Mail, Lock, User, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

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

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <div className="hidden lg:flex flex-1 flex-col justify-between bg-slate-950 p-12">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
            <FlaskConical size={17} className="text-white" />
          </div>
          <span className="font-bold text-white text-lg">Atlas Analytics</span>
        </Link>
        <div>
          <blockquote className="text-2xl font-medium text-white leading-relaxed mb-6">
            "Flat pricing, digital COAs with permanent URLs, and 50% off the first order made this a clear choice."
          </blockquote>
          <p className="text-slate-400 text-sm">— Independent Peptide Vendor</p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: '12,400+', sub: 'Samples tested' },
            { label: '4,800+', sub: 'COAs issued' },
            { label: '3–5 days', sub: 'Avg. turnaround' },
          ].map((s) => (
            <div key={s.label} className="border border-slate-800 rounded-xl p-4">
              <p className="text-xl font-bold text-white">{s.label}</p>
              <p className="text-xs text-slate-500 mt-1">{s.sub}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
                <FlaskConical size={17} className="text-white" />
              </div>
              <span className="font-bold text-slate-900 text-lg">Atlas Analytics</span>
            </Link>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 mb-1">
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="text-slate-500 text-sm mb-8">
            {mode === 'signin'
              ? 'Sign in to access your dashboard and order history.'
              : 'Start submitting samples today. Your first order is 50% off.'}
          </p>

          {error && (
            <div className="flex items-start gap-3 p-3.5 bg-red-50 border border-red-200 rounded-lg mb-5">
              <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="label">Full Name</label>
                <div className="relative">
                  <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="input-field pl-10"
                    placeholder="Jane Smith"
                    required
                  />
                </div>
              </div>
            )}

            <div>
              <label className="label">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field pl-10"
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pl-10 pr-10"
                  placeholder={mode === 'signup' ? 'Minimum 8 characters' : '••••••••'}
                  minLength={mode === 'signup' ? 8 : undefined}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 mt-2"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  {mode === 'signin' ? 'Signing in...' : 'Creating account...'}
                </span>
              ) : (
                mode === 'signin' ? 'Sign In' : 'Create Account'
              )}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            {mode === 'signin' ? "Don't have an account? " : "Already have an account? "}
            <button
              onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }}
              className="text-brand-600 font-medium hover:text-brand-700"
            >
              {mode === 'signin' ? 'Sign up free' : 'Sign in'}
            </button>
          </p>

          {mode === 'signup' && (
            <p className="text-center text-xs text-slate-400 mt-4">
              Your first order is automatically 50% off. No code needed.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
