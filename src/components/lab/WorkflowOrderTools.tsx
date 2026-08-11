import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, ChevronDown, ChevronUp, ExternalLink, Loader, Save } from 'lucide-react';
import { Order } from '../../lib/types';
import { formatDate } from '../../lib/utils';
import { resolveEtaAt } from '../../lib/etaHeat';
import OrderNotesThread from '../order/OrderNotesThread';

/** Compact ETA + notes panel (stops drag when interacting). */
export default function WorkflowOrderTools({
  order,
  sampleId,
  onSaveEta,
  saving = false,
  isAdmin = false,
  defaultOpen = false,
}: {
  order: Order;
  sampleId?: string | null;
  onSaveEta?: (order: Order, iso: string | null) => void | Promise<void>;
  saving?: boolean;
  isAdmin?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const etaIso = resolveEtaAt(order);
  const dateValue = etaIso ? etaIso.slice(0, 10) : '';
  const [draft, setDraft] = useState(dateValue);

  useEffect(() => {
    setDraft(dateValue);
  }, [dateValue, order.id]);

  return (
    <div
      className="border-t border-atlas-border pt-2"
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      onDragStart={e => e.preventDefault()}
    >
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-2 text-left rounded-md border border-atlas-border bg-neutral-50 hover:bg-neutral-100 px-2 py-1.5"
      >
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-neutral-800 min-w-0">
          <CalendarClock size={12} className="text-brand-700 flex-shrink-0" />
          <span className="truncate">ETA / Notes</span>
          {etaIso ? (
            <span className="font-mono font-medium text-brand-900 truncate">{formatDate(etaIso)}</span>
          ) : (
            <span className="text-neutral-400 font-normal">Not set</span>
          )}
        </span>
        {open ? <ChevronUp size={14} className="text-neutral-400 flex-shrink-0" /> : <ChevronDown size={14} className="text-neutral-400 flex-shrink-0" />}
      </button>

      {open && (
        <div className="mt-2 space-y-2 rounded-md border border-brand-200 bg-brand-50/40 p-2">
          {onSaveEta && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">Ready by</label>
              <div className="flex gap-1.5">
                <input
                  type="date"
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  className="input-field py-1 text-xs flex-1 min-w-0"
                />
                <button
                  type="button"
                  disabled={saving || !draft}
                  onClick={() => {
                    const iso = draft ? new Date(`${draft}T17:00:00`).toISOString() : null;
                    void onSaveEta(order, iso);
                  }}
                  className="btn-primary text-[11px] py-1 px-2 gap-1"
                  title="Save ETA"
                >
                  {saving ? <Loader size={11} className="animate-spin" /> : <Save size={11} />}
                  Save
                </button>
              </div>
              {etaIso && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setDraft('');
                    void onSaveEta(order, null);
                  }}
                  className="text-[10px] font-semibold text-neutral-500 hover:text-red-600"
                >
                  Clear ETA
                </button>
              )}
            </div>
          )}

          {isAdmin && (
            <Link
              to={`/admin/orders/${order.id}`}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 hover:underline"
              draggable={false}
            >
              <ExternalLink size={11} /> Open order detail
            </Link>
          )}

          <div className="rounded-md border border-atlas-border bg-white overflow-hidden">
            <OrderNotesThread
              orderId={order.id}
              sampleId={sampleId ?? null}
              compact
              allowActions
            />
          </div>
        </div>
      )}
    </div>
  );
}
