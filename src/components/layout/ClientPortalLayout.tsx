import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  LayoutDashboard, FileText, ShoppingCart, FlaskConical, Beaker,
  LogOut, Menu, X, Rocket, User, Key, HelpCircle, Plus,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import AtlasLogo from '../brand/AtlasLogo';

const MAIN_NAV = [
  { tab: 'getting-started', href: '/dashboard?tab=getting-started', icon: Rocket, label: 'Getting Started' },
  { tab: 'home', href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { tab: 'coas', href: '/dashboard/coas', icon: FileText, label: 'Your COAs' },
  { tab: 'orders', href: '/dashboard/orders', icon: ShoppingCart, label: 'Your Orders' },
  { tab: 'samples', href: '/dashboard?tab=samples', icon: FlaskConical, label: 'Samples' },
  { tab: 'peptide-requests', href: '/dashboard?tab=peptide-requests', icon: Beaker, label: 'Peptide Requests' },
];

const ACCOUNT_NAV = [
  { tab: 'account', href: '/dashboard?tab=account', icon: User, label: 'Account Details' },
  { href: '/dashboard/api', icon: Key, label: 'API Keys', pathMatch: '/dashboard/api' },
  { href: '/support', icon: HelpCircle, label: 'Support', pathMatch: '/support' },
];

function activeTab(location: ReturnType<typeof useLocation>, params: URLSearchParams): string {
  if (location.pathname.includes('/coas')) return 'coas';
  if (location.pathname.includes('/orders')) return 'orders';
  if (location.pathname.includes('/api')) return 'api';
  return params.get('tab') || 'home';
}

export default function ClientPortalLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const current = activeTab(location, params);

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Client';

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      navigate('/auth', { replace: true });
      setSigningOut(false);
    }
  }

  const Sidebar = () => (
    <div className="flex flex-col h-full aa-portal-aside">
      <div className="aa-portal-side-head">
        <AtlasLogo size="sm" />
        <p className="aa-portal-side-name truncate">{displayName}</p>
        <p className="aa-portal-side-email truncate">{user?.email}</p>
      </div>

      <div className="p-4">
        <Link to="/order-new" onClick={() => setOpen(false)} className="aa-btn-primary w-full text-sm gap-2 py-2.5">
          <Plus size={16} /> Submit Sample
        </Link>
      </div>

      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {MAIN_NAV.map(item => {
          const on = current === item.tab;
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

      <div className="p-3 border-t" style={{ borderColor: 'var(--aa-line)' }}>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          disabled={signingOut}
          className="portal-nav-item w-full text-red-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
        >
          <LogOut size={17} /> {signingOut ? 'Signing out…' : 'Log Out'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="aa-shell aa-portal flex">
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
            <Sidebar />
          </aside>
        </div>
      )}

      <div className="flex-1 lg:ml-60 min-w-0 relative z-[1]">
        <header className="lg:hidden aa-portal-mobile-bar px-4 py-3 flex items-center gap-3">
          <button type="button" onClick={() => setOpen(true)} className="p-2 rounded-xl hover:bg-black/5">
            <Menu size={20} />
          </button>
          <span className="font-semibold text-sm tracking-tight" style={{ color: 'var(--aa-ink)' }}>Client Portal</span>
        </header>
        <main className="portal-main">{children}</main>
      </div>
    </div>
  );
}
