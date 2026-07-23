import { useEffect, useState } from 'react';
import { CheckSquare, Loader, ListChecks } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  fetchOrderActionItems,
  openActionCount,
  OrderActionItem,
  reopenOrderActionItem,
  resolveOrderActionItem,
} from '../../lib/orderActions';
import { resolveUserRole } from '../../lib/roles';
import { supabase } from '../../lib/supabase';
import { formatDateTime } from '../../lib/utils';

interface Props {
  orderId: string;
  compact?: boolean;
  onOpenCountChange?: (count: number) => void;
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/order_action_items|schema cache|relation .* does not exist/i.test(message)) {
    return 'Action checklist will be available after the latest database migration is applied.';
  }
  return message || 'Could not load action items.';
}

export default function OrderActionChecklist({ orderId, compact = false, onOpenCountChange }: Props) {
  const { user, profile } = useAuth();
  const role = resolveUserRole(profile, user?.email);
  const isStaff = role === 'admin' || role === 'chemist';
  const [items, setItems] = useState<OrderActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const rows = await fetchOrderActionItems(orderId);
        if (!cancelled) {
          setItems(rows);
          setError('');
          onOpenCountChange?.(openActionCount(rows));
        }
      } catch (err) {
        if (!cancelled) setError(friendlyError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();

    const channel = supabase
      .channel(`order-actions-${orderId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_action_items', filter: `order_id=eq.${orderId}` },
        () => {
          void fetchOrderActionItems(orderId)
            .then(rows => {
              setItems(rows);
              onOpenCountChange?.(openActionCount(rows));
            })
            .catch(err => setError(friendlyError(err)));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [orderId, onOpenCountChange]);

  async function toggle(item: OrderActionItem) {
    if (!user || !isStaff || busyId) return;
    setBusyId(item.id);
    setError('');
    try {
      const updated = item.resolved_at
        ? await reopenOrderActionItem(item.id)
        : await resolveOrderActionItem({
            id: item.id,
            resolvedBy: user.id,
            resolvedByName: profile?.full_name || user.email?.split('@')[0] || '',
          });
      setItems(current => {
        const next = current.map(row => (row.id === updated.id ? updated : row));
        onOpenCountChange?.(openActionCount(next));
        return next;
      });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusyId(null);
    }
  }

  const openCount = openActionCount(items);

  return (
    <section className={`rounded-xl border border-atlas-border bg-white ${compact ? 'p-4' : 'p-5'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-bold text-black">
            <ListChecks size={17} className="text-brand-700" />
            Publish checklist
          </h3>
          <p className="mt-1 text-xs text-neutral-500">
            Actions from client notes. Clear them before publish when possible — chemists can override if needed.
          </p>
        </div>
        {items.length > 0 && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              openCount > 0
                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            }`}
          >
            {openCount > 0 ? `${openCount} open` : 'Clear'}
          </span>
        )}
      </div>

      <div className={`mt-3 space-y-2 ${compact ? 'max-h-48' : 'max-h-64'} overflow-y-auto`}>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-5 text-sm text-neutral-400">
            <Loader size={15} className="animate-spin" /> Loading checklist…
          </div>
        ) : items.length === 0 ? (
          <p className="py-4 text-center text-xs text-neutral-400">
            No actions yet. Staff can turn a note into a checklist item.
          </p>
        ) : (
          items.map(item => {
            const done = !!item.resolved_at;
            return (
              <label
                key={item.id}
                className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${
                  done
                    ? 'border-emerald-100 bg-emerald-50/40'
                    : 'border-amber-200 bg-amber-50/40'
                } ${isStaff ? 'cursor-pointer' : ''}`}
              >
                <button
                  type="button"
                  disabled={!isStaff || busyId === item.id}
                  onClick={() => void toggle(item)}
                  className="mt-0.5 shrink-0 text-brand-700 disabled:opacity-40"
                  aria-label={done ? 'Reopen action' : 'Mark action complete'}
                >
                  {busyId === item.id ? (
                    <Loader size={16} className="animate-spin" />
                  ) : done ? (
                    <CheckSquare size={16} className="text-emerald-700" />
                  ) : (
                    <span className="inline-block h-4 w-4 rounded border-2 border-amber-500 bg-white" />
                  )}
                </button>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-medium ${done ? 'text-neutral-500 line-through' : 'text-black'}`}>
                    {item.title}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-neutral-400">
                    {done
                      ? `Cleared ${formatDateTime(item.resolved_at!)}${item.resolved_by_name ? ` · ${item.resolved_by_name}` : ''}`
                      : `Opened ${formatDateTime(item.created_at)}${item.created_by_name ? ` · ${item.created_by_name}` : ''}`}
                  </span>
                </span>
              </label>
            );
          })
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}
