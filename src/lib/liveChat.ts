import { supabase } from './supabase';

export type LiveChatAuthorRole = 'client' | 'assistant' | 'chemist' | 'admin';
export type LiveChatVisibility = 'customer' | 'staff';
export type LiveChatThreadStatus =
  | 'waiting_admin'
  | 'waiting_chemist'
  | 'waiting_client'
  | 'closed';

export interface LiveChatThread {
  id: string;
  user_id: string;
  order_id: string | null;
  status: LiveChatThreadStatus;
  assigned_to: string | null;
  assigned_by: string | null;
  assigned_at: string | null;
  last_message_at: string;
  created_at: string;
  updated_at: string;
}

export interface LiveChatMessage {
  id: string;
  thread_id: string;
  author_id: string | null;
  author_role: LiveChatAuthorRole;
  author_name: string;
  body: string;
  visibility: LiveChatVisibility;
  created_at: string;
}

const THREAD_COLS =
  'id, user_id, order_id, status, assigned_to, assigned_by, assigned_at, last_message_at, created_at, updated_at';
const MSG_COLS =
  'id, thread_id, author_id, author_role, author_name, body, visibility, created_at';

function normalizeThread(row: Record<string, unknown>): LiveChatThread {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    order_id: row.order_id ? String(row.order_id) : null,
    status: (row.status as LiveChatThreadStatus) || 'waiting_admin',
    assigned_to: row.assigned_to ? String(row.assigned_to) : null,
    assigned_by: row.assigned_by ? String(row.assigned_by) : null,
    assigned_at: row.assigned_at ? String(row.assigned_at) : null,
    last_message_at: String(row.last_message_at),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function normalizeLiveChatMessage(row: Record<string, unknown>): LiveChatMessage {
  return {
    id: String(row.id),
    thread_id: String(row.thread_id),
    author_id: row.author_id ? String(row.author_id) : null,
    author_role: row.author_role as LiveChatAuthorRole,
    author_name: String(row.author_name ?? ''),
    body: String(row.body ?? ''),
    visibility: (row.visibility as LiveChatVisibility) || 'customer',
    created_at: String(row.created_at),
  };
}

export async function ensureLiveChatThread(input: {
  userId: string;
  orderId: string;
}): Promise<LiveChatThread> {
  const existing = await supabase
    .from('live_chat_threads')
    .select(THREAD_COLS)
    .eq('user_id', input.userId)
    .eq('order_id', input.orderId)
    .maybeSingle();

  if (existing.error) throw existing.error;
  if (existing.data) return normalizeThread(existing.data as unknown as Record<string, unknown>);

  const created = await supabase
    .from('live_chat_threads')
    .insert({
      user_id: input.userId,
      order_id: input.orderId,
      status: 'waiting_admin',
    })
    .select(THREAD_COLS)
    .single();

  if (created.error) {
    const again = await supabase
      .from('live_chat_threads')
      .select(THREAD_COLS)
      .eq('user_id', input.userId)
      .eq('order_id', input.orderId)
      .maybeSingle();
    if (again.error) throw created.error;
    if (again.data) return normalizeThread(again.data as unknown as Record<string, unknown>);
    throw created.error;
  }

  return normalizeThread(created.data as unknown as Record<string, unknown>);
}

export async function fetchLiveChatMessages(threadId: string): Promise<LiveChatMessage[]> {
  const { data, error } = await supabase
    .from('live_chat_messages')
    .select(MSG_COLS)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(row => normalizeLiveChatMessage(row as Record<string, unknown>));
}

async function touchThread(
  threadId: string,
  patch: Partial<{
    status: LiveChatThreadStatus;
    assigned_to: string | null;
    assigned_by: string | null;
    assigned_at: string | null;
  }>,
) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('live_chat_threads')
    .update({
      ...patch,
      updated_at: now,
      last_message_at: now,
    })
    .eq('id', threadId);
  if (error) throw error;
}

