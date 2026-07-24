import { FlaskConical } from 'lucide-react';
import { LabTestService, WizardSample } from '../../lib/orderCatalog';
import { AllocatedVial, buildVialAllocation } from '../../lib/orderProjection';
import { formatCurrency } from '../../lib/utils';

type Props = {
  sample: WizardSample;
  catalog?: LabTestService[];
  compact?: boolean;
  /** Highlight a vial index (1-based) when hovered elsewhere. */
  activeIndex?: number | null;
  onSelectVial?: (vial: AllocatedVial) => void;
};

export default function VialAllocationMap({
  sample,
  catalog,
  compact = false,
  activeIndex = null,
  onSelectVial,
}: Props) {
  const alloc = buildVialAllocation(sample, catalog);
  if (!sample.primary_test_id || alloc.vials.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-atlas-border bg-neutral-50 px-4 py-3 text-sm text-neutral-500">
        Select a package or assay to see which vials to ship.
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-brand-200 bg-white ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-sm font-bold text-black inline-flex items-center gap-1.5">
            <FlaskConical size={15} className="text-brand-700" />
            Vials to ship
          </p>
          <p className="text-xs text-neutral-500 mt-0.5">
            {alloc.totalVials} vial{alloc.totalVials === 1 ? '' : 's'}
            {alloc.conformityVials > 0
              ? ` · ${alloc.conformityVials} for conformity (identity, purity, quantity)`
              : ''}
          </p>
        </div>
        {alloc.extraConformityVials > 0 && (
          <span className="text-[10px] font-bold uppercase tracking-wide text-brand-800 bg-brand-50 border border-brand-200 rounded-full px-2 py-0.5">
            +{alloc.extraConformityVials} paid
          </span>
        )}
      </div>

      <div className={`grid gap-2 ${compact ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'}`}>
        {alloc.vials.map(vial => {
          const active = activeIndex === vial.index;
          return (
            <button
              key={vial.label}
              type="button"
              onClick={() => onSelectVial?.(vial)}
              className={`text-left rounded-lg border px-2.5 py-2 transition-colors ${
                active
                  ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-300'
                  : vial.paidExtra
                    ? 'border-amber-300 bg-amber-50/60 hover:border-amber-400'
                    : 'border-atlas-border bg-neutral-50/80 hover:border-brand-300'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-extrabold text-black">{vial.label}</span>
                <span
                  className={`text-[9px] font-bold uppercase tracking-wide ${
                    vial.paidExtra ? 'text-amber-800' : 'text-atlas-success'
                  }`}
                >
                  {vial.paidExtra ? 'Added' : 'Included'}
                </span>
              </div>
              <p className="mt-1 text-[11px] font-semibold text-neutral-800 leading-snug">{vial.purpose}</p>
              <p className="mt-0.5 text-[10px] text-neutral-500 leading-snug">{vial.assays.join(' · ')}</p>
              {vial.paidExtra && (
                <p className="mt-1 text-[10px] font-semibold text-amber-900">
                  +{formatCurrency(vial.price)}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
