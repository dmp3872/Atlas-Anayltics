import { useCallback, useEffect, useState } from 'react';
import {
  Building2, CheckCircle, AlertCircle, Star, Trash2, Plus, Pencil, X, Info,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Company } from '../../lib/types';
import LogoDropzone from './LogoDropzone';

type Message = { type: 'success' | 'error'; text: string } | null;

const BACKGROUND_MAX_BYTES = 3 * 1024 * 1024; // 3 MB

interface FormState {
  name: string;
  website: string;
  email: string;
  address: string;
  logo: string;
  chromatograph_background: string;
}

const EMPTY_FORM: FormState = {
  name: '', website: '', email: '', address: '', logo: '', chromatograph_background: '',
};

export default function CompanyManager() {
  const { user, refreshProfile } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<Message>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [modalMsg, setModalMsg] = useState<Message>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });
    if (error) {
      setMsg({ type: 'error', text: 'Could not load COA profiles. The companies table may need to be migrated.' });
    } else {
      setCompanies(data ?? []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Keep the account profile's company_name / company_logo pointed at the
  // default profile so order prefill and COA rendering stay in sync.
  async function syncDefaultToProfile() {
    if (!user) return;
    const { data } = await supabase
      .from('companies')
      .select('name, logo')
      .eq('user_id', user.id)
      .eq('is_default', true)
      .maybeSingle();
    await supabase
      .from('user_profiles')
      .update({ company_name: data?.name ?? '', company_logo: data?.logo ?? '' })
      .eq('id', user.id);
    await refreshProfile();
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalMsg(null);
    setModalOpen(true);
  }

  function openEdit(c: Company) {
    setEditing(c);
    setForm({
      name: c.name ?? '',
      website: c.website ?? '',
      email: c.email ?? '',
      address: c.address ?? '',
      logo: c.logo ?? '',
      chromatograph_background: c.chromatograph_background ?? '',
    });
    setModalMsg(null);
    setModalOpen(true);
  }

  function updateForm(patch: Partial<FormState>) {
    setForm(prev => ({ ...prev, ...patch }));
  }

  async function saveProfile() {
    if (!user) return;
    if (!form.name.trim()) {
      setModalMsg({ type: 'error', text: 'Company name is required.' });
      return;
    }
    setSaving(true);
    setModalMsg(null);
    const payload = {
      name: form.name.trim(),
      website: form.website.trim(),
      email: form.email.trim(),
      address: form.address.trim(),
      logo: form.logo,
      chromatograph_background: form.chromatograph_background,
    };

    let error;
    if (editing) {
      ({ error } = await supabase.from('companies').update(payload).eq('id', editing.id));
    } else {
      ({ error } = await supabase.from('companies').insert({
        ...payload,
        user_id: user.id,
        is_default: companies.length === 0,
      }));
    }

    if (error) {
      setModalMsg({ type: 'error', text: error.message });
      setSaving(false);
      return;
    }

    await load();
    await syncDefaultToProfile();
    setSaving(false);
    setModalOpen(false);
    setMsg({ type: 'success', text: editing ? 'COA profile updated.' : 'COA profile created.' });
  }

  async function makeDefault(id: string) {
    if (!user) return;
    setMsg(null);
    await supabase.from('companies').update({ is_default: false }).eq('user_id', user.id);
    await supabase.from('companies').update({ is_default: true }).eq('id', id);
    await load();
    await syncDefaultToProfile();
  }

  async function deleteCompany(company: Company) {
    if (!user) return;
    setMsg(null);
    const { error } = await supabase.from('companies').delete().eq('id', company.id);
    if (error) {
      setMsg({ type: 'error', text: error.message });
      return;
    }
    if (company.is_default) {
      const next = companies.find(c => c.id !== company.id);
      if (next) await supabase.from('companies').update({ is_default: true }).eq('id', next.id);
    }
    await load();
    await syncDefaultToProfile();
  }

  return (
    <div className="card p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-black flex items-center gap-2">
            <Building2 size={16} /> COA Profiles
          </h3>
          <p className="text-xs text-neutral-500 mt-1">
            Create a profile for each brand or sister company. Everything on a profile appears on that brand&apos;s COAs. The default profile is used for new orders.
          </p>
        </div>
        <button type="button" onClick={openCreate} className="btn-primary text-sm gap-1.5 whitespace-nowrap">
          <Plus size={16} /> New COA Profile
        </button>
      </div>

      {msg && (
        <div className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${
          msg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {msg.type === 'success' ? <CheckCircle size={16} className="flex-shrink-0 mt-0.5" /> : <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />}
          {msg.text}
        </div>
      )}

      {loading ? (
        <div className="py-6 flex justify-center">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : companies.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center">
          <Building2 size={28} className="mx-auto mb-2 text-neutral-300" />
          <p className="text-sm font-medium text-black">No COA profiles yet</p>
          <p className="text-xs text-neutral-500 mt-1">Add your first brand to start putting it on certificates.</p>
          <button type="button" onClick={openCreate} className="btn-primary text-sm mt-4 inline-flex gap-1.5">
            <Plus size={16} /> Create New COA Profile
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {companies.map(company => (
            <div key={company.id} className="rounded-lg border border-neutral-200 p-4 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                {company.logo ? (
                  <img src={company.logo} alt={`${company.name} logo`} className="h-12 w-12 rounded object-contain bg-neutral-50 border border-neutral-100 flex-shrink-0" />
                ) : (
                  <div className="h-12 w-12 rounded bg-neutral-100 flex items-center justify-center flex-shrink-0">
                    <Building2 size={18} className="text-neutral-400" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-black truncate">{company.name || 'Untitled'}</p>
                  {company.website && <p className="text-xs text-neutral-500 truncate">{company.website}</p>}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 mt-auto">
                {company.is_default ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 bg-brand-50 border border-brand-200 rounded-full px-2.5 py-1">
                    <Star size={12} className="fill-brand-500 text-brand-500" /> Default
                  </span>
                ) : (
                  <button type="button" onClick={() => makeDefault(company.id)} className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-brand-600">
                    <Star size={12} /> Set default
                  </button>
                )}
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => openEdit(company)} className="p-1.5 rounded text-neutral-500 hover:text-brand-600 hover:bg-neutral-100" title="Edit">
                    <Pencil size={14} />
                  </button>
                  <button type="button" onClick={() => deleteCompany(company)} className="p-1.5 rounded text-red-500 hover:text-red-700 hover:bg-red-50" title="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => !saving && setModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
              <h3 className="font-bold text-lg text-black">
                {editing ? 'Edit COA Profile' : 'Create New COA Profile'}
              </h3>
              <button type="button" onClick={() => !saving && setModalOpen(false)} className="p-1 text-neutral-400 hover:text-black rounded">
                <X size={20} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-brand-50 border border-brand-200 text-xs text-brand-800">
                <Info size={15} className="flex-shrink-0 mt-0.5" />
                Everything entered on this profile will be shown on the final COA.
              </div>

              {modalMsg && (
                <div className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${
                  modalMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'
                }`}>
                  {modalMsg.type === 'success' ? <CheckCircle size={16} className="flex-shrink-0 mt-0.5" /> : <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />}
                  {modalMsg.text}
                </div>
              )}

              <div>
                <label className="label">Company Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => updateForm({ name: e.target.value })}
                  className="input-field"
                  placeholder="Company name for COA header"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Website</label>
                  <input type="url" value={form.website} onChange={e => updateForm({ website: e.target.value })} className="input-field" placeholder="https://example.com" />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input type="email" value={form.email} onChange={e => updateForm({ email: e.target.value })} className="input-field" placeholder="contact@example.com" />
                </div>
              </div>

              <div>
                <label className="label">Address</label>
                <textarea
                  value={form.address}
                  onChange={e => updateForm({ address: e.target.value })}
                  className="input-field min-h-[64px] resize-y"
                  placeholder="Street address, City, State, Zip"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Company Logo <span className="text-neutral-400 font-normal text-xs">(300×300px · PNG or JPG)</span></label>
                  <LogoDropzone
                    value={form.logo}
                    onChange={logo => updateForm({ logo })}
                    onError={text => setModalMsg({ type: 'error', text })}
                    prompt="a logo"
                    hint="PNG or JPG · 300×300px"
                    compact
                  />
                </div>
                <div>
                  <label className="label">Chromatograph Background <span className="text-neutral-400 font-normal text-xs">(1500×600px · PNG)</span></label>
                  <LogoDropzone
                    value={form.chromatograph_background}
                    onChange={chromatograph_background => updateForm({ chromatograph_background })}
                    onError={text => setModalMsg({ type: 'error', text })}
                    prompt="a background"
                    hint="PNG preferred · 1500×600px"
                    maxBytes={BACKGROUND_MAX_BYTES}
                    compact
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-neutral-200">
              <button type="button" onClick={() => setModalOpen(false)} disabled={saving} className="btn-outline text-sm">
                Cancel
              </button>
              <button type="button" onClick={saveProfile} disabled={saving} className="btn-primary text-sm">
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
