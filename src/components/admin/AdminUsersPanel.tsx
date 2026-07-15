import { useMemo, useState } from 'react';
import { UserProfile, UserRole } from '../../lib/types';
import { ROLE_LABELS } from '../../lib/roles';

const ROLES: UserRole[] = ['client', 'chemist', 'verifier', 'reviewer', 'admin'];

interface Props {
  users: UserProfile[];
  loading?: boolean;
  savingId?: string | null;
  onChangeRole: (id: string, role: UserRole) => void;
}

export default function AdminUsersPanel({ users, loading, savingId, onChangeRole }: Props) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');

  const filtered = useMemo(() => {
    let list = [...users];
    if (roleFilter !== 'all') list = list.filter(u => (u.role ?? 'client') === roleFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(u =>
        (u.full_name ?? '').toLowerCase().includes(q)
        || (u.company_name ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [users, search, roleFilter]);

  const roleCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const u of users) c[u.role ?? 'client'] = (c[u.role ?? 'client'] ?? 0) + 1;
    return c;
  }, [users]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {ROLES.map(r => (
          <button
            key={r}
            type="button"
            onClick={() => setRoleFilter(roleFilter === r ? 'all' : r)}
            className={`card p-3 text-left transition-colors ${
              roleFilter === r ? 'border-brand-400 bg-brand-50' : 'hover:border-neutral-300'
            }`}
          >
            <p className="text-[10px] uppercase tracking-wider text-neutral-500">{ROLE_LABELS[r]}</p>
            <p className="text-xl font-bold text-black">{roleCounts[r] ?? 0}</p>
          </button>
        ))}
      </div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search name or company…"
        className="input-field max-w-md"
      />

      <div className="card overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-neutral-500">Loading accounts…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="coa-table-header">
                  <th className="text-left px-5 py-3">Name</th>
                  <th className="text-left px-5 py-3">Company</th>
                  <th className="text-left px-5 py-3">Role</th>
                  <th className="text-left px-5 py-3">User ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-atlas-border">
                {filtered.map(u => (
                  <tr key={u.id} className="bg-white hover:bg-neutral-50">
                    <td className="px-5 py-3 font-medium text-black">{u.full_name || '—'}</td>
                    <td className="px-5 py-3 text-neutral-600">{u.company_name || '—'}</td>
                    <td className="px-5 py-3">
                      <select
                        value={u.role ?? 'client'}
                        disabled={savingId === u.id}
                        onChange={e => onChangeRole(u.id, e.target.value as UserRole)}
                        className="input-field py-1.5 text-sm w-auto"
                      >
                        {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                    </td>
                    <td className="px-5 py-3 text-xs font-mono text-neutral-400">{u.id.slice(0, 13)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
