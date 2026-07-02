import { Clock, ArrowRight } from 'lucide-react';
import { StatusHistoryEntry } from '../../lib/types';
import { SUBMISSION_STATUS_LABELS } from '../../lib/submissionUtils';
import { formatDateTime } from '../../lib/utils';

export default function ActivityLog({ entries }: { entries: StatusHistoryEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="text-sm text-slate-500 text-center py-6">
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
            {i < entries.length - 1 && <div className="w-px flex-1 bg-slate-200 mt-1" />}
          </div>
          <div className="flex-1 min-w-0 pb-2">
            <div className="flex items-center gap-2 flex-wrap">
              {entry.from_status && (
                <>
                  <span className="text-xs text-slate-500">
                    {SUBMISSION_STATUS_LABELS[entry.from_status]}
                  </span>
                  <ArrowRight size={12} className="text-slate-400" />
                </>
              )}
              <span className="text-xs font-semibold text-brand-700">
                {SUBMISSION_STATUS_LABELS[entry.to_status]}
              </span>
            </div>
            {entry.note && <p className="text-sm text-slate-700 mt-0.5">{entry.note}</p>}
            <p className="text-xs text-slate-400 mt-1">{formatDateTime(entry.created_at)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
