import { Link } from 'react-router-dom';
import {
  Activity, BarChart3, ClipboardList, ExternalLink, FlaskConical,
  LayoutGrid, LogOut, Shield, Users,
} from 'lucide-react';
import AtlasLogo from '../brand/AtlasLogo';
import { useAuth } from '../../context/AuthContext';

export type AdminSection =
  | 'command'
  | 'lab'
  | 'operations'
  | 'orders'
  | 'coas'
  | 'users';

interface NavItem {
  id: AdminSection;
  label: string;
  desc: string;
  icon: typeof Activity;
}

const NAV: NavItem[] = [
  { id: 'command', label: 'Command Center', desc: 'Live lab status', icon: LayoutGrid },
  { id: 'lab', label: 'Lab Manager', desc: 'Chemist workload & COA control', icon: FlaskConical },
  { id: 'operations', label: 'Lab Analytics', desc: 'Intake & turnaround', icon: BarChart3 },
  { id: 'orders', label: 'Orders & Priority', desc: 'Queue control', icon: ClipboardList },
  { id: 'coas', label: 'COA Registry', desc: 'All certificates', icon: Shield },
  { id: 'users', label: 'Users & Access', desc: 'Roles & accounts', icon: Users },
];

const EXTERNAL = [
  { to: '/lab', label: 'Chemist Console', icon: FlaskConical },
  { to: '/verify-portal', label: 'Verification Portal', icon: Shield },
];

interface Props {
  section: AdminSection;
  onSection: (s: AdminSection) => void;
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  children: React.ReactNode;
}

export default function AdminShell({
  section, onSection, title, subtitle, onRefresh, refreshing, children,
}: Props) {
  const { profile, user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-neutral-100 flex">
      <aside className="hidden lg:flex w-64 flex-col bg-neutral-950 text-white flex-shrink-0 border-r border-neutral-800">
        <div className="p-5 border-b border-neutral-800">
          <Link to="/admin" className="block">
            <AtlasLogo variant="light" size="sm" />
          </Link>
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand-500 mt-3">Lab Director</p>
          <p className="text-xs text-neutral-500 mt-0.5">Operations Control</p>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-neutral-500">Main</p>
          {NAV.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSection(item.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors group ${
                section === item.id
                  ? 'bg-brand-500/15 text-brand-400 border border-brand-500/30'
                  : 'text-neutral-400 hover:bg-neutral-900 hover:text-white border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <item.icon size={16} className={section === item.id ? 'text-brand-500' : 'text-neutral-500 group-hover:text-neutral-300'} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{item.label}</p>
                  <p className="text-[10px] text-neutral-500 truncate">{item.desc}</p>
                </div>
              </div>
            </button>
          ))}

          <p className="px-3 pt-5 pb-1 text-[10px] font-bold uppercase tracking-wider text-neutral-500">Consoles</p>
          {EXTERNAL.map(link => (
            <Link
              key={link.to}
              to={link.to}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-neutral-400 hover:bg-neutral-900 hover:text-white text-sm transition-colors"
            >
              <link.icon size={15} className="text-neutral-500" />
              {link.label}
              <ExternalLink size={11} className="ml-auto opacity-40" />
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-neutral-800">
          <p className="text-xs font-medium text-white truncate">{profile?.full_name || 'Director'}</p>
          <p className="text-[10px] text-neutral-500 truncate">{user?.email}</p>
          <button
            type="button"
            onClick={() => signOut()}
            className="mt-3 flex items-center gap-2 text-xs text-neutral-500 hover:text-red-400 transition-colors"
          >
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 bg-white border-b border-atlas-border px-4 sm:px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-brand-600">Atlas Analytics · Lab Operations</p>
              <h1 className="text-xl sm:text-2xl font-bold text-black mt-0.5">{title}</h1>
              {subtitle && <p className="text-sm text-neutral-500 mt-0.5">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-2">
              {onRefresh && (
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={refreshing}
                  className="btn-outline text-xs py-2 gap-1.5"
                >
                  <Activity size={14} className={refreshing ? 'animate-spin' : ''} />
                  Refresh
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-1 mt-4 overflow-x-auto lg:hidden pb-1">
            {NAV.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSection(item.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap border ${
                  section === item.id ? 'bg-black text-white border-black' : 'border-atlas-border text-neutral-600'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

export { NAV };
