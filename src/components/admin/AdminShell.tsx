import { Link } from 'react-router-dom';
import {
  Activity, BarChart3, ClipboardList, ExternalLink, FlaskConical,
  LayoutGrid, LogOut, Menu, Shield, UserPlus, Users, Building2, X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
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
  { to: '/dashboard', label: 'Client portal', icon: Building2 },
];

interface Props {
  section: AdminSection;
  onSection: (s: AdminSection) => void;
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  children: ReactNode;
}

function NavButton({
  item,
  active,
  onSection,
  onPick,
}: {
  item: NavItem;
  active: boolean;
  onSection: (s: AdminSection) => void;
  onPick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        onSection(item.id);
        onPick?.();
      }}
      className={`portal-nav-item w-full ${active ? 'portal-nav-item-active' : ''}`}
    >
      <item.icon size={17} strokeWidth={1.6} />
      <span className="min-w-0 truncate">{item.label}</span>
    </button>
  );
}

function greetingForHour(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function AdminDetailChrome({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { profile, user, signOut } = useAuth();

  return (
    <div className="aa-shell aa-portal aa-admin min-h-screen">
      <div className="aa-ambient" aria-hidden />
      <header className="aa-portal-mobile-bar relative z-[1] px-4 sm:px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/admin" className="shrink-0">
              <AtlasLogo size="sm" />
            </Link>
            <div className="min-w-0 hidden sm:block">
              <p className="aa-section-kicker" style={{ margin: 0 }}>Admin</p>
              <p className="text-sm font-semibold tracking-tight truncate" style={{ color: 'var(--aa-ink)' }}>{title}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Link to="/admin" className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-full hover:bg-black/5" style={{ color: 'var(--aa-muted)' }}>
              <Shield size={13} /> Admin
            </Link>
            <Link to="/lab" className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-full hover:bg-black/5" style={{ color: 'var(--aa-muted)' }}>
              <FlaskConical size={13} /> Lab
            </Link>
            <Link to="/dashboard" className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-full hover:bg-black/5" style={{ color: 'var(--aa-muted)' }}>
              <Building2 size={13} /> Client
            </Link>
            <span className="hidden lg:inline text-xs px-2 truncate max-w-[12rem]" style={{ color: 'var(--aa-muted)' }}>
              {profile?.full_name || user?.email}
            </span>
            <button
              type="button"
              onClick={() => signOut()}
              className="p-2 rounded-full hover:bg-black/5"
              style={{ color: 'var(--aa-muted)' }}
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}

export default function AdminShell({
  section, onSection, title, subtitle, onRefresh, refreshing, children,
}: Props) {
  const { profile, user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const firstName = profile?.full_name?.split(' ')[0] || 'Director';
  const greeting = greetingForHour(new Date().getHours());
  const showGreeting = section === 'command';

  const Sidebar = ({ onPick }: { onPick?: () => void }) => (
    <div className="flex flex-col h-full aa-portal-aside">
      <div className="aa-portal-side-head">
        <Link to="/admin" onClick={onPick}>
          <AtlasLogo size="sm" />
        </Link>
        <p className="aa-portal-side-name truncate">{profile?.full_name || 'Lab Director'}</p>
        <p className="aa-portal-side-email truncate">{user?.email}</p>
      </div>

      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {NAV_GROUPS.map(group => (
          <div key={group.id} className="mb-1">
            <p className="px-3 pt-4 pb-1.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--aa-muted)' }}>
              {group.label}
            </p>
            {group.items.map(item => (
              <NavButton
                key={item.id}
                item={item}
                active={section === item.id}
                onSection={onSection}
                onPick={onPick}
              />
            ))}
          </div>
        ))}

        <p className="px-3 pt-5 pb-1.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--aa-muted)' }}>
          Consoles
        </p>
        {EXTERNAL.map(link => (
          <Link
            key={link.to}
            to={link.to}
            onClick={onPick}
            className="portal-nav-item"
          >
            <link.icon size={17} strokeWidth={1.6} />
            <span className="min-w-0 truncate">{link.label}</span>
            <ExternalLink size={12} className="ml-auto opacity-40 shrink-0" />
          </Link>
        ))}
      </nav>

      <div className="p-3" style={{ borderTop: '1px solid var(--aa-line)' }}>
        <button
          type="button"
          onClick={() => signOut()}
          className="portal-nav-item w-full text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          <LogOut size={17} /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="aa-shell aa-portal aa-admin flex">
      <div className="aa-ambient" aria-hidden />
      <aside className="hidden lg:flex flex-col w-60 fixed inset-y-0 left-0 z-30">
        <Sidebar />
      </aside>

      {open && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="relative w-72 max-w-[85vw] h-full shadow-xl z-10">
            <button type="button" onClick={() => setOpen(false)} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-neutral-100 z-10">
              <X size={18} />
            </button>
            <Sidebar onPick={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex-1 lg:ml-60 min-w-0 relative z-[1]">
        <header className="lg:hidden aa-portal-mobile-bar px-4 py-3 flex items-center gap-3">
          <button type="button" onClick={() => setOpen(true)} className="p-2 rounded-xl hover:bg-black/5">
            <Menu size={20} />
          </button>
          <span className="font-semibold text-sm tracking-tight" style={{ color: 'var(--aa-ink)' }}>Admin</span>
        </header>

        <div className="px-5 sm:px-8 pt-6 sm:pt-8 pb-2">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0 aa-animate">
              <p className="aa-section-kicker" style={{ marginBottom: '0.35rem' }}>Lab Director</p>
              <h1 className="aa-section-title" style={{ fontSize: 'clamp(1.7rem, 3vw, 2.2rem)' }}>
                {showGreeting ? `${greeting}, ${firstName}.` : title}
              </h1>
              <p className="portal-page-subtitle">
                {showGreeting ? title + (subtitle ? ` — ${subtitle}` : '') : subtitle}
              </p>
            </div>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                className="aa-admin-ghost-btn"
              >
                <Activity size={14} className={refreshing ? 'animate-spin' : ''} />
                Refresh
              </button>
            )}
          </div>

          <div className="flex gap-1.5 mt-5 overflow-x-auto lg:hidden pb-1">
            {NAV.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSection(item.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap border ${
                  section === item.id
                    ? 'bg-[#1d1d1f] text-white border-[#1d1d1f]'
                    : 'border-transparent bg-white/70'
                }`}
                style={section === item.id ? undefined : { color: 'var(--aa-muted)', borderColor: 'var(--aa-line)' }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <main className="px-5 sm:px-8 pb-10 pt-4">
          {children}
        </main>
      </div>
    </div>
  );
}

export { NAV, NAV_GROUPS };
