import { Link } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import AtlasLogo from '../brand/AtlasLogo';
import { useAuth } from '../../context/AuthContext';
import { ROLE_LABELS } from '../../lib/roles';
import { UserRole } from '../../lib/types';

export default function StaffHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  const { user, profile, signOut } = useAuth();
  const role = (profile?.role ?? 'client') as UserRole;
  return (
    <header className="coa-header-bar sticky top-0 z-40 border-b border-neutral-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Link to="/"><AtlasLogo variant="light" size="sm" /></Link>
          <div className="hidden sm:block border-l border-neutral-700 pl-4">
            <p className="font-bold truncate">{title}</p>
            <p className="text-xs text-neutral-500">{ROLE_LABELS[role]} · {profile?.full_name || user?.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {children}
          <button onClick={() => signOut()} className="p-2 text-neutral-500 hover:text-red-400 hover:bg-neutral-900 rounded-md" title="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
