import { Check, Clock, FlaskConical, Ban, Minus, Package, Plus } from 'lucide-react';
import {
  ATLAS_PRO_INCLUDED_EXTRA_CONFORMITY_VIALS,
  ATLAS_PRO_INCLUDED_CONFORMITY_VIALS,
  CONFORMITY_PRICE,
  FENTANYL_OPTION_LABEL,
  LabTestService,
  OTHER_RESEARCH_MATERIALS,
  SAMPLE_CATEGORIES,
  SampleCategory,
  SampleMatrix,
  WizardSample,
  formatServiceTurnaround,
  isOtherResearchMaterial,
  isPackageMode,
  packageCardMeta,
  sampleVialCount,
} from '../../../lib/orderCatalog';
import { packageCapabilities } from '../../../lib/orderProjection';
import { formatCurrency } from '../../../lib/utils';
import VialAllocationMap from '../VialAllocationMap';

interface Props {
  category: SampleCategory;
  onCategoryChange: (category: SampleCategory) => void;
  onOtherMaterialChange: (matrix: SampleMatrix) => void;
  sample: WizardSample;
  catalog: LabTestService[];
  onSelectPrimary: (testId: string) => void;
  onToggleAlaCarte: (testId: string) => void;
  onToggleFentanyl: (include: boolean) => void;
  onConformityExtraChange: (count: number) => void;
  onPreviewPackageChange?: (id: 'full_qc' | 'atlas_pro' | null) => void;
  catalogLoading?: boolean;
  catalogError?: string | null;
}

