import { ORDER_STATUS_LABELS } from '../../lib/utils';
import type { OrderStatus } from '../../lib/types';

const STATUS_CLASS: Record<string, string> = {
  received: 'status-received',
  awaiting_sample: 'status-awaiting_sample',
  processing: 'status-processing',
  analyzing: 'status-analyzing',
  in_review: 'status-in_review',
  complete: 'status-complete',
  cancelled: 'status-cancelled',
};

type Props = {
  status: OrderStatus | string;
  className?: string;
};

export default function OrderStatusBadge({ status, className = '' }: Props) {
  const key = String(status || 'received');
  const tone = STATUS_CLASS[key] || 'status-received';
  const label =
    (ORDER_STATUS_LABELS as Record<string, string>)[key]
    || key.replace(/_/g, ' ');

  return (
    <span className={`status-badge ${tone} ${className}`.trim()}>
      {label}
    </span>
  );
}
