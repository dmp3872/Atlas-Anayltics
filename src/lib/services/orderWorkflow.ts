import { supabase } from '../supabase';
import {
  Order, OrderSample, OrderStatus, OrderStatusHistoryEntry, PaymentStatus, SampleStatus,
} from '../types';
import { computeDueAt, normalizePaymentStatus, orderIsPayable } from '../utils';
import { notifyOrderUpdate } from '../notifications';
import { allocateUniqueAccessionNumber } from '../sampleCode';

function isMissingReceivedAtColumnError(message: string | undefined): boolean {
  return /received_at/i.test(message || '') && /schema cache|does not exist|could not find/i.test(message || '');
}

export const ORDER_ADMIN_NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  received: ['awaiting_sample', 'processing'],
  awaiting_sample: ['processing'],
  processing: ['analyzing'],
  analyzing: ['in_review'],
  in_review: ['complete'],
};

export async function logOrderStatusChange(
  orderId: string,
  toStatus: string,
  opts?: {
    fromStatus?: string | null;
    sampleId?: string | null;
    note?: string;
    changedBy?: string | null;
  },
): Promise<void> {
  const { error } = await supabase.from('order_status_history').insert({
    order_id: orderId,
    sample_id: opts?.sampleId ?? null,
    from_status: opts?.fromStatus ?? null,
    to_status: toStatus,
    changed_by: opts?.changedBy ?? null,
    note: opts?.note ?? '',
  });
  if (error) console.warn('order_status_history insert failed:', error.message);
}

export async function fetchOrderHistory(orderId: string): Promise<OrderStatusHistoryEntry[]> {
  const { data, error } = await supabase
    .from('order_status_history')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('fetchOrderHistory failed:', error.message);
    return [];
  }
  return (data ?? []) as OrderStatusHistoryEntry[];
}

export async function markOrderPaid(
  order: Order,
  opts: { note?: string; waived?: boolean; changedBy?: string | null },
): Promise<{ error: Error | null; order?: Order }> {
  const payment_status: PaymentStatus = opts.waived ? 'waived' : 'paid';
  const now = new Date().toISOString();
  const patch = {
    payment_status,
    paid_at: now,
    paid_by: opts.changedBy ?? null,
    payment_note: opts.note ?? '',
    updated_at: now,
    // Keep awaiting_sample if still waiting on physical package
    status: (order.status === 'received' ? 'awaiting_sample' : order.status) as OrderStatus,
  };

  const { data, error } = await supabase
    .from('orders')
    .update(patch)
    .eq('id', order.id)
    .select('*')
    .single();

  if (error) return { error: new Error(error.message) };

  await logOrderStatusChange(order.id, `payment:${payment_status}`, {
    fromStatus: order.payment_status ?? 'unpaid',
    note: opts.note || (opts.waived ? 'Payment waived' : 'Payment confirmed'),
    changedBy: opts.changedBy,
  });

  if (patch.status !== order.status) {
    await logOrderStatusChange(order.id, patch.status, {
      fromStatus: order.status,
      note: 'Moved to awaiting sample after payment',
      changedBy: opts.changedBy,
    });
  }

  await notifyOrderUpdate(order.user_id, order.order_number, opts.waived ? 'Payment waived' : 'Payment confirmed');
  return { error: null, order: data as Order };
}

