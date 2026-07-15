import { useState } from 'react';
import { ChevronDown, ChevronUp, ClipboardList } from 'lucide-react';
import {
  LabTestService,
  WizardSample,
  formatOrderTurnaround,
  orderTotals,
} from '../../lib/orderCatalog';
import { computeOrderReadiness } from '../../lib/orderReadiness';
import { formatCurrency } from '../../lib/utils';

interface Props {
  samples: WizardSample[];
  catalog: LabTestService[];
  discount?: number;
  className?: string;
}

export default function AtlasOrderSnapshot({
  samples,
  catalog,
  discount = 0,
  className = '',
}: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const readiness = computeOrderReadiness(samples);
  const { sampleCount, testCount, totalVials, subtotal, testSubtotal, addOnSubtotal } =
    orderTotals(samples, '', catalog);
  const estimatedTotal = Math.max(0, subtotal - discount);
  const turnaroundLabel = formatOrderTurnaround(samples, catalog);

  const body = (
    <>
      <div className="mb-4">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Order Readiness</p>
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-md ${
              readiness.state === 'ready_to_review'
                ? 'bg-emerald-50 text-emerald-800'
                : readiness.state === 'information_missing'
                  ? 'bg-amber-50 text-amber-900'
                  : 'bg-neutral-100 text-neutral-600'
            }`}
          >
            {readiness.stateLabel}
          </span>
        </div>
        <div
          className="h-2 rounded-full bg-neutral-100 overflow-hidden"
          role="progressbar"
          aria-valuenow={readiness.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Order readiness"
        >
          <div
            className={`h-full transition-all duration-300 ${
              readiness.state === 'ready_to_review' ? 'bg-emerald-500' : 'bg-brand-500'
            }`}
            style={{ width: `${readiness.percent}%` }}
          />
        </div>
        <p className="text-sm font-semibold text-black mt-1.5">{readiness.percent}% complete</p>
        <ul className="mt-2 space-y-1">
          {readiness.messages.map(msg => (
            <li key={msg} className="text-xs text-neutral-600 leading-snug">
              {msg}
            </li>
          ))}
        </ul>
      </div>

      <dl className="space-y-2.5 text-sm border-t border-atlas-border pt-4">
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">Samples</dt>
          <dd className="font-semibold text-black">{sampleCount || samples.length}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">Selected tests</dt>
          <dd className="font-semibold text-black">{testCount}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">Total vials required</dt>
          <dd className="font-semibold text-black">{totalVials}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">Estimated turnaround</dt>
          <dd className="font-semibold text-black text-right">{turnaroundLabel}</dd>
        </div>
        {testSubtotal > 0 && (
          <div className="flex justify-between gap-3">
            <dt className="text-neutral-500">Testing subtotal</dt>
            <dd className="font-semibold text-black">{formatCurrency(testSubtotal)}</dd>
          </div>
        )}
        {addOnSubtotal > 0 && (
          <div className="flex justify-between gap-3">
            <dt className="text-neutral-500">Add-ons</dt>
            <dd className="font-semibold text-black">+{formatCurrency(addOnSubtotal)}</dd>
          </div>
        )}
        {discount > 0 && (
          <div className="flex justify-between gap-3">
            <dt className="text-neutral-500">Discounts</dt>
            <dd className="font-semibold text-emerald-700">−{formatCurrency(discount)}</dd>
          </div>
        )}
      </dl>

      <div className="border-t border-atlas-border mt-4 pt-3 flex justify-between items-baseline">
        <span className="font-bold text-black">Estimated total</span>
        <span className="font-bold text-2xl text-brand-700">{formatCurrency(estimatedTotal)}</span>
      </div>
      <p className="text-[11px] text-neutral-500 mt-2">Invoice issued after laboratory confirmation.</p>
    </>
  );

  return (
    <>
      {/* Mobile collapsible bar */}
      <div className={`lg:hidden ${className}`}>
        <button
          type="button"
          onClick={() => setMobileOpen(o => !o)}
          className="w-full card border-brand-200 px-4 py-3 flex items-center justify-between gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          aria-expanded={mobileOpen}
        >
          <div className="flex items-center gap-2 min-w-0 text-left">
            <ClipboardList size={18} className="text-brand-600 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-black truncate">Atlas Order Snapshot</p>
              <p className="text-xs text-neutral-500">
                {readiness.percent}% · {formatCurrency(estimatedTotal)} · {totalVials} vials
              </p>
            </div>
          </div>
          {mobileOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {mobileOpen && <div className="card border-brand-200 p-4 mt-2 shadow-sm">{body}</div>}
      </div>

      {/* Desktop sticky panel */}
      <aside
        className={`hidden lg:block card border-brand-200 p-5 sticky top-24 shadow-sm ${className}`}
        aria-label="Atlas Order Snapshot"
      >
        <h3 className="font-bold text-black mb-4 flex items-center gap-2">
          <ClipboardList size={18} className="text-brand-600" />
          Atlas Order Snapshot
        </h3>
        {body}
      </aside>
    </>
  );
}
