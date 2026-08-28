import { Link } from 'react-router-dom';
import {
  Activity, BarChart3, ClipboardList, ExternalLink, FlaskConical,
  LayoutGrid, LogOut, Shield, UserPlus, Users, Building2,
} from 'lucide-react';
import AtlasLogo from '../brand/AtlasLogo';
import { useAuth } from '../../context/AuthContext';

export type AdminSection =
  | 'command'
  | 'dispatch'
  | 'lab'
  | 'operations'
  | 'orders'
  | 'coas'
  | 'clients'
  | 'users';

interface NavItem {
  id: AdminSection;
  label: string;
  desc: string;
  icon: typeof Activity;
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

/** Work = ops & staffing · Money = orders & COA overrides · People = CRM & access */
const NAV_GROUPS: NavGroup[] = [
  {
    id: 'work',
    label: 'Work',
    items: [
      { id: 'command', label: 'Ops Bench', desc: 'Customers, ETAs, exceptions', icon: LayoutGrid },
      { id: 'dispatch', label: 'Dispatch', desc: 'Assign unassigned samples', icon: UserPlus },
      { id: 'lab', label: 'Staff load', desc: 'Who is behind on assigned work', icon: FlaskConical },
      { id: 'operations', label: 'Lab Analytics', desc: 'Intake & turnaround', icon: BarChart3 },
    ],
  },
  {
    id: 'money',
    label: 'Money',
    items: [
      { id: 'orders', label: 'Orders & money', desc: 'Priority, pay, refunds', icon: ClipboardList },
      { id: 'coas', label: 'COA Registry', desc: 'Overrides & audit', icon: Shield },
    ],
  },
  {
    id: 'people',
    label: 'People',
    items: [
      { id: 'clients', label: 'Clients', desc: 'CRM & order history', icon: Building2 },
      { id: 'users', label: 'Users & Access', desc: 'Roles & accounts', icon: Users },
    ],
  },
];

const NAV: NavItem[] = NAV_GROUPS.flatMap(g => g.items);

const EXTERNAL = [
  { to: '/lab', label: 'Chemist Console', icon: FlaskConical },
  { to: '/verify-portal', label: 'Verification Portal', icon: Shield },
  { to: '/dashboard', label: 'Client portal', icon: Building2 },
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

function NavButton({
  item,
  active,
  onSection,
}: {
  item: NavItem;
  active: boolean;
  onSection: (s: AdminSection) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSection(item.id)}
      className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors group ${
        active
          ? 'bg-brand-500/15 text-brand-400 border border-brand-500/30'
          : 'text-neutral-400 hover:bg-neutral-900 hover:text-white border border-transparent'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <item.icon size={16} className={active ? 'text-brand-500' : 'text-neutral-500 group-hover:text-neutral-300'} />
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{item.label}</p>
          <p className="text-[10px] text-neutral-500 truncate">{item.desc}</p>
        </div>
      </div>
    </button>
  );
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
          {NAV_GROUPS.map(group => (
            <div key={group.id} className="mb-2">
              <p className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map(item => (
                  <NavButton
                    key={item.id}
                    item={item}
                    active={section === item.id}
                    onSection={onSection}
                  />
                ))}
              </div>
            </div>
          ))}

          <p className="px-3 pt-4 pb-1 text-[10px] font-bold uppercase tracking-wider text-neutral-500">Consoles</p>
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
            {NAV_GROUPS.map(group => (
              <div key={group.id} className="flex items-center gap-1 mr-2">
                <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 px-1">
                  {group.label}
                </span>
                {group.items.map(item => (
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

export { NAV, NAV_GROUPS };
