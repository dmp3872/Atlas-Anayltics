import { useState } from 'react';
import { CalendarClock, Loader, Save } from 'lucide-react';
import { formatDate } from '../../lib/utils';

interface Props {
  estimatedReadyAt?: string | null;
  dueAt?: string | null;
  saving?: boolean;
  onSave: (iso: string | null) => void | Promise<void>;
  compact?: boolean;
}

/** Staff control to set the client-visible estimated ready date. */
export default function OrderEtaEditor({
  estimatedReadyAt,
  dueAt,
  saving = false,
  onSave,
  compact = false,
}: Props) {
  const current = estimatedReadyAt || dueAt || '';
  const dateValue = current ? current.slice(0, 10) : '';
  const [draft, setDraft] = useState(dateValue);

  const display = estimatedReadyAt || dueAt;

  return (
    <div className={`rounded-xl border border-atlas-border bg-white ${compact ? 'p-4' : 'p-5'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-bold text-black">
            <CalendarClock size={17} className="text-brand-700" />
            Estimated ready date
          </h3>
          <p className="mt-1 text-xs text-neutral-500">
            Clients see this date on their order. Update it when TAT changes.
          </p>
        </div>
        {display && (
          <span className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-900">
            {formatDate(display)}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-[10rem] flex-1">
          <label className="label" htmlFor="order-eta-date">Ready by</label>
          <input
            id="order-eta-date"
            type="date"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            className="input-field mt-1"
          />
        </div>
        <button
          type="button"
          disabled={saving || !draft}
          onClick={() => {
            const iso = draft ? new Date(`${draft}T17:00:00`).toISOString() : null;
            void onSave(iso);
          }}
          className="btn-primary gap-1.5"
        >
          {saving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
          Save ETA
        </button>
        {display && (
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setDraft('');
              void onSave(null);
            }}
            className="btn-ghost text-sm border border-atlas-border"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
