import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, FileText, X } from 'lucide-react';
import { COA } from '../../lib/types';
import {
  FentanylDetectionMark,
  hydrateCoaImages,
  readCoaPdfStats,
  saveCoaPdfPrep,
} from '../../lib/coaImages';
import { fetchCoaImageRow } from '../../lib/coaSelect';
import {
  ENDOTOXIN_PASS_RESULT,
  ENDOTOXIN_SPEC_EU_ML,
  HEAVY_METAL_NAMES,
  HEAVY_METAL_PASS_RESULT,
  HeavyMetalName,
  AssayPassState,
  assayPassFromSelect,
  assayPassSelectValue,
  computeAssayAveragesFromPanels,
  heavyMetalsEmptyDefaults,
  heavyMetalsPassDefaults,
  SterilityMethod,
  STERILITY_METHOD_LABELS,
  MAX_PURITY_PERCENT,
  PURITY_INPUT_HINT,
  sanitizePurityInput,
  purityExceedsMax,
  resolveCasNumber,
  looksLikeCasNumber,
  lookupCas,
  defaultCultureProjectedCompletion,
  coaIntakeYmd,
} from '../../lib/labCoaForm';
import { downloadCoaPdf, openCoaPrintView } from '../../lib/coaPdf';
import { LABEL_CLAIM_UNITS, labelClaimFromSummary } from '../../lib/orderCatalog';
import {
  chromatogramDataFromParsed,
  type ParsedChromatogram,
} from '../../lib/chromatogramParse';
import LogoDropzone from '../account/LogoDropzone';
import ChromatogramDataDropzone from './ChromatogramDataDropzone';

const MAX_COA_IMAGE_BYTES = 1024 * 1024;

interface Props {
  coa: COA;
  onClose: () => void;
  onSaved?: (coa: COA) => void;
}

function applyPrepDefaults(coa: COA) {
  const next = hydrateCoaImages(coa);
  const stats = readCoaPdfStats(coa);
  const summary = (coa.result_summary && typeof coa.result_summary === 'object')
    ? (coa.result_summary as Record<string, unknown>)
    : {};
  const assay = computeAssayAveragesFromPanels(
    Array.isArray(coa.panel_results) ? coa.panel_results : [],
    coa.purity_percent,
    summary,
  );
  let labeledContent = typeof summary.labeled_content === 'string' ? summary.labeled_content.trim() : '';
  let labelClaimUnit = typeof summary.label_claim_unit === 'string' && summary.label_claim_unit.trim()
    ? summary.label_claim_unit.trim()
    : 'mg';
  if (!labeledContent) {
    const panels = Array.isArray(coa.panel_results) ? coa.panel_results : [];
    const net = panels.find(p => /net content|peptide content/i.test(p.panel_name)
      && !/^blend content/i.test(p.panel_name));
    const m = (net?.specification || '').match(/label claim:\s*([\d.]+)\s*([a-z%µμ]+)?/i);
    if (m) {
      labeledContent = m[1];
      if (m[2]) labelClaimUnit = m[2];
    }
  }
  const resolvedCas = resolveCasNumber(coa.peptide_sequence, coa.sample_name, coa.display_name);
  const includeCas = summary.include_cas_number !== false;
  const intakeYmd = coaIntakeYmd(summary);
  let sterilityProjectedCompletion = stats.sterility_projected_completion || '';
  if (
    stats.sterility_method === 'culture_14_day'
    && stats.sterility_pass === null
    && !sterilityProjectedCompletion.trim()
  ) {
    sterilityProjectedCompletion = defaultCultureProjectedCompletion(intakeYmd || undefined);
  }
  return {
    next,
    stats,
    assay,
    avgNetPeptide: stats.avg_net_peptide_content || assay.avg_net_peptide_content,
    meanOfVials: stats.mean_of_vials_tested || assay.mean_of_vials_tested,
    avgPurity: stats.avg_purity || assay.avg_purity,
    endotoxinEuMl: stats.endotoxin_eu_ml || (stats.endotoxin_pass === true ? ENDOTOXIN_PASS_RESULT : ''),
    labeledContent,
    labelClaimUnit,
    claimDisplay: labelClaimFromSummary(summary),
    includeCas,
    casNumber: resolvedCas,
    intakeYmd,
    sterilityProjectedCompletion,
  };
}

