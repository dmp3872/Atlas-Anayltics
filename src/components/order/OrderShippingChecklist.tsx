import { CheckCircle2, Package, Radio, Truck } from 'lucide-react';
import {
  resolveShippingMode,
  shippingChecklist,
  shippingModeLabel,
  type ShippingMode,
} from '../../lib/shippingGuide';
import PrepaidShippingLabel from './PrepaidShippingLabel';

interface Props {
  orderNumber: string;
  shippingPreboarded?: boolean | null;
  shippingLabelId?: string | null;
  compact?: boolean;
}

export default function OrderShippingChecklist({
  orderNumber,
  shippingPreboarded,
  shippingLabelId,
  compact = false,
}: Props) {
  const mode: ShippingMode = resolveShippingMode(shippingPreboarded);
  const items = shippingChecklist(mode, orderNumber);
  const preboarded = mode === 'preboarded';

  return (
    <section
      className={`rounded-xl border bg-white ${
        preboarded ? 'border-sky-200' : 'border-atlas-border'
      } ${compact ? 'p-4' : 'p-5'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-bold text-black">
            {preboarded ? <Radio size={17} className="text-sky-700" /> : <Truck size={17} className="text-brand-700" />}
            Ship your samples
          </h3>
          <p className="mt-1 text-xs text-neutral-500">
            Follow the steps for your shipping setup. Mixing the two processes can delay receiving.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide border ${
            preboarded
              ? 'bg-sky-50 text-sky-900 border-sky-200'
              : 'bg-neutral-50 text-neutral-700 border-neutral-200'
          }`}
        >
          {shippingModeLabel(mode)}
        </span>
      </div>

      <div
        className={`mt-4 rounded-lg border px-3 py-2.5 text-sm ${
          preboarded
            ? 'border-sky-200 bg-sky-50 text-sky-950'
            : 'border-amber-200 bg-amber-50 text-amber-950'
        }`}
      >
        {preboarded ? (
          <p>
            You are <strong>preboarded</strong>. UPS picks up at your site using your{' '}
            <strong>RFID plaque</strong> + prepaid label. Shipping is free.
          </p>
        ) : (
          <p>
            You are on the <strong>standard ship-in</strong> path (no RFID plaque). Drop the package
            at FedEx/UPS yourself with the prepaid label and order number on the box.
          </p>
        )}
      </div>

      <ol className="mt-4 space-y-3">
        {items.map((item, index) => (
          <li key={item.id} className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black text-[11px] font-bold text-brand-400">
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-black">{item.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-neutral-600">{item.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      {shippingLabelId ? (
        <div className="mt-4 border-t border-atlas-border pt-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-neutral-500">
            <Package size={12} /> Prepaid label
          </p>
          <PrepaidShippingLabel labelId={shippingLabelId} orderNumber={orderNumber} compact={compact} />
        </div>
      ) : (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
          <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-neutral-400" />
          Prepaid label will appear here once generated. Contact Atlas if you need a replacement.
        </p>
      )}
    </section>
  );
}
