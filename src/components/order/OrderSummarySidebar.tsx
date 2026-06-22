import { CheckCircle } from 'lucide-react';
import {
  WizardSample, orderTotals, sampleLineTotal, formatSampleTests, FULL_QC_PANEL,
} from '../../lib/orderCatalog';
import { formatCurrency } from '../../lib/utils';

interface Props {
  samples: WizardSample[];
  step: number;
}

export default function OrderSummarySidebar({ samples, step }: Props) {
  const { subtotal, sampleCount, testCount } = orderTotals(samples);

  return (
    <div className="card p-5 sticky top-6 border-brand-200">
      <h3 className="font-bold text-black mb-4">Order Summary</h3>

      <div className="space-y-2 text-sm mb-4">
        <div className="flex justify-between">
          <span className="text-neutral-500">Samples</span>
          <span className="font-semibold">{sampleCount}</span>
        </div>
        {testCount > 0 && (
          <div className="flex justify-between">
            <span className="text-neutral-500">Tests</span>
            <span className="font-semibold">{testCount}</span>
          </div>
        )}
      </div>

      {samples.some(s => s.sample_name) && (
        <div className="border-t border-atlas-border pt-3 mb-4 space-y-3 max-h-64 overflow-y-auto">
          {samples.filter(s => s.sample_name).map((s, i) => (
            <div key={s.id} className="text-sm">
              <p className="font-semibold text-black">{s.sample_name}</p>
              {s.batch_number && <p className="text-xs text-neutral-500">Batch: {s.batch_number}</p>}
              <p className="text-xs text-neutral-500">{formatSampleTests(s)}</p>
              {step >= 2 && s.rush && <p className="text-xs text-amber-600">Rush processing</p>}
              <p className="text-xs font-medium text-brand-800 mt-0.5">{formatCurrency(sampleLineTotal(s))}</p>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-atlas-border pt-3 flex justify-between font-bold text-lg">
        <span>Total</span>
        <span className="text-brand-800">{formatCurrency(subtotal)}</span>
      </div>

      <p className="text-xs text-neutral-500 mt-3">Invoice sent after order confirmation</p>

      <ul className="mt-4 space-y-2 text-xs text-neutral-600">
        {[
          'ISO 17025 accredited laboratory',
          '3–5 day standard turnaround',
          'QR-verified certificates of analysis',
          'Secure payment processing',
        ].map(item => (
          <li key={item} className="flex items-start gap-2">
            <CheckCircle size={12} className="text-atlas-success flex-shrink-0 mt-0.5" />
            {item}
          </li>
        ))}
      </ul>

      {step === 1 && (
        <p className="text-[10px] text-neutral-400 mt-4 leading-relaxed">
          {FULL_QC_PANEL.name}: submit {FULL_QC_PANEL.vialsRequired} vials (min. 10 mg each). Individual tests: 1 vial per test.
        </p>
      )}
    </div>
  );
}
