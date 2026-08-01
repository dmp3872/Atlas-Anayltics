import { useEffect, useState } from 'react';
import { CheckSquare, ChevronDown, ChevronUp, MessageCircle } from 'lucide-react';
import OrderActionChecklist from '../order/OrderActionChecklist';
import OrderNotesThread from '../order/OrderNotesThread';
import { fetchOrderActionItems, openActionCount } from '../../lib/orderActions';
import { fetchOrderMessages } from '../../lib/orderMessages';

export type OrderContextMeta = {
  noteCount: number;
  openActionCount: number;
};

/** Load note + open-action counts for queue order headers / sample badges. */
export function useOrderContextMeta(orderIds: string[]): Record<string, OrderContextMeta> {
  const [meta, setMeta] = useState<Record<string, OrderContextMeta>>({});
  const key = [...orderIds].sort().join('|');

  useEffect(() => {
    const ids = key ? key.split('|') : [];
    if (ids.length === 0) {
      setMeta({});
      return;
    }
    let cancelled = false;
    async function load() {
      const entries = await Promise.all(
        ids.map(async id => {
          try {
            const [messages, actions] = await Promise.all([
              fetchOrderMessages(id),
              fetchOrderActionItems(id),
            ]);
            return [id, { noteCount: messages.length, openActionCount: openActionCount(actions) }] as const;
          } catch {
            return [id, { noteCount: 0, openActionCount: 0 }] as const;
          }
        }),
      );
      if (!cancelled) setMeta(Object.fromEntries(entries));
    }
    void load();
    return () => { cancelled = true; };
  }, [key]);

  return meta;
}

export function OrderContextBadges({
  noteCount,
  openActions,
}: {
  noteCount?: number;
  openActions?: number;
}) {
  const notes = noteCount ?? 0;
  const open = openActions ?? 0;
  if (notes === 0 && open === 0) {
    return (
      <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border border-atlas-border bg-neutral-50 text-neutral-500">
        0 notes
      </span>
    );
  }
  return (
    <>
      {notes > 0 && (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-sky-200 bg-sky-50 text-sky-900">
          <MessageCircle size={10} /> {notes} note{notes === 1 ? '' : 's'}
        </span>
      )}
      {open > 0 && (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-900">
          <CheckSquare size={10} /> {open} open action{open === 1 ? '' : 's'}
        </span>
      )}
    </>
  );
}

/** Collapsible notes + checklist on a queue sample card. */
export function QueueSampleNotesActions({
  orderId,
  sampleId,
  noteCount = 0,
  openActions = 0,
}: {
  orderId: string;
  sampleId: string;
  noteCount?: number;
  openActions?: number;
}) {
  const [open, setOpen] = useState(false);
  const summary = [
    noteCount > 0 ? `${noteCount} note${noteCount === 1 ? '' : 's'}` : null,
    openActions > 0 ? `${openActions} open` : null,
  ].filter(Boolean).join(' · ') || '0';

  return (
    <div
      className="mt-3 border-t border-atlas-border pt-2"
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-2 rounded-md border border-atlas-border bg-neutral-50 hover:bg-neutral-100 px-2.5 py-1.5 text-left"
      >
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-neutral-800 min-w-0">
          <MessageCircle size={12} className="text-brand-700 flex-shrink-0" />
          <span className="truncate">Notes / Actions</span>
          <span className={`font-medium truncate ${openActions > 0 ? 'text-amber-800' : 'text-neutral-500'}`}>
            {summary}
          </span>
        </span>
        {open ? <ChevronUp size={14} className="text-neutral-400 flex-shrink-0" /> : <ChevronDown size={14} className="text-neutral-400 flex-shrink-0" />}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <OrderActionChecklist orderId={orderId} compact />
          <div className="rounded-md border border-atlas-border bg-white overflow-hidden">
            <OrderNotesThread
              orderId={orderId}
              sampleId={sampleId}
              compact
              allowActions
            />
          </div>
        </div>
      )}
    </div>
  );
}
