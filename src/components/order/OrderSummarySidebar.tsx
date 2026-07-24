import { CheckCircle, ShoppingCart } from 'lucide-react';
import {
  WizardSample, orderTotals, ATLAS_PRO_PANEL, FULL_QC_PANEL, CONFORMITY_PRICE,
  sampleVialCount, sampleTestPrice, sampleAddOnPrice, isPackageMode,
} from '../../lib/orderCatalog';
import { formatCurrency } from '../../lib/utils';

interface Props {
  samples: WizardSample[];
  step: number;
  total?: number;
  primaryBrand?: string;
}

export default function OrderSummarySidebar({ samples, step, total, primaryBrand = '' }: Props) {
  const { subtotal, sampleCount } = orderTotals(samples, primaryBrand);
  const displayTotal = total ?? subtotal;
  const hasTests = samples.some(s => s.sample_name && (isPackageMode(s.test_mode) || s.individual_tests.length > 0));
  const totalVials = samples.reduce((n, s) => n + (s.sample_name ? sampleVialCount(s) : 0), 0);
  const panelFees = samples.reduce((s, sample) => s + sampleTestPrice(sample), 0);
  const addOnFees = samples.reduce((s, sample) => s + sampleAddOnPrice(sample, primaryBrand), 0);
  const conformityVials = samples.reduce((n, s) => n + s.conformity_extra, 0);

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
        {hasTests && panelFees > 0 && (
          <div className="flex justify-between">
            <span className="text-neutral-500">Panel / tests</span>
            <span className="font-semibold">{formatCurrency(panelFees)}</span>
          </div>
        )}
        {addOnFees > 0 && (
          <div className="flex justify-between">
            <span className="text-neutral-500">
              Add-ons{conformityVials > 0 ? ` (incl. ${conformityVials} extra vial${conformityVials === 1 ? '' : 's'})` : ''}
            </span>
            <span className="font-semibold">+{formatCurrency(addOnFees)}</span>
          </div>
        )}
        {totalVials > 0 && (
          <div className="flex justify-between">
            <span className="text-neutral-500">Vials to ship</span>
            <span className="font-semibold">{totalVials}</span>
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
          'Secure payment via Stripe',
        ].map(item => (
          <li key={item} className="flex items-start gap-2">
            <CheckCircle size={13} className="text-atlas-success flex-shrink-0 mt-0.5" />
            {item}
          </li>
        ))}
      </ul>

      {step === 1 && (
        <p className="text-[10px] text-neutral-400 mt-4 leading-relaxed border-t border-atlas-border pt-3">
          {ATLAS_PRO_PANEL.name}: {ATLAS_PRO_PANEL.vialsRequired} vials with conformity included.
          {FULL_QC_PANEL.name}: {FULL_QC_PANEL.vialsRequired} vials (no conformity). Extra conformity vials {formatCurrency(CONFORMITY_PRICE)} each.
        </p>
      )}
    </div>
  );
}
