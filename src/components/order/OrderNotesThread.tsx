import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { CheckSquare, Lock, Loader, MessageCircle, Send, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { createOrderActionItem } from '../../lib/orderActions';
import {
  fetchOrderMessages,
  OrderMessage,
  sendOrderMessage,
} from '../../lib/orderMessages';
import { resolveUserRole } from '../../lib/roles';
import { supabase } from '../../lib/supabase';
import { formatDateTime } from '../../lib/utils';

interface Props {
  orderId: string;
  sampleId?: string | null;
  compact?: boolean;
  /** When true, staff see "Make action" on each note. */
  allowActions?: boolean;
}

type StaffComposeMode = 'customer' | 'internal';

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/order_messages|order_action_items|schema cache|relation .* does not exist/i.test(message)) {
    return 'Order notes will be available after the latest database migration is applied.';
  }
  return message || 'Could not load order notes.';
}

export default function OrderNotesThread({
  orderId,
  sampleId = null,
  compact = false,
  allowActions = false,
}: Props) {
  const { user, profile } = useAuth();
  const role = resolveUserRole(profile, user?.email);
  const isStaff = role === 'admin' || role === 'chemist';
  const [messages, setMessages] = useState<OrderMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [composeMode, setComposeMode] = useState<StaffComposeMode>('customer');
  const [internalAck, setInternalAck] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [actionHint, setActionHint] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const customerMessages = useMemo(
    () => messages.filter(m => !m.is_internal),
    [messages],
  );
  const internalMessages = useMemo(
    () => messages.filter(m => m.is_internal),
    [messages],
  );
  const visibleMessages = isStaff && composeMode === 'internal' ? internalMessages : customerMessages;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const rows = await fetchOrderMessages(orderId);
        if (!cancelled) {
          setMessages(rows);
          setError('');
        }
      } catch (err) {
        if (!cancelled) setError(friendlyError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();

    const channel = supabase
      .channel(`order-notes-${orderId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'order_messages', filter: `order_id=eq.${orderId}` },
        payload => {
          const incoming = normalizeIncoming(payload.new as Record<string, unknown>);
          setMessages(current =>
            current.some(message => message.id === incoming.id)
              ? current
              : [...current, incoming],
          );
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [orderId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [visibleMessages.length, composeMode]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!user || !draft.trim() || sending) return;

    const sendingInternal = isStaff && composeMode === 'internal';
    if (sendingInternal && !internalAck) {
      setError('Confirm the internal-only checkbox before saving an internal note.');
      return;
    }
    if (sendingInternal) {
      const ok = window.confirm(
        'Save as INTERNAL note?\n\nClients will NOT see this message. Only Atlas staff can read it.',
      );
      if (!ok) return;
    }

    setSending(true);
    setError('');
    try {
      const created = await sendOrderMessage({
        orderId,
        authorId: user.id,
        authorRole: role,
        authorName: profile?.full_name || user.email?.split('@')[0] || '',
        body: draft,
        isInternal: sendingInternal,
      });
      setMessages(current =>
        current.some(message => message.id === created.id) ? current : [...current, created],
      );
      setDraft('');
      if (sendingInternal) setInternalAck(false);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSending(false);
    }
  }

  async function makeAction(message: OrderMessage) {
    if (!user || !isStaff || actionBusyId) return;
    setActionBusyId(message.id);
    setError('');
    setActionHint('');
    try {
      await createOrderActionItem({
        orderId,
        sampleId,
        sourceMessageId: message.id,
        title: message.body.trim().slice(0, 500),
        createdBy: user.id,
        createdByName: profile?.full_name || user.email?.split('@')[0] || '',
      });
      setActionHint('Added to publish checklist.');
      window.setTimeout(() => setActionHint(''), 2200);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setActionBusyId(null);
    }
  }

  return (
    <section className={`rounded-xl border border-atlas-border bg-white ${compact ? 'p-4' : 'p-5'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-bold text-black">
            <MessageCircle size={17} className="text-brand-700" />
            {isStaff ? 'Order conversation' : 'Order Notes'}
          </h3>
          <p className="mt-1 text-xs text-neutral-500">
            {isStaff
              ? 'Customer replies are visible to the client. Internal notes stay staff-only.'
              : 'Shared privately between you and the Atlas laboratory team.'}
            {allowActions && isStaff ? ' Turn a customer note into a publish checklist action.' : ''}
          </p>
        </div>
        {customerMessages.length > 0 && (
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-500">
            {customerMessages.length}
          </span>
        )}
      </div>

      {isStaff && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setComposeMode('customer');
              setError('');
            }}
            className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-colors ${
              composeMode === 'customer'
                ? 'border-emerald-400 bg-emerald-50 text-emerald-950'
                : 'border-atlas-border bg-white text-neutral-600 hover:border-neutral-300'
            }`}
          >
            <span className="block uppercase tracking-wide">Customer thread</span>
            <span className="mt-0.5 block font-normal text-[11px] opacity-80">
              Visible to client · {customerMessages.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setComposeMode('internal');
              setError('');
            }}
            className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-colors ${
              composeMode === 'internal'
                ? 'border-red-400 bg-red-50 text-red-950'
                : 'border-atlas-border bg-white text-neutral-600 hover:border-neutral-300'
            }`}
          >
            <span className="inline-flex items-center gap-1 uppercase tracking-wide">
              <Lock size={11} /> Internal notes
            </span>
            <span className="mt-0.5 block font-normal text-[11px] opacity-80">
              Staff only · {internalMessages.length}
            </span>
          </button>
        </div>
      )}

      {isStaff && composeMode === 'internal' && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border-2 border-red-400 bg-red-50 px-3 py-2.5 text-xs text-red-950">
          <ShieldAlert size={16} className="mt-0.5 shrink-0 text-red-600" />
          <div>
            <p className="font-bold uppercase tracking-wide">Internal only — clients cannot see these notes</p>
            <p className="mt-0.5">
              Use this for lab handoffs, QA flags, and sensitive context. Never put anything here you intend the customer to read.
            </p>
          </div>
        </div>
      )}

      <div
        className={`mt-4 space-y-3 overflow-y-auto rounded-lg p-3 ${
          isStaff && composeMode === 'internal' ? 'bg-red-50/60' : 'bg-neutral-50'
        } ${compact ? 'max-h-64' : 'max-h-80'}`}
        aria-live="polite"
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-neutral-400">
            <Loader size={15} className="animate-spin" /> Loading notes…
          </div>
        ) : visibleMessages.length === 0 ? (
          <div className="py-6 text-center">
            {isStaff && composeMode === 'internal' ? (
              <Lock size={22} className="mx-auto text-red-300" />
            ) : (
              <MessageCircle size={22} className="mx-auto text-neutral-300" />
            )}
            <p className="mt-2 text-sm font-medium text-neutral-600">
              {isStaff && composeMode === 'internal' ? 'No internal notes yet' : 'No notes yet'}
            </p>
            <p className="mt-0.5 text-xs text-neutral-400">
              {isStaff && composeMode === 'internal'
                ? 'Staff-only notes for this order will appear here.'
                : 'Ask a question or share handling details with the lab.'}
            </p>
          </div>
        ) : (
          visibleMessages.map(message => {
            const mine = message.author_id === user?.id;
            const staff = message.author_role !== 'client';
            const internal = message.is_internal;
            return (
              <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[88%] rounded-xl px-3 py-2 ${
                    internal
                      ? 'border-2 border-red-300 bg-red-100 text-red-950'
                      : mine
                        ? 'bg-brand-500 text-black'
                        : staff
                          ? 'border border-atlas-gold/30 bg-atlas-black text-white'
                          : 'border border-atlas-border bg-white text-black'
                  }`}
                >
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
                    <span className={internal ? 'text-red-800' : mine ? 'text-black/70' : staff ? 'text-atlas-gold' : 'text-neutral-500'}>
                      {message.author_name || (staff ? 'Atlas Lab' : 'Client')}
                    </span>
                    {internal ? (
                      <span className="inline-flex items-center gap-0.5 text-red-700">
                        <Lock size={10} /> Internal
                      </span>
                    ) : staff ? (
                      <span className="text-atlas-gold/70">Atlas Team</span>
                    ) : null}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {message.body}
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className={`text-[10px] ${internal ? 'text-red-700/70' : mine ? 'text-black/55' : 'text-neutral-400'}`}>
                      {formatDateTime(message.created_at)}
                    </p>
                    {allowActions && isStaff && !internal && (
                      <button
                        type="button"
                        disabled={actionBusyId === message.id}
                        onClick={() => void makeAction(message)}
                        className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide ${
                          mine ? 'text-black/70 hover:text-black' : 'text-atlas-gold hover:text-white'
                        }`}
                      >
                        {actionBusyId === message.id ? (
                          <Loader size={11} className="animate-spin" />
                        ) : (
                          <CheckSquare size={11} />
                        )}
                        Make action
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {actionHint && <p className="mt-2 text-xs text-emerald-700">{actionHint}</p>}

      <form onSubmit={submit} className="mt-3 space-y-2">
        {isStaff && composeMode === 'internal' && (
          <label className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-950">
            <input
              type="checkbox"
              checked={internalAck}
              onChange={e => setInternalAck(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I understand this note is <strong>internal only</strong> and will <strong>not</strong> be sent to the customer.
            </span>
          </label>
        )}
        <div className="flex items-end gap-2">
          <label className="sr-only" htmlFor={`order-note-${orderId}`}>
            {isStaff && composeMode === 'internal' ? 'Add an internal note' : 'Add an order note'}
          </label>
          <textarea
            id={`order-note-${orderId}`}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={2}
            maxLength={2000}
            placeholder={
              !isStaff
                ? 'Message the Atlas lab…'
                : composeMode === 'internal'
                  ? 'Internal staff note (not visible to client)…'
                  : 'Reply to the customer…'
            }
            className={`input-field min-h-[44px] flex-1 resize-y ${
              isStaff && composeMode === 'internal' ? 'border-red-300 focus:border-red-500 focus:ring-red-200' : ''
            }`}
          />
          <button
            type="submit"
            disabled={
              !draft.trim()
              || sending
              || (isStaff && composeMode === 'internal' && !internalAck)
            }
            className={`h-11 shrink-0 px-4 ${
              isStaff && composeMode === 'internal' ? 'btn-secondary border-red-400 text-red-900' : 'btn-primary'
            }`}
            aria-label={isStaff && composeMode === 'internal' ? 'Save internal note' : 'Send order note'}
          >
            {sending ? <Loader size={16} className="animate-spin" /> : composeMode === 'internal' && isStaff ? <Lock size={16} /> : <Send size={16} />}
            <span className="hidden sm:inline">
              {isStaff && composeMode === 'internal' ? 'Save internal' : 'Send'}
            </span>
          </button>
        </div>
      </form>
      <p className="mt-1 text-right text-[10px] text-neutral-400">
        Enter to send · Shift+Enter for a new line
        {isStaff && composeMode === 'customer' ? ' · Customer will see this reply' : ''}
        {isStaff && composeMode === 'internal' ? ' · Client cannot see this' : ''}
      </p>
    </section>
  );
}

function normalizeIncoming(row: Record<string, unknown>): OrderMessage {
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
