import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle, AlertTriangle, ArrowLeft, ArrowRight, CheckCircle, CheckCircle2, Clock,
  DollarSign, Fingerprint, Package, PackageCheck, Zap,
} from 'lucide-react';
import StaffHeader from '../../components/layout/StaffHeader';
import ActivityLog from '../../components/admin/ActivityLog';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  Order, OrderSample, OrderStatus, OrderStatusHistoryEntry,
} from '../../lib/types';
import {
  formatCurrency, formatDateTime, ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS, SAMPLE_STATUS_LABELS, normalizePaymentStatus, orderIsPayable,
} from '../../lib/utils';
import {
  ORDER_ADMIN_NEXT_STATUS, fetchOrderHistory, logOrderStatusChange, markOrderPaid, markSampleReceived,
  sampleReceivedBy,
} from '../../lib/services/orderWorkflow';
import OrderStatusPipeline from '../../components/order/OrderStatusPipeline';
import OrderNotesThread from '../../components/order/OrderNotesThread';

const ACTIVITY_LABELS: Record<string, string> = {
  ...ORDER_STATUS_LABELS,
  ...PAYMENT_STATUS_LABELS,
  ...SAMPLE_STATUS_LABELS,
}

export default function AdminOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [samples, setSamples] = useState<OrderSample[]>([]);
  const [history, setHistory] = useState<OrderStatusHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [payNote, setPayNote] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [receivedByBySample, setReceivedByBySample] = useState<Record<string, string>>({});
  const [receiveNoteBySample, setReceiveNoteBySample] = useState<Record<string, string>>({});
  const defaultReceivedBy = (profile?.full_name || '').trim();

  function receivedByFor(sampleId: string) {
    return (receivedByBySample[sampleId] ?? defaultReceivedBy).trim();
  }

  async function reload() {
    if (!id) return;
    const [orderRes, hist] = await Promise.all([
      supabase.from('orders').select('*, order_samples(*)').eq('id', id).single(),
      fetchOrderHistory(id),
    ]);
    if (orderRes.data) {
      const { order_samples, ...rest } = orderRes.data as Order & { order_samples?: OrderSample[] };
      setOrder(rest as Order);
      setSamples((order_samples ?? []).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
    } else {
      setOrder(null);
    }
    setHistory(hist);
  }

  useEffect(() => {
    setLoading(true);
    reload().finally(() => setLoading(false));
  }, [id]);

  const nextStatuses = useMemo(() => (order ? ORDER_ADMIN_NEXT_STATUS[order.status] ?? [] : []), [order]);
  const payment = normalizePaymentStatus(order?.payment_status);
  const paid = orderIsPayable(order?.payment_status);
  const overdue = !!order?.due_at
    && order.status !== 'complete' && order.status !== 'cancelled'
    && new Date(order.due_at).getTime() < Date.now();

  async function handleMarkPaid(waived: boolean) {
    if (!order) return;
    setActionLoading(true);
    setMsg(null);
    const { error } = await markOrderPaid(order, { note: payNote, waived, changedBy: user?.id });
    if (error) {
      setMsg({ type: 'error', text: error.message });
    } else {
      setMsg({ type: 'success', text: waived ? 'Payment waived.' : 'Payment confirmed.' });
      setPayNote('');
      await reload();
    }
    setActionLoading(false);
  }

  async function handleAdvanceStatus(newStatus: OrderStatus) {
    if (!order) return;
    setActionLoading(true);
    setMsg(null);
    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', order.id);
    if (error) {
      setMsg({ type: 'error', text: error.message });
    } else {
      await logOrderStatusChange(order.id, newStatus, {
        fromStatus: order.status,
        note: statusNote || `Status updated to ${ORDER_STATUS_LABELS[newStatus]}`,
        changedBy: user?.id,
      });
      setStatusNote('');
      setMsg({ type: 'success', text: `Order moved to ${ORDER_STATUS_LABELS[newStatus]}.` });
      await reload();
    }
    setActionLoading(false);
  }

  async function handleReceiveSample(sample: OrderSample) {
    if (!order) return;
    const receivedBy = receivedByFor(sample.id);
    if (!receivedBy) {
      setMsg({ type: 'error', text: 'Enter who received this sample before continuing.' });
      return;
    }
    setActionLoading(true);
    setMsg(null);
    const { error, sample: updated } = await markSampleReceived(sample, order, {
      receivedBy,
      note: receiveNoteBySample[sample.id] || '',
      changedBy: user?.id,
      vialCountConfirmed: sample.vial_count,
    });
    if (error) {
      setMsg({ type: 'error', text: error.message });
    } else {
      const code = updated?.accession_number?.trim();
      setMsg({
        type: 'success',
        text: code
          ? `${sample.display_name || sample.sample_name} received as ${code} (by ${receivedBy}).`
          : `${sample.display_name || sample.sample_name} received (by ${receivedBy}).`,
      });
      await reload();
    }
    setActionLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <StaffHeader title="Order Detail" />
        <div className="max-w-4xl mx-auto p-6">
          <div className="h-64 bg-neutral-100 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <StaffHeader title="Order Detail" />
        <div className="max-w-4xl mx-auto p-6">
          <button type="button" onClick={() => navigate('/admin')} className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-black mb-4">
            <ArrowLeft size={14} /> Back to admin
          </button>
          <div className="card p-8 text-center text-neutral-500">Order not found.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <StaffHeader title="Order Detail" />
      <div className="max-w-4xl mx-auto p-4 sm:p-6">
        <button type="button" onClick={() => navigate('/admin')} className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-black mb-4">
          <ArrowLeft size={14} /> Back to admin
        </button>

        {msg && (
          <div className={`flex items-start gap-2 p-3 rounded-lg border text-sm mb-4 ${
            msg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {msg.type === 'success' ? <CheckCircle size={16} className="flex-shrink-0 mt-0.5" /> : <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />}
            {msg.text}
          </div>
        )}

        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-black flex items-center gap-2">
              {order.order_number}
              {order.rush_processing && (
                <span className="flex items-center gap-1 text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200 font-semibold">
                  <Zap size={11} /> Rush
                </span>
              )}
            </h1>
            <p className="text-sm text-neutral-500">{order.company_name || '—'}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs font-bold uppercase px-2.5 py-1 rounded-full border bg-neutral-100 text-neutral-700 border-neutral-200">
              {ORDER_STATUS_LABELS[order.status]}
            </span>
            {order.due_at && (
              <span className={`text-xs flex items-center gap-1 ${overdue ? 'text-red-700 font-semibold' : 'text-neutral-500'}`}>
                {overdue ? <AlertTriangle size={11} /> : <Clock size={11} />}
                Due {formatDateTime(order.due_at)}
              </span>
            )}
          </div>
        </div>

        <div className="card p-5 mb-6 overflow-x-auto">
          <OrderStatusPipeline status={order.status} size="comfortable" />
        </div>

        {/* Payment */}
        <div className="card p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-black">Payment</h2>
            <span className={`text-[11px] font-bold uppercase px-2.5 py-1 rounded-full border flex items-center gap-1 ${
              paid ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-900 border-amber-200'
            }`}>
              {paid && <CheckCircle2 size={11} />}
              {PAYMENT_STATUS_LABELS[payment]}
            </span>
          </div>
          {order.paid_at && (
            <p className="text-xs text-neutral-500 mb-3">
              {payment === 'waived' ? 'Waived' : 'Paid'} {formatDateTime(order.paid_at)}
              {order.payment_note && <> · {order.payment_note}</>}
            </p>
          )}
          {!paid && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-900 flex items-center gap-1">
                <DollarSign size={12} /> Confirm payment or waive it
              </p>
              <input
                value={payNote}
                onChange={e => setPayNote(e.target.value)}
                placeholder="Wire ref / crypto tx / invoice # (optional)"
                className="input-field text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleMarkPaid(false)}
                  className="btn-primary text-sm py-1.5"
                >
                  Mark Paid
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleMarkPaid(true)}
                  className="btn-outline text-sm py-1.5"
                >
                  Waive Payment
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Status actions */}
        {order.status !== 'complete' && order.status !== 'cancelled' && (
          <div className="card p-6 mb-6">
            <h2 className="font-semibold text-black mb-4">Update Status</h2>
            <textarea
              className="input-field min-h-[60px] mb-3 text-sm"
              placeholder="Optional note for activity log…"
              value={statusNote}
              onChange={e => setStatusNote(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              {nextStatuses.map(status => (
                <button
                  key={status}
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleAdvanceStatus(status)}
                  className="btn-primary text-sm"
                >
                  <ArrowRight size={14} /> {ORDER_STATUS_LABELS[status]}
                </button>
              ))}
              {nextStatuses.length === 0 && (
                <p className="text-sm text-neutral-500">
                  {order.status === 'awaiting_sample'
                    ? 'Receive at least one sample below to advance this order.'
                    : 'No further manual transitions from this status.'}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Samples */}
        <div className="card p-6 mb-6 space-y-4">
          <h2 className="font-semibold text-black">Samples ({samples.length})</h2>
          {samples.length === 0 ? (
            <p className="text-sm text-neutral-500">No samples on this order yet.</p>
          ) : (
            samples.map(sample => {
              const canReceive = sample.status === 'awaiting_sample';
              const receivedByName = sampleReceivedBy(sample);
              return (
                <div key={sample.id} className="border border-atlas-border rounded-xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-black flex items-center gap-1.5">
                        <Package size={14} className="text-brand-600 flex-shrink-0" />
                        {sample.display_name || sample.sample_name}
                      </p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {sample.vial_count} vial{sample.vial_count === 1 ? '' : 's'}
                        {sample.accession_number && <> · Accession {sample.accession_number}</>}
                        {receivedByName && <> · Received by {receivedByName}</>}
                      </p>
                    </div>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border bg-neutral-100 text-neutral-600 border-neutral-200 flex-shrink-0">
                      {SAMPLE_STATUS_LABELS[sample.status]}
                    </span>
                  </div>

                  {canReceive && (
                    <div className="rounded-lg border border-brand-200 bg-brand-50/40 p-3 space-y-2">
                      <p className="text-xs font-semibold text-brand-900 flex items-center gap-1">
                        <Fingerprint size={12} /> Receive into lab
                      </p>
                      {!paid && (
                        <p className="text-xs text-amber-700">Order must be paid or waived before this sample can be received.</p>
                      )}
                      <p className="text-[11px] text-brand-900/80">
                        Accession # is auto-generated (YY-XXXXXX) and becomes the COA sample code.
                      </p>
                      <div>
                        <label className="text-[11px] font-semibold text-brand-900">
                          Received by <span className="text-red-500">*</span>
                        </label>
                        <input
                          value={receivedByBySample[sample.id] ?? defaultReceivedBy}
                          onChange={e => setReceivedByBySample(prev => ({ ...prev, [sample.id]: e.target.value }))}
                          placeholder="Full name of person receiving"
                          className="input-field text-sm mt-1"
                          autoComplete="name"
                          required
                        />
                      </div>
                      <input
                        value={receiveNoteBySample[sample.id] ?? ''}
                        onChange={e => setReceiveNoteBySample(prev => ({ ...prev, [sample.id]: e.target.value }))}
                        placeholder="Receiving note (optional)"
                        className="input-field text-sm"
                      />
                      <button
                        type="button"
                        disabled={actionLoading || !paid || !receivedByFor(sample.id)}
                        onClick={() => handleReceiveSample(sample)}
                        className="btn-primary text-xs py-1.5 gap-1"
                      >
                        <PackageCheck size={12} /> Receive into lab
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="mb-6">
          <OrderNotesThread orderId={order.id} />
        </div>

        <div className="card p-6">
          <h2 className="font-semibold text-black mb-4">Activity Log</h2>
          <ActivityLog entries={history} labels={ACTIVITY_LABELS} />
        </div>

        <div className="card p-6 mt-6">
          <h2 className="font-semibold text-black mb-3">Order Summary</h2>
          <div className="text-sm text-neutral-600 space-y-1">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatCurrency(order.subtotal)}</span>
            </div>
            {order.discount_amount > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Discount</span>
                <span>−{formatCurrency(order.discount_amount)}</span>
              </div>
            )}
            {order.rush_fee > 0 && (
              <div className="flex justify-between text-purple-700">
                <span>Rush fee</span>
                <span>+{formatCurrency(order.rush_fee)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-black text-sm pt-1 border-t border-atlas-border mt-1">
              <span>Total</span>
              <span>{formatCurrency(order.total)}</span>
            </div>
          </div>
          {order.notes && (
            <p className="text-xs text-neutral-500 mt-3 border-t border-atlas-border pt-3">{order.notes}</p>
          )}
        </div>
      </div>
    </div>
  );
}
