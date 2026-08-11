import { useMemo, useState } from 'react';
import {
  AlertCircle, CalendarClock, CheckCircle, ChevronDown, ChevronRight, Package, PackageCheck, DollarSign, Fingerprint,
} from 'lucide-react';
import { Order, OrderSample, UserProfile } from '../../lib/types';
import {
  ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, formatDateTime, normalizePaymentStatus, orderIsPayable,
} from '../../lib/utils';
import {
  defaultIntakeEtaDateValue, intakeEtaDateToIso, markOrderPaid, markSampleReceived,
} from '../../lib/services/orderWorkflow';
import { useAuth } from '../../context/AuthContext';
import PrintPackButton from './PrintPackButton';
import { LAB_PRINT_PACK_ENABLED } from '../../lib/labFeatures';
import { parseSampleMetadata } from '../../lib/coaPanels';
import { LABEL_CLAIM_UNITS } from '../../lib/orderCatalog';

interface Props {
  orders: Order[];
  samples: OrderSample[];
  clients: UserProfile[];
  onChanged: () => void;
}

type DeskFilter = 'needs_payment' | 'awaiting_shipment' | 'ready_to_receive' | 'all';

type DeskRow = {
  sample: OrderSample;
  order: Order;
  needsPayment: boolean;
  awaitingShipment: boolean;
  readyToReceive: boolean;
};

type OrderGroup = {
  order: Order;
  rows: DeskRow[];
  needsPayment: boolean;
  readyCount: number;
};

