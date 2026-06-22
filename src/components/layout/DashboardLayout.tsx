import { useState } from 'react';
import { Link, useLocation, Navigate } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, FileText, Key, User, HelpCircle,
  FlaskConical, LogOut, Menu, X, ChevronRight
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Overview' },
  { href: '/dashboard/orders', icon: ShoppingCart, label: 'Orders' },
  { href: '/dashboard/coas', icon: FileText, label: 'My COAs' },
  { href: '/dashboard/api', icon: Key, label: 'API Keys' },
  { href: '/account', icon: User, label: 'Account' },
  { href: '/support', icon: HelpCircle, label: 'Support' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut, loading } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const isActive = (href: string) => location.pathname === href;

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <Link to="/" className="flex items-center gap-2.5 px-6 py-5 border-b border-slate-200">
        <div className="w-7 h-7 bg-brand-600 rounded-lg flex items-center justify-center">
          <FlaskConical size={15} className="text-white" />
        </div>
        <span className="font-bold text-slate-900">Atlas Analytics</span>
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
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <item.icon size={17} className={isActive(item.href) ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600'} />
            {item.label}
            {isActive(item.href) && <ChevronRight size={14} className="ml-auto text-brand-500" />}
          </Link>
        ))}
      </nav>

      <div className="px-3 pb-4 border-t border-slate-200 pt-3">
        <Link
          to="/order"
          className="flex items-center justify-center gap-2 w-full py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors mb-3"
        >
          <ShoppingCart size={15} />
          New Order
        </Link>
        <button
          onClick={signOut}
          className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          <LogOut size={15} />
          Sign Out
        </button>
        <div className="mt-3 px-2">
          <p className="text-xs text-slate-500 truncate">{user.email}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden md:flex flex-col w-56 bg-white border-r border-slate-200 fixed inset-y-0 left-0 z-30">
        <SidebarContent />
      </aside>

      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setSidebarOpen(false)} />
          <aside className="relative flex flex-col w-64 bg-white h-full shadow-xl">
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100"
            >
              <X size={18} />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex-1 md:ml-56">
        <div className="md:hidden sticky top-0 z-20 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg hover:bg-slate-100">
            <Menu size={20} />
          </button>
          <span className="font-semibold text-slate-900">Atlas Analytics</span>
        </div>
        <main className="p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
