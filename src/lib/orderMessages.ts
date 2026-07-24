import { supabase } from './supabase';
import type { UserRole } from './types';

export interface OrderMessage {
  id: string;
  order_id: string;
  author_id: string;
  author_role: 'client' | 'chemist' | 'admin';
  author_name: string;
  body: string;
  is_internal: boolean;
  created_at: string;
}

const MESSAGE_COLUMNS = 'id, order_id, author_id, author_role, author_name, body, is_internal, created_at';

function normalizeMessage(row: Record<string, unknown>): OrderMessage {
  return {
    id: String(row.id),
    order_id: String(row.order_id),
    author_id: String(row.author_id),
    author_role: row.author_role as OrderMessage['author_role'],
    author_name: String(row.author_name ?? ''),
    body: String(row.body ?? ''),
    is_internal: Boolean(row.is_internal),
    created_at: String(row.created_at),
  };
}

export async function fetchOrderMessages(orderId: string): Promise<OrderMessage[]> {
  const { data, error } = await supabase
    .from('order_messages')
    .select(MESSAGE_COLUMNS)
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });

  if (error) {
    // Fallback before is_internal migration is applied.
    if (/is_internal/i.test(error.message)) {
      const legacy = await supabase
        .from('order_messages')
        .select('id, order_id, author_id, author_role, author_name, body, created_at')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true });
      if (legacy.error) throw legacy.error;
      return (legacy.data ?? []).map(row => normalizeMessage({ ...row, is_internal: false }));
    }
    throw error;
  }

  return (data ?? []).map(row => normalizeMessage(row as Record<string, unknown>));
}

export async function sendOrderMessage(input: {
  orderId: string;
  authorId: string;
  authorRole: UserRole;
  authorName: string;
  body: string;
  /** Staff-only. Never visible to clients. */
  isInternal?: boolean;
}): Promise<OrderMessage> {
  const body = input.body.trim();
  if (!body) throw new Error('Enter a note before sending.');
  if (body.length > 2000) throw new Error('Notes must be 2,000 characters or fewer.');

  const role =
    input.authorRole === 'admin' || input.authorRole === 'chemist'
      ? input.authorRole
      : 'client';
  const isInternal = role === 'client' ? false : !!input.isInternal;

  const payload = {
    order_id: input.orderId,
    author_id: input.authorId,
    author_role: role,
    author_name: input.authorName.trim() || (role === 'client' ? 'Client' : 'Atlas Lab'),
    body,
    is_internal: isInternal,
  };

  const { data, error } = await supabase
    .from('order_messages')
    .insert(payload)
    .select(MESSAGE_COLUMNS)
    .single();

  if (error) {
    if (/is_internal/i.test(error.message) && !isInternal) {
      const { is_internal: _omit, ...legacyPayload } = payload;
      const legacy = await supabase
        .from('order_messages')
        .insert(legacyPayload)
        .select('id, order_id, author_id, author_role, author_name, body, created_at')
        .single();
      if (legacy.error) throw legacy.error;
      return normalizeMessage({ ...legacy.data, is_internal: false });
    }
    throw error;
  }

  return normalizeMessage(data as Record<string, unknown>);
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
