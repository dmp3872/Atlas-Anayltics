import { Zap } from 'lucide-react';
import { LabPriority } from '../../lib/types';
import { LAB_PRIORITY_LABELS, LAB_PRIORITY_STYLES } from '../../lib/labQueue';

interface Props {
  priority: LabPriority;
  rush?: boolean;
  /** Compact strip for cards; default is full label bar. */
  compact?: boolean;
  className?: string;
}

/** Color banner that makes priority category obvious at a glance. */
export default function PriorityBanner({ priority, rush, compact, className = '' }: Props) {
  const styles = LAB_PRIORITY_STYLES[priority];
  const label = LAB_PRIORITY_LABELS[priority];

  if (compact) {
    return (
      <div
        className={`flex items-center justify-between gap-2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${styles.banner} ${styles.bannerText} ${className}`}
        role="status"
        aria-label={`${label} priority`}
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-90" />
          {label}
        </span>
        {rush && (
          <span className="inline-flex items-center gap-0.5 opacity-95">
            <Zap size={10} /> Rush
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-between gap-3 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider ${styles.banner} ${styles.bannerText} ${className}`}
      role="status"
      aria-label={`${label} priority`}
    >
      <span className="inline-flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-current opacity-90" />
        {label} priority
      </span>
      {rush && (
        <span className="inline-flex items-center gap-1 opacity-95">
          <Zap size={11} /> Rush testing
        </span>
      )}
    </div>
  );
}
