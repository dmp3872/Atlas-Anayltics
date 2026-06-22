import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FlaskConical, Menu, X, ChevronDown, LogOut, LayoutDashboard, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function Header() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  const navLinks = [
    { href: '/pricing', label: 'Pricing' },
    { href: '/verify', label: 'Verify COA' },
    { href: '/coa-library', label: 'COA Library' },
    { href: '/trust', label: 'Why Atlas' },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center group-hover:bg-brand-700 transition-colors">
              <FlaskConical className="w-4.5 h-4.5 text-white" size={18} />
            </div>
            <span className="font-bold text-slate-900 text-lg tracking-tight">Atlas</span>
            <span className="hidden sm:block text-xs font-medium text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">Analytics</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive(link.href)
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <div className="w-7 h-7 bg-brand-600 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs font-semibold">
                      {user.email?.[0].toUpperCase()}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-slate-700 max-w-[120px] truncate">{user.email}</span>
                  <ChevronDown size={14} className="text-slate-500" />
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-50">
                    <Link
                      to="/dashboard"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <LayoutDashboard size={15} />
                      Dashboard
                    </Link>
                    <Link
                      to="/account"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <User size={15} />
                      Account Settings
                    </Link>
                    <div className="border-t border-slate-100 my-1" />
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
                <Link to="/auth" className="btn-ghost text-sm">Sign In</Link>
                <Link to="/order" className="btn-primary text-sm">Submit Samples</Link>
              </>
            )}
          </div>

          <button
            className="md:hidden p-2 rounded-lg hover:bg-slate-100"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 py-4 space-y-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              onClick={() => setMobileOpen(false)}
              className={`block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive(link.href)
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {link.label}
            </Link>
          ))}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            {user ? (
              <>
                <Link to="/dashboard" onClick={() => setMobileOpen(false)} className="block px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-lg">Dashboard</Link>
                <button onClick={() => { signOut(); setMobileOpen(false); }} className="block w-full text-left px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg">Sign Out</button>
              </>
            ) : (
              <>
                <Link to="/auth" onClick={() => setMobileOpen(false)} className="btn-outline w-full text-sm">Sign In</Link>
                <Link to="/order" onClick={() => setMobileOpen(false)} className="btn-primary w-full text-sm">Submit Samples</Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
