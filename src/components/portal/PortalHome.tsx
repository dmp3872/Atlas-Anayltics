import { Link } from 'react-router-dom';
import { ArrowRight, Package, FileText, ShoppingCart, Clock, TrendingUp, CheckCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Order } from '../../lib/types';
import { formatCurrency, formatDate, ORDER_STATUS_LABELS } from '../../lib/utils';

interface Props {
  orders: Order[];
  coaCount: number;
  loading: boolean;
}

export default function PortalHome({ orders, coaCount, loading }: Props) {
  const { profile } = useAuth();
  const firstName = profile?.full_name?.split(' ')[0] || 'there';
  const active = orders.filter(o => !['complete', 'cancelled'].includes(o.status));
  const totalSpent = orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0);

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="portal-page-title">Dashboard</h1>
        <p className="portal-page-subtitle">Welcome back, {firstName}. Here&apos;s your testing overview.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Active Orders', value: active.length, icon: Package },
          { label: 'Certificates', value: coaCount, icon: FileText },
          { label: 'In Pipeline', value: active.length, icon: Clock },
          { label: 'Total Invested', value: formatCurrency(totalSpent), icon: TrendingUp },
        ].map(s => (
          <div key={s.label} className="portal-stat-card">
            <s.icon size={18} className="text-brand-600 mb-2" strokeWidth={1.5} />
            <p className="text-2xl font-bold text-black tabular-nums">{loading ? '—' : s.value}</p>
            <p className="text-xs text-neutral-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {profile?.is_first_order && (
        <div className="card p-5 border-brand-300 bg-gradient-to-r from-brand-50 to-white flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CheckCircle size={22} className="text-brand-600" />
            <div>
              <p className="font-semibold text-black">50% off your first sample</p>
              <p className="text-sm text-neutral-600">Applied automatically at checkout.</p>
            </div>
          </div>
          <Link to="/order-new" className="btn-primary text-sm">Submit Sample</Link>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-black">Recent Orders</h2>
            <Link to="/dashboard/orders" className="text-xs font-medium text-brand-700 hover:underline">View all</Link>
          </div>
          {loading ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : orders.length === 0 ? (
            <p className="text-sm text-neutral-500 py-6 text-center">No orders yet. <Link to="/order-new" className="text-brand-700 font-medium">Submit your first sample</Link>.</p>
          ) : (
            <div className="space-y-2">
              {orders.slice(0, 4).map(o => (
                <Link key={o.id} to="/dashboard/orders" className="block p-3 rounded-lg border border-atlas-border hover:border-brand-300 hover:bg-brand-50/30 transition-colors">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-black">{o.order_number}</span>
                    <span className="font-semibold">{formatCurrency(o.total)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-neutral-500 mt-1">
                    <span>{formatDate(o.created_at)}</span>
                    <span className="uppercase font-semibold text-brand-700">{ORDER_STATUS_LABELS[o.status]}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <h2 className="font-semibold text-black mb-4">Quick Actions</h2>
          <div className="space-y-2">
            {[
              { href: '/order-new', icon: Package, label: 'Submit New Samples', sub: 'Order wizard · prepaid label included' },
              { href: '/dashboard/coas', icon: FileText, label: 'Your COAs', sub: 'Certificates of analysis' },
              { href: '/dashboard/orders', icon: ShoppingCart, label: 'Track Orders', sub: 'Expand orders for sample detail' },
            ].map(a => (
              <Link key={a.href} to={a.href} className="flex items-center gap-3 p-3 rounded-lg border border-atlas-border hover:border-brand-300 transition-colors group">
                <div className="w-9 h-9 rounded-lg bg-neutral-100 group-hover:bg-brand-50 flex items-center justify-center">
                  <a.icon size={17} className="text-neutral-600 group-hover:text-brand-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-black">{a.label}</p>
                  <p className="text-xs text-neutral-500">{a.sub}</p>
                </div>
                <ArrowRight size={14} className="text-neutral-300" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
