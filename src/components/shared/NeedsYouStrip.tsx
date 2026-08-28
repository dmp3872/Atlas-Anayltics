import { Link } from 'react-router-dom';
import { AlertCircle, AlertTriangle, ArrowRight, CheckCircle2, Info } from 'lucide-react';
import type { NeedsYouItem } from '../../lib/needsYou';

const LEVEL = {
  urgent: {
    wrap: 'aa-needs aa-needs-urgent',
    icon: AlertTriangle,
    iconClass: 'text-red-600',
    title: 'text-red-950',
  },
  warning: {
    wrap: 'aa-needs aa-needs-warning',
    icon: AlertCircle,
    iconClass: 'text-amber-700',
    title: 'text-amber-950',
  },
  info: {
    wrap: 'aa-needs aa-needs-info',
    icon: Info,
    iconClass: 'text-sky-700',
    title: 'text-sky-950',
  },
} as const;

interface Props {
  items: NeedsYouItem[];
  /** Called for admin section navigation when item has actionSection and no href. */
  onSection?: (section: string) => void;
  emptyLabel?: string;
  className?: string;
}

export default function NeedsYouStrip({
  items,
  onSection,
  emptyLabel = 'Nothing needs you right now.',
  className = '',
}: Props) {
  if (items.length === 0) {
    return (
      <div className={`aa-needs aa-needs-empty flex items-center gap-2.5 ${className}`}>
        <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
        <p className="text-sm font-medium text-emerald-900">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <section className={`space-y-2 ${className}`} aria-label="Needs you">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight" style={{ color: 'var(--aa-ink, #1d1d1f)' }}>
          Needs you
        </h2>
        <p className="text-[11px]" style={{ color: 'var(--aa-muted, #6e6e73)' }}>
          {items.length} action{items.length === 1 ? '' : 's'}
        </p>
      </div>
      <ul className="space-y-2">
        {items.map(item => {
          const style = LEVEL[item.level];
          const Icon = style.icon;
          const action = (
            <span className="inline-flex items-center gap-1 text-xs font-semibold shrink-0">
              {item.actionLabel || 'Open'}
              <ArrowRight size={12} />
            </span>
          );
          const body = (
            <>
              <Icon size={16} className={`${style.iconClass} shrink-0 mt-0.5`} />
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold ${style.title}`}>{item.title}</p>
                {item.detail && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--aa-muted, #6e6e73)' }}>{item.detail}</p>
                )}
              </div>
              {action}
            </>
          );
          const rowClass = `w-full flex items-start gap-3 ${style.wrap} text-left transition-opacity hover:opacity-95`;

          if (item.href) {
            return (
              <li key={item.id}>
                <Link to={item.href} className={rowClass}>
                  {body}
                </Link>
              </li>
            );
          }
          if (item.actionSection && onSection) {
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSection(item.actionSection!)}
                  className={rowClass}
                >
                  {body}
                </button>
              </li>
            );
          }
          return (
            <li key={item.id}>
              <div className={`${rowClass} cursor-default`}>
                <Icon size={16} className={`${style.iconClass} shrink-0 mt-0.5`} />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${style.title}`}>{item.title}</p>
                  {item.detail && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--aa-muted, #6e6e73)' }}>{item.detail}</p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
