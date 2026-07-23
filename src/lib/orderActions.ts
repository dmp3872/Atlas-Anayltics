import { supabase } from './supabase';

export interface OrderActionItem {
  id: string;
  order_id: string;
  sample_id: string | null;
  source_message_id: string | null;
  title: string;
  created_by: string;
  created_by_name: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolved_by_name: string;
  created_at: string;
}

export async function fetchOrderActionItems(orderId: string): Promise<OrderActionItem[]> {
  const { data, error } = await supabase
    .from('order_action_items')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as OrderActionItem[];
}

export async function createOrderActionItem(input: {
  orderId: string;
  title: string;
  createdBy: string;
  createdByName: string;
  sampleId?: string | null;
  sourceMessageId?: string | null;
}): Promise<OrderActionItem> {
  const title = input.title.trim();
  if (!title) throw new Error('Enter an action title.');
  const { data, error } = await supabase
    .from('order_action_items')
    .insert({
      order_id: input.orderId,
      sample_id: input.sampleId || null,
      source_message_id: input.sourceMessageId || null,
      title,
      created_by: input.createdBy,
      created_by_name: input.createdByName.trim() || 'Atlas Lab',
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as OrderActionItem;
}

export async function resolveOrderActionItem(input: {
  id: string;
  resolvedBy: string;
  resolvedByName: string;
}): Promise<OrderActionItem> {
  const { data, error } = await supabase
    .from('order_action_items')
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: input.resolvedBy,
      resolved_by_name: input.resolvedByName.trim() || 'Atlas Lab',
    })
    .eq('id', input.id)
    .select('*')
    .single();
  if (error) throw error;
  return data as OrderActionItem;
}

export async function reopenOrderActionItem(id: string): Promise<OrderActionItem> {
  const { data, error } = await supabase
    .from('order_action_items')
    .update({
      resolved_at: null,
      resolved_by: null,
      resolved_by_name: '',
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as OrderActionItem;
}

export function openActionCount(items: OrderActionItem[]): number {
  return items.filter(item => !item.resolved_at).length;
}
