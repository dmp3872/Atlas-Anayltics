import { useState } from 'react';
import { ChevronDown, ChevronUp, Pencil } from 'lucide-react';
import {
  LabTestService,
  WizardSample,
  categoryLabel,
  formatBlendLabel,
  formatLabelClaim,
  formatSampleTests,
  formatOrderTurnaround,
  orderTotals,
  sampleLineTotal,
  sampleVialCount,
  activeBlendComponents,
} from '../../../lib/orderCatalog';
import { formatCurrency } from '../../../lib/utils';
import { Company } from '../../../lib/types';
import { ReadinessReport } from '../../../lib/orderReadiness';
import OrderPaymentPlaceholder, { SimulatedPaymentMethod } from './OrderPaymentPlaceholder';
import VialAllocationMap from '../VialAllocationMap';

interface Confirmations {
  accurate: boolean;
  labelsMatch: boolean;
  agreeTerms: boolean;
}

interface Props {
  samples: WizardSample[];
  catalog: LabTestService[];
  companyName: string;
  selectedCompany: Company | null;
  discount: number;
  confirmations: Confirmations;
  onConfirmationChange: (patch: Partial<Confirmations>) => void;
  onEditSample: (index: number) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  promoCode: string;
  onPromoCodeChange: (value: string) => void;
  promoApplied: boolean;
  onApplyPromo: () => void;
  paymentPaid: boolean;
  onPaymentPaidChange: (paid: boolean) => void;
  paymentMethod: SimulatedPaymentMethod;
  onPaymentMethodChange: (method: SimulatedPaymentMethod) => void;
  onCardPayAndSubmit?: () => Promise<void>;
  readiness?: ReadinessReport;
}