export default function StepSelectTesting({
  category,
  onCategoryChange,
  onOtherMaterialChange,
  sample,
  catalog,
  onSelectPrimary,
  onToggleAlaCarte,
  onToggleFentanyl,
  onConformityExtraChange,
  onPreviewPackageChange,
  catalogLoading,
  catalogError,
}: Props) {
  // Prefer Full QC then Safety Pro for left→right hierarchy (core → recommended).
  const packages = [
    ...catalog.filter(t => t.id === 'full_qc'),
    ...catalog.filter(t => t.id === 'atlas_pro'),
    ...catalog.filter(t => t.kind === 'package' && t.id !== 'full_qc' && t.id !== 'atlas_pro'),
  ];
  const assays = catalog.filter(t => t.kind !== 'package' && t.canBePrimary && t.available);
  const onPackage = isPackageMode(sample.test_mode);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-black tracking-tight">Choose Test Package</h2>
        <p className="text-sm text-neutral-500 mt-1">
          Choose your sample type, then a package — or build your own assay list below.
        </p>
      </div>

      <fieldset>
        <legend className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-800 mb-2.5">
          Choose analytical test
        </legend>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {SAMPLE_CATEGORIES.map(opt => {
            const selected = category === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onCategoryChange(opt.id)}
                className={`text-left rounded-xl border px-3 py-3.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                  selected
                    ? 'border-brand-500 bg-brand-500 text-black shadow-sm'
                    : 'border-atlas-border bg-white text-black hover:border-brand-400'
                }`}
                aria-pressed={selected}
              >
                <p className={`text-sm font-bold ${selected ? 'text-black' : 'text-black'}`}>{opt.label}</p>
                <p className={`text-xs mt-0.5 ${selected ? 'text-black/70' : 'text-neutral-500'}`}>
                  {opt.description}
                </p>
              </button>
            );
          })}
        </div>

        {category === 'other' && (
          <div className="mt-3 rounded-xl border border-atlas-border bg-white p-3.5">
            <label htmlFor="other-material-type" className="label mb-1.5 block">
              Material type
            </label>
            <select
              id="other-material-type"
              className="input-field"
              value={isOtherResearchMaterial(sample.sample_matrix) ? sample.sample_matrix : 'Raw Material'}
              onChange={e => onOtherMaterialChange(e.target.value as SampleMatrix)}
            >
              {OTHER_RESEARCH_MATERIALS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        )}
      </fieldset>

      {catalogLoading && (
        <div className="card p-4 text-sm text-neutral-500 animate-pulse">Loading testing services…</div>
      )}
      {catalogError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {catalogError} Showing catalog defaults.
        </div>
      )}

      <section>
        <div className="grid md:grid-cols-2 gap-4 items-start">
          {packages.map(test => {
            const meta = packageCardMeta(test.id);
            const selected = sample.primary_test_id === test.id;
            const disabled = !test.available;
            const emphasized = meta?.emphasized === true;
            const features = (meta?.features ?? test.description.split(',').map(s => s.trim())).filter(
              f => !f.toLowerCase().includes('fentanyl'),
            );
            const tagline = meta?.tagline ?? (emphasized ? 'Recommended package' : 'Standard package');
            const isSafetyPro = test.id === 'atlas_pro';

            return (
              <div key={test.id} className="flex flex-col gap-3">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelectPrimary(test.id)}
                  onMouseEnter={() => {
                    if ((test.id === 'full_qc' || test.id === 'atlas_pro') && !selected) {
                      onPreviewPackageChange?.(test.id);
                    }
                  }}
                  onMouseLeave={() => onPreviewPackageChange?.(null)}
                  onFocus={() => {
                    if ((test.id === 'full_qc' || test.id === 'atlas_pro') && !selected) {
                      onPreviewPackageChange?.(test.id);
                    }
                  }}
                  onBlur={() => onPreviewPackageChange?.(null)}
                  className={`relative text-left rounded-2xl border-2 px-5 py-6 min-h-[320px] flex flex-col transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                    disabled
                      ? 'border-neutral-200 bg-neutral-50 opacity-70 cursor-not-allowed'
                      : selected
                        ? emphasized
                          ? 'border-brand-600 bg-white shadow-lg ring-2 ring-brand-300'
                          : 'border-brand-500 bg-white shadow-md ring-1 ring-brand-300'
                        : emphasized
                          ? 'border-brand-400 bg-white shadow-sm hover:border-brand-600 hover:shadow-md'
                          : 'border-atlas-border bg-white hover:border-brand-400 hover:shadow-sm'
                  }`}
                  aria-pressed={selected}
                >
                  {emphasized && (
                    <span className="absolute -top-2.5 left-5 inline-flex items-center gap-1 rounded-full bg-atlas-black text-brand-400 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1">
                      Recommended
                    </span>
                  )}

                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div>
                      <p className="text-xl font-bold text-black leading-tight">{test.name}</p>
                      <p className="text-sm text-neutral-500 mt-1">{tagline}</p>
                    </div>
                    {selected && !disabled && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-brand-900 bg-brand-100 px-2 py-1 rounded-full flex-shrink-0">
                        <Check size={11} />
                        Selected
                      </span>
                    )}
                  </div>

                  <p className="mt-4 mb-1">
                    <span className="text-3xl font-bold text-black tracking-tight">
                      {formatCurrency(test.price)}
                    </span>
                    <span className="text-sm text-neutral-500 ml-1.5">per sample</span>
                  </p>

                  <ul className="mt-4 space-y-2 flex-1">
                    {features.map(feature => {
                      const isExtra = feature.trim().startsWith('+');
                      const label = feature.replace(/^\+\s*/, '');
                      return (
                        <li key={feature} className="flex items-start gap-2 text-sm text-neutral-700">
                          <Check
                            size={16}
                            className={`flex-shrink-0 mt-0.5 ${isExtra ? 'text-brand-600' : 'text-atlas-success'}`}
                          />
                          <span>
                            {isExtra && <span className="text-brand-700 font-semibold">+ </span>}
                            {label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="mt-5 pt-4 border-t border-atlas-border flex items-center justify-between gap-2 text-sm">
                    <span className="inline-flex items-center gap-1.5 font-medium text-brand-800">
                      <FlaskConical size={15} />
                      {test.vialsRequired} vial{test.vialsRequired === 1 ? '' : 's'} required to ship
                    </span>
                    <span className="inline-flex items-center gap-1 text-neutral-500 text-xs">
                      <Clock size={13} />
                      {formatServiceTurnaround(test)}
                    </span>
                  </div>
                </button>

                {isSafetyPro && selected && (
                  <div className="overflow-hidden rounded-xl border-2 border-brand-400 bg-white shadow-sm">
                    <div className="bg-brand-50 px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-black">3-vial conformity testing included</p>
                          <p className="mt-1 text-xs leading-relaxed text-neutral-600">
                            Your primary vial plus {ATLAS_PRO_INCLUDED_EXTRA_CONFORMITY_VIALS} included comparison vials
                            are each tested for purity, quantity, and identification.
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-atlas-black px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-300">
                          Included
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {['Purity', 'Quantity', 'Identification'].map(metric => (
                          <div key={metric} className="rounded-lg border border-brand-200 bg-white px-2 py-2 text-center">
                            <p className="text-lg font-extrabold text-brand-700">
                              {ATLAS_PRO_INCLUDED_CONFORMITY_VIALS}
                            </p>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-600">{metric}</p>
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 border-t border-brand-200 pt-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-500">
                          Also included in Atlas Pro
                        </p>
                        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-neutral-700">
                          {['Heavy metals screen', 'Endotoxin (LAL)', 'Sterility (PCR)', 'Digital verified COA'].map(item => (
                            <span key={item} className="inline-flex items-start gap-1.5">
                              <Check size={12} className="mt-0.5 shrink-0 text-atlas-success" />
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-black">Add more conformity vials</p>
                          <p className="text-xs text-neutral-500">
                            Beyond the {ATLAS_PRO_INCLUDED_CONFORMITY_VIALS} included · {formatCurrency(CONFORMITY_PRICE)} each
                          </p>
                        </div>
                        <div className="flex items-center overflow-hidden rounded-lg border border-atlas-border bg-white">
                          <button
                            type="button"
                            onClick={() => onConformityExtraChange(Math.max(0, sample.conformity_extra - 1))}
                            disabled={sample.conformity_extra === 0}
                            className="p-2 text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-30"
                            aria-label="Remove one extra conformity vial"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="min-w-8 text-center text-sm font-bold text-black" aria-live="polite">
                            {sample.conformity_extra}
                          </span>
                          <button
                            type="button"
                            onClick={() => onConformityExtraChange(sample.conformity_extra + 1)}
                            className="p-2 text-neutral-600 hover:bg-neutral-50"
                            aria-label="Add one extra conformity vial"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between rounded-lg bg-atlas-black px-3 py-2 text-xs">
                        <span className="font-medium text-white">
                          {ATLAS_PRO_INCLUDED_CONFORMITY_VIALS + sample.conformity_extra} conformity vials tested
                        </span>
                        <span className="font-bold text-brand-300">
                          {sampleVialCount(sample, catalog)} total vial{sampleVialCount(sample, catalog) === 1 ? '' : 's'} to ship
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {isSafetyPro && selected && (
                  <label className="flex items-start gap-3 text-sm cursor-pointer rounded-xl border-2 border-brand-400 bg-brand-50 p-4 text-neutral-800">
                    <input
                      type="checkbox"
                      className="mt-0.5 rounded border-atlas-border"
                      checked={sample.include_fentanyl}
                      disabled={disabled}
                      onChange={e => onToggleFentanyl(e.target.checked)}
                      onClick={e => e.stopPropagation()}
                    />
                    <span>
                      <span className="font-semibold text-black">
                        Include {FENTANYL_OPTION_LABEL}
                      </span>
                      <span className="block text-xs text-neutral-500 mt-0.5">
                        Optional add-on for Atlas Safety Pro — no additional charge.
                      </span>
                    </span>
                  </label>
                )}
              </div>
            );
          })}
        </div>

        {sample.primary_test_id && (
          <div className="mt-4 space-y-3">
            <VialAllocationMap sample={sample} catalog={catalog} />
            {(sample.test_mode === 'full_qc' || sample.test_mode === 'atlas_pro') && (
              <div className="rounded-xl border border-atlas-border bg-neutral-50 px-4 py-3 text-xs text-neutral-600">
                <p className="font-bold uppercase tracking-wide text-neutral-500 mb-1">Package snapshot</p>
                <p>
                  {packageCapabilities(sample.test_mode).name}:{' '}
                  {packageCapabilities(sample.test_mode).methodKeys
                    .map(k => k.replace(/_/g, ' '))
                    .join(' · ')}
                  {' · '}
                  {formatCurrency(packageCapabilities(sample.test_mode).price)}
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="pt-2 border-t border-atlas-border">
        <div className="flex items-center gap-2 mb-1">
          <Package size={16} className="text-neutral-500" />
          <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-700">
            Or build à la carte
          </h3>
        </div>
        <p className="text-xs text-neutral-500 mb-3">
          {onPackage
            ? 'Selecting any assay below switches you off the package. Select one or more assays — the first is primary; additional selections are included in the order.'
            : 'Select one or more assays. Your first selection is the primary test; any others are added to the same order.'}
        </p>
        <div className="grid sm:grid-cols-2 gap-2">
          {assays.map(test => {
            const isPrimary = !onPackage && sample.primary_test_id === test.id;
            const isAddon = !onPackage && sample.individual_tests.includes(test.id);
            const selected = isPrimary || isAddon;
            const disabled = !test.available;
            return (
              <button
                key={test.id}
                type="button"
                disabled={disabled}
                onClick={() => onToggleAlaCarte(test.id)}
                className={`text-left rounded-lg border px-3 py-3 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
                  disabled
                    ? 'border-neutral-200 bg-neutral-50 opacity-70 cursor-not-allowed'
                    : selected
                      ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-300'
                      : 'border-atlas-border bg-white hover:border-brand-300'
                }`}
                aria-pressed={selected}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-black">{test.name}</p>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {disabled && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 bg-neutral-200/80 px-1.5 py-0.5 rounded">
                        <Ban size={10} />
                        {test.comingSoonLabel || 'Soon'}
                      </span>
                    )}
                    {isPrimary && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-brand-900 bg-brand-100 px-1.5 py-0.5 rounded">
                        <Check size={10} />
                        Primary
                      </span>
                    )}
                    {isAddon && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600 bg-neutral-100 px-1.5 py-0.5 rounded">
                        Added
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{test.description}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 text-[11px] text-neutral-600">
                  <span className="font-semibold text-brand-800">{formatCurrency(test.price)}</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock size={12} />
                    {formatServiceTurnaround(test)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <FlaskConical size={12} />
                    {test.vialsRequired} vial{test.vialsRequired === 1 ? '' : 's'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
