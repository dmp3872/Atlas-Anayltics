import { useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import {
  LayoutDashboard, FileText, ShoppingCart, FlaskConical, Beaker,
  LogOut, Menu, X, Rocket, User, Key, HelpCircle, Plus, ClipboardList,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import AtlasLogo from '../brand/AtlasLogo';

const MAIN_NAV = [
  { tab: 'getting-started', href: '/dashboard?tab=getting-started', icon: Rocket, label: 'Getting Started' },
  { tab: 'home', href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { tab: 'coas', href: '/dashboard/coas', icon: FileText, label: 'Your COAs' },
  { tab: 'orders', href: '/dashboard/orders', icon: ShoppingCart, label: 'Your Orders' },
  { href: '/dashboard/submissions', icon: ClipboardList, label: 'Submissions', pathMatch: '/dashboard/submissions' },
  { tab: 'samples', href: '/dashboard?tab=samples', icon: FlaskConical, label: 'Samples' },
  { tab: 'peptide-requests', href: '/dashboard?tab=peptide-requests', icon: Beaker, label: 'Peptide Requests' },
];

const ACCOUNT_NAV = [
  { tab: 'account', href: '/dashboard?tab=account', icon: User, label: 'Account Details' },
  { href: '/dashboard/api', icon: Key, label: 'API Keys', pathMatch: '/dashboard/api' },
  { href: '/support', icon: HelpCircle, label: 'Support', pathMatch: '/support' },
];

function activeTab(location: ReturnType<typeof useLocation>, params: URLSearchParams): string {
  if (location.pathname.includes('/submissions')) return 'submissions';
  if (location.pathname.includes('/coas')) return 'coas';
  if (location.pathname.includes('/orders')) return 'orders';
  if (location.pathname.includes('/api')) return 'api';
  return params.get('tab') || 'home';
}

export default function ClientPortalLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, signOut } = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  const [open, setOpen] = useState(false);
  const current = activeTab(location, params);

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Client';

  const Sidebar = () => (
    <div className="flex flex-col h-full bg-white">
      <div className="px-5 py-5 border-b border-atlas-border">
        <AtlasLogo size="sm" />
        <p className="mt-3 text-sm font-semibold text-black truncate">{displayName}</p>
        <p className="text-xs text-neutral-500 truncate">{user?.email}</p>
      </div>

      <div className="p-4">
        <Link to="/order-new" onClick={() => setOpen(false)} className="btn-primary w-full text-sm gap-2 py-2.5">
          <Plus size={16} /> Submit Sample
        </Link>
      </div>

      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {MAIN_NAV.map(item => {
          const on = 'pathMatch' in item && item.pathMatch
            ? location.pathname.startsWith(item.pathMatch)
            : current === item.tab;
          return (
            <Link
              key={item.label}
              to={item.href}
              onClick={() => setOpen(false)}
              className={`portal-nav-item ${on ? 'portal-nav-item-active' : ''}`}
            >
              <item.icon size={17} />
              {item.label}
            </Link>
          );
        })}

        <p className="px-3 pt-5 pb-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">Account</p>
        {ACCOUNT_NAV.map(item => {
          const on = item.pathMatch
            ? location.pathname.startsWith(item.pathMatch)
            : current === item.tab;
          return (
            <Link
              key={item.label}
              to={item.href}
              onClick={() => setOpen(false)}
              className={`portal-nav-item ${on ? 'portal-nav-item-active' : ''}`}
            >
              <item.icon size={17} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-atlas-border">
        <button type="button" onClick={() => signOut()} className="portal-nav-item w-full text-red-600 hover:bg-red-50 hover:text-red-700">
          <LogOut size={17} /> Log Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-50 flex">
      <aside className="hidden lg:flex flex-col w-60 border-r border-atlas-border fixed inset-y-0 left-0 z-30">
        <Sidebar />
      </aside>

      {open && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="relative w-72 max-w-[85vw] h-full shadow-xl">
            <button type="button" onClick={() => setOpen(false)} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-neutral-100 z-10">
              <X size={18} />
            </button>
            <Sidebar />
          </aside>
        </div>
      )}

      <div className="flex-1 lg:ml-60 min-w-0">
        <header className="lg:hidden sticky top-0 z-20 bg-white border-b border-atlas-border px-4 py-3 flex items-center gap-3">
          <button type="button" onClick={() => setOpen(true)} className="p-2 rounded-lg hover:bg-neutral-100">
            <Menu size={20} />
          </button>
          <span className="font-semibold text-black text-sm">Client Portal</span>
        </header>
        <main className="portal-main">{children}</main>
      </div>
    </div>
  );
}
