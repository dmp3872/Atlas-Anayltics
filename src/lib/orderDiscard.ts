import { supabase } from './supabase';
import { Order } from './types';

/** Orders still awaiting payment/shipment — safe for the client to permanently remove. */
export function canDiscardOrder(order: Pick<Order, 'status' | 'payment_status'>): boolean {
  if (order.status === 'cancelled' || order.status === 'complete') return false;
  if (order.status === 'received' || order.status === 'awaiting_sample') {
    // Don't allow discard once paid and samples may be in transit tracking
    return order.payment_status !== 'paid' && order.payment_status !== 'waived';
  }
  return false;
}

export async function discardOrder(orderId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('orders').delete().eq('id', orderId);
  return { error: error?.message ?? null };
}
