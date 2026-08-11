import { Link } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import AtlasLogo from '../brand/AtlasLogo';
import { useAuth } from '../../context/AuthContext';
import { ROLE_LABELS, resolveUserRole, roleHome } from '../../lib/roles';
import { UserRole } from '../../lib/types';

export default function StaffHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  const { user, profile, signOut } = useAuth();
  const role = resolveUserRole(profile, user?.email) as UserRole;
  const home = roleHome(role);
  return (
    <header className="coa-header-bar sticky top-0 z-40 border-b border-neutral-800 no-print">
      <div className="app-header-inner">
        <div className="flex items-center gap-4 min-w-0">
          <Link to={home} title={`Back to ${ROLE_LABELS[role]} home`}>
            <AtlasLogo variant="light" size="sm" />
          </Link>
          <div className="hidden sm:block border-l border-neutral-700 pl-4 min-w-0">
            <p className="font-bold truncate text-sm">{title}</p>
            <p className="text-xs text-neutral-500 truncate">{ROLE_LABELS[role]} · {profile?.full_name || user?.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {children}
          <button onClick={() => signOut()} className="p-2 text-neutral-500 hover:text-red-400 hover:bg-neutral-900 rounded-md" title="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
