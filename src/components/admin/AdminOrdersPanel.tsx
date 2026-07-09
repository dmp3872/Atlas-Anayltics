import { useMemo, useState } from 'react';
import { AlertTriangle, Zap } from 'lucide-react';
import { COA, Order, OrderSample, LabPriority } from '../../lib/types';
import { formatDateTime, ORDER_STATUS_LABELS } from '../../lib/utils';
import {
  LAB_PRIORITIES, LAB_PRIORITY_LABELS, LAB_PRIORITY_STYLES, normalizeLabPriority,
} from '../../lib/labQueue';
import { matchCoaForSample } from '../../lib/coaPanels';

interface Props {
  orders: Order[];
  samples?: OrderSample[];
  coas?: COA[];
  savingOrderId?: string | null;
  onSetPriority: (orderId: string, priority: LabPriority) => void;
}

interface OrderQueueStats {
  sampleCount: number;
  pendingCount: number;
  oldestPendingHours: number;
}

export default function AdminOrdersPanel({ orders, samples = [], coas = [], savingOrderId, onSetPriority }: Props) {
  const [filter, setFilter] = useState<'active' | 'all' | 'urgent' | 'rush'>('active');
  const [search, setSearch] = useState('');

  const statsByOrder = useMemo(() => {
    const map = new Map<string, OrderQueueStats>();
    for (const sample of samples) {
      const stats = map.get(sample.order_id) ?? { sampleCount: 0, pendingCount: 0, oldestPendingHours: 0 };
      stats.sampleCount += 1;
      const hasCoa = !!matchCoaForSample(sample, coas);
      const isPending = sample.status !== 'complete' && !hasCoa;
      if (isPending) {
        const ageHours = Math.max(0, (Date.now() - new Date(sample.created_at).getTime()) / (1000 * 60 * 60));
        stats.pendingCount += 1;
        stats.oldestPendingHours = Math.max(stats.oldestPendingHours, ageHours);
      }
      map.set(sample.order_id, stats);
    }
    return map;
  }, [samples, coas]);

  const filtered = useMemo(() => {
    let list = [...orders];
    if (filter === 'active') list = list.filter(o => o.status !== 'complete' && o.status !== 'cancelled');
    if (filter === 'urgent') list = list.filter(o => normalizeLabPriority(o.lab_priority) === 'urgent');
    if (filter === 'rush') list = list.filter(o => o.rush_processing);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(o =>
        o.order_number.toLowerCase().includes(q)
        || (o.company_name ?? '').toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [orders, filter, search]);

  const agingOrders = useMemo(() => {
    return orders
      .filter(o => o.status !== 'complete' && o.status !== 'cancelled')
      .map(o => ({ order: o, stats: statsByOrder.get(o.id) }))
      .filter((row): row is { order: Order; stats: OrderQueueStats } => !!row.stats && row.stats.pendingCount > 0)
      .sort((a, b) => b.stats.oldestPendingHours - a.stats.oldestPendingHours)
      .slice(0, 5);
  }, [orders, statsByOrder]);

  return (
    <div className="space-y-4">
      {agingOrders.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={15} className="text-amber-500" />
            <h3 className="font-bold text-sm text-black">Aging queue — needs priority review</h3>
          </div>
          <div className="space-y-2">
            {agingOrders.map(({ order, stats }) => {
              const priority = normalizeLabPriority(order.lab_priority);
              return (
                <div
                  key={order.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-atlas-border bg-neutral-50"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-black">
                      {order.order_number}
                      <span className="text-neutral-500 font-normal"> · {order.company_name || '—'}</span>
                    </p>
                    <p className="text-xs text-neutral-500">
                      {stats.pendingCount} sample{stats.pendingCount === 1 ? '' : 's'} pending · waiting {Math.round(stats.oldestPendingHours)}h
                      {order.rush_processing && <span className="text-purple-700 font-semibold"> · Rush</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      disabled={savingOrderId === order.id || priority === 'urgent'}
                      onClick={() => onSetPriority(order.id, 'urgent')}
                      className="px-2.5 py-1 text-[11px] font-bold uppercase rounded-md border bg-red-50 text-red-800 border-red-200 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Urgent
                    </button>
                    <button
                      type="button"
                      disabled={savingOrderId === order.id || priority === 'high'}
                      onClick={() => onSetPriority(order.id, 'high')}
                      className="px-2.5 py-1 text-[11px] font-bold uppercase rounded-md border bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      High
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-neutral-600">
          Set order priority here — chemists see a numbered, color-coded queue in the Lab Console. Rush orders auto-start as High.
        </p>
        <div className="flex flex-wrap gap-2">
          {(['active', 'urgent', 'rush', 'all'] as const).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border capitalize ${
                filter === f ? 'bg-black text-white border-black' : 'border-atlas-border'
              }`}
            >
              {f === 'active' ? 'Active' : f}
            </button>
          ))}
        </div>
      </div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search order # or company…"
        className="input-field max-w-md"
      />

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="coa-table-header">
                <th className="text-left px-5 py-3">Order</th>
                <th className="text-left px-5 py-3">Company</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-left px-5 py-3">Rush</th>
                <th className="text-left px-5 py-3">Samples</th>
                <th className="text-left px-5 py-3">Pending</th>
                <th className="text-left px-5 py-3">Priority</th>
                <th className="text-left px-5 py-3">Total</th>
                <th className="text-left px-5 py-3">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-atlas-border">
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-5 py-8 text-center text-neutral-500">No orders match this filter.</td></tr>
              ) : filtered.map(order => {
                const priority = normalizeLabPriority(order.lab_priority);
                const styles = LAB_PRIORITY_STYLES[priority];
                const stats = statsByOrder.get(order.id);
                return (
                  <tr key={order.id} className={`hover:bg-neutral-50 ${styles.bg}`}>
                    <td className="px-5 py-3 font-semibold text-black">{order.order_number}</td>
                    <td className="px-5 py-3 text-neutral-600">{order.company_name || '—'}</td>
                    <td className="px-5 py-3 text-neutral-600">{ORDER_STATUS_LABELS[order.status]}</td>
                    <td className="px-5 py-3">
                      {order.rush_processing ? (
                        <span className="text-[10px] font-bold uppercase text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200 flex items-center gap-0.5 w-fit">
                          <Zap size={10} /> Yes
                        </span>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-neutral-600 tabular-nums">{stats?.sampleCount ?? 0}</td>
                    <td className="px-5 py-3 tabular-nums">
                      {stats && stats.pendingCount > 0 ? (
                        <span className="text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                          {stats.pendingCount}
                        </span>
                      ) : (
                        <span className="text-neutral-400">0</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <select
                        value={priority}
                        disabled={savingOrderId === order.id}
                        onChange={e => onSetPriority(order.id, e.target.value as LabPriority)}
                        className={`input-field py-1.5 text-xs w-auto font-semibold ${styles.badge}`}
                      >
                        {LAB_PRIORITIES.map(p => (
                          <option key={p} value={p}>{LAB_PRIORITY_LABELS[p]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-3 tabular-nums">${order.total?.toFixed(2) ?? '0.00'}</td>
                    <td className="px-5 py-3 text-xs text-neutral-500 whitespace-nowrap">{formatDateTime(order.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
