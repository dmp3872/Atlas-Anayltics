import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, ExternalLink, PartyPopper, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { COA, OrderSample } from '../../lib/types';
import AtlasDigitalCoaCard from '../order/AtlasDigitalCoaCard';
import { assayResultsFromPanels } from '../../lib/coaDisplayPanels';
import { createEmptySample, type TestMode } from '../../lib/orderCatalog';

interface Props {
  coa: COA;
  sample?: OrderSample;
  onClose: () => void;
}

function coaSample(coa: COA, sample?: OrderSample) {
  const meta = (sample?.metadata ?? {}) as Record<string, unknown>;
  const modeValue = typeof meta.test_mode === 'string' ? meta.test_mode : 'individual';
  const mode: TestMode =
    modeValue === 'atlas_pro' || modeValue === 'full_qc' ? modeValue : 'individual';
  const individualTests = Array.isArray(meta.individual_tests)
    ? meta.individual_tests.filter((value): value is string => typeof value === 'string')
    : [];
  if (mode === 'individual' && individualTests.length === 0) {
    individualTests.push('identity_purity_quantity');
  }
  return createEmptySample({
    sample_name: sample?.sample_name || coa.sample_name,
    display_name: sample?.display_name || coa.display_name,
    batch_number:
      (typeof meta.batch_number === 'string' ? meta.batch_number : '') || coa.batch_number || '',
    labeled_content: typeof meta.labeled_content === 'string' ? meta.labeled_content : '',
    label_claim_unit:
      typeof meta.label_claim_unit === 'string' ? meta.label_claim_unit : 'mg',
    primary_test_id:
      (typeof meta.primary_test_id === 'string' ? meta.primary_test_id : '') ||
      (mode === 'individual' ? 'identity_purity_quantity' : mode),
    test_mode: mode,
    individual_tests: individualTests,
    conformity_extra: Number(meta.conformity_extra) || 0,
    include_fentanyl: Boolean(meta.include_fentanyl),
  });
}

export default function CoaReadyCelebration({ coa, sample, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const digitalSample = useMemo(() => coaSample(coa, sample), [coa, sample]);
  const assayResults = useMemo(
    () =>
      assayResultsFromPanels(coa.panel_results, {
        quantityUnit: digitalSample.label_claim_unit || 'mg',
      }),
    [coa.panel_results, digitalSample.label_claim_unit],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  async function copyEmbed() {
    const embedUrl = `${window.location.origin}/embed/coa/${encodeURIComponent(coa.slug)}`;
    const code = `<iframe src="${embedUrl}" title="Atlas Analytics Verified COA" width="390" height="780" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" style="border:0;width:100%;max-width:390px;"></iframe>`;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="coa-ready-title"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="relative my-auto w-full max-w-3xl overflow-hidden rounded-3xl border border-atlas-gold/40 bg-neutral-950 shadow-2xl">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          {Array.from({ length: 18 }, (_, index) => (
            <span
              key={index}
              className="absolute h-2 w-2 animate-bounce rounded-sm bg-atlas-gold opacity-70"
              style={{
                left: `${5 + ((index * 17) % 90)}%`,
                top: `${4 + ((index * 23) % 76)}%`,
                animationDelay: `${(index % 6) * 120}ms`,
                animationDuration: `${900 + (index % 4) * 180}ms`,
                transform: `rotate(${index * 29}deg)`,
              }}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/60 text-neutral-300 hover:text-white"
          aria-label="Close COA celebration"
        >
          <X size={17} />
        </button>

        <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_300px] lg:items-center">
          <div className="text-center lg:text-left">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-atlas-gold text-black shadow-[0_0_30px_rgba(212,175,55,0.45)]">
              <PartyPopper size={27} />
            </span>
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.3em] text-atlas-gold">
              Testing complete
            </p>
            <h2 id="coa-ready-title" className="mt-2 text-3xl font-extrabold text-white">
              Your COA is ready
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-neutral-300">
              Results for <strong className="text-white">{coa.display_name || coa.sample_name}</strong>{' '}
              are verified and ready to view, share, or embed on your website.
            </p>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
              <Link to={`/coa/${encodeURIComponent(coa.slug)}`} className="btn-primary justify-center gap-2">
                <ExternalLink size={16} /> View COA
              </Link>
              {coa.is_public && (
                <button type="button" onClick={copyEmbed} className="btn-outline-gold justify-center gap-2">
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? 'Embed code copied' : 'Copy embed code'}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 text-xs font-semibold text-neutral-500 hover:text-neutral-300"
            >
              Continue to dashboard
            </button>
          </div>

          <div className="mx-auto w-full max-w-[300px]">
            <AtlasDigitalCoaCard
              samples={[digitalSample]}
              companyName={coa.company_name || ''}
              stage="tracking"
              trackingStage="complete"
              accession={coa.accession_number || coa.slug}
              readinessPercent={100}
              overallResult={
                coa.overall_result === 'pass' || coa.overall_result === 'fail'
                  ? coa.overall_result
                  : 'pending'
              }
              assayResults={assayResults}
              celebrate
            />
          </div>
        </div>
      </div>
    </div>
  );
}
