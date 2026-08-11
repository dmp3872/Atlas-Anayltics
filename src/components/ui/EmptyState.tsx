import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

type Props = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  actionTo?: string;
  onAction?: () => void;
  className?: string;
};

export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionTo,
  onAction,
  className = '',
}: Props) {
  return (
    <div className={`card p-10 sm:p-12 text-center ${className}`.trim()}>
      {Icon && (
        <div className="w-12 h-12 rounded-xl bg-neutral-100 flex items-center justify-center mx-auto mb-4">
          <Icon size={22} className="text-neutral-400" />
        </div>
      )}
      <h3 className="text-base font-semibold text-black mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-neutral-500 max-w-md mx-auto mb-5">{description}</p>
      )}
      {actionLabel && actionTo && (
        <Link to={actionTo} className="btn-primary text-sm">
          {actionLabel}
        </Link>
      )}
      {actionLabel && onAction && !actionTo && (
        <button type="button" onClick={onAction} className="btn-primary text-sm">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
