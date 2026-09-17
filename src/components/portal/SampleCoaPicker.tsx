import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { COA, OrderSample } from '../../lib/types';
import { coaBrandLabel, coasForSample } from '../../lib/coaPanels';

interface Props {
  sample?: OrderSample | null;
  coas: COA[];
  /** Pre-grouped certificates for this sample (Your COAs tab). */
  group?: COA[];
  /** Open a specific issued COA (e.g. celebration overlay). */
  onOpenCoa?: (coa: COA) => void;
  /** Compact table cell vs order detail column. */
  compact?: boolean;
}

function sortCoasForPicker(list: COA[]): COA[] {
  return [...list].sort(
    (a, b) =>
      (Date.parse(a.issued_at || a.created_at) || 0)
      - (Date.parse(b.issued_at || b.created_at) || 0),
  );
}

/**
 * When a sample has multiple branded COAs, Open the primary certificate and
 * list additional brand copies underneath for selection.
 */
export default function SampleCoaPicker({ sample, coas, group, onOpenCoa, compact }: Props) {
  const matches = sortCoasForPicker(
    group && group.length > 0
      ? group
      : sample
        ? coasForSample(sample, coas)
        : [],
  );

  if (matches.length === 0) return null;

  const openBtn = (coa: COA, label: string) => {
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
  };

  const primary = matches[0];
  const additional = matches.slice(1);

  if (additional.length === 0) {
    return openBtn(primary, compact ? 'Open' : 'Open');
  }

  return (
    <div className={`flex flex-col ${compact ? 'items-end gap-1.5' : 'gap-2 min-w-[10rem]'}`}>
      {openBtn(primary, 'Open')}
      <div className={`flex flex-col ${compact ? 'items-end' : ''} gap-1 w-full`}>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
          Additional ({additional.length})
        </p>
        {additional.map(coa => openBtn(coa, coaBrandLabel(coa)))}
      </div>
    </div>
  );
}
