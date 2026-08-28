import { Link } from 'react-router-dom';
import { AlertCircle, AlertTriangle, ArrowRight, CheckCircle2, Info } from 'lucide-react';
import type { NeedsYouItem } from '../../lib/needsYou';

const LEVEL = {
  urgent: {
    wrap: 'border-red-200 bg-red-50',
    icon: AlertTriangle,
    iconClass: 'text-red-600',
    title: 'text-red-950',
  },
  warning: {
    wrap: 'border-amber-200 bg-amber-50',
    icon: AlertCircle,
    iconClass: 'text-amber-700',
    title: 'text-amber-950',
  },
  info: {
    wrap: 'border-sky-200 bg-sky-50',
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
      <div className={`rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 flex items-center gap-2.5 ${className}`}>
        <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
        <p className="text-sm font-medium text-emerald-900">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <section className={`space-y-2 ${className}`} aria-label="Needs you">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-black tracking-tight">Needs you</h2>
        <p className="text-[11px] text-neutral-500">{items.length} action{items.length === 1 ? '' : 's'}</p>
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
                  <p className="text-xs text-neutral-600 mt-0.5">{item.detail}</p>
                )}
              </div>
              {action}
            </>
          );
          const rowClass = `w-full flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors hover:brightness-[0.98] ${style.wrap}`;

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
                    <p className="text-xs text-neutral-600 mt-0.5">{item.detail}</p>
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
