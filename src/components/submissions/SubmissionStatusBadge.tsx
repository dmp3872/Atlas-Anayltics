import { SubmissionStatus } from '../../lib/types';
import { SUBMISSION_STATUS_LABELS, SUBMISSION_STATUS_COLORS } from '../../lib/submissionUtils';

export default function SubmissionStatusBadge({ status }: { status: SubmissionStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
        SUBMISSION_STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-600'
      }`}
    >
      {SUBMISSION_STATUS_LABELS[status] ?? status}
    </span>
  );
}
