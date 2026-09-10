import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Loader, MessageCircle, Send, UserPlus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  LIVE_CHAT_STATUS_LABELS,
  LiveChatMessage,
  LiveChatThread,
  adminReplyToClient,
  fetchAdminLiveChatThreads,
  fetchLiveChatMessages,
  forwardLiveChatToChemist,
  isLiveChatSchemaMissing,
  normalizeLiveChatMessage,
  relayChemistNoteToClient,
  sendLiveChatMessage,
} from '../../lib/liveChat';
import { supabase } from '../../lib/supabase';
import { Order, UserProfile } from '../../lib/types';
import { formatDateTime } from '../../lib/utils';

type ChemistOpt = { id: string; name: string };

interface Props {
  chemists: ChemistOpt[];
  clients: UserProfile[];
  orders: Order[];
}

export default function AdminLiveChatInbox({ chemists, clients, orders }: Props) {
  const { user, profile } = useAuth();
  const [threads, setThreads] = useState<LiveChatThread[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [clientDraft, setClientDraft] = useState('');
  const [staffDraft, setStaffDraft] = useState('');
  const [chemistId, setChemistId] = useState('');
  const [forwardNote, setForwardNote] = useState('');

  const selected = useMemo(
    () => threads.find(t => t.id === selectedId) ?? null,
    [threads, selectedId],
  );

  const orderMap = useMemo(() => new Map(orders.map(o => [o.id, o])), [orders]);
  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);

  async function reloadThreads() {
    try {
      const rows = await fetchAdminLiveChatThreads();
      setThreads(rows);
      setError('');
    } catch (err) {
      setError(
        isLiveChatSchemaMissing(err)
          ? 'Apply the live_chat migration to enable this inbox.'
          : (err instanceof Error ? err.message : 'Could not load chats.'),
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reloadThreads();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    void fetchLiveChatMessages(selectedId).then(rows => {
      if (!cancelled) setMessages(rows);
    }).catch(err => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load messages.');
    });

    const channel = supabase
      .channel(`admin-live-chat-${selectedId}`)
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

  async function sendToClient(e: FormEvent) {
    e.preventDefault();
    if (!user || !selected || !clientDraft.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      await adminReplyToClient({
        threadId: selected.id,
        adminId: user.id,
        body: clientDraft,
      });
      setClientDraft('');
      await reloadThreads();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed.');
    } finally {
      setSending(false);
    }
  }

  async function sendStaffNote(e: FormEvent) {
    e.preventDefault();
    if (!user || !selected || !staffDraft.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      await sendLiveChatMessage({
        threadId: selected.id,
        authorId: user.id,
        authorRole: 'admin',
        authorName: profile?.full_name || 'Admin',
        visibility: 'staff',
        body: staffDraft,
      });
      setStaffDraft('');
      await reloadThreads();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed.');
    } finally {
      setSending(false);
    }
  }

  async function forward() {
    if (!user || !selected || !chemistId || sending) return;
    const chemist = chemists.find(c => c.id === chemistId);
    if (!chemist) return;
    setSending(true);
    setError('');
    try {
      await forwardLiveChatToChemist({
        threadId: selected.id,
        adminId: user.id,
        adminName: profile?.full_name || 'Admin',
        chemistId: chemist.id,
        chemistName: chemist.name,
        note: forwardNote,
      });
      setForwardNote('');
      await reloadThreads();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Forward failed.');
    } finally {
      setSending(false);
    }
  }

  async function relayLatestChemist() {
    if (!user || !selected || sending) return;
    const lastChemist = [...messages].reverse().find(m => m.author_role === 'chemist' && m.visibility === 'staff');
    if (!lastChemist) {
      setError('No chemist staff note to relay yet.');
      return;
    }
    setSending(true);
    setError('');
    try {
      await relayChemistNoteToClient({
        threadId: selected.id,
        adminId: user.id,
        chemistBody: lastChemist.body,
      });
      await reloadThreads();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Relay failed.');
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
      <div className="card p-4 bg-amber-50 border-amber-200 text-sm text-amber-950">
        <p className="font-semibold mb-1">Routing rules</p>
        <p>
          Client messages land here first. Forward to a chemist for lab input (staff-only).
          Chemists never appear in the client widget — only admin “Atlas Lab” replies do.
        </p>
      </div>

      {error && (
        <div className="card p-3 border-red-200 bg-red-50 text-sm text-red-800">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[20rem_1fr] gap-4 min-h-[28rem]">
        <div className="card overflow-hidden flex flex-col max-h-[70vh]">
          <div className="px-3 py-2.5 border-b border-atlas-border flex items-center gap-2">
            <MessageCircle size={15} className="text-brand-600" />
            <p className="text-sm font-semibold">Inbox</p>
            <button type="button" onClick={() => void reloadThreads()} className="ml-auto text-xs text-brand-700 hover:underline">
              Refresh
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {threads.length === 0 ? (
              <p className="text-sm text-neutral-500 p-6 text-center">No live chats yet.</p>
            ) : (
              threads.map(t => {
                const order = t.order_id ? orderMap.get(t.order_id) : null;
                const client = clientMap.get(t.user_id);
                const active = t.id === selectedId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className={`w-full text-left px-3 py-2.5 border-b border-atlas-border hover:bg-neutral-50 ${
                      active ? 'bg-brand-50' : ''
                    }`}
                  >
                    <p className="text-sm font-semibold text-black truncate">
                      {order?.order_number || 'No order'}
                    </p>
                    <p className="text-xs text-neutral-500 truncate">
                      {client?.full_name || client?.company_name || 'Client'}
                    </p>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-brand-800 mt-1">
                      {LIVE_CHAT_STATUS_LABELS[t.status]}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="card flex flex-col max-h-[70vh] min-h-[28rem]">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-sm text-neutral-500 p-8">
              Select a thread to reply, forward, or relay.
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-atlas-border">
                <p className="font-semibold text-black">
                  {selected.order_id ? orderMap.get(selected.order_id)?.order_number : 'Chat'}
                </p>
                <p className="text-xs text-neutral-500">
                  {clientMap.get(selected.user_id)?.full_name
                    || clientMap.get(selected.user_id)?.email
                    || selected.user_id}
                  {' · '}
                  {LIVE_CHAT_STATUS_LABELS[selected.status]}
                  {selected.assigned_to
                    ? ` · Chemist: ${chemists.find(c => c.id === selected.assigned_to)?.name || 'Assigned'}`
                    : ''}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                {messages.map(m => {
                  const staffOnly = m.visibility === 'staff';
                  return (
                    <div
                      key={m.id}
                      className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                        staffOnly
                          ? 'bg-violet-50 border border-violet-200 text-violet-950'
                          : m.author_role === 'client'
                            ? 'bg-neutral-100 text-neutral-900'
                            : m.author_role === 'assistant'
                              ? 'bg-brand-50 border border-brand-100 text-brand-950'
                              : 'bg-emerald-50 border border-emerald-200 text-emerald-950'
                      }`}
                    >
                      <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5 opacity-70">
                        {staffOnly ? 'Staff only · ' : ''}
                        {m.author_role === 'assistant' ? 'Atlas Assistant' : m.author_name || m.author_role}
                      </p>
                      {m.body}
                      <p className="text-[10px] text-neutral-400 mt-1">{formatDateTime(m.created_at)}</p>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-atlas-border p-3 space-y-3 bg-neutral-50">
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="flex-1 min-w-[10rem]">
                    <label className="label">Forward to chemist</label>
                    <select
                      className="input-field text-sm py-2"
                      value={chemistId}
                      onChange={e => setChemistId(e.target.value)}
                    >
                      <option value="">Select chemist…</option>
                      {chemists.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    disabled={!chemistId || sending}
                    onClick={() => void forward()}
                    className="btn-outline text-sm gap-1.5"
                  >
                    <UserPlus size={14} /> Forward
                  </button>
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => void relayLatestChemist()}
                    className="btn-outline text-sm"
                    title="Copy the latest chemist staff note to the client as Atlas Lab"
                  >
                    Relay chemist → client
                  </button>
                </div>
                <input
                  className="input-field text-sm py-2"
                  placeholder="Optional note to chemist (staff only)"
                  value={forwardNote}
                  onChange={e => setForwardNote(e.target.value)}
                />

                <form onSubmit={sendToClient} className="flex gap-2">
                  <input
                    className="input-field text-sm py-2 flex-1"
                    placeholder="Reply to client (shown as Atlas Lab)…"
                    value={clientDraft}
                    onChange={e => setClientDraft(e.target.value)}
                    disabled={sending}
                  />
                  <button type="submit" disabled={sending || !clientDraft.trim()} className="btn-primary text-sm gap-1.5">
                    <Send size={14} /> To client
                  </button>
                </form>

                <form onSubmit={sendStaffNote} className="flex gap-2">
                  <input
                    className="input-field text-sm py-2 flex-1"
                    placeholder="Staff-only note to chemist…"
                    value={staffDraft}
                    onChange={e => setStaffDraft(e.target.value)}
                    disabled={sending}
                  />
                  <button type="submit" disabled={sending || !staffDraft.trim()} className="btn-outline text-sm">
                    Staff note
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
