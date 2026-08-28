import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Menu, X, ChevronDown, LogOut, LayoutDashboard, User, ArrowRight,
  FlaskConical, Shield, Building2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import AtlasLogo from '../brand/AtlasLogo';
import { ROLE_LABELS, resolveUserRole, roleHome } from '../../lib/roles';
import type { UserRole } from '../../lib/types';

function workspaceLinks(role: UserRole): { href: string; label: string; icon: typeof LayoutDashboard }[] {
  switch (role) {
    case 'admin':
      return [
        { href: '/admin', label: 'Admin', icon: Shield },
        { href: '/lab', label: 'Lab', icon: FlaskConical },
        { href: '/dashboard', label: 'Client portal', icon: Building2 },
      ];
    case 'chemist':
      return [{ href: '/lab', label: 'Lab', icon: FlaskConical }];
    case 'verifier':
      // Isolated portal — no workspace switcher into Admin / Lab / Client.
      return [];
    case 'reviewer':
      return [];
    default:
      return [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }];
  }
}

export default function Header() {
  const { user, profile, signOut } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const role = resolveUserRole(profile, user?.email);
  const home = roleHome(role);
  const workspaces = workspaceLinks(role);
  const primaryHome = workspaces[0] ?? {
    href: home,
    label: ROLE_LABELS[role],
    icon: role === 'verifier' ? Shield : LayoutDashboard,
  };

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);

  const navLinks = [
    { href: '/pricing', label: 'Pricing' },
    { href: '/verify', label: 'Verify COA' },
    { href: '/coa-library', label: 'COA Library' },
    { href: '/trust', label: 'Why Atlas' },
  ];

  useEffect(() => {
    if (!mobileOpen) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <>
      <header className="sticky top-0 z-50 bg-black border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <Link to="/" onClick={() => setMobileOpen(false)} className="flex items-center shrink-0 h-full py-1">
              <AtlasLogo variant="light" size="header" />
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    isActive(link.href)
                      ? 'text-brand-400'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="hidden md:flex items-center gap-2">
              {user ? (
                <div className="relative">
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-900 transition-colors rounded-md"
                  >
                    <div className="w-7 h-7 bg-brand-500 rounded-full flex items-center justify-center">
                      <span className="text-black text-xs font-bold">
                        {user.email?.[0].toUpperCase()}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-neutral-300 max-w-[120px] truncate">{user.email}</span>
                    <ChevronDown size={14} className="text-neutral-500" />
                  </button>
                  {userMenuOpen && (
                    <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-atlas-border py-1 z-50">
                      <p className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                        {ROLE_LABELS[role]}
                      </p>
                      {workspaces.map(ws => (
                        <Link
                          key={ws.href}
                          to={ws.href}
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50"
                        >
                          <ws.icon size={15} />
                          {ws.label}
                        </Link>
                      ))}
                      {role === 'verifier' && (
                        <Link
                          to="/medical-director"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50"
                        >
                          <Shield size={15} />
                          Medical Director
                        </Link>
                      )}
                      {role !== 'verifier' && (
                        <Link
                          to="/account"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50"
                        >
                          <User size={15} />
                          Account Settings
                        </Link>
                      )}
                      <div className="border-t border-neutral-100 my-1" />
                      <button
                        onClick={() => { signOut(); setUserMenuOpen(false); }}
                        className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                      >
                        <LogOut size={15} />
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <Link to="/auth" className="text-sm font-medium text-neutral-400 hover:text-white px-3 py-2">Sign In</Link>
                  <Link to="/auth" state={{ from: '/order-new' }} className="btn-primary text-sm py-2">Submit Samples</Link>
                </>
              )}
            </div>

            <button
              type="button"
              className="md:hidden p-2 -mr-2 text-neutral-400 hover:text-white"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>
          </div>
        </div>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-[100] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 w-full max-w-sm bg-black border-l border-neutral-800 flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-4 h-20 border-b border-neutral-800 shrink-0">
              <AtlasLogo variant="light" size="header" />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="p-2 -mr-2 text-neutral-400 hover:text-white"
                aria-label="Close menu"
              >
                <X size={22} />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-4 py-2">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center justify-between py-4 border-b border-neutral-800/80 text-base font-medium transition-colors ${
                    isActive(link.href) ? 'text-brand-400' : 'text-white'
                  }`}
                >
                  <span className={isActive(link.href) ? 'border-l-2 border-brand-500 pl-3 -ml-px' : 'pl-3.5'}>
                    {link.label}
                  </span>
                  <ArrowRight size={16} className={isActive(link.href) ? 'text-brand-500' : 'text-neutral-600'} />
                </Link>
              ))}
            </nav>

            <div className="shrink-0 p-4 border-t border-neutral-800 space-y-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {user ? (
                <>
                  <Link
                    to={primaryHome.href}
                    onClick={() => setMobileOpen(false)}
                    className="btn-primary w-full justify-center text-sm"
                  >
                    {primaryHome.label}
                  </Link>
                  <button
                    type="button"
                    onClick={() => { signOut(); setMobileOpen(false); }}
                    className="btn-outline w-full justify-center text-sm border-neutral-700 text-neutral-300 hover:bg-neutral-900"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/order-new"
                    onClick={() => setMobileOpen(false)}
                    className="btn-primary w-full justify-center text-sm gap-2"
                  >
                    Submit Samples <ArrowRight size={16} />
                  </Link>
                  <Link
                    to="/auth"
                    onClick={() => setMobileOpen(false)}
                    className="btn-outline w-full justify-center text-sm border-neutral-700 text-neutral-300 hover:bg-neutral-900"
                  >
                    Sign In
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