export async function markSampleReceived(
  sample: OrderSample,
  order: Order,
  opts: {
    /** Optional override. When omitted/blank, a YY-XXXXXX code is auto-assigned. */
    accessionNumber?: string;
    /** Required — name of the person who physically received the sample. */
    receivedBy: string;
    note?: string;
    changedBy?: string | null;
    vialCountConfirmed?: number;
  },
): Promise<{ error: Error | null; sample?: OrderSample; order?: Order }> {
  if (!orderIsPayable(order.payment_status)) {
    return { error: new Error('Order must be paid (or waived) before receiving samples.') };
  }

  const receivedBy = (opts.receivedBy || '').trim();
  if (!receivedBy) {
    return { error: new Error('Received by name is required.') };
  }

  let accession = (opts.accessionNumber || sample.accession_number || '').trim();
  if (!accession) {
    try {
      accession = await allocateUniqueAccessionNumber(sample.created_at || new Date());
    } catch (err) {
      return {
        error: err instanceof Error ? err : new Error('Could not generate accession number.'),
      };
    }
  }

  const now = new Date().toISOString();
  // Prefer an existing physical intake stamp; otherwise this receive moment is the intake date.
  const receivedAt = sampleIntakeAt(sample) || now;
  const prevMeta =
    sample.metadata && typeof sample.metadata === 'object' ? sample.metadata : {};
  const samplePatch: Partial<OrderSample> = {
    status: 'received',
    accession_number: accession,
    // Preserve original intake time if already set (re-accession should not rewrite COA date).
    received_at: receivedAt,
    metadata: {
      ...prevMeta,
      received_at: receivedAt,
      sample_code: accession,
      received_by: receivedBy,
    },
  };
  if (opts.vialCountConfirmed != null && opts.vialCountConfirmed > 0) {
    samplePatch.vial_count = opts.vialCountConfirmed;
  }

  let { data: updatedSample, error: sampleErr } = await supabase
    .from('order_samples')
    .update(samplePatch)
    .eq('id', sample.id)
    .select('*')
    .single();

  // Migration 20260715221000 may not be applied yet — keep intake time in metadata only.
  if (sampleErr && isMissingReceivedAtColumnError(sampleErr.message)) {
    const { received_at: _drop, ...withoutCol } = samplePatch;
    const retry = await supabase
      .from('order_samples')
      .update(withoutCol)
      .eq('id', sample.id)
      .select('*')
      .single();
    updatedSample = retry.data;
    sampleErr = retry.error;
  }

  if (sampleErr) return { error: new Error(sampleErr.message) };

  // Keep linked COA "Received Date" in sync with physical intake.
  await syncCoaReceivedDateFromSample(sample.id, receivedAt);

  await logOrderStatusChange(order.id, 'received', {
    fromStatus: sample.status,
    sampleId: sample.id,
    note: opts.note
      ? `${opts.note} · Received by ${receivedBy}`
      : `Accessioned as ${accession} · Received by ${receivedBy}`,
    changedBy: opts.changedBy,
  });

  const orderPatch: Partial<Order> = { updated_at: now };
  if (!order.due_at) {
    orderPatch.due_at = computeDueAt(new Date(), !!order.rush_processing);
  }
  if (order.status === 'awaiting_sample' || order.status === 'received') {
    orderPatch.status = 'processing';
  }

  const { data: updatedOrder, error: orderErr } = await supabase
    .from('orders')
    .update(orderPatch)
    .eq('id', order.id)
    .select('*')
    .single();

  if (orderErr) return { error: new Error(orderErr.message) };

  if (orderPatch.status && orderPatch.status !== order.status) {
    await logOrderStatusChange(order.id, orderPatch.status, {
      fromStatus: order.status,
      sampleId: sample.id,
      note: 'First sample received — order in processing',
      changedBy: opts.changedBy,
    });
  }

  await notifyOrderUpdate(order.user_id, order.order_number, 'Sample received');
  return {
    error: null,
    sample: updatedSample as OrderSample,
    order: updatedOrder as Order,
  };
}

