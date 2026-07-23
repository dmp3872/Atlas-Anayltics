import { FormEvent, useEffect, useRef, useState } from 'react';
import { Loader, MessageCircle, Send } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
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
  compact?: boolean;
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/order_messages|schema cache|relation .* does not exist/i.test(message)) {
    return 'Order notes will be available after the latest database migration is applied.';
  }
  return message || 'Could not load order notes.';
}

export default function OrderNotesThread({ orderId, compact = false }: Props) {
  const { user, profile } = useAuth();
  const role = resolveUserRole(profile, user?.email);
  const [messages, setMessages] = useState<OrderMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

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
          const incoming = payload.new as OrderMessage;
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
  }, [messages.length]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!user || !draft.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      const created = await sendOrderMessage({
        orderId,
        authorId: user.id,
        authorRole: role,
        authorName: profile?.full_name || user.email?.split('@')[0] || '',
        body: draft,
      });
      setMessages(current =>
        current.some(message => message.id === created.id) ? current : [...current, created],
      );
      setDraft('');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className={`rounded-xl border border-atlas-border bg-white ${compact ? 'p-4' : 'p-5'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-bold text-black">
            <MessageCircle size={17} className="text-brand-700" />
            Order Notes
          </h3>
          <p className="mt-1 text-xs text-neutral-500">
            Shared privately between the client and Atlas laboratory team.
          </p>
        </div>
        {messages.length > 0 && (
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-500">
            {messages.length}
          </span>
        )}
      </div>

      <div
        className={`mt-4 space-y-3 overflow-y-auto rounded-lg bg-neutral-50 p-3 ${
          compact ? 'max-h-64' : 'max-h-80'
        }`}
        aria-live="polite"
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-neutral-400">
            <Loader size={15} className="animate-spin" /> Loading notes…
          </div>
        ) : messages.length === 0 ? (
          <div className="py-6 text-center">
            <MessageCircle size={22} className="mx-auto text-neutral-300" />
            <p className="mt-2 text-sm font-medium text-neutral-600">No notes yet</p>
            <p className="mt-0.5 text-xs text-neutral-400">
              Ask a question or share handling details with the lab.
            </p>
          </div>
        ) : (
          messages.map(message => {
            const mine = message.author_id === user?.id;
            const staff = message.author_role !== 'client';
            return (
              <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[88%] rounded-xl px-3 py-2 ${
                    mine
                      ? 'bg-brand-500 text-black'
                      : staff
                        ? 'border border-atlas-gold/30 bg-atlas-black text-white'
                        : 'border border-atlas-border bg-white text-black'
                  }`}
                >
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider">
                    <span className={mine ? 'text-black/70' : staff ? 'text-atlas-gold' : 'text-neutral-500'}>
                      {message.author_name || (staff ? 'Atlas Lab' : 'Client')}
                    </span>
                    {staff && <span className="text-atlas-gold/70">Atlas Team</span>}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {message.body}
                  </p>
                  <p className={`mt-1 text-[10px] ${mine ? 'text-black/55' : 'text-neutral-400'}`}>
                    {formatDateTime(message.created_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <form onSubmit={submit} className="mt-3 flex items-end gap-2">
        <label className="sr-only" htmlFor={`order-note-${orderId}`}>Add an order note</label>
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
          placeholder={role === 'client' ? 'Message the Atlas lab…' : 'Reply to the client…'}
          className="input-field min-h-[44px] flex-1 resize-y"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          className="btn-primary h-11 shrink-0 px-4"
          aria-label="Send order note"
        >
          {sending ? <Loader size={16} className="animate-spin" /> : <Send size={16} />}
          <span className="hidden sm:inline">Send</span>
        </button>
      </form>
      <p className="mt-1 text-right text-[10px] text-neutral-400">
        Enter to send · Shift+Enter for a new line
      </p>
    </section>
  );
}
