import { CheckCircle, XCircle, Clock } from 'lucide-react';

type Props = {
  result?: string | null;
  className?: string;
};

/** Shared pass / fail / pending badge using site badge-* classes. */
export default function ResultBadge({ result, className = '' }: Props) {
  const value = (result || '').toLowerCase();
  if (value === 'pass') {
    return (
      <span className={`badge-pass ${className}`.trim()}>
        <CheckCircle size={11} /> Pass
      </span>
    );
  }
  if (value === 'fail') {
    return (
      <span className={`badge-fail ${className}`.trim()}>
        <XCircle size={11} /> Fail
      </span>
    );
  }
  return (
    <span className={`badge-pending ${className}`.trim()}>
      <Clock size={11} /> Pending
    </span>
  );
}
