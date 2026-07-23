import { CheckCircle2, CircleDashed, XCircle } from 'lucide-react';
import { formatLabelClaim } from '../../lib/orderCatalog';
import type { LabCoaResults } from '../../lib/labCoaForm';

type Props = {
  labelClaim: string;
  labelClaimUnit?: string;
  results: LabCoaResults;
  overallResult: 'pass' | 'fail' | 'pending';
};

function parseAmount(raw: string): number | null {
  const match = raw.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function StatusIcon({ state }: { state: 'pass' | 'fail' | 'pending' }) {
  if (state === 'pass') return <CheckCircle2 size={14} className="text-emerald-600" />;
  if (state === 'fail') return <XCircle size={14} className="text-red-600" />;
  return <CircleDashed size={14} className="text-amber-500" />;
}

function Cell({
  label,
  claim,
  result,
  state,
}: {
  label: string;
  claim: string;
  result: string;
  state: 'pass' | 'fail' | 'pending';
}) {
  return (
    <div className="rounded-lg border border-atlas-border bg-white px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500">{label}</p>
        <StatusIcon state={state} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Claim</p>
          <p className="mt-0.5 font-semibold text-neutral-700">{claim || '—'}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Result</p>
          <p className="mt-0.5 font-bold text-black">{result || '—'}</p>
        </div>
      </div>
    </div>
  );
}

export default function ClaimVsResultStrip({
  labelClaim,
  labelClaimUnit = 'mg',
  results,
  overallResult,
}: Props) {
  const claimText = formatLabelClaim(labelClaim, labelClaimUnit);
  const claimAmount = parseAmount(labelClaim);
  const measuredAmount = parseAmount(results.netContent);
  const purity = parseAmount(results.netPurity);

  let quantityState: 'pass' | 'fail' | 'pending' = 'pending';
  if (measuredAmount != null && claimAmount != null && claimAmount > 0) {
    const deltaPct = Math.abs(measuredAmount - claimAmount) / claimAmount;
    quantityState = deltaPct <= 0.1 ? 'pass' : 'fail';
  } else if (results.netContent.trim()) {
    quantityState = overallResult === 'fail' ? 'fail' : 'pending';
  }

  let purityState: 'pass' | 'fail' | 'pending' = 'pending';
  if (purity != null) purityState = purity >= 98 ? 'pass' : 'fail';

  const identityState: 'pass' | 'fail' | 'pending' = results.identification.trim()
    ? overallResult === 'fail'
      ? 'fail'
      : 'pass'
    : 'pending';

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-black">Claim vs result</p>
          <p className="text-xs text-neutral-500">
            Live comparison while entering Issue COA values.
          </p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            overallResult === 'pass'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : overallResult === 'fail'
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          Overall {overallResult}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Cell
          label="Identity"
          claim="Matches labeled peptide"
          result={results.identification.trim() || 'Pending'}
          state={identityState}
        />
        <Cell
          label="Quantity"
          claim={claimText || '—'}
          result={results.netContent.trim() || 'Pending'}
          state={quantityState}
        />
        <Cell
          label="Purity"
          claim="≥ 98%"
          result={results.netPurity.trim() ? `${results.netPurity.trim()}%` : 'Pending'}
          state={purityState}
        />
      </div>
    </div>
  );
}
