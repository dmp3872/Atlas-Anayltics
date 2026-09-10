import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, Loader, MessageCircle, Search, Send, Sparkles, X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { resolveEtaAt } from '../../lib/etaHeat';
import {
  faqChipsForOrder,
  handoffReply,
  matchAutoreply,
} from '../../lib/liveChatAutoreply';
import {
  ensureLiveChatThread,
  fetchLiveChatMessages,
  isLiveChatSchemaMissing,
  LiveChatMessage,
  normalizeLiveChatMessage,
  sendLiveChatMessage,
} from '../../lib/liveChat';
import { resolveUserRole } from '../../lib/roles';
import { supabase } from '../../lib/supabase';
import { Order } from '../../lib/types';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STEPS,
  formatDate,
  formatDateTime,
  getStatusStep,
} from '../../lib/utils';

type EphemeralBubble = {
  id: string;
  role: 'assistant' | 'client';
  body: string;
  created_at: string;
};

function StageStrip({ status }: { status: Order['status'] }) {
  const current = getStatusStep(status);
  if (status === 'cancelled') {
    return <p className="text-xs text-red-700 font-medium">Cancelled</p>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {ORDER_STATUS_STEPS.map((step, i) => {
        const done = i < current;
        const active = i === current || (status === 'received' && i === 0);
        return (
          <span
            key={step}
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
              done
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : active
                  ? 'bg-brand-50 border-brand-300 text-brand-900'
                  : 'bg-neutral-50 border-neutral-200 text-neutral-400'
            }`}
          >
            {ORDER_STATUS_LABELS[step]}
          </span>
        );
      })}
    </div>
  );
}

export default function LiveChatWidget() {
  const { user, profile, loading: authLoading } = useAuth();
  const role = resolveUserRole(profile, user?.email);
  const [open, setOpen] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  /** FAQ chat when no order is selected (not persisted). */
  const [ephemeral, setEphemeral] = useState<EphemeralBubble[]>([]);
  const [draft, setDraft] = useState('');
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => orders.find(o => o.id === selectedOrderId) ?? null,
    [orders, selectedOrderId],
  );

  const filteredOrders = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(o =>
      o.order_number.toLowerCase().includes(q)
      || (o.company_name || '').toLowerCase().includes(q)
      || ORDER_STATUS_LABELS[o.status].toLowerCase().includes(q),
    );
  }, [orders, filter]);

  const chips = useMemo(() => faqChipsForOrder(selected), [selected]);
  const showWidget = !authLoading && !!user && role === 'client';

  useEffect(() => {
    if (!showWidget || !user || !open) return;
    let cancelled = false;
    setOrdersLoading(true);
    void supabase
      .from('orders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) setError(err.message);
        else setOrders((data as Order[]) ?? []);
        setOrdersLoading(false);
      });
    return () => { cancelled = true; };
  }, [showWidget, user, open]);

  useEffect(() => {
    if (!selectedOrderId || !user) {
      setThreadId(null);
      setMessages([]);
      return;
    }

    let cancelled = false;
    setThreadLoading(true);
    setError('');

    void (async () => {
      try {
        const thread = await ensureLiveChatThread({ userId: user.id, orderId: selectedOrderId });
        if (cancelled) return;
        setThreadId(thread.id);
        const rows = await fetchLiveChatMessages(thread.id);
        if (cancelled) return;
        setMessages(rows);
      } catch (err) {
        if (cancelled) return;
        setError(
          isLiveChatSchemaMissing(err)
            ? 'Live chat needs the latest database migration (live_chat tables).'
            : (err instanceof Error ? err.message : 'Could not open chat.'),
        );
      } finally {
        if (!cancelled) setThreadLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedOrderId, user]);

  useEffect(() => {
    if (!threadId) return;

    const channel = supabase
      .channel(`live-chat-widget-${threadId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'live_chat_messages', filter: `thread_id=eq.${threadId}` },
        payload => {
          const incoming = normalizeLiveChatMessage(payload.new as Record<string, unknown>);
          setMessages(current =>
            current.some(m => m.id === incoming.id) ? current : [...current, incoming],
          );
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [threadId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages.length, ephemeral.length, selectedOrderId, open]);

  async function handleSend(raw: string) {
    const text = raw.trim();
    if (!text || sending || !user) return;

    setSending(true);
    setError('');
    setDraft('');

    const faqHit = matchAutoreply(text, selected);
    const auto = faqHit ?? handoffReply(selected);

    // No order selected → ephemeral FAQ only (never order notes)
    if (!selected) {
      setEphemeral(prev => [
        ...prev,
        { id: `c-${Date.now()}`, role: 'client', body: text, created_at: new Date().toISOString() },
      ]);
      window.setTimeout(() => {
        setEphemeral(prev => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            body: auto.body,
            created_at: new Date().toISOString(),
          },
        ]);
        setSending(false);
      }, 280);
      return;
    }

    try {
      const thread = threadId
        ? { id: threadId }
        : await ensureLiveChatThread({ userId: user.id, orderId: selected.id });
      if (!threadId) setThreadId(thread.id);

      const clientName = profile?.full_name || user.email || 'Client';

      const savedClient = await sendLiveChatMessage({
        threadId: thread.id,
        authorId: user.id,
        authorRole: 'client',
        authorName: clientName,
        body: text,
      });
      setMessages(current =>
        current.some(m => m.id === savedClient.id) ? current : [...current, savedClient],
      );

      window.setTimeout(() => {
        void sendLiveChatMessage({
          threadId: thread.id,
          authorId: user.id,
          authorRole: 'assistant',
          authorName: 'Atlas Assistant',
          body: auto.body,
        }).then(saved => {
          setMessages(current =>
            current.some(m => m.id === saved.id) ? current : [...current, saved],
          );
        }).catch(() => {
          setMessages(current => [
            ...current,
            {
              id: `local-a-${Date.now()}`,
              thread_id: thread.id,
              author_id: user.id,
              author_role: 'assistant',
              author_name: 'Atlas Assistant',
              body: auto.body,
              created_at: new Date().toISOString(),
            },
          ]);
        }).finally(() => setSending(false));
      }, 280);
    } catch (err) {
      setError(
        isLiveChatSchemaMissing(err)
          ? 'Live chat needs the latest database migration (live_chat tables).'
          : (err instanceof Error ? err.message : 'Could not send message.'),
      );
      setDraft(text);
      setSending(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void handleSend(draft);
  }

  if (!showWidget) return null;

  const eta = selected ? resolveEtaAt(selected) : null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-3 no-print">
      {open && (
        <div className="w-[min(100vw-1.5rem,24rem)] h-[min(70vh,34rem)] bg-white border border-atlas-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <header className="shrink-0 bg-black text-white px-4 py-3 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <MessageCircle size={15} className="text-brand-400" />
                Lab chat
              </p>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Messages go to admin · filter by order #
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800"
              aria-label="Close chat"
            >
              <X size={16} />
            </button>
          </header>

          {!selectedOrderId ? (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="p-3 border-b border-atlas-border">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    className="input-field pl-8 text-sm py-2"
                    placeholder="Look up order number…"
                    autoFocus
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {ordersLoading ? (
                  <div className="flex justify-center py-8 text-neutral-400">
                    <Loader size={18} className="animate-spin" />
                  </div>
                ) : filteredOrders.length === 0 ? (
                  <p className="text-sm text-neutral-500 text-center py-8 px-4">
                    {orders.length === 0
                      ? 'No orders yet. You can still ask FAQs below.'
                      : 'No orders match that number.'}
                  </p>
                ) : (
                  filteredOrders.map(order => {
                    const ready = resolveEtaAt(order);
                    return (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => {
                          setSelectedOrderId(order.id);
                          setEphemeral([]);
                          setError('');
                        }}
                        className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-neutral-50 border border-transparent hover:border-atlas-border transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-black font-mono truncate">
                            {order.order_number}
                          </p>
                          <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-500 shrink-0">
                            {ORDER_STATUS_LABELS[order.status]}
                          </span>
                        </div>
                        <p className="text-xs text-neutral-500 mt-0.5 truncate">
                          {ready ? `Est. ready ${formatDate(ready)}` : 'ETA pending'}
                          {order.rush_processing ? ' · Rush' : ''}
                        </p>
                      </button>
                    );
                  })
                )}
              </div>
              <div className="shrink-0 border-t border-atlas-border p-3 bg-neutral-50 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1">
                  <Sparkles size={11} /> Quick answers
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {chips.slice(0, 5).map(chip => (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => void handleSend(chip.prompt)}
                      className="text-[11px] px-2 py-1 rounded-full border border-atlas-border bg-white text-neutral-700 hover:border-brand-400 hover:text-brand-800"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
                {ephemeral.length > 0 && (
                  <div className="max-h-28 overflow-y-auto space-y-2">
                    {ephemeral.map(b => (
                      <div
                        key={b.id}
                        className={`text-xs whitespace-pre-wrap rounded-lg px-2.5 py-2 ${
                          b.role === 'assistant'
                            ? 'bg-brand-50 text-brand-950 border border-brand-100'
                            : 'bg-white border border-atlas-border text-neutral-800 ml-6'
                        }`}
                      >
                        {b.body}
                      </div>
                    ))}
                  </div>
                )}
                <form onSubmit={onSubmit} className="flex gap-1.5">
                  <input
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    className="input-field text-sm py-2 flex-1"
                    placeholder="Ask a FAQ, or pick an order to chat…"
                    maxLength={2000}
                    disabled={sending}
                  />
                  <button type="submit" disabled={sending || !draft.trim()} className="btn-primary px-3 py-2 shrink-0" aria-label="Send">
                    {sending ? <Loader size={15} className="animate-spin" /> : <Send size={15} />}
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="shrink-0 px-3 py-2.5 border-b border-atlas-border bg-neutral-50 space-y-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedOrderId(null);
                      setThreadId(null);
                      setMessages([]);
                    }}
                    className="p-1 rounded-md text-neutral-500 hover:bg-white hover:text-black"
                    aria-label="Back to orders"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold font-mono text-black truncate">
                      {selected?.order_number}
                    </p>
                    <p className="text-[11px] text-neutral-500">
                      {eta ? `Est. ready ${formatDate(eta)}` : 'ETA pending'}
                      {selected?.rush_processing ? ' · Rush' : ''}
                    </p>
                  </div>
                </div>
                {selected && <StageStrip status={selected.status} />}
              </div>

              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
                {threadLoading ? (
                  <div className="flex justify-center py-8 text-neutral-400">
                    <Loader size={18} className="animate-spin" />
                  </div>
                ) : (
                  <>
                    <div className="rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2 text-xs text-brand-950 whitespace-pre-wrap">
                      <span className="inline-flex items-center gap-1 font-semibold mb-1">
                        <Sparkles size={12} /> Atlas Assistant
                      </span>
                      {'\n'}Ask about ETA or stages for an instant answer. Other messages go to Atlas admin (not order notes). Chemists never chat with you directly.
                    </div>
                    {messages.map(m => {
                      const mine = m.author_role === 'client';
                      const assistant = m.author_role === 'assistant';
                      return (
                        <div
                          key={m.id}
                          className={`max-w-[90%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                            mine
                              ? 'ml-auto bg-black text-white'
                              : assistant
                                ? 'mr-auto bg-brand-50 border border-brand-100 text-brand-950'
                                : 'mr-auto bg-neutral-100 text-neutral-900'
                          }`}
                        >
                          {!mine && (
                            <p className={`text-[10px] font-bold uppercase tracking-wide mb-0.5 ${assistant ? 'text-brand-700' : 'text-neutral-500'}`}>
                              {assistant ? 'Atlas Assistant' : (m.author_name || 'Atlas Lab')}
                            </p>
                          )}
                          {m.body}
                          <p className="text-[10px] mt-1 text-neutral-400">
                            {formatDateTime(m.created_at)}
                          </p>
                        </div>
                      );
                    })}
                    <div ref={endRef} />
                  </>
                )}
              </div>

              <div className="shrink-0 border-t border-atlas-border p-2 space-y-2">
                <div className="flex gap-1 overflow-x-auto pb-0.5">
                  {chips.slice(0, 3).map(chip => (
                    <button
                      key={chip.id}
                      type="button"
                      disabled={sending}
                      onClick={() => void handleSend(chip.prompt)}
                      className="shrink-0 text-[10px] px-2 py-1 rounded-full border border-atlas-border bg-neutral-50 text-neutral-700 hover:border-brand-400"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
                {error && <p className="text-xs text-red-600 px-1">{error}</p>}
                <form onSubmit={onSubmit} className="flex gap-1.5">
                  <input
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    className="input-field text-sm py-2 flex-1"
                    placeholder="Message this chat…"
                    maxLength={2000}
                    disabled={sending}
                  />
                  <button type="submit" disabled={sending || !draft.trim()} className="btn-primary px-3 py-2 shrink-0" aria-label="Send">
                    {sending ? <Loader size={15} className="animate-spin" /> : <Send size={15} />}
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-2 rounded-full bg-black text-white pl-4 pr-5 py-3 shadow-lg border border-neutral-800 hover:bg-neutral-900 transition-colors"
        aria-label={open ? 'Close lab chat' : 'Open lab chat'}
      >
        {open ? <X size={18} /> : <MessageCircle size={18} className="text-brand-400" />}
        <span className="text-sm font-semibold">{open ? 'Close' : 'Lab chat'}</span>
      </button>
    </div>
  );
}
