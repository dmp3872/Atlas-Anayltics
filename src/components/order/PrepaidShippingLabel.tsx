import { Copy, Check, Printer } from 'lucide-react';
import { useState } from 'react';
import { ATLAS_SHIP_TO, shippingLabelTracking } from '../../lib/shippingLabel';

interface Props {
  labelId: string;
  orderNumber: string;
  compact?: boolean;
}

export default function PrepaidShippingLabel({ labelId, orderNumber, compact }: Props) {
  const [copied, setCopied] = useState(false);
  const tracking = shippingLabelTracking(labelId);

  function copyTracking() {
    navigator.clipboard.writeText(tracking);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-mono font-semibold text-black">{labelId}</span>
        <span className="text-neutral-400">·</span>
        <span className="font-mono text-neutral-600">{tracking}</span>
        <button type="button" onClick={copyTracking} className="text-brand-700 hover:text-brand-600 font-medium">
          {copied ? 'Copied' : 'Copy tracking'}
        </button>
      </div>
    );
  }

  return (
    <div className="border-2 border-black rounded-lg overflow-hidden bg-white print:border-black">
      <div className="bg-black text-white px-4 py-2 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-brand-400">Prepaid Shipping Label</span>
        <span className="text-[10px] text-neutral-400">Atlas Analytics</span>
      </div>
      <div className="p-4 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">Ship To</p>
            <p className="font-semibold text-black">{ATLAS_SHIP_TO.name}</p>
            <p className="text-neutral-600">{ATLAS_SHIP_TO.line1}</p>
            <p className="text-neutral-600">{ATLAS_SHIP_TO.city}, {ATLAS_SHIP_TO.state} {ATLAS_SHIP_TO.zip}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">Reference</p>
            <p className="font-mono text-sm font-semibold">{orderNumber}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mt-3 mb-1">Label ID</p>
            <p className="font-mono text-sm">{labelId}</p>
          </div>
        </div>
        <div className="border border-dashed border-neutral-300 rounded p-3 bg-neutral-50">
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">Tracking Number</p>
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-lg font-bold tracking-wide">{tracking}</p>
            <button type="button" onClick={copyTracking} className="btn-outline text-xs gap-1 py-1.5 px-2.5">
              {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
            </button>
          </div>
        </div>
        <p className="text-xs text-neutral-500">
          Attach this label to your package. FedEx or UPS prepaid — drop off at any authorized location.
        </p>
        <button type="button" onClick={() => window.print()} className="btn-secondary text-sm gap-1.5 no-print w-full sm:w-auto">
          <Printer size={14} /> Print Label
        </button>
      </div>
    </div>
  );
}
