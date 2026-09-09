import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Loader, MessageCircle, Send } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  LIVE_CHAT_STATUS_LABELS,
  LiveChatMessage,
  LiveChatThread,
  fetchChemistLiveChatThreads,
  fetchLiveChatMessages,
  isLiveChatSchemaMissing,
  normalizeLiveChatMessage,
  sendLiveChatMessage,
} from '../../lib/liveChat';
import { supabase } from '../../lib/supabase';
import { Order } from '../../lib/types';
import { formatDateTime } from '../../lib/utils';

interface Props {
  orders?: Order[];
}

/**
 * Chemist view of forwarded chats.
 * Chemists can only post staff-visibility notes — never visible to clients.
 */
export default function ChemistLiveChatPanel({ orders = [] }: Props) {
  const { user, profile } = useAuth();
  const [threads, setThreads] = useState<LiveChatThread[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const orderMap = useMemo(() => new Map(orders.map(o => [o.id, o])), [orders]);
  const selected = useMemo(
    () => threads.find(t => t.id === selectedId) ?? null,
    [threads, selectedId],
  );

  async function reload() {
    if (!user) return;
    try {
      setThreads(await fetchChemistLiveChatThreads(user.id));
      setError('');
    } catch (err) {
      setError(
        isLiveChatSchemaMissing(err)
          ? 'Apply the live_chat migration to enable forwarded chats.'
          : (err instanceof Error ? err.message : 'Could not load chats.'),
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [user?.id]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    void fetchLiveChatMessages(selectedId).then(rows => {
      if (!cancelled) setMessages(rows);
    });

    const channel = supabase
      .channel(`chemist-live-chat-${selectedId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'live_chat_messages', filter: `thread_id=eq.${selectedId}` },
        payload => {
          const incoming = normalizeLiveChatMessage(payload.new as Record<string, unknown>);
          setMessages(current =>
            current.some(m => m.id === incoming.id) ? current : [...current, incoming],
          );
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [selectedId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user || !selected || !draft.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      await sendLiveChatMessage({
        threadId: selected.id,
        authorId: user.id,
        authorRole: 'chemist',
        authorName: profile?.full_name || 'Chemist',
        visibility: 'staff',
        body: draft,
      });
      setDraft('');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send.');
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="card p-10 flex justify-center text-neutral-400">
        <Loader className="animate-spin" size={22} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="card p-4 bg-violet-50 border-violet-200 text-sm text-violet-950">
        <p className="font-semibold mb-1">Staff-only replies</p>
        <p>
          These chats were forwarded by admin. Your replies stay internal — clients never see chemist
          messages. Admin sends the final answer as Atlas Lab.
        </p>
      </div>

      {error && (
        <div className="card p-3 border-red-200 bg-red-50 text-sm text-red-800">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[18rem_1fr] gap-4 min-h-[24rem]">
        <div className="card overflow-hidden max-h-[60vh]">
          <div className="px-3 py-2.5 border-b border-atlas-border flex items-center gap-2">
            <MessageCircle size={15} />
            <p className="text-sm font-semibold">Assigned to you</p>
          </div>
          <div className="overflow-y-auto">
            {threads.length === 0 ? (
              <p className="text-sm text-neutral-500 p-6 text-center">No forwarded chats.</p>
            ) : (
              threads.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  className={`w-full text-left px-3 py-2.5 border-b border-atlas-border hover:bg-neutral-50 ${
                    t.id === selectedId ? 'bg-brand-50' : ''
                  }`}
                >
                  <p className="text-sm font-semibold font-mono">
                    {t.order_id ? orderMap.get(t.order_id)?.order_number || 'Order' : 'Chat'}
                  </p>
                  <p className="text-[10px] font-bold uppercase text-violet-800">
                    {LIVE_CHAT_STATUS_LABELS[t.status]}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="card flex flex-col max-h-[60vh] min-h-[24rem]">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-sm text-neutral-500">
              Select a forwarded chat.
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-atlas-border">
                <p className="font-semibold">
                  {selected.order_id
                    ? orderMap.get(selected.order_id)?.order_number || 'Order chat'
                    : 'Chat'}
                </p>
                <p className="text-xs text-neutral-500">Staff channel — not visible to client</p>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                {messages.map(m => (
                  <div
                    key={m.id}
                    className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                      m.visibility === 'staff'
                        ? 'bg-violet-50 border border-violet-200'
                        : 'bg-neutral-100'
                    }`}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5 text-neutral-500">
                      {m.visibility === 'staff' ? 'Staff · ' : 'Customer-visible · '}
                      {m.author_name || m.author_role}
                    </p>
                    {m.body}
                    <p className="text-[10px] text-neutral-400 mt-1">{formatDateTime(m.created_at)}</p>
                  </div>
                ))}
              </div>
              <form onSubmit={onSubmit} className="border-t border-atlas-border p-3 flex gap-2 bg-violet-50/40">
                <input
                  className="input-field text-sm py-2 flex-1"
                  placeholder="Staff-only reply for admin…"
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  disabled={sending}
                />
                <button type="submit" disabled={sending || !draft.trim()} className="btn-primary text-sm gap-1.5">
                  <Send size={14} /> Staff reply
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
