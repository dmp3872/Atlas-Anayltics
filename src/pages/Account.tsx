import { useState, useEffect } from 'react';
import { User, Lock, Building2, CheckCircle, AlertCircle, CreditCard } from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/utils';

export default function Account() {
  const { user, profile, refreshProfile } = useAuth();
  const [tab, setTab] = useState<'profile' | 'password' | 'billing'>('profile');

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [companyName, setCompanyName] = useState(profile?.company_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setFullName(profile?.full_name ?? '');
    setCompanyName(profile?.company_name ?? '');
    setPhone(profile?.phone ?? '');
  }, [profile]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    const { error } = await supabase.from('user_profiles').upsert({
      id: user!.id,
      full_name: fullName,
      company_name: companyName,
      phone,
    });
    if (error) setSaveMsg({ type: 'error', text: error.message });
    else {
      await refreshProfile();
      setSaveMsg({ type: 'success', text: 'Profile updated successfully.' });
    }
    setSaving(false);
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPw !== confirmPw) { setPwMsg({ type: 'error', text: 'Passwords do not match.' }); return; }
    if (newPw.length < 8) { setPwMsg({ type: 'error', text: 'Password must be at least 8 characters.' }); return; }
    setPwLoading(true);
    setPwMsg(null);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    if (error) setPwMsg({ type: 'error', text: error.message });
    else {
      setPwMsg({ type: 'success', text: 'Password changed successfully.' });
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    }
    setPwLoading(false);
  }

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'password', label: 'Password', icon: Lock },
    { id: 'billing', label: 'Billing', icon: CreditCard },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">Account Settings</h1>

        <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-xl w-fit">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as typeof tab)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'profile' && (
          <div className="card p-6">
            <h2 className="font-semibold text-slate-900 mb-5 flex items-center gap-2">
              <User size={17} /> Profile Information
            </h2>

            <div className="mb-5 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <p className="text-xs text-slate-500 mb-0.5">Email address</p>
              <p className="font-medium text-slate-900">{user?.email}</p>
              <p className="text-xs text-slate-400 mt-1">Email cannot be changed. Contact support if needed.</p>
            </div>

            {saveMsg && (
              <div className={`flex items-center gap-2 p-3 rounded-lg border mb-5 text-sm ${
                saveMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'
              }`}>
                {saveMsg.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                {saveMsg.text}
              </div>
            )}

            <form onSubmit={saveProfile} className="space-y-4">
              <div>
                <label className="label">Full Name</label>
                <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} className="input-field" placeholder="Jane Smith" />
              </div>
              <div>
                <label className="label flex items-center gap-1.5">
                  <Building2 size={13} /> Company Name <span className="text-slate-400 font-normal">(appears on COAs)</span>
                </label>
                <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} className="input-field" placeholder="Your Lab or Company" />
              </div>
              <div>
                <label className="label">Phone</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="input-field" placeholder="+1 (555) 000-0000" />
              </div>
              <button type="submit" disabled={saving} className="btn-primary w-full py-3">
                {saving ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Saving...
                  </span>
                ) : 'Save Profile'}
              </button>
            </form>
          </div>
        )}

        {tab === 'password' && (
          <div className="card p-6">
            <h2 className="font-semibold text-slate-900 mb-5 flex items-center gap-2">
              <Lock size={17} /> Change Password
            </h2>

            {pwMsg && (
              <div className={`flex items-center gap-2 p-3 rounded-lg border mb-5 text-sm ${
                pwMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'
              }`}>
                {pwMsg.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                {pwMsg.text}
              </div>
            )}

            <form onSubmit={changePassword} className="space-y-4">
              <div>
                <label className="label">New Password</label>
                <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} className="input-field" placeholder="Minimum 8 characters" minLength={8} required />
              </div>
              <div>
                <label className="label">Confirm New Password</label>
                <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} className="input-field" placeholder="Re-enter new password" required />
              </div>
              <button type="submit" disabled={pwLoading} className="btn-primary w-full py-3">
                {pwLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Updating...
                  </span>
                ) : 'Update Password'}
              </button>
            </form>
          </div>
        )}

        {tab === 'billing' && (
          <div className="space-y-5">
            <div className="card p-6">
              <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <CreditCard size={17} /> Prepaid Balance
              </h2>
              <div className="flex items-center justify-between p-5 bg-gradient-to-r from-brand-50 to-slate-50 rounded-xl border border-brand-100 mb-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Current Balance</p>
                  <p className="text-3xl font-bold text-slate-900">{formatCurrency(profile?.prepaid_balance ?? 0)}</p>
                </div>
                <div className="w-12 h-12 bg-brand-100 rounded-xl flex items-center justify-center">
                  <CreditCard size={22} className="text-brand-600" />
                </div>
              </div>
              <button className="btn-outline w-full gap-2">
                <CreditCard size={15} /> Add Funds
              </button>
            </div>

            <div className="card p-6">
              <h2 className="font-semibold text-slate-900 mb-4">Account Status</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-500">First-order discount</span>
                  <span className={`font-medium ${profile?.is_first_order ? 'text-emerald-600' : 'text-slate-500 line-through'}`}>
                    {profile?.is_first_order ? '50% off — available' : 'Used'}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-500">Account type</span>
                  <span className="font-medium text-slate-900">Standard</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-slate-500">Member since</span>
                  <span className="font-medium text-slate-900">{user?.created_at ? new Date(user.created_at).getFullYear() : '—'}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
