import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader, ShieldCheck } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import AtlasDigitalCoaCard from '../components/order/AtlasDigitalCoaCard';
import { assayResultsFromPanels } from '../lib/coaDisplayPanels';
import { createEmptySample, type TestMode, type WizardSample, isOtherResearchMaterial } from '../lib/orderCatalog';
import { supabase } from '../lib/supabase';
import type { COA, PanelResult } from '../lib/types';

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function sampleFromCoa(coa: COA): WizardSample {
  const summary =
    coa.result_summary && typeof coa.result_summary === 'object'
      ? (coa.result_summary as Record<string, unknown>)
      : {};
  const panels = Array.isArray(coa.panel_results) ? coa.panel_results : [];
  const panelNames = panels.map(panel => panel.panel_name.toLowerCase());
  const storedMode = stringValue(summary.test_mode);

  let testMode: TestMode =
    storedMode === 'atlas_pro' || storedMode === 'full_qc' ? storedMode : 'individual';

  const individualTests: string[] = [];
  if (panelNames.some(name => /purity|identity|content|quant/.test(name))) {
    individualTests.push('identity_purity_quantity');
  }
  if (panelNames.some(name => /heavy metal|lead|arsenic|cadmium|mercury|chromium/.test(name))) {
    individualTests.push('heavy_metals_icpms');
  }
  if (panelNames.some(name => /endotoxin|lal/.test(name))) {
    individualTests.push('endotoxin_usp85');
  }
  if (panelNames.some(name => /sterility/.test(name))) {
    individualTests.push(
      panelNames.some(name => /culture/.test(name)) ? 'sterility_culture' : 'sterility_pcr',
    );
  }
  const includeFentanyl = panelNames.some(name => /fentanyl/.test(name));
  if (includeFentanyl) individualTests.push('fentanyl_detection');

  if (testMode === 'individual' && individualTests.length === 0) {
    individualTests.push('identity_purity_quantity');
  }

  // Older issued COAs may not retain package mode. A full biosafety set is
  // safely represented as Atlas Pro for method/vial display purposes.
  if (
    testMode === 'individual' &&
    individualTests.includes('heavy_metals_icpms') &&
    individualTests.includes('endotoxin_usp85') &&
    individualTests.includes('sterility_pcr')
  ) {
    testMode = 'atlas_pro';
  }

  const testedVials =
    numberValue(summary.conformity_vials) ||
    numberValue(summary.variance_vials) ||
    numberValue(summary.vials_tested) ||
    numberValue(summary.mean_of_vials_tested);
  const conformityExtra =
    testMode === 'atlas_pro' ? Math.max(0, Math.round(testedVials) - 3) : 0;

  const primaryId =
    testMode === 'atlas_pro' || testMode === 'full_qc'
      ? testMode
      : individualTests[0] || 'identity_purity_quantity';

  const matrixStored =
    stringValue(summary.sample_matrix) || stringValue(summary.matrix_type);
  const categoryStored = stringValue(summary.category);
  const category: WizardSample['category'] | undefined =
    categoryStored === 'other'
    || categoryStored === 'single_peptide'
    || categoryStored === 'peptide_blend'
    || categoryStored === 'bac_water'
      ? categoryStored
      : isOtherResearchMaterial(matrixStored)
        ? 'other'
        : undefined;

  return createEmptySample({
    sample_name: coa.sample_name || coa.display_name,
    display_name: coa.display_name || coa.sample_name,
    batch_number: coa.batch_number || '',
    peptide_identification: coa.sample_name || coa.display_name,
    labeled_content:
      stringValue(summary.labeled_content) ||
      stringValue(summary.net_content) ||
      stringValue(summary.avg_net_peptide_content),
    label_claim_unit: stringValue(summary.label_claim_unit) || 'mg',
    primary_test_id: primaryId,
    test_mode: testMode,
    individual_tests: individualTests.filter(id => id !== primaryId),
    include_fentanyl: includeFentanyl,
    conformity_extra: conformityExtra,
    category,
    sample_matrix: (matrixStored || undefined) as WizardSample['sample_matrix'] | undefined,
  });
}

