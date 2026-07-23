import { useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from 'lucide-react';
import BlendComponentsEditor from '../BlendComponentsEditor';
import OrderCoaProfileSection from '../OrderCoaProfileSection';
import {
  LABEL_CLAIM_UNITS,
  OTHER_RESEARCH_MATERIALS,
  SAMPLE_CATEGORIES,
  SAMPLE_MATRICES,
  SampleCategory,
  WizardSample,
  applyCategoryDefaults,
  formatSampleTests,
  LabTestService,
} from '../../../lib/orderCatalog';
import { sampleHeaderMeta } from '../../../lib/orderReadiness';
import { Company } from '../../../lib/types';
import { searchPeptides } from '../../../data/peptideCatalog';

interface Props {
  samples: WizardSample[];
  catalog: LabTestService[];
  collapsed: Record<string, boolean>;
  setCollapsed: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  updateSample: (id: string, patch: Partial<WizardSample>) => void;
  addSample: () => void;
  duplicateSample: (id: string) => void;
  removeSample: (id: string) => void;
  userId: string;
  companies: Company[];
  selectedCompanyId: string;
  onSelectCompany: (company: Company) => void;
  onCompaniesChange: (companies: Company[]) => void;
  onProfileSynced: () => void;
  companiesLoading: boolean;
}

export default function StepSampleInfo({
  samples,
  catalog,
  collapsed,
  setCollapsed,
  updateSample,
  addSample,
  duplicateSample,
  removeSample,
  userId,
  companies,
  selectedCompanyId,
  onSelectCompany,
  onCompaniesChange,
  onProfileSynced,
  companiesLoading,
}: Props) {
  const [suggestFor, setSuggestFor] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  function changeCategory(sampleId: string, category: SampleCategory) {
    updateSample(sampleId, applyCategoryDefaults(category));
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-black">Sample Information</h2>
        <p className="text-sm text-neutral-500 mt-1">
          Add one or more samples to this laboratory order. Testing selections from step 1 are applied to each sample.
        </p>
      </div>

      <OrderCoaProfileSection
        userId={userId}
        companies={companies}
        selectedId={selectedCompanyId || null}
        onSelect={onSelectCompany}
        onCompaniesChange={onCompaniesChange}
        onProfileSynced={onProfileSynced}
      />
      {!companiesLoading && companies.length === 0 && (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2" role="status">
          Create a COA profile to print certificates against your brand after testing completes.
        </p>
      )}

      {samples.map((sample, idx) => {
        const isCollapsed = !!collapsed[sample.id];
        const meta = sampleHeaderMeta(sample, idx);
        return (
          <div key={sample.id} className="card border-brand-200 overflow-hidden">
            <div className="flex items-start justify-between gap-2 px-4 py-3 bg-brand-50/50 border-b border-brand-100">
              <button
                type="button"
                className="flex-1 min-w-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 rounded"
                onClick={() => setCollapsed(prev => ({ ...prev, [sample.id]: !prev[sample.id] }))}
                aria-expanded={!isCollapsed}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-black">{meta.title}</span>
                  <span className="text-sm text-neutral-700 truncate">{meta.name}</span>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                      meta.status === 'Complete'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    {meta.status}
                  </span>
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  Lot {meta.lot} · {meta.tests} · {meta.vials} vial{meta.vials === 1 ? '' : 's'} required · {meta.category}
                </p>
                <p className="text-xs text-neutral-400 mt-0.5 truncate">{formatSampleTests(sample, catalog)}</p>
              </button>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => duplicateSample(sample.id)}
                  className="p-2 text-neutral-500 hover:text-black rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
                  aria-label={`Duplicate sample ${idx + 1}`}
                  title="Duplicate sample"
                >
                  <Copy size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => removeSample(sample.id)}
                  disabled={samples.length <= 1}
                  className="p-2 text-neutral-500 hover:text-red-600 disabled:opacity-30 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
                  aria-label={`Remove sample ${idx + 1}`}
                  title="Remove sample"
                >
                  <Trash2 size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setCollapsed(prev => ({ ...prev, [sample.id]: !prev[sample.id] }))}
                  className="p-2 text-neutral-500 rounded"
                  aria-label={isCollapsed ? 'Expand sample' : 'Collapse sample'}
                >
                  {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                </button>
              </div>
            </div>

            {!isCollapsed && (
              <div className="p-4 space-y-4">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2 relative">
                    <label className="label" htmlFor={`name-${sample.id}`}>Product or sample name</label>
                    <input
                      id={`name-${sample.id}`}
                      className="input-field"
                      value={sample.sample_name}
                      onChange={e => {
                        const value = e.target.value;
                        updateSample(sample.id, {
                          sample_name: value,
                          display_name: value,
                          peptide_identification:
                            sample.category === 'single_peptide' && !sample.peptide_identification
                              ? value
                              : sample.peptide_identification,
                        });
                        setSuggestFor(sample.id);
                        setSuggestions(searchPeptides(value, 8));
                      }}
                      onFocus={() => {
                        setSuggestFor(sample.id);
                        setSuggestions(searchPeptides(sample.sample_name, 8));
                      }}
                      onBlur={() => setTimeout(() => setSuggestFor(null), 150)}
                      placeholder="e.g. BPC-157"
                      autoComplete="off"
                      required
                    />
                    {suggestFor === sample.id && suggestions.length > 0 && (
                      <ul className="absolute z-20 mt-1 w-full bg-white border border-atlas-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                        {suggestions.map(name => (
                          <li key={name}>
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-brand-50"
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => {
                                updateSample(sample.id, {
                                  sample_name: name,
                                  display_name: name,
                                  peptide_identification: sample.category === 'single_peptide' ? name : sample.peptide_identification,
                                });
                                setSuggestFor(null);
                              }}
                            >
                              {name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <label className="label" htmlFor={`cat-${sample.id}`}>Sample category</label>
                    <select
                      id={`cat-${sample.id}`}
                      className="input-field"
                      value={sample.category}
                      onChange={e => changeCategory(sample.id, e.target.value as SampleCategory)}
                    >
                      {SAMPLE_CATEGORIES.map(c => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                  </div>

                  {sample.category === 'single_peptide' && (
                    <div>
                      <label className="label" htmlFor={`compound-${sample.id}`}>Compound / analyte</label>
                      <input
                        id={`compound-${sample.id}`}
                        className="input-field"
                        value={sample.peptide_identification}
                        onChange={e => updateSample(sample.id, { peptide_identification: e.target.value })}
                        placeholder="e.g. BPC-157"
                      />
                    </div>
                  )}

                  <div>
                    <label className="label" htmlFor={`lot-${sample.id}`}>Lot or batch number</label>
                    <input
                      id={`lot-${sample.id}`}
                      className="input-field"
                      value={sample.batch_number}
                      onChange={e => updateSample(sample.id, { batch_number: e.target.value })}
                      placeholder="e.g. LOT-2406-01"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label" htmlFor={`claim-${sample.id}`}>Label claim</label>
                      <input
                        id={`claim-${sample.id}`}
                        className="input-field"
                        value={sample.labeled_content}
                        onChange={e => updateSample(sample.id, { labeled_content: e.target.value })}
                        placeholder="e.g. 5"
                        required
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor={`unit-${sample.id}`}>Unit</label>
                      <select
                        id={`unit-${sample.id}`}
                        className="input-field"
                        value={sample.label_claim_unit}
                        onChange={e => updateSample(sample.id, { label_claim_unit: e.target.value })}
                      >
                        {LABEL_CLAIM_UNITS.map(u => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="label" htmlFor={`matrix-${sample.id}`}>
                      {sample.category === 'other' ? 'Material type' : 'Sample matrix'}
                    </label>
                    <select
                      id={`matrix-${sample.id}`}
                      className="input-field"
                      value={sample.sample_matrix}
                      onChange={e => updateSample(sample.id, { sample_matrix: e.target.value as WizardSample['sample_matrix'] })}
                    >
                      {(sample.category === 'other' ? OTHER_RESEARCH_MATERIALS : SAMPLE_MATRICES).map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="label" htmlFor={`ref-${sample.id}`}>Client reference (optional)</label>
                    <input
                      id={`ref-${sample.id}`}
                      className="input-field"
                      value={sample.client_reference}
                      onChange={e => updateSample(sample.id, { client_reference: e.target.value })}
                      placeholder="Internal PO or SKU"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="label" htmlFor={`notes-${sample.id}`}>Special instructions (optional)</label>
                    <textarea
                      id={`notes-${sample.id}`}
                      className="input-field min-h-[72px]"
                      value={sample.special_instructions}
                      onChange={e => updateSample(sample.id, { special_instructions: e.target.value })}
                      placeholder="Handling notes for receiving"
                    />
                  </div>
                </div>

                {(sample.category === 'peptide_blend' || sample.sample_type === 'blend') && (
                  <BlendComponentsEditor
                    components={sample.blend_components}
                    onChange={components => updateSample(sample.id, {
                      blend_components: components,
                      blend_compounds: components.length,
                      sample_type: 'blend',
                    })}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}

      <button type="button" onClick={addSample} className="btn-outline gap-2 w-full sm:w-auto">
        <Plus size={16} />
        Add Another Sample
      </button>
    </div>
  );
}
