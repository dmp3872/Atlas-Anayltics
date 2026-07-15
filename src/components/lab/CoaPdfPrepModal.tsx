import { useEffect, useState } from 'react';
import { FileText, X } from 'lucide-react';
import { COA } from '../../lib/types';
import { hydrateCoaImages, readCoaPdfStats, saveCoaPdfPrep } from '../../lib/coaImages';
import { openCoaPdf } from '../../lib/coaPdf';
import LogoDropzone from '../account/LogoDropzone';

const MAX_COA_IMAGE_BYTES = 2 * 1024 * 1024;

interface Props {
  coa: COA;
  onClose: () => void;
  onSaved?: (coa: COA) => void;
}

export default function CoaPdfPrepModal({ coa, onClose, onSaved }: Props) {
  const initial = hydrateCoaImages(coa);
  const initialStats = readCoaPdfStats(coa);
  const [vialImage, setVialImage] = useState(initial.vial_image || '');
  const [chromatogramImage, setChromatogramImage] = useState(initial.chromatogram_image || '');
  const [avgNetPeptide, setAvgNetPeptide] = useState(initialStats.avg_net_peptide_content);
  const [meanOfVials, setMeanOfVials] = useState(initialStats.mean_of_vials_tested);
  const [avgPurity, setAvgPurity] = useState(initialStats.avg_purity || '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const next = hydrateCoaImages(coa);
    const stats = readCoaPdfStats(coa);
    setVialImage(next.vial_image || '');
    setChromatogramImage(next.chromatogram_image || '');
    setAvgNetPeptide(stats.avg_net_peptide_content);
    setMeanOfVials(stats.mean_of_vials_tested);
    setAvgPurity(stats.avg_purity || '');
    setError(null);
  }, [coa.id]);

  async function handleGenerate() {
    const vials = meanOfVials.trim();
    if (vials && !/^\d+(\.\d+)?$/.test(vials)) {
      setError('Mean of vials tested must be a number.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { coa: saved, error: saveError } = await saveCoaPdfPrep(coa, {
        vial_image: vialImage,
        chromatogram_image: chromatogramImage,
        avg_net_peptide_content: avgNetPeptide,
        mean_of_vials_tested: vials,
        avg_purity: avgPurity,
      });
      if (saveError) {
        setError(saveError);
        return;
      }
      onSaved?.(saved);
      await openCoaPdf(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate the PDF.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl border border-atlas-border w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-atlas-border">
          <div>
            <h2 className="text-lg font-bold text-black">Prepare COA PDF</h2>
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
            Attach photos and fill Average Net Peptide Content before generating.
            The client company logo watermarks the chromatogram.
          </p>

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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label mb-2 block">Vial photo</label>
              <LogoDropzone
                value={vialImage}
                onChange={setVialImage}
                onError={setError}
                maxBytes={MAX_COA_IMAGE_BYTES}
                prompt="a vial photo"
                hint="JPG or PNG, up to 2 MB"
              />
            </div>
            <div>
              <label className="label mb-2 block">Chromatogram photo</label>
              <LogoDropzone
                value={chromatogramImage}
                onChange={setChromatogramImage}
                onError={setError}
                maxBytes={MAX_COA_IMAGE_BYTES}
                prompt="a chromatogram"
                hint="JPG or PNG instrument trace, up to 2 MB"
              />
            </div>
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
            {busy ? 'Saving & generating…' : 'Save & view PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
