import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Package, FileText, ShoppingCart, Clock, TrendingUp, CheckCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { COA, Order, OrderSample } from '../../lib/types';
import { formatCurrency, formatDate, ORDER_STATUS_LABELS } from '../../lib/utils';
import { computeClientNeedsYou } from '../../lib/needsYou';
import NeedsYouStrip from '../shared/NeedsYouStrip';

interface Props {
  orders: Order[];
  samples: OrderSample[];
  coas: COA[];
  coaCount: number;
  loading: boolean;
}

export default function PortalHome({ orders, samples, coas, coaCount, loading }: Props) {
  const { profile } = useAuth();
  const firstName = profile?.full_name?.split(' ')[0] || 'there';
  const active = orders.filter(o => !['complete', 'cancelled'].includes(o.status));
  const totalSpent = orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const needsYou = useMemo(
    () => (loading ? [] : computeClientNeedsYou({ orders, samples, coas })),
    [loading, orders, samples, coas],
  );

  return (
    <div className="max-w-5xl space-y-7">
      <div className="aa-animate">
        <p className="aa-section-kicker" style={{ marginBottom: '0.35rem' }}>Client portal</p>
        <h1 className="aa-section-title" style={{ fontSize: 'clamp(1.85rem, 3vw, 2.35rem)' }}>
          {greeting}, {firstName}.
        </h1>
        <p className="portal-page-subtitle">Your testing overview — orders, certificates, and what needs you next.</p>
      </div>

      {!loading && (
        <div className="aa-animate" style={{ animationDelay: '60ms' }}>
          <NeedsYouStrip
            items={needsYou}
            emptyLabel="You're all caught up — nothing needs you right now."
          />
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 aa-animate" style={{ animationDelay: '100ms' }}>
        {[
          { label: 'Active Orders', value: active.length, icon: Package },
          { label: 'Certificates', value: coaCount, icon: FileText },
          { label: 'In Pipeline', value: active.length, icon: Clock },
          { label: 'Total Invested', value: formatCurrency(totalSpent), icon: TrendingUp },
        ].map(s => (
          <div key={s.label} className="portal-stat-card">
            <s.icon size={16} className="mb-2" style={{ color: 'var(--aa-gold)' }} strokeWidth={1.5} />
            <p className="text-2xl font-bold tabular-nums tracking-tight" style={{ color: 'var(--aa-ink)', letterSpacing: '-0.03em' }}>
              {loading ? '—' : s.value}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--aa-muted)' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {profile?.is_first_order && (
        <div className="aa-portal-panel aa-portal-panel-pad flex flex-wrap items-center justify-between gap-4 aa-animate" style={{ animationDelay: '120ms' }}>
          <div className="flex items-center gap-3">
            <CheckCircle size={20} style={{ color: 'var(--aa-gold)' }} />
            <div>
              <p className="font-semibold tracking-tight" style={{ color: 'var(--aa-ink)' }}>50% off your first sample</p>
              <p className="text-sm" style={{ color: 'var(--aa-muted)' }}>Applied automatically at checkout.</p>
            </div>
          </div>
          <Link to="/order-new" className="aa-btn-primary text-sm py-2.5 px-4">Submit Sample</Link>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-5 aa-animate" style={{ animationDelay: '140ms' }}>
        <div className="aa-portal-panel aa-portal-panel-pad">
          <div className="flex items-center justify-between mb-3">
            <h2 className="aa-portal-panel-title">Recent Orders</h2>
            <Link to="/dashboard/orders" className="text-xs font-semibold hover:underline" style={{ color: 'var(--aa-muted)' }}>
              View all
            </Link>
          </div>
          {loading ? (
            <p className="text-sm" style={{ color: 'var(--aa-muted)' }}>Loading…</p>
          ) : orders.length === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: 'var(--aa-muted)' }}>
              No orders yet.{' '}
              <Link to="/order-new" className="font-semibold" style={{ color: 'var(--aa-ink)' }}>Submit your first sample</Link>.
            </p>
          ) : (
            <div className="space-y-0.5">
              {orders.slice(0, 4).map(o => (
                <Link key={o.id} to="/dashboard/orders" className="aa-portal-row">
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold tracking-tight" style={{ color: 'var(--aa-ink)' }}>{o.order_number}</span>
                    <span className="font-semibold tabular-nums">{formatCurrency(o.total)}</span>
                  </div>
                  <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--aa-muted)' }}>
                    <span>{formatDate(o.created_at)}</span>
                    <span className="uppercase font-semibold tracking-wide" style={{ color: 'var(--aa-gold)' }}>
                      {ORDER_STATUS_LABELS[o.status]}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="aa-portal-panel aa-portal-panel-pad">
          <h2 className="aa-portal-panel-title mb-3">Quick Actions</h2>
          <div className="space-y-0.5">
            {[
              { href: '/order-new', icon: Package, label: 'Submit New Samples', sub: 'Order wizard · prepaid label included' },
              { href: '/dashboard/coas', icon: FileText, label: 'Your COAs', sub: 'Certificates of analysis' },
              { href: '/dashboard/orders', icon: ShoppingCart, label: 'Track Orders', sub: 'Expand orders for sample detail' },
            ].map(a => (
              <Link key={a.href} to={a.href} className="aa-portal-row flex items-center gap-3 group">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(0,0,0,0.04)' }}
                >
                  <a.icon size={16} style={{ color: 'var(--aa-muted)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold tracking-tight" style={{ color: 'var(--aa-ink)' }}>{a.label}</p>
                  <p className="text-xs" style={{ color: 'var(--aa-muted)' }}>{a.sub}</p>
                </div>
                <ArrowRight size={14} className="text-neutral-300 group-hover:text-neutral-500" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