export async function setSampleStatus(
  sample: OrderSample,
  status: SampleStatus,
  opts?: { note?: string; changedBy?: string | null; order?: Order },
): Promise<{ error: Error | null; sample?: OrderSample }> {
  const now = new Date().toISOString();
  const patch: Partial<OrderSample> = { status };
  if (status === 'received' && !sampleIntakeAt(sample)) {
    patch.received_at = now;
    const prevMeta =
      sample.metadata && typeof sample.metadata === 'object' ? sample.metadata : {};
    patch.metadata = { ...prevMeta, received_at: now };
  }
  let { data, error } = await supabase
    .from('order_samples')
    .update(patch)
    .eq('id', sample.id)
    .select('*')
    .single();

  if (error && isMissingReceivedAtColumnError(error.message) && 'received_at' in patch) {
    const { received_at: _drop, ...withoutCol } = patch;
    const retry = await supabase
      .from('order_samples')
      .update(withoutCol)
      .eq('id', sample.id)
      .select('*')
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) return { error: new Error(error.message) };

  if (status === 'received') {
    const intake = sampleIntakeAt(data as OrderSample) || (patch.received_at as string | undefined) || new Date().toISOString();
    await syncCoaReceivedDateFromSample(sample.id, intake);
  }

  await logOrderStatusChange(sample.order_id, status, {
    fromStatus: sample.status,
    sampleId: sample.id,
    note: opts?.note,
    changedBy: opts?.changedBy,
  });

  if (opts?.order && (status === 'analyzing' || status === 'in_review')) {
    const orderStatus: OrderStatus = status === 'analyzing' ? 'analyzing' : 'in_review';
    if (opts.order.status !== 'complete' && opts.order.status !== 'cancelled') {
      await supabase
        .from('orders')
        .update({ status: orderStatus, updated_at: new Date().toISOString() })
        .eq('id', opts.order.id);
      if (opts.order.status !== orderStatus) {
        await logOrderStatusChange(opts.order.id, orderStatus, {
          fromStatus: opts.order.status,
          sampleId: sample.id,
          note: opts.note || `Sample moved to ${status}`,
          changedBy: opts.changedBy,
        });
        if (status === 'analyzing') {
          await notifyOrderUpdate(opts.order.user_id, opts.order.order_number, 'In testing');
        }
      }
    }
  }

  return { error: null, sample: data as OrderSample };
}

export function paymentLabel(status: unknown): string {
  return normalizePaymentStatus(status);
}


/** Push intake timestamp onto every COA linked to this sample (result_summary). */
async function syncCoaReceivedDateFromSample(sampleId: string, receivedAt: string): Promise<void> {
  const receivedDate = formatIntakeDate(receivedAt);
  const { data: rows, error } = await supabase
    .from('coas')
    .select('id, result_summary')
    .eq('sample_id', sampleId);
  if (error || !rows?.length) return;

  await Promise.all(rows.map(async (row) => {
    const summary =
      row.result_summary && typeof row.result_summary === 'object' && !Array.isArray(row.result_summary)
        ? { ...(row.result_summary as Record<string, unknown>) }
        : {};
    if (summary.received_at === receivedAt && summary.received_date === receivedDate) return;
    const { error: upErr } = await supabase
      .from('coas')
      .update({
        result_summary: {
          ...summary,
          received_at: receivedAt,
          received_date: receivedDate,
        },
      })
      .eq('id', row.id);
    if (upErr) console.warn('COA received-date sync failed:', upErr.message);
  }));
}

function formatIntakeDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** ISO timestamp when the sample was physically intaked / accessioned at the lab. */
export function sampleIntakeAt(
  sample: Pick<OrderSample, 'received_at' | 'status' | 'created_at' | 'metadata'> | null | undefined,
): string | null {
  if (!sample) return null;
  if (typeof sample.received_at === 'string' && sample.received_at.trim()) return sample.received_at;
  const meta = sample.metadata && typeof sample.metadata === 'object' ? sample.metadata : null;
  const metaAt = meta && typeof meta.received_at === 'string' ? meta.received_at.trim() : '';
  if (metaAt) return metaAt;
  // Already past awaiting_sample without a stamp — use created_at as best known intake time.
  if (sample.status && sample.status !== 'awaiting_sample' && sample.created_at) {
    return sample.created_at;
  }
  return null;
}

/** Name of the person who received / accessioned the sample at the lab. */
export function sampleReceivedBy(
  sample: Pick<OrderSample, 'metadata'> | null | undefined,
): string | null {
  if (!sample?.metadata || typeof sample.metadata !== 'object') return null;
  const name = sample.metadata.received_by;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
}
