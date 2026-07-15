import { supabase } from '../supabase';
import {
  Order, OrderSample, OrderStatus, OrderStatusHistoryEntry, PaymentStatus, SampleStatus,
} from '../types';
import { computeDueAt, normalizePaymentStatus, orderIsPayable } from '../utils';
import { notifyOrderUpdate } from '../notifications';

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
    accessionNumber: string;
    note?: string;
    changedBy?: string | null;
    vialCountConfirmed?: number;
  },
): Promise<{ error: Error | null; sample?: OrderSample; order?: Order }> {
  if (!orderIsPayable(order.payment_status)) {
    return { error: new Error('Order must be paid (or waived) before receiving samples.') };
  }
  const accession = opts.accessionNumber.trim();
  if (!accession) return { error: new Error('Accession number is required.') };

  const now = new Date().toISOString();
  const receivedAt = sample.received_at || now;
  const prevMeta =
    sample.metadata && typeof sample.metadata === 'object' ? sample.metadata : {};
  const samplePatch: Partial<OrderSample> = {
    status: 'received',
    accession_number: accession,
    // Preserve original intake time if already set (re-accession should not rewrite COA date).
    received_at: receivedAt,
    metadata: { ...prevMeta, received_at: receivedAt },
  };
  if (opts.vialCountConfirmed != null && opts.vialCountConfirmed > 0) {
    samplePatch.vial_count = opts.vialCountConfirmed;
  }

  const { data: updatedSample, error: sampleErr } = await supabase
    .from('order_samples')
    .update(samplePatch)
    .eq('id', sample.id)
    .select('*')
    .single();

  if (sampleErr) return { error: new Error(sampleErr.message) };

  await logOrderStatusChange(order.id, 'received', {
    fromStatus: sample.status,
    sampleId: sample.id,
    note: opts.note || `Accessioned as ${accession}`,
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
  const patch: Partial<OrderSample> = { status };
  if (status === 'received' && !sample.received_at) {
    patch.received_at = new Date().toISOString();
  }
  const { data, error } = await supabase
    .from('order_samples')
    .update(patch)
    .eq('id', sample.id)
    .select('*')
    .single();

  if (error) return { error: new Error(error.message) };

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