export default function ReceivingDesk({ orders, samples, clients, onChanged }: Props) {
  const { user, profile } = useAuth();
  const [filter, setFilter] = useState<DeskFilter>('ready_to_receive');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [receivedByBySample, setReceivedByBySample] = useState<Record<string, string>>({});
  const [noteBySample, setNoteBySample] = useState<Record<string, string>>({});
  const [etaBySample, setEtaBySample] = useState<Record<string, string>>({});
  const [claimBySample, setClaimBySample] = useState<Record<string, string>>({});
  const [claimUnitBySample, setClaimUnitBySample] = useState<Record<string, string>>({});
  const [payNoteByOrder, setPayNoteByOrder] = useState<Record<string, string>>({});
  /** Explicit expand/collapse overrides. Missing key = auto (open if 1 sample). */
  const [expandedByOrder, setExpandedByOrder] = useState<Record<string, boolean>>({});
  const [lastReceived, setLastReceived] = useState<{
    sample: OrderSample;
    order: Order;
    accession?: string | null;
    receivedBy: string;
  } | null>(null);
  const defaultReceivedBy = (profile?.full_name || '').trim();

  function receivedByFor(sampleId: string) {
    return (receivedByBySample[sampleId] ?? defaultReceivedBy).trim();
  }

  function etaFor(sample: OrderSample, order: Order) {
    return etaBySample[sample.id] ?? defaultIntakeEtaDateValue(order);
  }

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

  const groups = useMemo((): OrderGroup[] => {
    const byOrder = new Map<string, OrderGroup>();
    for (const row of rows) {
      let group = byOrder.get(row.order.id);
      if (!group) {
        group = {
          order: row.order,
          rows: [],
          needsPayment: row.needsPayment,
          readyCount: 0,
        };
        byOrder.set(row.order.id, group);
      }
      group.rows.push(row);
      if (row.needsPayment) group.needsPayment = true;
      if (row.readyToReceive) group.readyCount += 1;
    }
    return Array.from(byOrder.values());
  }, [rows]);

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

  function isExpanded(orderId: string, sampleCount: number) {
    if (orderId in expandedByOrder) return expandedByOrder[orderId];
    return sampleCount <= 1;
  }

  function toggleOrder(orderId: string, sampleCount: number) {
    setExpandedByOrder(prev => {
      const currentlyOpen = orderId in prev ? prev[orderId] : sampleCount <= 1;
      return { ...prev, [orderId]: !currentlyOpen };
    });
  }

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
    const receivedBy = receivedByFor(sample.id);
    if (!receivedBy) {
      setMsg({ type: 'error', text: 'Enter who received this sample before continuing.' });
      return;
    }
    const etaYmd = etaFor(sample, order);
    const estimatedReadyAt = intakeEtaDateToIso(etaYmd);
    if (!estimatedReadyAt) {
      setMsg({ type: 'error', text: 'Enter a valid ETA date before receiving.' });
      return;
    }
    const meta = parseSampleMetadata(sample.metadata);
    const claimFromOrder = (meta.labeled_content || '').trim();
    const labeledContent = (claimBySample[sample.id] ?? claimFromOrder).trim();
    const labelClaimUnit = (
      claimUnitBySample[sample.id]
      ?? meta.label_claim_unit
      ?? 'mg'
    ).trim() || 'mg';
    setBusyId(sample.id);
    setMsg(null);
    const { error, sample: updated } = await markSampleReceived(sample, order, {
      receivedBy,
      note: noteBySample[sample.id] || '',
      changedBy: user?.id,
      vialCountConfirmed: sample.vial_count,
      estimatedReadyAt,
      ...(labeledContent
        ? { labeledContent, labelClaimUnit }
        : {}),
    });
    if (error) setMsg({ type: 'error', text: error.message });
    else {
      const code = updated?.accession_number?.trim();
      const receivedSample = updated
        ? { ...sample, ...updated, accession_number: code || sample.accession_number }
        : sample;
      setLastReceived({
        sample: receivedSample,
        order,
        accession: code,
        receivedBy,
      });
      setMsg({
        type: 'success',
        text: code
          ? `Received ${sample.display_name || sample.sample_name} · LIMS ID ${code} (by ${receivedBy}) — ETA ${etaYmd}. Now in testing queue.`
          : `Received ${sample.display_name || sample.sample_name} (by ${receivedBy}) — ETA ${etaYmd}. Now in testing queue.`,
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
          Confirm payment, then receive samples when the package arrives. LIMS ID is assigned automatically.
          Multi-sample orders start collapsed — expand to receive each sample.
        </p>
      </div>

      {msg && (
        <div className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${
          msg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {msg.type === 'success' ? <CheckCircle size={16} className="flex-shrink-0 mt-0.5" /> : <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />}
          <div className="flex-1 space-y-2">
            <p>{msg.text}</p>
            {LAB_PRINT_PACK_ENABLED && msg.type === 'success' && lastReceived && (
              <PrintPackButton
                order={lastReceived.order}
                sample={lastReceived.sample}
                accession={lastReceived.accession}
                receivedBy={lastReceived.receivedBy}
              />
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {filters.map(f => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`filter-chip ${filter === f.id ? 'filter-chip-active' : ''}`}
          >
            {f.label}
            {f.count != null && f.count > 0 && (
              <span className="ml-1.5 opacity-80">({f.count})</span>
            )}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <div className="card p-10 text-center text-neutral-500">
          <PackageCheck size={32} className="mx-auto text-neutral-300 mb-3" />
          <p className="font-medium text-black">Nothing in this view</p>
          <p className="text-sm mt-1">Inbound samples will appear here after clients place orders.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(({ order, rows: orderRows, needsPayment, readyCount }) => {
            const payment = normalizePaymentStatus(order.payment_status);
            const open = isExpanded(order.id, orderRows.length);
            const sampleCount = orderRows.length;
            const company = (order.company_name || '').trim() || '—';

            return (
              <article key={order.id} className="card overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleOrder(order.id, sampleCount)}
                  className="w-full text-left px-4 py-3 sm:px-5 sm:py-3.5 flex items-start gap-3 hover:bg-neutral-50/80 transition-colors"
                  aria-expanded={open}
                >
                  <span className="mt-0.5 text-neutral-400 flex-shrink-0" aria-hidden>
                    {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 sm:gap-3">
                      <p className="font-bold text-black truncate text-[15px]">
                        {company}
                      </p>
                      <p className="font-mono text-sm font-semibold text-neutral-800 flex-shrink-0">
                        {order.order_number}
                      </p>
                    </div>
                    <p className="text-xs text-neutral-500 mt-1">
                      {clientName(order.user_id)}
                      {' · '}
                      {sampleCount} sample{sampleCount === 1 ? '' : 's'}
                      {readyCount > 0 ? ` · ${readyCount} ready` : ''}
                      {' · '}
                      Ordered {formatDateTime(order.created_at)}
                      {' · '}
                      {ORDER_STATUS_LABELS[order.status]}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 justify-end flex-shrink-0 pt-0.5">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                      payment === 'paid' || payment === 'waived'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-amber-50 text-amber-900 border-amber-200'
                    }`}>
                      {PAYMENT_STATUS_LABELS[payment]}
                    </span>
                  </div>
                </button>

                {open && (
                  <div className="border-t border-atlas-border px-4 py-3 sm:px-5 sm:py-4 space-y-3">
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
                          onClick={e => e.stopPropagation()}
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

                    <ul className="space-y-3">
                      {orderRows.map(({ sample, readyToReceive }) => {
                        const meta = parseSampleMetadata(sample.metadata);
                        const lot = (meta.batch_number || '').trim();
                        const claim = (meta.labeled_content || '').trim();
                        const claimUnit = (meta.label_claim_unit || '').trim() || 'mg';
                        return (
                        <li
                          key={sample.id}
                          className="rounded-lg border border-atlas-border bg-white p-3 space-y-2"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold text-black text-sm">
                                {sample.display_name || sample.sample_name}
                              </p>
                              <p className="text-xs text-neutral-600 mt-1">
                                <span className="font-semibold text-neutral-800">Lot</span>
                                {': '}
                                {lot ? (
                                  <span className="font-mono font-medium text-black">{lot}</span>
                                ) : (
                                  <span className="text-amber-700">Not provided</span>
                                )}
                                {claim ? (
                                  <>
                                    {' · '}
                                    <span className="text-neutral-500">Claim {claim}{claimUnit ? ` ${claimUnit}` : ''}</span>
                                  </>
                                ) : null}
                              </p>
                              <p className="text-xs text-neutral-500 mt-0.5">
                                {sample.vial_count} vial{sample.vial_count === 1 ? '' : 's'}
                                {sample.accession_number ? ` · ${sample.accession_number}` : ''}
                              </p>
                            </div>
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border bg-neutral-50 text-neutral-600 border-atlas-border self-start">
                              {sample.status.replace(/_/g, ' ')}
                            </span>
                          </div>

                          {readyToReceive && (
                            <div className="rounded-lg border border-brand-200 bg-brand-50/40 p-3 space-y-2">
                              <p className="text-xs font-semibold text-brand-900 flex items-center gap-1">
                                <Fingerprint size={12} /> Receive into lab
                              </p>
                              <p className="text-[11px] text-brand-900/80">
                                LIMS ID will be auto-generated (e.g. 2608-K7M4Q9) and used on the COA.
                                {lot ? <> Confirm package lot matches <strong className="font-mono">{lot}</strong>.</> : null}
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
                              <div>
                                <label className="text-[11px] font-semibold text-brand-900 flex items-center gap-1">
                                  <CalendarClock size={11} />
                                  ETA / ready by <span className="text-red-500">*</span>
                                </label>
                                <input
                                  type="date"
                                  value={etaFor(sample, order)}
                                  onChange={e => setEtaBySample(prev => ({ ...prev, [sample.id]: e.target.value }))}
                                  className="input-field text-sm mt-1"
                                  required
                                />
                                <p className="text-[10px] text-brand-900/70 mt-1">
                                  {order.rush_processing
                                    ? 'Defaults to rush TAT (3 days). Change for a custom client-visible date.'
                                    : 'Defaults to standard TAT (7 days). Change for a custom client-visible date.'}
                                </p>
                              </div>
                              <div>
                                <label className="text-[11px] font-semibold text-brand-900">
                                  Label claim {!claim ? <span className="text-amber-700 font-normal">(missing from order)</span> : null}
                                </label>
                                <div className="mt-1 flex gap-2">
                                  <input
                                    value={claimBySample[sample.id] ?? claim}
                                    onChange={e => setClaimBySample(prev => ({ ...prev, [sample.id]: e.target.value }))}
                                    placeholder="e.g. 10"
                                    inputMode="decimal"
                                    className="input-field text-sm flex-1"
                                  />
                                  <select
                                    value={claimUnitBySample[sample.id] ?? claimUnit}
                                    onChange={e => setClaimUnitBySample(prev => ({ ...prev, [sample.id]: e.target.value }))}
                                    className="input-field text-sm w-24"
                                  >
                                    {LABEL_CLAIM_UNITS.map(u => (
                                      <option key={u} value={u}>{u}</option>
                                    ))}
                                    {!(LABEL_CLAIM_UNITS as readonly string[]).includes(claimUnit) && claimUnit ? (
                                      <option value={claimUnit}>{claimUnit}</option>
                                    ) : null}
                                  </select>
                                </div>
                                <p className="text-[10px] text-brand-900/70 mt-1">
                                  Fill in if the client left claim blank — used on the COA Net Content specification.
                                </p>
                              </div>
                              <input
                                value={noteBySample[sample.id] ?? ''}
                                onChange={e => setNoteBySample(prev => ({ ...prev, [sample.id]: e.target.value }))}
                                placeholder="Receiving note (optional)"
                                className="input-field text-sm"
                              />
                              <button
                                type="button"
                                disabled={busyId === sample.id || !receivedByFor(sample.id) || !etaFor(sample, order)}
                                onClick={() => handleReceive(sample, order)}
                                className="btn-primary text-xs py-1.5 gap-1"
                              >
                                <PackageCheck size={12} /> Receive into lab
                              </button>
                            </div>
                          )}
                        </li>
                        );
                      })}
                    </ul>
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
