import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, FileText, ShoppingCart, FlaskConical, Shield, LayoutDashboard,
  CheckCircle, AlertCircle, ExternalLink,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { COA, Order, UserProfile, UserRole } from '../lib/types';
import { formatDate } from '../lib/utils';
import { ROLE_LABELS } from '../lib/roles';
import { hydrateCoaImages } from '../lib/coaImages';
import { canPrepareCoa } from '../lib/coaWorkflow';
import StaffHeader from '../components/layout/StaffHeader';
import CoaPdfPrepModal from '../components/lab/CoaPdfPrepModal';
import { COA_LIST_COLUMNS } from '../lib/coaSelect';

const ROLES: UserRole[] = ['client', 'chemist', 'verifier', 'reviewer', 'admin'];

export default function Admin() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [coas, setCoas] = useState<COA[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [prepCoa, setPrepCoa] = useState<COA | null>(null);

  async function loadAll() {
    const [u, c, o] = await Promise.all([
      supabase.from('user_profiles').select('*'),
      supabase.from('coas').select(COA_LIST_COLUMNS).order('issued_at', { ascending: false }),
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
    ]);
    if (u.data) setUsers(u.data.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')));
    if (c.data) setCoas((c.data as COA[]).map(hydrateCoaImages));
    if (o.data) setOrders(o.data);
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  async function changeRole(id: string, role: UserRole) {
    setSavingId(id);
    setMsg(null);
    const { error } = await supabase.from('user_profiles').update({ role }).eq('id', id);
    if (error) {
      setMsg({ type: 'error', text: error.message });
    } else {
      setUsers(prev => prev.map(u => (u.id === id ? { ...u, role } : u)));
      setMsg({ type: 'success', text: 'Role updated.' });
    }
    setSavingId(null);
  }

  const stats = [
    { label: 'Users', value: users.length, icon: Users },
    { label: 'COAs', value: coas.length, icon: FileText },
    { label: 'Orders', value: orders.length, icon: ShoppingCart },
    { label: 'Public COAs', value: coas.filter(c => c.is_public).length, icon: Shield },
  ];

  const links = [
    { to: '/admin/submissions', label: 'Submissions Queue', desc: 'Kyle workflow — status pipeline', icon: ShoppingCart },
    { to: '/lab', label: 'Lab Console', desc: 'Issue certificates', icon: FlaskConical },
    { to: '/dashboard', label: 'Client Portal', desc: 'Client experience', icon: LayoutDashboard },
    { to: '/verify-portal', label: 'Verification', desc: 'Browse & verify', icon: Shield },
  ];

  return (
    <div className="min-h-screen bg-neutral-100">
      <StaffHeader title="Admin Console" />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-black">Administration</h1>
          <p className="text-sm text-neutral-500 mt-1">Full access to users, certificates, and every workspace.</p>
        </div>

        {msg && (
          <div className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${
            msg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {msg.type === 'success' ? <CheckCircle size={16} className="flex-shrink-0 mt-0.5" /> : <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />}
            {msg.text}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stats.map(s => (
            <div key={s.label} className="card p-4">
              <s.icon size={16} className="text-brand-500 mb-2" />
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{s.label}</p>
              <p className="text-2xl font-bold text-black">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Workspace links */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {links.map(l => (
            <Link key={l.to} to={l.to} className="card p-5 hover:border-brand-300 transition-colors flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center">
                <l.icon size={18} className="text-brand-600" />
              </div>
              <div>
                <p className="font-semibold text-black">{l.label}</p>
                <p className="text-xs text-neutral-500">{l.desc}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* Users */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-atlas-border flex items-center gap-2">
            <Users size={15} className="text-brand-500" />
            <h3 className="font-bold text-sm">Users &amp; Roles</h3>
          </div>
          {loading ? (
            <p className="p-6 text-sm text-neutral-500">Loading…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="coa-table-header">
                    <th className="text-left px-5 py-3">Name</th>
                    <th className="text-left px-5 py-3">Company</th>
                    <th className="text-left px-5 py-3">Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-atlas-border">
                  {users.map(u => (
                    <tr key={u.id} className="bg-white hover:bg-neutral-50">
                      <td className="px-5 py-3">
                        <p className="font-medium text-black">{u.full_name || '—'}</p>
                        <p className="text-xs text-neutral-400 font-mono">{u.id.slice(0, 8)}</p>
                      </td>
                      <td className="px-5 py-3 text-neutral-600">{u.company_name || '—'}</td>
                      <td className="px-5 py-3">
                        <select
                          value={(u.role ?? 'client')}
                          disabled={savingId === u.id}
                          onChange={e => changeRole(u.id, e.target.value as UserRole)}
                          className="input-field py-1.5 text-sm w-auto"
                        >
                          {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent COAs */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-atlas-border">
            <h3 className="font-bold text-sm">All Certificates</h3>
          </div>
          {coas.length === 0 ? (
            <p className="p-6 text-sm text-neutral-500">No COAs yet.</p>
          ) : (
            <div className="divide-y divide-atlas-border max-h-[400px] overflow-y-auto">
              {coas.map(c => (
                <div key={c.id} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-neutral-50">
                  <div className="min-w-0">
                    <p className="font-medium text-black truncate">{c.display_name || c.sample_name}</p>
                    <p className="text-xs text-neutral-500">{c.company_name || '—'} · {formatDate(c.issued_at)} · {c.is_public ? 'Public' : 'Private'}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {canPrepareCoa(c) && (
                      <button
                        type="button"
                        onClick={() => setPrepCoa(c)}
                        className="btn-outline text-xs py-1.5 px-2 gap-1"
                      >
                        Prepare
                      </button>
                    )}
                    <Link to={`/coa/${c.slug}`} className="btn-primary text-xs py-1.5 px-2 gap-1">
                      <ExternalLink size={12} /> Open & download PNG
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {prepCoa && (
        <CoaPdfPrepModal
          coa={prepCoa}
          onClose={() => setPrepCoa(null)}
          onSaved={updated => {
            setCoas(prev => prev.map(c => (c.id === updated.id ? hydrateCoaImages(updated) : c)));
          }}
        />
      )}
    </div>
  );
}
