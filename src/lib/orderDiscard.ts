import { supabase } from './supabase';
import { Order } from './types';

/** Orders still awaiting lab intake — safe for the client to permanently remove. */
export function canDiscardOrder(order: Pick<Order, 'status'>): boolean {
  return order.status === 'received';
}

export async function discardOrder(orderId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('orders').delete().eq('id', orderId);
  return { error: error?.message ?? null };
}
