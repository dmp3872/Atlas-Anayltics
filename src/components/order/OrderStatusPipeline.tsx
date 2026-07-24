import { OrderStatus } from '../../lib/types';
import { ORDER_STATUS_LABELS, ORDER_STATUS_STEPS, getStatusStep } from '../../lib/utils';

/** Shorter labels for tight layouts — same stages as admin / lab order pipeline. */
export const ORDER_STATUS_SHORT_LABELS: Record<(typeof ORDER_STATUS_STEPS)[number], string> = {
  awaiting_sample: 'Awaiting',
  processing: 'Received',
  analyzing: 'Testing',
  in_review: 'Review',
  complete: 'Complete',
};

interface Props {
  status: OrderStatus | string;
  /** compact = portal cards; comfortable = admin / history */
  size?: 'compact' | 'comfortable';
  className?: string;
  showCurrentCaption?: boolean;
}

/**
 * Shared testing-process progress: continuous bar (portal classic) + labeled stages
 * aligned to ORDER_STATUS_STEPS / admin & lab workflow.
 */
export default function OrderStatusPipeline({
  status,
  size = 'compact',
  className = '',
  showCurrentCaption = true,
}: Props) {
  const steps = ORDER_STATUS_STEPS;
  const currentIdx = getStatusStep(status as OrderStatus);
  const cancelled = status === 'cancelled';
  const currentKey = steps[Math.min(Math.max(currentIdx, 0), steps.length - 1)];
  const currentLabel = cancelled
    ? ORDER_STATUS_LABELS.cancelled
    : ORDER_STATUS_LABELS[currentKey];

  const barH = size === 'compact' ? 'h-2' : 'h-2.5';
  const labelClass = size === 'compact' ? 'text-[10px]' : 'text-xs';

  return (
    <div className={className} aria-label={`Order progress: ${currentLabel}`}>
      {cancelled && (
        <p className="text-xs font-semibold text-red-700 mb-2">Order cancelled</p>
      )}

      {/* Continuous segmented bar — fills through the current stage */}
      <div className="flex gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length - 1} aria-valuenow={cancelled ? 0 : currentIdx}>
        {steps.map((step, i) => {
          const filled = !cancelled && i <= currentIdx;
          const active = !cancelled && i === currentIdx;
          return (
            <div
              key={step}
              title={ORDER_STATUS_LABELS[step]}
              className={`${barH} flex-1 rounded-full transition-colors ${
                filled
                  ? active
                    ? 'bg-brand-600 shadow-[0_0_0_2px_rgba(202,138,4,0.25)]'
                    : 'bg-brand-500'
                  : 'bg-neutral-200'
              }`}
            />
          );
        })}
      </div>

      {/* Stage labels under the bar */}
      <div className="flex gap-1 mt-1.5">
        {steps.map((step, i) => {
          const reached = !cancelled && i <= currentIdx;
          const active = !cancelled && i === currentIdx;
          const short = ORDER_STATUS_SHORT_LABELS[step];
          const full = ORDER_STATUS_LABELS[step];
          return (
            <div
              key={step}
              className={`flex-1 min-w-0 text-center ${labelClass} font-semibold leading-tight ${
                active ? 'text-brand-800' : reached ? 'text-brand-700' : 'text-neutral-400'
              }`}
              title={full}
            >
              {size === 'comfortable' ? (
                <>
                  <span className="hidden sm:inline">{full}</span>
                  <span className="sm:hidden">{short}</span>
                </>
              ) : (
                short
              )}
            </div>
          );
        })}
      </div>

      {showCurrentCaption && !cancelled && (
        <p className="mt-2.5 text-xs text-neutral-600 leading-snug">
          <span className="inline-flex items-center rounded-md bg-brand-100 text-brand-900 font-semibold px-1.5 py-0.5 mr-1.5">
            {currentLabel}
          </span>
          {currentKey === 'awaiting_sample' && 'Ship your samples using the checklist on this order (RFID pickup or standard drop-off).'}
          {currentKey === 'processing' && 'Your package was received and accessioned at the lab.'}
          {currentKey === 'analyzing' && 'Chemists are running your selected panels.'}
          {currentKey === 'in_review' && 'Results are under lab review before the COA is published.'}
          {currentKey === 'complete' && 'Testing finished — your COA is available.'}
        </p>
      )}

      {showCurrentCaption && cancelled && (
        <p className="mt-2 text-xs text-neutral-500">This order is no longer in the testing pipeline.</p>
      )}
    </div>
  );
}
