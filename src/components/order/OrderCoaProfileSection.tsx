import { useState } from 'react';
import { Building2, CheckCircle, AlertCircle, Info, Plus, Star, ChevronDown, ChevronUp } from 'lucide-react';
import { Company } from '../../lib/types';
import { fetchUserCompanies, saveCoaProfile } from '../../lib/coaProfile';
import CoaProfileFormFields, { EMPTY_COA_PROFILE_FORM, CoaProfileFormState } from './CoaProfileFormFields';

type Message = { type: 'success' | 'error'; text: string } | null;

interface Props {
  userId: string;
  companies: Company[];
  selectedId: string | null;
  onSelect: (company: Company) => void;
  onCompaniesChange: (companies: Company[]) => void;
  onProfileSynced?: () => void;
}

export default function OrderCoaProfileSection({
  userId,
  companies,
  selectedId,
  onSelect,
  onCompaniesChange,
  onProfileSynced,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [form, setForm] = useState<CoaProfileFormState>(EMPTY_COA_PROFILE_FORM);
  const [msg, setMsg] = useState<Message>(null);
  const [saving, setSaving] = useState(false);

  const selected = companies.find(c => c.id === selectedId);

  async function reloadCompanies(selectId?: string) {
    const next = await fetchUserCompanies(userId);
    onCompaniesChange(next);
    const pick = next.find(c => c.id === selectId) ?? next.find(c => c.is_default) ?? next[0];
    if (pick) onSelect(pick);
    onProfileSynced?.();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const { company, error } = await saveCoaProfile(userId, form, {
      existingCount: companies.length,
      setAsDefault: companies.length === 0,
    });
    if (error || !company) {
      setMsg({ type: 'error', text: error?.message ?? 'Could not save COA profile.' });
      setSaving(false);
      return;
    }
    setForm(EMPTY_COA_PROFILE_FORM);
    setCreating(false);
    setShowAdvanced(false);
    await reloadCompanies(company.id);
    setMsg({ type: 'success', text: 'COA profile saved — it will appear on your certificates.' });
    setSaving(false);
  }

  return (
    <div className="card p-5 border-brand-200 space-y-4">
      <div>
        <h2 className="text-lg font-bold text-black flex items-center gap-2">
          <Building2 size={18} className="text-brand-600" /> COA Profile
        </h2>
        <p className="text-sm text-neutral-500 mt-1">
          Choose the brand that appears on your certificates. Create one here if you haven&apos;t set it up yet.
        </p>
      </div>

      {msg && (
        <div className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${
          msg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {msg.type === 'success' ? <CheckCircle size={16} className="flex-shrink-0 mt-0.5" /> : <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />}
          {msg.text}
        </div>
      )}

      {companies.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">Profile for this order</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {companies.map(company => {
              const active = company.id === selectedId;
              return (
                <button
                  key={company.id}
                  type="button"
                  onClick={() => onSelect(company)}
                  className={`p-3 rounded-xl border-2 text-left flex items-center gap-3 transition-colors ${
                    active ? 'border-brand-500 bg-brand-50' : 'border-neutral-200 hover:border-brand-300'
                  }`}
                >
                  {company.logo ? (
                    <img src={company.logo} alt="" className="h-10 w-10 rounded object-contain bg-white border border-neutral-100 flex-shrink-0" />
                  ) : (
                    <div className="h-10 w-10 rounded bg-neutral-100 flex items-center justify-center flex-shrink-0">
                      <Building2 size={16} className="text-neutral-400" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{company.name}</p>
                    {company.website && <p className="text-xs text-neutral-500 truncate">{company.website}</p>}
                  </div>
                  {company.is_default && (
                    <Star size={12} className="text-brand-500 fill-brand-500 flex-shrink-0" />
                  )}
                  {active && <CheckCircle size={16} className="text-brand-600 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
          {!creating && (
            <button
              type="button"
              onClick={() => { setCreating(true); setMsg(null); }}
              className="text-sm font-medium text-brand-700 hover:text-brand-600 inline-flex items-center gap-1 mt-1"
            >
              <Plus size={14} /> Add another COA profile
            </button>
          )}
        </div>
      )}

      {(companies.length === 0 || creating) && (
        <form onSubmit={handleCreate} className="space-y-4 border-t border-neutral-100 pt-4">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-brand-50 border border-brand-200 text-xs text-brand-800">
            <Info size={15} className="flex-shrink-0 mt-0.5" />
            {companies.length === 0
              ? 'You need at least one COA profile before submitting samples. This information prints on your certificate header.'
              : 'Add a sister brand or white-label profile for this order.'}
          </div>

          <CoaProfileFormFields
            form={form}
            onChange={patch => setForm(prev => ({ ...prev, ...patch }))}
            onError={text => setMsg({ type: 'error', text })}
            compact={!showAdvanced}
          />

          {!showAdvanced ? (
            <button
              type="button"
              onClick={() => setShowAdvanced(true)}
              className="text-xs font-medium text-neutral-500 hover:text-brand-700 inline-flex items-center gap-1"
            >
              <ChevronDown size={14} /> Show logo & chromatograph options
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowAdvanced(false)}
              className="text-xs font-medium text-neutral-500 hover:text-brand-700 inline-flex items-center gap-1"
            >
              <ChevronUp size={14} /> Hide advanced branding
            </button>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className="btn-primary text-sm">
              {saving ? 'Saving...' : companies.length === 0 ? 'Create COA Profile' : 'Save New Profile'}
            </button>
            {companies.length > 0 && (
              <button
                type="button"
                disabled={saving}
                onClick={() => { setCreating(false); setForm(EMPTY_COA_PROFILE_FORM); setMsg(null); }}
                className="btn-outline text-sm"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {selected && !creating && (
        <p className="text-xs text-neutral-500 border-t border-neutral-100 pt-3">
          Certificates for this order will use <strong className="text-black">{selected.name}</strong>
          {selected.email ? ` · ${selected.email}` : ''}.
        </p>
      )}
    </div>
  );
}
