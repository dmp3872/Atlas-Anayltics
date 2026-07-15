import { useEffect, useState } from 'react';
import { FileText, X } from 'lucide-react';
import { COA } from '../../lib/types';
import {
  FentanylDetectionMark,
  hydrateCoaImages,
  readCoaPdfStats,
  saveCoaPdfPrep,
} from '../../lib/coaImages';
import { ENDOTOXIN_SPEC_EU_ML, SterilityMethod, STERILITY_METHOD_LABELS } from '../../lib/labCoaForm';
import { openCoaPrintView } from '../../lib/coaPdf';
import LogoDropzone from '../account/LogoDropzone';

const MAX_COA_IMAGE_BYTES = 1024 * 1024;

interface Props {
  coa: COA;
  onClose: () => void;
  onSaved?: (coa: COA) => void;
}

export default function CoaPdfPrepModal({ coa, onClose, onSaved }: Props) {
  const initial = hydrateCoaImages(coa);
  const initialStats = readCoaPdfStats(coa);
  const [vialImage, setVialImage] = useState(initial.vial_image || '');
  const [avgNetPeptide, setAvgNetPeptide] = useState(initialStats.avg_net_peptide_content);
  const [meanOfVials, setMeanOfVials] = useState(initialStats.mean_of_vials_tested);
  const [avgPurity, setAvgPurity] = useState(initialStats.avg_purity || '');
  const [fentanylDetection, setFentanylDetection] = useState<FentanylDetectionMark>(
    initialStats.fentanyl_detection,
  );
  const [includeMolecularWeight, setIncludeMolecularWeight] = useState(
    initialStats.include_molecular_weight,
  );
  const [molecularWeight, setMolecularWeight] = useState(initialStats.molecular_weight);
  const [sterilityMethod, setSterilityMethod] = useState<SterilityMethod>(
    initialStats.sterility_method,
  );
  const [sterilityPass, setSterilityPass] = useState(initialStats.sterility_pass);
  const [endotoxinEuMl, setEndotoxinEuMl] = useState(initialStats.endotoxin_eu_ml);
  const [endotoxinPass, setEndotoxinPass] = useState(initialStats.endotoxin_pass);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const next = hydrateCoaImages(coa);
    const stats = readCoaPdfStats(coa);
    setVialImage(next.vial_image || '');
    setAvgNetPeptide(stats.avg_net_peptide_content);
    setMeanOfVials(stats.mean_of_vials_tested);
    setAvgPurity(stats.avg_purity || '');
    setFentanylDetection(stats.fentanyl_detection);
    setIncludeMolecularWeight(stats.include_molecular_weight);
    setMolecularWeight(stats.molecular_weight);
    setSterilityMethod(stats.sterility_method);
    setSterilityPass(stats.sterility_pass);
    setEndotoxinEuMl(stats.endotoxin_eu_ml);
    setEndotoxinPass(stats.endotoxin_pass);
    setError(null);
  }, [coa.id]);

  async function handleGenerate() {
    const vials = meanOfVials.trim();
    if (vials && !/^\d+(\.\d+)?$/.test(vials)) {
      setError('Mean of vials tested must be a number.');
      return;
    }
    if (includeMolecularWeight && molecularWeight.trim() && Number.isNaN(Number(molecularWeight))) {
      setError('Molecular weight must be a number.');
      return;
    }
    if (endotoxinEuMl.trim() && Number.isNaN(Number(endotoxinEuMl))) {
      setError('Endotoxin value must be a number (EU/mL).');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { coa: saved, error: saveError } = await saveCoaPdfPrep(coa, {
        vial_image: vialImage,
        chromatogram_image: coa.chromatogram_image || '',
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

  const headerLogo = initial.company_logo || '';
  const watermark = initial.chromatogram_image || '';

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
            Upload the vial photo and fill Average Net Peptide Content.
            After save, the live certificate opens — use Download PNG there.
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

          <div className="rounded-lg border border-atlas-border p-4 space-y-3 bg-neutral-50/60">
            <h3 className="text-sm font-bold uppercase tracking-wide text-black">Average Net Peptide Content</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="avg-net-peptide">Value</label>
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
              <label className="label" htmlFor="avg-purity">Average Purity (optional)</label>
              <input
                id="avg-purity"
                value={avgPurity}
                onChange={e => setAvgPurity(e.target.value)}
                className="input-field"
                placeholder="e.g. 99.1%"
              />
            </div>
          </div>

          <div className="rounded-lg border border-atlas-border p-4 space-y-3 bg-neutral-50/60">
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

          <div className="rounded-lg border border-atlas-border p-4 space-y-3 bg-neutral-50/60">
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

          <div className="rounded-lg border border-atlas-border p-4 space-y-3 bg-neutral-50/60">
            <h3 className="text-sm font-bold uppercase tracking-wide text-black">Endotoxins (LAL)</h3>
            <p className="text-xs text-neutral-500">Specification on COA: {ENDOTOXIN_SPEC_EU_ML}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="endotoxin-eu-ml">Result (EU/mL)</label>
                <input
                  id="endotoxin-eu-ml"
                  type="number"
                  step="0.01"
                  min={0}
                  value={endotoxinEuMl}
                  onChange={e => setEndotoxinEuMl(e.target.value)}
                  className="input-field"
                  placeholder="e.g. 0.25"
                />
              </div>
              <div>
                <label className="label" htmlFor="endotoxin-conformity">Conformity</label>
                <select
                  id="endotoxin-conformity"
                  value={endotoxinPass ? 'pass' : 'fail'}
                  onChange={e => setEndotoxinPass(e.target.value === 'pass')}
                  className="input-field"
                >
                  <option value="pass">PASS</option>
                  <option value="fail">FAIL</option>
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-atlas-border p-4 space-y-3 bg-neutral-50/60">
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
                <option value="none_detected">None Detected</option>
                <option value="detected">Detected</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label mb-2 block">Vial photo</label>
            <p className="text-xs text-neutral-500 mb-2">
              Empty background is auto-cropped so the vial fills the certificate frame.
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
