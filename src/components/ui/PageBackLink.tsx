import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

type Props = {
  label: string;
  /** Prefer this path when history cannot go back safely. */
  to?: string;
  /** Use browser history when same-origin referrer exists; otherwise `to`. */
  preferHistory?: boolean;
  className?: string;
  onClick?: () => void;
};

/**
 * Canonical back control for detail pages.
 * Place at the top of page content, above the title.
 */
export default function PageBackLink({
  label,
  to,
  preferHistory = false,
  className = '',
  onClick,
}: Props) {
  const navigate = useNavigate();

  function handleClick(e: React.MouseEvent) {
    if (onClick) {
      e.preventDefault();
      onClick();
      return;
    }
    if (preferHistory && typeof window !== 'undefined') {
      const ref = document.referrer;
      const sameOrigin = !!ref && ref.startsWith(window.location.origin);
      if (sameOrigin && window.history.length > 1) {
        e.preventDefault();
        navigate(-1);
      }
    }
  }

  const classes = `btn-back mb-4 ${className}`.trim();

  if (to) {
    return (
      <Link to={to} onClick={handleClick} className={classes}>
        <ArrowLeft size={14} />
        {label}
      </Link>
    );
  }

  return (
    <button type="button" onClick={handleClick} className={classes}>
      <ArrowLeft size={14} />
      {label}
    </button>
  );
}
