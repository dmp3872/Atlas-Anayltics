import { useEffect, useState } from 'react';
import {
  AlertTriangle, CalendarClock, CheckCircle2, Clock, Loader, X, Zap,
} from 'lucide-react';
import ActivityLog from '../admin/ActivityLog';
import OrderActionChecklist from '../order/OrderActionChecklist';
import OrderEtaEditor from '../order/OrderEtaEditor';
import OrderNotesThread from '../order/OrderNotesThread';
import { notifyOrderEtaUpdated } from '../../lib/notifications';
import { fetchOrderHistory } from '../../lib/services/orderWorkflow';
import { supabase } from '../../lib/supabase';
import { Order, OrderSample, OrderStatusHistoryEntry } from '../../lib/types';
import {
  formatDate, normalizePaymentStatus, ORDER_STATUS_LABELS,
  orderIsPayable, PAYMENT_STATUS_LABELS, SAMPLE_STATUS_LABELS,
} from '../../lib/utils';

const ACTIVITY_LABELS: Record<string, string> = {
  ...ORDER_STATUS_LABELS,
  ...PAYMENT_STATUS_LABELS,
  ...SAMPLE_STATUS_LABELS,
};

interface Props {
  orderId: string;
  onClose: () => void;
  /** Keep Lab queue state in sync after ETA edits. */
  onOrderUpdated?: (order: Order) => void;
}

export default function ChemistOrderBriefDrawer({ orderId, onClose, onOrderUpdated }: Props) {
  const [order, setOrder] = useState<Order | null>(null);
  const [samples, setSamples] = useState<OrderSample[]>([]);
  const [history, setHistory] = useState<OrderStatusHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [etaSaving, setEtaSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [orderRes, hist] = await Promise.all([
          supabase.from('orders').select('*, order_samples(*)').eq('id', orderId).single(),
          fetchOrderHistory(orderId),
        ]);
        if (cancelled) return;
        if (orderRes.error || !orderRes.data) {
          setError(orderRes.error?.message || 'Order not found.');
          setOrder(null);
          setSamples([]);
          setHistory([]);
          return;
        }
        const { order_samples, ...rest } = orderRes.data as Order & { order_samples?: OrderSample[] };
        setOrder(rest as Order);
        setSamples(
          (order_samples ?? []).sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
          ),
        );
        setHistory(hist);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load order.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [orderId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSaveEta(iso: string | null) {
    if (!order) return;
    setEtaSaving(true);
    setError('');
    try {
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          estimated_ready_at: iso,
          due_at: iso ?? order.due_at ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id);
      if (updateError) {
        setError(updateError.message);
        return;
      }
      const next = {
        ...order,
        estimated_ready_at: iso,
        due_at: iso ?? order.due_at,
      };
      setOrder(next);
      onOrderUpdated?.(next);
      if (iso) {
        await notifyOrderEtaUpdated(order.user_id, order.order_number, formatDate(iso));
      }
    } finally {
      setEtaSaving(false);
    }
  }

  const payment = normalizePaymentStatus(order?.payment_status);
  const paid = orderIsPayable(order?.payment_status);
  const overdue = !!(order?.estimated_ready_at || order?.due_at)
    && order?.status !== 'complete' && order?.status !== 'cancelled'
    && new Date(order.estimated_ready_at || order.due_at || '').getTime() < Date.now();

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/30"
        aria-label="Close order brief"
        onClick={onClose}
      />
      <aside
        className="relative w-full max-w-md h-full bg-neutral-50 border-l border-atlas-border shadow-xl overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chemist-order-brief-title"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 px-4 py-3 bg-white border-b border-atlas-border">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Order brief</p>
            <h2 id="chemist-order-brief-title" className="font-bold text-black truncate">
              {order?.order_number || 'Loading…'}
            </h2>
            {order && (
              <p className="text-xs text-neutral-500 truncate">{order.company_name || '—'}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-outline p-1.5 shrink-0"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-400">
              <Loader size={16} className="animate-spin" /> Loading order…
            </div>
          )}

          {!loading && error && !order && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {!loading && order && (
            <>
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                {order.rush_processing && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                    <Zap size={10} /> Rush
                  </span>
                )}
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border bg-neutral-100 text-neutral-700 border-neutral-200">
                  {ORDER_STATUS_LABELS[order.status]}
                </span>
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                  paid
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-amber-50 text-amber-900 border-amber-200'
                }`}>
                  {paid && <CheckCircle2 size={10} />}
                  {PAYMENT_STATUS_LABELS[payment]}
                </span>
                {(order.estimated_ready_at || order.due_at) && (
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                    overdue
                      ? 'bg-red-50 text-red-800 border-red-200'
                      : 'bg-neutral-50 text-neutral-600 border-atlas-border'
                  }`}>
                    {overdue ? <AlertTriangle size={10} /> : <Clock size={10} />}
                    Ready {formatDate(order.estimated_ready_at || order.due_at || '')}
                  </span>
                )}
              </div>

              {order.notes?.trim() && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800 mb-1">
                    Checkout note
                  </p>
                  <p className="text-sm text-amber-950 whitespace-pre-wrap">{order.notes.trim()}</p>
                </div>
              )}

              <OrderEtaEditor
                compact
                estimatedReadyAt={order.estimated_ready_at}
                dueAt={order.due_at}
                saving={etaSaving}
                onSave={handleSaveEta}
              />

              <div className="rounded-lg border border-atlas-border bg-white p-3 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1">
                  <CalendarClock size={11} /> Samples
                </p>
                {samples.length === 0 ? (
                  <p className="text-xs text-neutral-400">No samples on this order.</p>
                ) : (
                  <ul className="space-y-2">
                    {samples.map(sample => (
                      <li key={sample.id} className="text-xs text-neutral-700">
                        <span className="font-semibold text-black">
                          {sample.display_name || sample.sample_name}
                        </span>
                        {sample.accession_number ? (
                          <span className="font-mono text-neutral-500"> · LIMS {sample.accession_number}</span>
                        ) : null}
                        <span className="text-neutral-500">
                          {' · '}{SAMPLE_STATUS_LABELS[sample.status]}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <OrderActionChecklist orderId={order.id} compact />
              <OrderNotesThread orderId={order.id} allowActions compact />

              <div className="rounded-lg border border-atlas-border bg-white p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-2">
                  Recent activity
                </p>
                <ActivityLog entries={history.slice(0, 12)} labels={ACTIVITY_LABELS} />
              </div>

              <p className="text-[11px] text-neutral-400 pb-4">
                Payment and admin status tools stay in Admin. Chemists can update ETA, notes, and checklist here.
              </p>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
