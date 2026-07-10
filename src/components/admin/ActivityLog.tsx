import { Clock, ArrowRight } from 'lucide-react';
import { formatDateTime } from '../../lib/utils';

export interface ActivityLogEntry {
  id: string;
  from_status?: string | null;
  to_status: string;
  note?: string | null;
  created_at: string;
}

interface Props {
  entries: ActivityLogEntry[];
  /** Map status codes → display labels. Falls back to raw status string. */
  labels?: Record<string, string>;
}

function labelFor(status: string, labels?: Record<string, string>): string {
  if (!status) return '—';
  if (labels?.[status]) return labels[status];
  if (status.startsWith('payment:')) {
    const p = status.slice('payment:'.length);
    return labels?.[p] || `Payment: ${p}`;
  }
  return status.replace(/_/g, ' ');
}

export default function ActivityLog({ entries, labels }: Props) {
  if (entries.length === 0) {
    return (
      <div className="text-sm text-neutral-500 text-center py-6">
        No activity recorded yet.
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {entries.map((entry, i) => (
        <div key={entry.id} className="flex gap-3 pb-4 last:pb-0">
          <div className="flex flex-col items-center">
            <div className="w-7 h-7 rounded-full bg-brand-50 border border-brand-200 flex items-center justify-center flex-shrink-0">
              <Clock size={12} className="text-brand-600" />
            </div>
            {i < entries.length - 1 && <div className="w-px flex-1 bg-neutral-200 mt-1" />}
          </div>
          <div className="flex-1 min-w-0 pb-2">
            <div className="flex items-center gap-2 flex-wrap">
              {entry.from_status && (
                <>
                  <span className="text-xs text-neutral-500">
                    {labelFor(entry.from_status, labels)}
                  </span>
                  <ArrowRight size={12} className="text-neutral-400" />
                </>
              )}
              <span className="text-xs font-semibold text-brand-700">
                {labelFor(entry.to_status, labels)}
              </span>
            </div>
            {entry.note && <p className="text-sm text-neutral-700 mt-0.5">{entry.note}</p>}
            <p className="text-xs text-neutral-400 mt-1">{formatDateTime(entry.created_at)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