export async function sendLiveChatMessage(input: {
  threadId: string;
  authorId: string;
  authorRole: LiveChatAuthorRole;
  authorName: string;
  body: string;
  /** Admin only — chemists are forced to staff by DB trigger. */
  visibility?: LiveChatVisibility;
}): Promise<LiveChatMessage> {
  const body = input.body.trim();
  if (!body) throw new Error('Enter a message before sending.');
  if (body.length > 2000) throw new Error('Messages must be 2,000 characters or fewer.');

  let visibility: LiveChatVisibility = 'customer';
  if (input.authorRole === 'chemist') visibility = 'staff';
  else if (input.authorRole === 'admin') visibility = input.visibility ?? 'customer';
  else visibility = 'customer';

  const displayName =
    input.authorName.trim()
    || (input.authorRole === 'assistant'
      ? 'Atlas Assistant'
      : input.authorRole === 'admin' && visibility === 'customer'
        ? 'Atlas Lab'
        : input.authorRole === 'chemist'
          ? 'Chemist'
          : 'Client');

  const { data, error } = await supabase
    .from('live_chat_messages')
    .insert({
      thread_id: input.threadId,
      author_id: input.authorId,
      author_role: input.authorRole,
      author_name: displayName,
      body,
      visibility,
    })
    .select(MSG_COLS)
    .single();

  if (error) throw error;

  // Thread status/timestamps are maintained by live_chat_after_message trigger.
  return normalizeLiveChatMessage(data as Record<string, unknown>);
}

/** Admin: assign thread to a chemist (client never sees chemist identity). */
export async function forwardLiveChatToChemist(input: {
  threadId: string;
  adminId: string;
  adminName: string;
  chemistId: string;
  chemistName: string;
  note?: string;
}): Promise<void> {
  const now = new Date().toISOString();
  await touchThread(input.threadId, {
    assigned_to: input.chemistId,
    assigned_by: input.adminId,
    assigned_at: now,
    status: 'waiting_chemist',
  });

  const note = (input.note || '').trim();
  await sendLiveChatMessage({
    threadId: input.threadId,
    authorId: input.adminId,
    authorRole: 'admin',
    authorName: input.adminName || 'Admin',
    visibility: 'staff',
    body: note
      ? `Forwarded to ${input.chemistName} for lab input.\n\n${note}`
      : `Forwarded to ${input.chemistName} for lab input. Reply here (staff only) — the client will not see your message until an admin sends it.`,
  });
}

/** Admin: post a customer-visible reply (shown as Atlas Lab). */
export async function adminReplyToClient(input: {
  threadId: string;
  adminId: string;
  body: string;
}): Promise<LiveChatMessage> {
  return sendLiveChatMessage({
    threadId: input.threadId,
    authorId: input.adminId,
    authorRole: 'admin',
    authorName: 'Atlas Lab',
    visibility: 'customer',
    body: input.body,
  });
}

/** Admin: relay a chemist staff note to the client under Atlas Lab branding. */
export async function relayChemistNoteToClient(input: {
  threadId: string;
  adminId: string;
  chemistBody: string;
}): Promise<LiveChatMessage> {
  return adminReplyToClient({
    threadId: input.threadId,
    adminId: input.adminId,
    body: input.chemistBody.trim(),
  });
}

export async function fetchAdminLiveChatThreads(): Promise<LiveChatThread[]> {
  const { data, error } = await supabase
    .from('live_chat_threads')
    .select(THREAD_COLS)
    .order('last_message_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map(row => normalizeThread(row as unknown as Record<string, unknown>));
}

export async function fetchChemistLiveChatThreads(chemistId: string): Promise<LiveChatThread[]> {
  const { data, error } = await supabase
    .from('live_chat_threads')
    .select(THREAD_COLS)
    .eq('assigned_to', chemistId)
    .neq('status', 'closed')
    .order('last_message_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map(row => normalizeThread(row as unknown as Record<string, unknown>));
}

export function isLiveChatSchemaMissing(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /live_chat_threads|live_chat_messages|schema cache|relation .* does not exist/i.test(message);
}

export const LIVE_CHAT_STATUS_LABELS: Record<LiveChatThreadStatus, string> = {
  waiting_admin: 'Needs admin',
  waiting_chemist: 'With chemist',
  waiting_client: 'Awaiting client',
  closed: 'Closed',
};