function overallPanelStatus(panels: PanelResult[]): 'pass' | 'fail' | 'pending' {
  if (!panels.length || panels.some(panel => !stringValue(panel.result))) return 'pending';
  return panels.every(panel => panel.pass) ? 'pass' : 'fail';
}

export default function EmbeddedCOA() {
  const { slug = '' } = useParams();
  const [coa, setCoa] = useState<COA | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setNotFound(false);
      const { data, error } = await supabase
        .from('coas')
        .select('*')
        .eq('slug', slug)
        .eq('is_public', true)
        .maybeSingle();

      if (cancelled) return;
      if (error || !data) {
        setNotFound(true);
        setCoa(null);
      } else {
        setCoa(data as unknown as COA);
      }
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    document.title = coa
      ? `${coa.display_name || coa.sample_name} — Atlas Verified COA`
      : 'Atlas Verified COA';
  }, [coa]);

  const sample = useMemo(() => (coa ? sampleFromCoa(coa) : null), [coa]);
  const result = coa
    ? coa.overall_result === 'pass' || coa.overall_result === 'fail'
      ? coa.overall_result
      : overallPanelStatus(Array.isArray(coa.panel_results) ? coa.panel_results : [])
    : 'pending';
  const assayResults = useMemo(() => {
    if (!coa || !sample) return null;
    return assayResultsFromPanels(coa.panel_results, {
      vialCount: Math.max(1, sample.conformity_extra + (sample.test_mode === 'atlas_pro' ? 3 : 1)),
      quantityUnit: sample.label_claim_unit || 'mg',
    });
  }, [coa, sample]);

  if (loading) {
    return (
      <main className="min-h-screen bg-transparent flex items-center justify-center p-5">
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <Loader size={18} className="animate-spin text-brand-600" />
          Loading verified certificate…
        </div>
      </main>
    );
  }

  if (notFound || !coa || !sample) {
    return (
      <main className="min-h-screen bg-neutral-50 flex items-center justify-center p-5">
        <div className="max-w-sm rounded-2xl border border-atlas-border bg-white p-6 text-center shadow-sm">
          <ShieldCheck size={28} className="mx-auto text-neutral-300" />
          <h1 className="mt-3 font-bold text-black">COA unavailable</h1>
          <p className="mt-1 text-sm text-neutral-500">
            This certificate is private, unpublished, or no longer available.
          </p>
          <Link to={`/verify?slug=${encodeURIComponent(slug)}`} className="btn-outline mt-4 inline-flex text-sm">
            Verify certificate
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-transparent px-5 py-4">
      <div className="mx-auto w-full max-w-[390px]">
        <AtlasDigitalCoaCard
          samples={[sample]}
          companyName={coa.company_name || ''}
          stage="tracking"
          trackingStage="complete"
          accession={coa.accession_number || coa.slug}
          readinessPercent={100}
          overallResult={result}
          assayResults={assayResults}
        />

        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-atlas-border bg-white/95 px-3 py-2 shadow-sm">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-neutral-500">
              Published result
            </p>
            <p
              className={`text-sm font-extrabold uppercase ${
                result === 'pass'
                  ? 'text-emerald-700'
                  : result === 'fail'
                    ? 'text-red-700'
                    : 'text-amber-700'
              }`}
            >
              {result}
            </p>
          </div>
          <a
            href={`/coa/${encodeURIComponent(coa.slug)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-outline inline-flex gap-1.5 px-3 py-1.5 text-xs"
          >
            Full COA <ExternalLink size={12} />
          </a>
        </div>

        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 block text-center text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-400 hover:text-brand-700"
        >
          Powered by Atlas Analytics
        </a>
      </div>
    </main>
  );
}