export default function CoaPdfPrepModal({ coa, onClose, onSaved }: Props) {
  const boot = applyPrepDefaults(coa);
  const [vialImage, setVialImage] = useState(boot.next.vial_image || '');
  const [hplcImage, setHplcImage] = useState(boot.next.hplc_image || '');
  const [watermarkImage, setWatermarkImage] = useState(boot.next.chromatogram_image || '');
  const [chromatogramParsed, setChromatogramParsed] = useState<ParsedChromatogram | null>(() => {
    const chrom = boot.next.chromatogram_data;
    const pts = Array.isArray(chrom?.points) ? chrom.points : [];
    if (pts.length < 2) return null;
    return {
      points: pts,
      retention_time: Number(chrom?.retention_time) || pts.reduce((a, b) => (b.y > a.y ? b : a), pts[0]).x,
      source_filename: chrom?.source_filename || 'Saved chromatogram data',
      original_count: Number(chrom?.point_count) || pts.length,
    };
  });
  const [avgNetPeptide, setAvgNetPeptide] = useState(boot.avgNetPeptide);
  const [meanOfVials, setMeanOfVials] = useState(boot.meanOfVials);
  const [avgPurity, setAvgPurity] = useState(boot.avgPurity);
  const [labeledContent, setLabeledContent] = useState(boot.labeledContent);
  const [labelClaimUnit, setLabelClaimUnit] = useState(boot.labelClaimUnit);
  const [includeCas, setIncludeCas] = useState(boot.includeCas);
  const [casNumber, setCasNumber] = useState(boot.casNumber);
  const [casSuggestions, setCasSuggestions] = useState<{ name: string; cas: string }[]>([]);
  const [showCasSuggestions, setShowCasSuggestions] = useState(false);
  const [fentanylDetection, setFentanylDetection] = useState<FentanylDetectionMark>(
    boot.stats.fentanyl_detection,
  );
  const [includeMolecularWeight, setIncludeMolecularWeight] = useState(
    boot.stats.include_molecular_weight,
  );
  const [molecularWeight, setMolecularWeight] = useState(boot.stats.molecular_weight);
  const [sterilityMethod, setSterilityMethod] = useState<SterilityMethod>(
    boot.stats.sterility_method,
  );
  const [sterilityPass, setSterilityPass] = useState<AssayPassState>(boot.stats.sterility_pass);
  const [sterilityProjectedCompletion, setSterilityProjectedCompletion] = useState(
    boot.sterilityProjectedCompletion,
  );
  const [intakeYmd, setIntakeYmd] = useState(boot.intakeYmd);
  const [endotoxinEuMl, setEndotoxinEuMl] = useState(boot.endotoxinEuMl);
  const [endotoxinPass, setEndotoxinPass] = useState<AssayPassState>(boot.stats.endotoxin_pass);
  const [heavyMetalsPass, setHeavyMetalsPass] = useState<AssayPassState>(boot.stats.heavy_metals_pass);
  const [heavyMetals, setHeavyMetals] = useState<Record<HeavyMetalName, string>>(
    boot.stats.heavy_metals || heavyMetalsEmptyDefaults(),
  );
  const [showAssayEdits, setShowAssayEdits] = useState(false);
  const [loadingImages, setLoadingImages] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const assay = useMemo(
    () => computeAssayAveragesFromPanels(
      Array.isArray(coa.panel_results) ? coa.panel_results : [],
      coa.purity_percent,
      (coa.result_summary && typeof coa.result_summary === 'object')
        ? (coa.result_summary as Record<string, unknown>)
        : null,
    ),
    [coa.id, coa.panel_results, coa.purity_percent, coa.result_summary],
  );

  useEffect(() => {
    let cancelled = false;
    const d = applyPrepDefaults(coa);
    setAvgNetPeptide(d.avgNetPeptide);
    setMeanOfVials(d.meanOfVials);
    setAvgPurity(d.avgPurity);
    setLabeledContent(d.labeledContent);
    setLabelClaimUnit(d.labelClaimUnit);
    setIncludeCas(d.includeCas);
    setCasNumber(d.casNumber);
    setFentanylDetection(d.stats.fentanyl_detection);
    setIncludeMolecularWeight(d.stats.include_molecular_weight);
    setMolecularWeight(d.stats.molecular_weight);
    setSterilityMethod(d.stats.sterility_method);
    setSterilityPass(d.stats.sterility_pass);
    setSterilityProjectedCompletion(d.sterilityProjectedCompletion);
    setIntakeYmd(d.intakeYmd);
    setEndotoxinEuMl(d.endotoxinEuMl);
    setEndotoxinPass(d.stats.endotoxin_pass);
    setHeavyMetalsPass(d.stats.heavy_metals_pass);
    setHeavyMetals(d.stats.heavy_metals || heavyMetalsEmptyDefaults());
    {
      const chrom = d.next.chromatogram_data;
      const pts = Array.isArray(chrom?.points) ? chrom.points : [];
      if (pts.length >= 2) {
        setChromatogramParsed({
          points: pts,
          retention_time: Number(chrom?.retention_time) || pts.reduce((a, b) => (b.y > a.y ? b : a), pts[0]).x,
          source_filename: chrom?.source_filename || 'Saved chromatogram data',
          original_count: Number(chrom?.point_count) || pts.length,
        });
      } else {
        setChromatogramParsed(null);
      }
    }
    setShowAssayEdits(false);
    setError(null);
    setLoadingImages(true);

    // Workflow list rows omit multi‑MB image columns — reload vial + chromatogram saved at Issue.
    void (async () => {
      const images = await fetchCoaImageRow(coa.id);
      if (cancelled) return;
      const vial = (images?.vial_image || d.next.vial_image || '').trim();
      const hplc = (images?.hplc_image || d.next.hplc_image || '').trim();
      const watermark = (images?.chromatogram_image || d.next.chromatogram_image || '').trim();
      setVialImage(vial);
      setHplcImage(hplc);
      setWatermarkImage(watermark);
      setLoadingImages(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [coa.id]);

  async function handleGenerate() {
    if (loadingImages) {
      setError('Still loading images saved at Issue — wait a moment and try again.');
      return;
    }
    const vials = meanOfVials.trim();
    if (vials && !/^\d+(\.\d+)?$/.test(vials)) {
      setError('Mean of vials tested must be a number.');
      return;
    }
    if (includeMolecularWeight && molecularWeight.trim() && Number.isNaN(Number(molecularWeight))) {
      setError('Molecular weight must be a number.');
      return;
    }
    if (purityExceedsMax(avgPurity)) {
      setError(`Average purity cannot exceed ${MAX_PURITY_PERCENT.toFixed(2)}% (±0.18%). 100% is not allowed.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { coa: saved, error: saveError } = await saveCoaPdfPrep(coa, {
        vial_image: vialImage,
        chromatogram_image: watermarkImage || coa.chromatogram_image || '',
        hplc_image: hplcImage,
        chromatogram_data: chromatogramParsed
          ? chromatogramDataFromParsed(chromatogramParsed, coa.chromatogram_data)
          : {
              ...(coa.chromatogram_data && typeof coa.chromatogram_data === 'object'
                ? {
                    vial_size: coa.chromatogram_data.vial_size,
                    sample_matrix: coa.chromatogram_data.sample_matrix,
                  }
                : {}),
            },
        company_logo: coa.company_logo || '',
        avg_net_peptide_content: avgNetPeptide,
        mean_of_vials_tested: vials,
        avg_purity: avgPurity,
        labeled_content: labeledContent,
        label_claim_unit: labelClaimUnit,
        include_cas_number: includeCas,
        cas_number: includeCas
          ? (looksLikeCasNumber(casNumber) ? casNumber.trim() : resolveCasNumber(casNumber, coa.sample_name, coa.display_name))
          : '',
        fentanyl_detection: fentanylDetection,
        include_molecular_weight: includeMolecularWeight,
        molecular_weight: molecularWeight,
        sterility_method: sterilityMethod,
        sterility_pass: sterilityPass,
        sterility_projected_completion:
          sterilityMethod === 'culture_14_day' && sterilityPass === null
            ? sterilityProjectedCompletion.trim()
            : '',
        endotoxin_eu_ml: endotoxinEuMl,
        endotoxin_pass: endotoxinPass,
        heavy_metals_pass: heavyMetalsPass,
        heavy_metals: heavyMetals,
        include_sterility: (() => {
          const summary = (coa.result_summary && typeof coa.result_summary === 'object')
            ? (coa.result_summary as Record<string, unknown>)
            : {};
          if (typeof summary.include_sterility === 'boolean') return summary.include_sterility;
          if (summary.test_mode === 'atlas_pro' || summary.test_mode === 'full_qc') return true;
          const panel = (Array.isArray(coa.panel_results) ? coa.panel_results : [])
            .find(p => /steril/i.test(p.panel_name));
          if (!panel) return false;
          const result = (panel.result || '').trim();
          return !(panel.pass === null || /^pending\b/i.test(result));
        })(),
        include_endotoxin: (() => {
          const summary = (coa.result_summary && typeof coa.result_summary === 'object')
            ? (coa.result_summary as Record<string, unknown>)
            : {};
          if (typeof summary.include_endotoxin === 'boolean') return summary.include_endotoxin;
          if (summary.test_mode === 'atlas_pro') return true;
          if (summary.test_mode === 'full_qc') return false;
          const panel = (Array.isArray(coa.panel_results) ? coa.panel_results : [])
            .find(p => /endotoxin|lal/i.test(p.panel_name));
          if (!panel) return false;
          const result = (panel.result || '').trim();
          return !(panel.pass === null || /^pending$/i.test(result));
        })(),
        include_heavy_metals: (() => {
          const summary = (coa.result_summary && typeof coa.result_summary === 'object')
            ? (coa.result_summary as Record<string, unknown>)
            : {};
          if (typeof summary.include_heavy_metals === 'boolean') return summary.include_heavy_metals;
          if (summary.test_mode === 'atlas_pro') return true;
          if (summary.test_mode === 'full_qc') return false;
          const panels = Array.isArray(coa.panel_results) ? coa.panel_results : [];
          const metal = panels.find(p => /lead|arsenic|cadmium|mercury|chromium/i.test(p.panel_name));
          if (!metal) return false;
          const result = (metal.result || '').trim();
          return !(metal.pass === null || /^pending$/i.test(result));
        })(),
      });
      if (saveError) {
        setError(saveError);
        return;
      }
      onSaved?.(saved);
      onClose();
      // Download digital PDF, then open the live certificate for review.
      try {
        await downloadCoaPdf(saved);
      } catch (dlErr) {
        console.warn('COA PDF download failed:', dlErr);
      }
      openCoaPrintView(saved.slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the certificate.');
    } finally {
      setBusy(false);
    }
  }

  const hydrated = hydrateCoaImages(coa);
  const headerLogo = hydrated.company_logo || '';
  const watermark = watermarkImage || hydrated.chromatogram_image || '';
  const contentBreakdown = assay.content_values.join(' · ') || '—';
  const purityBreakdown = assay.purity_values.join(' · ') || '—';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl border border-atlas-border w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-atlas-border">
          <div>
            <h2 className="text-lg font-bold text-black">Prepare certificate</h2>
            <p className="text-sm text-neutral-500 mt-0.5">
              {coa.display_name || coa.sample_name}
              {coa.company_name ? ` · ${coa.company_name}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-black p-1" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          <p className="text-sm text-neutral-600">
            Assay averages are calculated from Issue results. Vial and chromatograph photos attached at Issue are loaded automatically — replace only if needed.
          </p>

          {(headerLogo || watermark) && (
            <div className="flex flex-wrap gap-4 rounded-lg border border-atlas-border bg-neutral-50 p-3">
              {headerLogo && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">Header logo</p>
                  <img src={headerLogo} alt="" className="h-12 w-12 object-contain bg-white border border-atlas-border rounded" />
                </div>
              )}
              {watermark && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">HPLC watermark</p>
                  <img src={watermark} alt="" className="h-12 w-12 object-contain bg-white border border-atlas-border rounded opacity-70" />
                </div>
              )}
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <label className="label mb-0">Vial photo</label>
                {vialImage ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-atlas-success">
                    <CheckCircle2 size={12} /> From Issue
                  </span>
                ) : loadingImages ? (
                  <span className="text-[11px] text-neutral-400">Loading…</span>
                ) : null}
              </div>
              <p className="text-xs text-neutral-500 mb-2">
                {vialImage
                  ? 'Already attached at Issue. Replace only if you need a different shot.'
                  : 'Empty background is auto-cropped so the vial fills the certificate frame.'}
              </p>
              <LogoDropzone
                value={vialImage}
                onChange={setVialImage}
                onError={setError}
                maxBytes={MAX_COA_IMAGE_BYTES}
                prompt="a vial photo"
                hint="JPG or PNG, up to 1 MB"
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <label className="label mb-0">Chromatograph photo</label>
                {hplcImage ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-atlas-success">
                    <CheckCircle2 size={12} /> From Issue
                  </span>
                ) : loadingImages ? (
                  <span className="text-[11px] text-neutral-400">Loading…</span>
                ) : null}
              </div>
              <p className="text-xs text-neutral-500 mb-2">
                {hplcImage
                  ? 'Already attached at Issue. Replace only if you need a different run image.'
                  : 'Unique HPLC image for this run. Client watermark logo is applied automatically on the certificate.'}
              </p>
              <LogoDropzone
                value={hplcImage}
                onChange={setHplcImage}
                onError={setError}
                maxBytes={MAX_COA_IMAGE_BYTES}
                prompt="a chromatograph"
                hint="JPG or PNG, up to 1 MB"
              />
            </div>
          </div>

          <div>
            <label className="label mb-2 block">Raw chromatogram data</label>
            <p className="text-xs text-neutral-500 mb-2">
              Optional CSV/TSV (retention time + intensity). Drives the interactive digital chromatogram on the certificate.
            </p>
            <ChromatogramDataDropzone
              parsed={chromatogramParsed}
              onParsed={setChromatogramParsed}
              onError={setError}
            />
          </div>

          <div className="rounded-lg border border-atlas-border p-4 space-y-3 bg-neutral-50/60">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide text-black">Certificate averages</h3>
                <p className="text-xs text-neutral-500 mt-1">
                  Auto-filled from assay
                  {assay.content_values.length || assay.purity_values.length
                    ? `: net ${contentBreakdown}; purity ${purityBreakdown}`
                    : ''}
                </p>
              </div>
              <button
                type="button"
                className="text-xs font-semibold text-brand-700 hover:text-brand-800 shrink-0"
                onClick={() => {
                  setAvgNetPeptide(assay.avg_net_peptide_content);
                  setMeanOfVials(assay.mean_of_vials_tested);
                  setAvgPurity(assay.avg_purity);
                }}
              >
                Recalculate
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="prep-label-claim">
                  Label claim
                  {!labeledContent.trim() && (
                    <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                      Missing — enter for COA
                    </span>
                  )}
                </label>
                <input
                  id="prep-label-claim"
                  value={labeledContent}
                  onChange={e => setLabeledContent(e.target.value)}
                  className={`input-field ${!labeledContent.trim() ? 'border-amber-300 bg-amber-50/40' : ''}`}
                  placeholder="e.g. 10"
                  inputMode="decimal"
                />
              </div>
              <div>
                <label className="label" htmlFor="prep-claim-unit">Claim unit</label>
                <select
                  id="prep-claim-unit"
                  value={labelClaimUnit}
                  onChange={e => setLabelClaimUnit(e.target.value)}
                  className="input-field"
                >
                  {LABEL_CLAIM_UNITS.map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                  {labelClaimUnit
                    && !(LABEL_CLAIM_UNITS as readonly string[]).includes(labelClaimUnit) && (
                    <option value={labelClaimUnit}>{labelClaimUnit}</option>
                  )}
                </select>
              </div>
            </div>
            <div className="rounded-lg border border-atlas-border bg-white p-3 space-y-2">
              <label className="inline-flex items-center gap-2 text-sm text-neutral-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeCas}
                  onChange={e => setIncludeCas(e.target.checked)}
                  className="rounded border-atlas-border"
                />
                Include CAS Number on COA
              </label>
              {includeCas && (
                <div className="relative">
                  <label className="label" htmlFor="prep-cas">CAS Number</label>
                  <input
                    id="prep-cas"
                    value={casNumber}
                    onChange={e => {
                      setCasNumber(e.target.value);
                      setCasSuggestions(lookupCas(e.target.value));
                      setShowCasSuggestions(true);
                    }}
                    onFocus={() => {
                      setCasSuggestions(lookupCas(casNumber || coa.sample_name || ''));
                      setShowCasSuggestions(true);
                    }}
                    onBlur={() => setTimeout(() => setShowCasSuggestions(false), 150)}
                    className="input-field"
                    placeholder="e.g. 218949-48-5"
                    autoComplete="off"
                  />
                  {showCasSuggestions && casSuggestions.length > 0 && (
                    <ul className="absolute z-10 mt-1 w-full bg-white border border-atlas-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {casSuggestions.map(hit => (
                        <li key={`${hit.name}-${hit.cas}`}>
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-brand-50"
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => {
                              setCasNumber(hit.cas);
                              setShowCasSuggestions(false);
                            }}
                          >
                            <span className="font-medium">{hit.name}</span>
                            <span className="text-neutral-500 ml-2 font-mono text-xs">{hit.cas}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-xs text-neutral-500 mt-1">
                    Prefills from sample name when known (e.g. Tesamorelin → 218949-48-5).
                  </p>
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="avg-net-peptide">Average Net Peptide Content</label>
                <input
                  id="avg-net-peptide"
                  value={avgNetPeptide}
                  onChange={e => setAvgNetPeptide(e.target.value)}
                  className="input-field"
                  placeholder="e.g. 12.4 mg"
                />
              </div>
              <div>
                <label className="label" htmlFor="mean-vials">Mean of — vials tested</label>
                <input
                  id="mean-vials"
                  type="number"
                  min={0}
                  step={1}
                  value={meanOfVials}
                  onChange={e => setMeanOfVials(e.target.value)}
                  className="input-field"
                  placeholder="e.g. 3"
                />
                <p className="text-xs text-neutral-500 mt-1">Prints as: Mean of {meanOfVials || '_'} vials tested</p>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="avg-purity">Average Purity</label>
              <input
                id="avg-purity"
                value={avgPurity}
                onChange={e => setAvgPurity(sanitizePurityInput(e.target.value))}
                className="input-field"
                placeholder="e.g. 99.1%"
                max={MAX_PURITY_PERCENT}
              />
              <p className="text-xs text-neutral-500 mt-1">{PURITY_INPUT_HINT}</p>
            </div>
          </div>

          <div className="rounded-lg border border-atlas-border overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAssayEdits(v => !v)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left bg-white hover:bg-neutral-50"
            >
              <div>
                <p className="text-sm font-bold text-black">Assay details already on COA</p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Sterility, endotoxin, heavy metals, fentanyl, molecular weight — filled at Issue. Expand only to edit.
                </p>
              </div>
              <ChevronDown
                size={18}
                className={`text-neutral-400 shrink-0 transition-transform ${showAssayEdits ? 'rotate-180' : ''}`}
              />
            </button>
            {showAssayEdits && (
              <div className="px-4 pb-4 space-y-4 border-t border-atlas-border bg-neutral-50/60">
                <div className="pt-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-black">Molecular Weight</h3>
                    <label className="inline-flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeMolecularWeight}
                        onChange={e => setIncludeMolecularWeight(e.target.checked)}
                        className="rounded border-atlas-border"
                      />
                      Include on COA
                    </label>
                  </div>
                  <div>
                    <label className="label" htmlFor="molecular-weight">Value (Da)</label>
                    <input
                      id="molecular-weight"
                      type="number"
                      step="0.1"
                      value={molecularWeight}
                      onChange={e => setMolecularWeight(e.target.value)}
                      disabled={!includeMolecularWeight}
                      className="input-field"
                      placeholder="e.g. 1419.7"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-black">Sterility</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label" htmlFor="sterility-method">Method</label>
                      <select
                        id="sterility-method"
                        value={sterilityMethod}
                        onChange={e => {
                          const next = e.target.value as SterilityMethod;
                          setSterilityMethod(next);
                          if (next === 'culture_14_day') {
                            setSterilityProjectedCompletion(
                              defaultCultureProjectedCompletion(intakeYmd || undefined),
                            );
                          } else {
                            setSterilityProjectedCompletion('');
                          }
                        }}
                        className="input-field"
                      >
                        {(Object.keys(STERILITY_METHOD_LABELS) as SterilityMethod[]).map(key => (
                          <option key={key} value={key}>{STERILITY_METHOD_LABELS[key]}</option>
                        ))}
                      </select>
                      <p className="text-xs text-neutral-500 mt-1">
                        COA row: Sterility ({STERILITY_METHOD_LABELS[sterilityMethod]})
                      </p>
                    </div>
                    <div>
                      <label className="label" htmlFor="sterility-pass">Result</label>
                      <select
                        id="sterility-pass"
                        value={assayPassSelectValue(sterilityPass)}
                        onChange={e => setSterilityPass(assayPassFromSelect(e.target.value))}
                        className="input-field"
                      >
                        <option value="pending">Pending</option>
                        <option value="pass">Not Detected — PASS</option>
                        <option value="fail">Detected — FAIL</option>
                      </select>
                    </div>
                    {sterilityMethod === 'culture_14_day' && sterilityPass === null && (
                      <div className="sm:col-span-2">
                        <label className="label" htmlFor="prep-sterility-projected">
                          Projected completion date
                        </label>
                        <input
                          id="prep-sterility-projected"
                          type="date"
                          value={sterilityProjectedCompletion}
                          onChange={e => setSterilityProjectedCompletion(e.target.value)}
                          className="input-field max-w-xs"
                        />
                        <p className="text-xs text-neutral-500 mt-1">
                          Defaults to 14 days after sample intake
                          {intakeYmd ? ` (${intakeYmd}).` : '.'}
                          {' '}Shown on the COA while Pending.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-black">Endotoxins (LAL)</h3>
                  <p className="text-xs text-neutral-500">Specification on COA: {ENDOTOXIN_SPEC_EU_ML}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label" htmlFor="endotoxin-eu-ml">Result (EU/mL)</label>
                      <input
                        id="endotoxin-eu-ml"
                        type="text"
                        value={endotoxinEuMl}
                        onChange={e => setEndotoxinEuMl(e.target.value)}
                        disabled={endotoxinPass === null}
                        className="input-field disabled:opacity-50"
                        placeholder={endotoxinPass === null ? 'Pending' : ENDOTOXIN_PASS_RESULT}
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor="endotoxin-conformity">Conformity</label>
                      <select
                        id="endotoxin-conformity"
                        value={assayPassSelectValue(endotoxinPass)}
                        onChange={e => {
                          const next = assayPassFromSelect(e.target.value);
                          setEndotoxinPass(next);
                          if (next === true) setEndotoxinEuMl(ENDOTOXIN_PASS_RESULT);
                          if (next === null) setEndotoxinEuMl('');
                        }}
                        className="input-field"
                      >
                        <option value="pending">Pending</option>
                        <option value="pass">PASS</option>
                        <option value="fail">FAIL</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <h3 className="text-sm font-bold uppercase tracking-wide text-black">Heavy Metals</h3>
                      <p className="text-xs text-neutral-500 mt-1">USP {'<232>'} limits apply per metal</p>
                    </div>
                    <div>
                      <label className="label" htmlFor="heavy-metals-conformity">Heavy metals conformity</label>
                      <select
                        id="heavy-metals-conformity"
                        value={assayPassSelectValue(heavyMetalsPass)}
                        onChange={e => {
                          const next = assayPassFromSelect(e.target.value);
                          setHeavyMetalsPass(next);
                          if (next === true) setHeavyMetals(heavyMetalsPassDefaults());
                          if (next === null) setHeavyMetals(heavyMetalsEmptyDefaults());
                        }}
                        className="input-field"
                      >
                        <option value="pending">Pending</option>
                        <option value="pass">PASS — Not Detected</option>
                        <option value="fail">FAIL — enter measured values</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {HEAVY_METAL_NAMES.map(metal => (
                      <div key={metal}>
                        <label className="text-xs text-neutral-500 mb-1 block">{metal}</label>
                        <input
                          type="text"
                          value={heavyMetals[metal]}
                          onChange={e => setHeavyMetals(prev => ({ ...prev, [metal]: e.target.value }))}
                          disabled={heavyMetalsPass === null}
                          className="input-field py-1.5 text-sm disabled:opacity-50"
                          placeholder={heavyMetalsPass === null ? 'Pending' : HEAVY_METAL_PASS_RESULT}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-black">Fentanyl Detection</h3>
                  <div>
                    <label className="label" htmlFor="fentanyl-detection">Result on COA</label>
                    <select
                      id="fentanyl-detection"
                      value={fentanylDetection}
                      onChange={e => setFentanylDetection(e.target.value as FentanylDetectionMark)}
                      className="input-field"
                    >
                      <option value="">Not shown on COA</option>
                      <option value="none_detected">Not Detected — PASS</option>
                      <option value="detected">Detected — FAIL</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600" role="alert">{error}</p>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 px-5 py-4 border-t border-atlas-border">
          <button type="button" onClick={onClose} disabled={busy} className="btn-outline">
            Cancel
          </button>
          <button type="button" onClick={() => void handleGenerate()} disabled={busy} className="btn-primary gap-2">
            <FileText size={16} />
            {busy ? 'Saving…' : 'Save & download PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