export default function StepReviewSubmit({
  samples,
  catalog,
  companyName,
  selectedCompany,
  discount,
  confirmations,
  onConfirmationChange,
  onEditSample,
  notes,
  onNotesChange,
  promoCode,
  onPromoCodeChange,
  promoApplied,
  onApplyPromo,
  paymentPaid,
  onPaymentPaidChange,
  paymentMethod,
  onPaymentMethodChange,
  onCardPayAndSubmit,
  readiness,
}: Props) {
  const totals = orderTotals(samples, companyName, catalog);
  const estimatedTotal = Math.max(0, totals.subtotal - discount);
  // Collapsed by default so the review page stays compact.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  function isExpanded(id: string) {
    return expanded[id] === true;
  }

  function toggleExpanded(id: string) {
    setExpanded(prev => ({ ...prev, [id]: !isExpanded(id) }));
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-black">Review and Submit</h2>
        <p className="text-sm text-neutral-500 mt-1">
          Confirm each sample, pay the order total, then accept the acknowledgements to submit.
        </p>
      </div>

      {readiness && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-sm font-bold text-black">Ready to ship checklist</p>
            <span className="text-xs font-semibold text-brand-800">{readiness.percent}%</span>
          </div>
          <ul className="space-y-1.5">
            {readiness.checklist.map(item => (
              <li key={item.id} className="flex items-start gap-2 text-sm">
                <span
                  className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                    item.done ? 'bg-emerald-500' : 'bg-amber-400'
                  }`}
                />
                <span className={item.done ? 'text-neutral-700' : 'text-amber-900'}>
                  {item.label}
                  {!item.done && item.blocking ? ` — ${item.blocking}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        {samples.map((sample, idx) => {
          const claim = formatLabelClaim(sample.labeled_content, sample.label_claim_unit);
          const composition =
            sample.sample_type === 'blend'
              ? formatBlendLabel(sample.blend_components) || activeBlendComponents(sample.blend_components).map(c => c.name).join(', ')
              : sample.peptide_identification || sample.sample_name;
          const open = isExpanded(sample.id);
          const tests = formatSampleTests(sample, catalog);
          return (
            <div key={sample.id} className="card border-atlas-border overflow-hidden">
              <div className="flex items-stretch gap-1 p-2">
                <button
                  type="button"
                  onClick={() => toggleExpanded(sample.id)}
                  className="flex-1 min-w-0 text-left rounded-lg px-2 py-2 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                  aria-expanded={open}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-black truncate">
                        Sample {idx + 1}: {sample.sample_name || 'Untitled'}
                      </p>
                      <p className="text-xs text-neutral-500 mt-0.5 truncate">
                        {categoryLabel(sample.category)}
                        {sample.batch_number ? ` · Lot ${sample.batch_number}` : ''}
                        {' · '}{sampleVialCount(sample, catalog)} vials
                        {' · '}{formatCurrency(sampleLineTotal(sample, companyName, catalog))}
                      </p>
                      {!open && (
                        <p className="text-xs text-neutral-500 mt-0.5 truncate">{tests}</p>
                      )}
                    </div>
                    <span className="flex-shrink-0 text-neutral-500 mt-0.5" aria-hidden>
                      {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onEditSample(idx)}
                  className="btn-ghost text-sm gap-1.5 py-1.5 px-2 self-start mt-1 flex-shrink-0"
                >
                  <Pencil size={14} />
                  Edit
                </button>
              </div>

              {open && (
                <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-2 text-sm border-t border-atlas-border px-4 py-3">
                  <div>
                    <dt className="text-neutral-500 text-xs">Compound / composition</dt>
                    <dd className="font-medium text-black">{composition || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500 text-xs">Lot / batch</dt>
                    <dd className="font-medium text-black">{sample.batch_number || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500 text-xs">Label claim</dt>
                    <dd className="font-medium text-black">{claim || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500 text-xs">Required vials</dt>
                    <dd className="font-medium text-black">{sampleVialCount(sample, catalog)}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-neutral-500 text-xs">Selected testing</dt>
                    <dd className="font-medium text-black">{tests}</dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500 text-xs">Estimated turnaround</dt>
                    <dd className="font-medium text-black">
                      {formatOrderTurnaround([sample], catalog)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-neutral-500 text-xs">Sample price</dt>
                    <dd className="font-medium text-black">{formatCurrency(sampleLineTotal(sample, companyName, catalog))}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-neutral-500 text-xs">COA profile</dt>
                    <dd className="font-medium text-black">{selectedCompany?.name || companyName || 'Not selected'}</dd>
                  </div>
                  <div className="sm:col-span-2 pt-2">
                    <VialAllocationMap sample={sample} catalog={catalog} compact />
                  </div>
                </dl>
              )}
            </div>
          );
        })}
      </div>

      <div className="card border-brand-200 p-4 bg-brand-50/30">
        <h3 className="font-bold text-black mb-3">Order summary</h3>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-neutral-500">Samples</dt><dd className="font-semibold">{totals.sampleCount}</dd></div>
          <div className="flex justify-between"><dt className="text-neutral-500">Testing subtotal</dt><dd className="font-semibold">{formatCurrency(totals.testSubtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-neutral-500">Add-on subtotal</dt><dd className="font-semibold">{formatCurrency(totals.addOnSubtotal)}</dd></div>
          {discount > 0 && (
            <div className="flex justify-between text-emerald-700">
              <dt>Discounts</dt>
              <dd className="font-semibold">−{formatCurrency(discount)}</dd>
            </div>
          )}
          <div className="flex justify-between"><dt className="text-neutral-500">Total vials required</dt><dd className="font-semibold">{totals.totalVials}</dd></div>
          <div className="flex justify-between"><dt className="text-neutral-500">Estimated turnaround</dt><dd className="font-semibold">{formatOrderTurnaround(samples, catalog)}</dd></div>
          <div className="flex justify-between border-t border-atlas-border pt-2 mt-1">
            <dt className="font-bold text-black">Estimated total</dt>
            <dd className="font-bold text-xl text-brand-700">{formatCurrency(estimatedTotal)}</dd>
          </div>
        </dl>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="promo">Promo code</label>
          <div className="flex gap-2">
            <input
              id="promo"
              className="input-field"
              value={promoCode}
              onChange={e => onPromoCodeChange(e.target.value)}
              disabled={promoApplied}
              placeholder="Optional"
            />
            <button type="button" className="btn-outline" onClick={onApplyPromo} disabled={promoApplied}>
              {promoApplied ? 'Applied' : 'Apply'}
            </button>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="order-notes">Order notes (optional)</label>
          <input
            id="order-notes"
            className="input-field"
            value={notes}
            onChange={e => onNotesChange(e.target.value)}
            placeholder="Receiving or billing notes"
          />
        </div>
      </div>

      <fieldset className="space-y-3 card p-4 border-atlas-border">
        <legend className="font-semibold text-black px-1">Confirmations</legend>
        {([
          ['accurate', 'I confirm that the sample information is accurate.'],
          ['labelsMatch', 'I confirm that the physical vial labels will match this submission.'],
          ['agreeTerms', 'I agree to the laboratory’s sample-submission terms.'],
        ] as const).map(([key, label]) => (
          <label key={key} className="flex items-start gap-2.5 text-sm text-neutral-800 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 rounded border-atlas-border"
              checked={confirmations[key]}
              onChange={e => onConfirmationChange({ [key]: e.target.checked })}
            />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>

      <OrderPaymentPlaceholder
        amount={estimatedTotal}
        paid={paymentPaid}
        method={paymentMethod}
        onMethodChange={onPaymentMethodChange}
        onPaidChange={onPaymentPaidChange}
        onCardPayAndSubmit={onCardPayAndSubmit}
      />
    </div>
  );
}
