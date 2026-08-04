import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Mail, Phone, Shield } from 'lucide-react';
import { Order, UserProfile } from '../../lib/types';
import { formatCurrency, formatDate, ORDER_STATUS_LABELS } from '../../lib/utils';
import { orderLabPriority, LAB_PRIORITY_LABELS, LAB_PRIORITY_STYLES } from '../../lib/labQueue';

interface Props {
  users: UserProfile[];
  orders: Order[];
}

interface ClientRow {
  profile: UserProfile;
  orders: Order[];
  activeCount: number;
  totalSpend: number;
  lastOrderAt: string | null;
}

/** Light client CRM — accounts, order history, shipping enrollment. */
export default function AdminClientsPanel({ users, orders }: Props) {
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const clients = useMemo(() => {
    const byUser = new Map<string, Order[]>();
    for (const order of orders) {
      const list = byUser.get(order.user_id) ?? [];
      list.push(order);
      byUser.set(order.user_id, list);
    }

    const rows: ClientRow[] = users
      .filter(u => (u.role ?? 'client') === 'client')
      .map(profile => {
        const clientOrders = (byUser.get(profile.id) ?? [])
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        const activeCount = clientOrders.filter(o => o.status !== 'complete' && o.status !== 'cancelled').length;
        const totalSpend = clientOrders.reduce((sum, o) => sum + (o.total || 0), 0);
        return {
          profile,
          orders: clientOrders,
          activeCount,
          totalSpend,
          lastOrderAt: clientOrders[0]?.created_at ?? null,
        };
      })
      .sort((a, b) => {
        if (a.activeCount !== b.activeCount) return b.activeCount - a.activeCount;
        return (b.lastOrderAt ? Date.parse(b.lastOrderAt) : 0) - (a.lastOrderAt ? Date.parse(a.lastOrderAt) : 0);
      });

    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(row => {
      const p = row.profile;
      return (
        (p.full_name || '').toLowerCase().includes(q)
        || (p.company_name || '').toLowerCase().includes(q)
        || (p.phone || '').toLowerCase().includes(q)
        || row.orders.some(o => o.order_number.toLowerCase().includes(q))
      );
    });
  }, [users, orders, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-neutral-600">
          Client accounts with order history, spend, and shipping enrollment.
        </p>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, company, phone, or order…"
          className="input-field max-w-md"
        />
      </div>

      <div className="space-y-2">
        {clients.length === 0 ? (
          <div className="card p-8 text-center text-sm text-neutral-500">No clients match this search.</div>
        ) : clients.map(row => {
          const open = expandedId === row.profile.id;
          const p = row.profile;
          return (
            <div key={p.id} className="card overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedId(open ? null : p.id)}
                className="w-full text-left px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-neutral-50/80"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-black truncate flex items-center gap-2">
                    <Building2 size={14} className="text-brand-600 flex-shrink-0" />
                    {p.company_name || p.full_name || 'Client'}
                  </p>
                  <p className="text-xs text-neutral-500 mt-0.5 truncate">
                    {p.full_name || '—'}
                    {p.phone ? ` · ${p.phone}` : ''}
                    {p.shipping_preboarded ? ' · RFID preboarded' : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 text-xs flex-shrink-0">
                  <span className="tabular-nums">
                    <span className="text-neutral-400">Orders </span>
                    <span className="font-bold text-black">{row.orders.length}</span>
                  </span>
                  <span className="tabular-nums">
                    <span className="text-neutral-400">Active </span>
                    <span className={`font-bold ${row.activeCount ? 'text-amber-800' : 'text-black'}`}>{row.activeCount}</span>
                  </span>
                  <span className="tabular-nums">
                    <span className="text-neutral-400">Spend </span>
                    <span className="font-bold text-black">{formatCurrency(row.totalSpend)}</span>
                  </span>
                </div>
              </button>

              {open && (
                <div className="border-t border-atlas-border px-5 py-4 space-y-3 bg-neutral-50/40">
                  <div className="flex flex-wrap gap-4 text-xs text-neutral-600">
                    {p.phone && (
                      <span className="inline-flex items-center gap-1"><Phone size={11} /> {p.phone}</span>
                    )}
                    {(p.address_line1 || p.city) && (
                      <span>
                        {[p.address_line1, p.city, p.state, p.zip].filter(Boolean).join(', ')}
                      </span>
                    )}
                    {p.shipping_preboarded && (
                      <span className="inline-flex items-center gap-1 text-brand-700 font-semibold">
                        <Shield size={11} /> UPS / RFID preboarded
                      </span>
                    )}
                    {p.website && (
                      <span className="inline-flex items-center gap-1"><Mail size={11} /> {p.website}</span>
                    )}
                  </div>

                  {row.orders.length === 0 ? (
                    <p className="text-sm text-neutral-500">No orders yet.</p>
                  ) : (
                    <div className="divide-y divide-atlas-border rounded-lg border border-atlas-border bg-white overflow-hidden">
                      {row.orders.slice(0, 12).map(order => {
                        const priority = orderLabPriority(order);
                        const styles = LAB_PRIORITY_STYLES[priority];
                        return (
                          <div key={order.id} className="flex items-center gap-3 px-3 py-2.5">
                            <span className={`w-1.5 self-stretch rounded-full ${styles.banner}`} />
                            <div className="min-w-0 flex-1">
                              <Link
                                to={`/admin/orders/${order.id}`}
                                className="font-mono text-sm font-semibold text-brand-700 hover:underline"
                              >
                                {order.order_number}
                              </Link>
                              <p className="text-[11px] text-neutral-500">
                                {ORDER_STATUS_LABELS[order.status]} · {LAB_PRIORITY_LABELS[priority]}
                                {order.rush_processing ? ' · Rush' : ''} · {formatDate(order.created_at)}
                              </p>
                            </div>
                            <span className="text-sm font-semibold tabular-nums flex-shrink-0">
                              {formatCurrency(order.total || 0)}
                            </span>
                          </div>
                        );
                      })}
                      {row.orders.length > 12 && (
                        <p className="px-3 py-2 text-xs text-neutral-500 text-center">
                          +{row.orders.length - 12} older orders
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
