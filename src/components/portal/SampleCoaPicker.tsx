import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { COA, OrderSample } from '../../lib/types';
import { coaBrandLabel, coasForSample } from '../../lib/coaPanels';

interface Props {
  sample: OrderSample;
  coas: COA[];
  /** Open a specific issued COA (e.g. celebration overlay). */
  onOpenCoa?: (coa: COA) => void;
  /** Compact table cell vs order detail column. */
  compact?: boolean;
}

/**
 * When a sample has multiple branded COAs, let the client pick which to open.
 * Single-COA samples keep a one-click Open.
 */
export default function SampleCoaPicker({ sample, coas, onOpenCoa, compact }: Props) {
  const matches = coasForSample(sample, coas);

  if (matches.length === 0) return null;

  if (matches.length === 1) {
    const coa = matches[0];
    if (onOpenCoa) {
      return (
        <button
          type="button"
          onClick={() => onOpenCoa(coa)}
          className={`btn-outline gap-1 inline-flex whitespace-nowrap ${compact ? 'text-[11px] py-1 px-2' : 'text-xs py-1.5'}`}
        >
          <ExternalLink size={compact ? 11 : 12} /> COA
        </button>
      );
    }
    return (
      <Link
        to={`/coa/${coa.slug}`}
        className={`btn-outline gap-1 inline-flex whitespace-nowrap ${compact ? 'text-[11px] py-1 px-2' : 'text-xs py-1.5'}`}
      >
        <ExternalLink size={compact ? 11 : 12} /> View COA
      </Link>
    );
  }

  return (
    <div className={`flex flex-col ${compact ? 'items-end gap-1' : 'gap-1.5 min-w-[10rem]'}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
        Select COA ({matches.length})
      </p>
      <div className={`flex flex-col ${compact ? 'items-end' : ''} gap-1`}>
        {matches.map(coa => {
          const label = coaBrandLabel(coa);
          const className = `btn-outline gap-1 inline-flex whitespace-nowrap max-w-[14rem] ${
            compact ? 'text-[11px] py-1 px-2' : 'text-xs py-1.5'
          }`;
          if (onOpenCoa) {
            return (
              <button
                key={coa.id}
                type="button"
                title={label}
                onClick={() => onOpenCoa(coa)}
                className={className}
              >
                <ExternalLink size={compact ? 11 : 12} className="shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            );
          }
          return (
            <Link key={coa.id} to={`/coa/${coa.slug}`} title={label} className={className}>
              <ExternalLink size={compact ? 11 : 12} className="shrink-0" />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
