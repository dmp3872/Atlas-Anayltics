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
  computeAssayAveragesFromPanels,
  SterilityMethod,
  STERILITY_METHOD_LABELS,
} from '../../lib/labCoaForm';
import { openCoaPrintView } from '../../lib/coaPdf';
import LogoDropzone from '../account/LogoDropzone';

const MAX_COA_IMAGE_BYTES = 1024 * 1024;

interface Props {
  coa: COA;
  onClose: () => void;
  onSaved?: (coa: COA) => void;
}

function applyPrepDefaults(coa: COA) {
  const next = hydrateCoaImages(coa);
  const stats = readCoaPdfStats(coa);
  const assay = computeAssayAveragesFromPanels(
    Array.isArray(coa.panel_results) ? coa.panel_results : [],
    coa.purity_percent,
  );
  return {
    next,
    stats,
    assay,
    avgNetPeptide: stats.avg_net_peptide_content || assay.avg_net_peptide_content,
    meanOfVials: stats.mean_of_vials_tested || assay.mean_of_vials_tested,
    avgPurity: stats.avg_purity || assay.avg_purity,
    endotoxinEuMl: stats.endotoxin_eu_ml || (stats.endotoxin_pass ? ENDOTOXIN_PASS_RESULT : ''),
  };
}

export default function CoaPdfPrepModal({ coa, onClose, onSaved }: Props) {
  const boot = applyPrepDefaults(coa);
  const [vialImage, setVialImage] = useState(boot.next.vial_image || '');
  const [hplcImage, setHplcImage] = useState(boot.next.hplc_image || '');
  const [avgNetPeptide, setAvgNetPeptide] = useState(boot.avgNetPeptide);
  const [meanOfVials, setMeanOfVials] = useState(boot.meanOfVials);
  const [avgPurity, setAvgPurity] = useState(boot.avgPurity);
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
  const [sterilityPass, setSterilityPass] = useState(boot.stats.sterility_pass);
  const [endotoxinEuMl, setEndotoxinEuMl] = useState(boot.endotoxinEuMl);
  const [endotoxinPass, setEndotoxinPass] = useState(boot.stats.endotoxin_pass);
  const [showAssayEdits, setShowAssayEdits] = useState(false);
  const [loadingImages, setLoadingImages] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const assay = useMemo(
    () => computeAssayAveragesFromPanels(
      Array.isArray(coa.panel_results) ? coa.panel_results : [],
      coa.purity_percent,
    ),
    [coa.id, coa.panel_results, coa.purity_percent],
  );

  useEffect(() => {
    let cancelled = false;
    const d = applyPrepDefaults(coa);
    setVialImage(d.next.vial_image || '');
    setHplcImage(d.next.hplc_image || '');
    setAvgNetPeptide(d.avgNetPeptide);
    setMeanOfVials(d.meanOfVials);
    setAvgPurity(d.avgPurity);
    setFentanylDetection(d.stats.fentanyl_detection);
    setIncludeMolecularWeight(d.stats.include_molecular_weight);
    setMolecularWeight(d.stats.molecular_weight);
    setSterilityMethod(d.stats.sterility_method);
    setSterilityPass(d.stats.sterility_pass);
    setEndotoxinEuMl(d.endotoxinEuMl);
    setEndotoxinPass(d.stats.endotoxin_pass);
    setShowAssayEdits(false);
    setError(null);
    setLoadingImages(true);

    // Workflow list rows omit multi‑MB image columns — reload what was saved at Issue.
    void (async () => {
      const images = await fetchCoaImageRow(coa.id);
      if (cancelled) return;
      if (images) {
        setVialImage(prev => prev || images.vial_image || '');
        setHplcImage(prev => prev || images.hplc_image || '');
      }
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
    setBusy(true);
    setError(null);
    try {
      const { coa: saved, error: saveError } = await saveCoaPdfPrep(coa, {
        vial_image: vialImage,
        chromatogram_image: coa.chromatogram_image || '',
        hplc_image: hplcImage,
        company_logo: coa.company_logo || '',
        avg_net_peptide_content: avgNetPeptide,
        mean_of_vials_tested: vials,
        avg_purity: avgPurity,
        fentanyl_detection: fentanylDetection,
        include_molecular_weight: includeMolecularWeight,
        molecular_weight: molecularWeight,
        sterility_method: sterilityMethod,
        sterility_pass: sterilityPass,
        endotoxin_eu_ml: endotoxinEuMl,
        endotoxin_pass: endotoxinPass,
      });
      if (saveError) {
        setError(saveError);
        return;
      }
      onSaved?.(saved);
      onClose();
      // PNG download happens on the live certificate page — open it after save.
      openCoaPrintView(saved.slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the certificate.');
    } finally {
      setBusy(false);
    }
  }

  const hydrated = hydrateCoaImages(coa);
  const headerLogo = hydrated.company_logo || '';
  const watermark = hydrated.chromatogram_image || '';
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
                onChange={e => setAvgPurity(e.target.value)}
                className="input-field"
                placeholder="e.g. 99.1%"
              />
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
                  Sterility, endotoxin, fentanyl, molecular weight — filled at Issue. Expand only to edit.
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
                        onChange={e => setSterilityMethod(e.target.value as SterilityMethod)}
                        className="input-field"
                      >
                        {(Object.keys(STERILITY_METHOD_LABELS) as SterilityMethod[]).map(key => (
                          <option key={key} value={key}>{STERILITY_METHOD_LABELS[key]}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor="sterility-pass">Result</label>
                      <select
                        id="sterility-pass"
                        value={sterilityPass ? 'pass' : 'fail'}
                        onChange={e => setSterilityPass(e.target.value === 'pass')}
                        className="input-field"
                      >
                        <option value="pass">Not Detected — PASS</option>
                        <option value="fail">Detected — FAIL</option>
                      </select>
                    </div>
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
                        className="input-field"
                        placeholder={ENDOTOXIN_PASS_RESULT}
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor="endotoxin-conformity">Conformity</label>
                      <select
                        id="endotoxin-conformity"
                        value={endotoxinPass ? 'pass' : 'fail'}
                        onChange={e => {
                          const pass = e.target.value === 'pass';
                          setEndotoxinPass(pass);
                          if (pass) setEndotoxinEuMl(ENDOTOXIN_PASS_RESULT);
                        }}
                        className="input-field"
                      >
                        <option value="pass">PASS</option>
                        <option value="fail">FAIL</option>
                      </select>
                    </div>
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
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
