import { CheckCircle, ShoppingCart } from 'lucide-react';
import {
  WizardSample, orderTotals, formatSampleTests, FULL_QC_PANEL,
} from '../../lib/orderCatalog';
import { formatCurrency } from '../../lib/utils';

interface Props {
  samples: WizardSample[];
  step: number;
  total?: number;
}

export default function OrderSummarySidebar({ samples, step, total }: Props) {
  const { subtotal, sampleCount } = orderTotals(samples);
  const displayTotal = total ?? subtotal;
  const hasTests = samples.some(s => s.sample_name && (s.test_mode === 'full_qc' || s.individual_tests.length > 0));

  return (
    <div className="card p-5 sticky top-24 border-brand-200 shadow-sm">
      <h3 className="font-bold text-black mb-4 flex items-center gap-2">
        <ShoppingCart size={18} className="text-brand-600" />
        Order Summary
      </h3>

      <div className="space-y-2 text-sm mb-4">
        <div className="flex justify-between">
          <span className="text-neutral-500">Samples</span>
          <span className="font-semibold">{sampleCount || samples.filter(s => s.sample_name).length}</span>
        </div>
        {hasTests && (
          <div className="flex justify-between">
            <span className="text-neutral-500">Testing</span>
            <span className="font-semibold">{formatCurrency(subtotal)}</span>
          </div>
        )}
      </div>

      <div className="border-t border-atlas-border pt-3 flex justify-between items-baseline">
        <span className="font-bold text-black">Total</span>
        <span className="font-bold text-2xl text-brand-700">{formatCurrency(displayTotal)}</span>
      </div>

      <p className="text-xs text-neutral-500 mt-3">Invoice sent after order confirmation</p>

      <ul className="mt-5 space-y-2.5 text-xs text-neutral-600">
        {[
          'ISO 17025 accredited laboratory',
          '3–5 day standard turnaround',
          'QR-verified certificates of analysis',
          'Secure payment via Square',
        ].map(item => (
          <li key={item} className="flex items-start gap-2">
            <CheckCircle size={13} className="text-atlas-success flex-shrink-0 mt-0.5" />
            {item}
          </li>
        ))}
      </ul>

      {step === 1 && (
        <p className="text-[10px] text-neutral-400 mt-4 leading-relaxed border-t border-atlas-border pt-3">
          {FULL_QC_PANEL.name}: submit {FULL_QC_PANEL.vialsRequired} vials (min. 10 mg each). Individual tests: 1 vial per test.
        </p>
      )}
    </div>
  );
}
