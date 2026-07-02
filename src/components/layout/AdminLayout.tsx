import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, FlaskConical, LogOut, Menu, X, ChevronRight, ArrowLeft,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useUserRole } from '../../hooks/useUserRole';
import AtlasLogo from '../brand/AtlasLogo';

const navItems = [
  { href: '/admin', icon: LayoutDashboard, label: 'Submissions' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut, loading } = useAuth();
  const { isStaff } = useUserRole();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!isStaff) return <Navigate to="/dashboard" replace />;

  const isActive = (href: string) => location.pathname === href;

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <Link to="/admin" className="px-6 py-5 border-b border-atlas-border">
        <AtlasLogo size="sm" />
        <p className="text-xs text-brand-700 font-semibold mt-1 uppercase tracking-wider">Admin</p>
      </Link>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            onClick={() => setSidebarOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group ${
              isActive(item.href)
                ? 'bg-brand-50 text-brand-700'
                : 'text-neutral-600 hover:bg-neutral-100 hover:text-black'
            }`}
          >
            <item.icon size={17} className={isActive(item.href) ? 'text-brand-600' : 'text-neutral-400 group-hover:text-neutral-600'} />
            {item.label}
            {isActive(item.href) && <ChevronRight size={14} className="ml-auto text-brand-500" />}
          </Link>
        ))}
      </nav>

      <div className="px-3 pb-4 border-t border-atlas-border pt-3 space-y-2">
        <Link to="/dashboard" className="flex items-center gap-2 w-full px-3 py-2 text-sm text-neutral-600 hover:text-black rounded-lg hover:bg-neutral-100">
          <ArrowLeft size={15} /> Client portal
        </Link>
        <button
          onClick={signOut}
          className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm font-medium text-neutral-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          <LogOut size={15} /> Sign Out
        </button>
        <p className="text-xs text-neutral-500 truncate px-2">{user.email}</p>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-neutral-50">
      <aside className="hidden md:flex flex-col w-56 bg-white border-r border-atlas-border fixed inset-y-0 left-0 z-30">
        <SidebarContent />
      </aside>

      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="relative flex flex-col w-64 bg-white h-full shadow-xl">
            <button onClick={() => setSidebarOpen(false)} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-neutral-100">
              <X size={18} />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex-1 md:ml-56">
        <div className="md:hidden sticky top-0 z-20 bg-white border-b border-atlas-border px-4 py-3 flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg hover:bg-neutral-100">
            <Menu size={20} />
          </button>
          <span className="font-semibold text-black flex items-center gap-2">
            <FlaskConical size={16} className="text-brand-600" /> Admin
          </span>
        </div>
        <main className="p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
