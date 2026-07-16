import { useMemo, useState } from 'react';
import {
  AlertCircle, CheckCircle, Package, PackageCheck, DollarSign, Fingerprint,
} from 'lucide-react';
import { Order, OrderSample, UserProfile } from '../../lib/types';
import {
  ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, formatDateTime, normalizePaymentStatus, orderIsPayable,
} from '../../lib/utils';
import { markOrderPaid, markSampleReceived } from '../../lib/services/orderWorkflow';
import { useAuth } from '../../context/AuthContext';

interface Props {
  orders: Order[];
  samples: OrderSample[];
  clients: UserProfile[];
  onChanged: () => void;
}

type DeskFilter = 'needs_payment' | 'awaiting_shipment' | 'ready_to_receive' | 'all';

export default function ReceivingDesk({ orders, samples, clients, onChanged }: Props) {
  const { user } = useAuth();
  const [filter, setFilter] = useState<DeskFilter>('ready_to_receive');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteBySample, setNoteBySample] = useState<Record<string, string>>({});
  const [payNoteByOrder, setPayNoteByOrder] = useState<Record<string, string>>({});

  const clientName = (userId: string) => {
    const c = clients.find(x => x.id === userId);
    return c?.full_name || c?.company_name || userId.slice(0, 8);
  };

  const rows = useMemo(() => {
    const orderMap = new Map(orders.map(o => [o.id, o]));
    return samples
      .map(sample => {
        const order = orderMap.get(sample.order_id);
        if (!order || order.status === 'cancelled' || order.status === 'complete') return null;
        const paid = orderIsPayable(order.payment_status);
        const awaiting = sample.status === 'awaiting_sample';
        const needsPayment = !paid;
        const awaitingShipment = paid && awaiting;
        const readyToReceive = paid && awaiting;
        return { sample, order, needsPayment, awaitingShipment, readyToReceive };
      })
      .filter((r): r is NonNullable<typeof r> => !!r)
      .filter(r => {
        if (filter === 'needs_payment') return r.needsPayment;
        if (filter === 'awaiting_shipment') return r.awaitingShipment;
        if (filter === 'ready_to_receive') return r.readyToReceive;
        return r.needsPayment || r.awaitingShipment || r.sample.status === 'awaiting_sample';
      })
      .sort((a, b) => new Date(b.order.created_at).getTime() - new Date(a.order.created_at).getTime());
  }, [orders, samples, filter]);

  const counts = useMemo(() => {
    let needs_payment = 0;
    let awaiting_shipment = 0;
    for (const sample of samples) {
      const order = orders.find(o => o.id === sample.order_id);
      if (!order || order.status === 'cancelled' || order.status === 'complete') continue;
      const paid = orderIsPayable(order.payment_status);
      if (!paid) needs_payment += 1;
      else if (sample.status === 'awaiting_sample') awaiting_shipment += 1;
    }
    return { needs_payment, awaiting_shipment, ready_to_receive: awaiting_shipment };
  }, [orders, samples]);

  async function handleMarkPaid(order: Order, waived = false) {
    setBusyId(order.id);
    setMsg(null);
    const { error } = await markOrderPaid(order, {
      note: payNoteByOrder[order.id] || '',
      waived,
      changedBy: user?.id,
    });
    if (error) setMsg({ type: 'error', text: error.message });
    else {
      setMsg({ type: 'success', text: waived ? `Payment waived for ${order.order_number}.` : `Marked ${order.order_number} paid.` });
      onChanged();
    }
    setBusyId(null);
  }

  async function handleReceive(sample: OrderSample, order: Order) {
    setBusyId(sample.id);
    setMsg(null);
    const { error, sample: updated } = await markSampleReceived(sample, order, {
      note: noteBySample[sample.id] || '',
      changedBy: user?.id,
      vialCountConfirmed: sample.vial_count,
    });
    if (error) setMsg({ type: 'error', text: error.message });
    else {
      const code = updated?.accession_number?.trim();
      setMsg({
        type: 'success',
        text: code
          ? `Received ${sample.display_name || sample.sample_name} as ${code} — now in testing queue.`
          : `Received ${sample.display_name || sample.sample_name} — now in testing queue.`,
      });
      onChanged();
    }
    setBusyId(null);
  }

  const filters: { id: DeskFilter; label: string; count?: number }[] = [
    { id: 'ready_to_receive', label: 'Ready to receive', count: counts.ready_to_receive },
    { id: 'needs_payment', label: 'Needs payment', count: counts.needs_payment },
    { id: 'awaiting_shipment', label: 'Awaiting shipment', count: counts.awaiting_shipment },
    { id: 'all', label: 'All inbound' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-black flex items-center gap-2">
          <Package size={20} className="text-brand-500" /> Receiving desk
        </h2>
        <p className="text-sm text-neutral-500 mt-1">
          Confirm payment, then receive samples when the package arrives. Accession # is assigned automatically.
        </p>
      </div>

      {msg && (
        <div className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${
          msg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {msg.type === 'success' ? <CheckCircle size={16} className="flex-shrink-0 mt-0.5" /> : <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />}
          {msg.text}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {filters.map(f => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border ${
              filter === f.id ? 'bg-black text-white border-black' : 'border-atlas-border'
            }`}
          >
            {f.label}
            {f.count != null && f.count > 0 && (
              <span className="ml-1.5 opacity-80">({f.count})</span>
            )}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="card p-10 text-center text-neutral-500">
          <PackageCheck size={32} className="mx-auto text-neutral-300 mb-3" />
          <p className="font-medium text-black">Nothing in this view</p>
          <p className="text-sm mt-1">Inbound samples will appear here after clients place orders.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(({ sample, order, needsPayment, readyToReceive }) => {
            const payment = normalizePaymentStatus(order.payment_status);
            return (
              <article key={sample.id} className="card p-4 sm:p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-black">{sample.display_name || sample.sample_name}</p>
                    <p className="text-sm text-neutral-600 mt-0.5">
                      {order.company_name || '—'} · {order.order_number} · {clientName(order.user_id)}
                    </p>
                    <p className="text-xs text-neutral-500 mt-1">
                      Ordered {formatDateTime(order.created_at)} · {ORDER_STATUS_LABELS[order.status]} · {sample.vial_count} vial{sample.vial_count === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                      payment === 'paid' || payment === 'waived'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-amber-50 text-amber-900 border-amber-200'
                    }`}>
                      {PAYMENT_STATUS_LABELS[payment]}
                    </span>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border bg-neutral-50 text-neutral-600 border-atlas-border">
                      {sample.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>

                {needsPayment && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-2">
                    <p className="text-xs font-semibold text-amber-900 flex items-center gap-1">
                      <DollarSign size={12} /> Confirm payment before receiving
                    </p>
                    <input
                      value={payNoteByOrder[order.id] ?? ''}
                      onChange={e => setPayNoteByOrder(prev => ({ ...prev, [order.id]: e.target.value }))}
                      placeholder="Wire ref / crypto tx / invoice # (optional)"
                      className="input-field text-sm"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busyId === order.id}
                        onClick={() => handleMarkPaid(order, false)}
                        className="btn-primary text-xs py-1.5"
                      >
                        Mark paid
                      </button>
                      <button
                        type="button"
                        disabled={busyId === order.id}
                        onClick={() => handleMarkPaid(order, true)}
                        className="btn-outline text-xs py-1.5"
                      >
                        Waive payment
                      </button>
                    </div>
                  </div>
                )}

                {readyToReceive && (
                  <div className="rounded-lg border border-brand-200 bg-brand-50/40 p-3 space-y-2">
                    <p className="text-xs font-semibold text-brand-900 flex items-center gap-1">
                      <Fingerprint size={12} /> Receive into lab
                    </p>
                    <p className="text-[11px] text-brand-900/80">
                      Accession # will be auto-generated (e.g. 26-K7M4Q9) and used as the COA sample code.
                    </p>
                    <input
                      value={noteBySample[sample.id] ?? ''}
                      onChange={e => setNoteBySample(prev => ({ ...prev, [sample.id]: e.target.value }))}
                      placeholder="Receiving note (optional)"
                      className="input-field text-sm"
                    />
                    <button
                      type="button"
                      disabled={busyId === sample.id}
                      onClick={() => handleReceive(sample, order)}
                      className="btn-primary text-xs py-1.5 gap-1"
                    >
                      <PackageCheck size={12} /> Receive into lab
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
