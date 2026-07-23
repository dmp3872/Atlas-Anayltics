import { supabase } from './supabase';
import type { UserRole } from './types';

export interface OrderMessage {
  id: string;
  order_id: string;
  author_id: string;
  author_role: 'client' | 'chemist' | 'admin';
  author_name: string;
  body: string;
  created_at: string;
}

export async function fetchOrderMessages(orderId: string): Promise<OrderMessage[]> {
  const { data, error } = await supabase
    .from('order_messages')
    .select('id, order_id, author_id, author_role, author_name, body, created_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as OrderMessage[];
}

export async function sendOrderMessage(input: {
  orderId: string;
  authorId: string;
  authorRole: UserRole;
  authorName: string;
  body: string;
}): Promise<OrderMessage> {
  const body = input.body.trim();
  if (!body) throw new Error('Enter a note before sending.');
  if (body.length > 2000) throw new Error('Notes must be 2,000 characters or fewer.');

  const role =
    input.authorRole === 'admin' || input.authorRole === 'chemist'
      ? input.authorRole
      : 'client';
  const { data, error } = await supabase
    .from('order_messages')
    .insert({
      order_id: input.orderId,
      author_id: input.authorId,
      author_role: role,
      author_name: input.authorName.trim() || (role === 'client' ? 'Client' : 'Atlas Lab'),
      body,
    })
    .select('id, order_id, author_id, author_role, author_name, body, created_at')
    .single();
  if (error) throw error;
  return data as OrderMessage;
}

export async function fetchSeenCoaCelebrations(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('coa_celebration_seen')
    .select('coa_id')
    .eq('user_id', userId);
  if (error) throw error;
  return new Set((data ?? []).map(row => String(row.coa_id)));
}

export async function markCoaCelebrationSeen(userId: string, coaId: string): Promise<void> {
  const { error } = await supabase
    .from('coa_celebration_seen')
    .upsert({ user_id: userId, coa_id: coaId }, { onConflict: 'user_id,coa_id' });
  if (error) throw error;
}
