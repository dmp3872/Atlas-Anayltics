import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, ArrowRight, AlertCircle, FlaskConical, Save, CheckCircle2 } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import DocumentUploadPlaceholder from '../../components/submissions/DocumentUploadPlaceholder';
import { useAuth } from '../../context/AuthContext';
import { TestPanel } from '../../lib/types';
import {
  createSubmission,
  fetchSubmission,
  fetchTestPanels,
  SampleDraft,
  saveDraftSubmission,
  splitTestPanels,
  submitDraftSubmission,
} from '../../lib/services/submissions';
import {
  clearLocalSubmissionDraft,
  loadLocalSubmissionDraft,
  saveLocalSubmissionDraft,
} from '../../lib/submissionDraft';
import { ATLAS_SAFETY_PRO_INCLUDES } from '../../lib/submissionUtils';
import { formatCurrency } from '../../lib/utils';

function uid() {
  return Math.random().toString(36).slice(2);
}

interface SampleRow extends SampleDraft {
  key: string;
}

function draftFromForm(
  companyName: string,
  contactName: string,
  email: string,
  phone: string,
  urgency: 'standard' | 'rush',
  notes: string,
  samples: SampleRow[],
) {
  return {
    company_name: companyName.trim(),
    contact_name: contactName.trim(),
    email: email.trim(),
    phone: phone.trim(),
    urgency,
    notes: notes.trim(),
    samples: samples.map(({ product_name, batch_lot_number, sample_count, panel_id }) => ({
      product_name: product_name.trim(),
      batch_lot_number: batch_lot_number.trim(),
      sample_count,
      panel_id,
    })),
  };
}

function validateDraft(
  companyName: string,
  contactName: string,
  email: string,
  samples: SampleRow[],
  requirePanels: boolean,
): string | null {
  if (!companyName.trim() || !contactName.trim() || !email.trim()) {
    return 'Company name, contact name, and email are required.';
  }
  for (const s of samples) {
    if (!s.product_name.trim()) {
      return 'Each sample must have a product/sample name.';
    }
    if (requirePanels && !s.panel_id) {
      return 'Each sample must have a requested test panel.';
    }
  }
  return null;
}

export default function SubmissionNew() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const draftId = searchParams.get('draft');

  const [panels, setPanels] = useState<TestPanel[]>([]);
  const [loading, setLoading] = useState(false);
  const [draftLoading, setDraftLoading] = useState(!!draftId);
  const [error, setError] = useState('');
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [existingDraftId, setExistingDraftId] = useState<string | undefined>(draftId ?? undefined);

  const [companyName, setCompanyName] = useState(profile?.company_name ?? '');
  const [contactName, setContactName] = useState(profile?.full_name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [urgency, setUrgency] = useState<'standard' | 'rush'>('standard');
  const [notes, setNotes] = useState('');
  const [samples, setSamples] = useState<SampleRow[]>([
    { key: uid(), product_name: '', batch_lot_number: '', sample_count: 1, panel_id: '' },
  ]);

  const applyDraftToForm = useCallback((draft: {
    company_name: string;
    contact_name: string;
    email: string;
    phone: string;
    urgency: 'standard' | 'rush';
    notes: string;
    samples: SampleDraft[];
  }) => {
    setCompanyName(draft.company_name);
    setContactName(draft.contact_name);
    setEmail(draft.email);
    setPhone(draft.phone);
    setUrgency(draft.urgency);
    setNotes(draft.notes);
    setSamples(
      draft.samples.length > 0
        ? draft.samples.map((s) => ({ ...s, key: uid() }))
        : [{ key: uid(), product_name: '', batch_lot_number: '', sample_count: 1, panel_id: '' }],
    );
  }, []);

  useEffect(() => {
    fetchTestPanels()
      .then((data) => {
        setPanels(data);
        const safetyPro = data.find((p) => p.category === 'package');
        if (safetyPro && !draftId) {
          setSamples((prev) =>
            prev.map((s, i) => (i === 0 && !s.panel_id ? { ...s, panel_id: safetyPro.id } : s)),
          );
        }
      })
      .catch(console.error);
  }, [draftId]);

  useEffect(() => {
    if (profile?.company_name && !draftId) setCompanyName(profile.company_name);
    if (profile?.full_name && !draftId) setContactName(profile.full_name);
    if (profile?.phone && !draftId) setPhone(profile.phone);
  }, [profile, draftId]);

  useEffect(() => {
    if (!user || draftId) return;
    const local = loadLocalSubmissionDraft(user.id);
    if (local) {
      applyDraftToForm(local);
      setDraftSavedAt(local.savedAt);
    }
  }, [user, draftId, applyDraftToForm]);

  useEffect(() => {
    if (!draftId || !user) return;
    fetchSubmission(draftId)
      .then((sub) => {
        if (!sub || sub.user_id !== user.id || sub.status !== 'draft') {
          setError('Draft not found or already submitted.');
          return;
        }
        applyDraftToForm({
          company_name: sub.company_name,
          contact_name: sub.contact_name,
          email: sub.email,
          phone: sub.phone,
          urgency: sub.urgency,
          notes: sub.notes,
          samples: (sub.submission_samples ?? []).map((s) => ({
            product_name: s.product_name,
            batch_lot_number: s.batch_lot_number,
            sample_count: s.sample_count,
            panel_id: s.panel_id ?? '',
          })),
        });
        setExistingDraftId(sub.id);
      })
      .catch(() => setError('Failed to load draft.'))
      .finally(() => setDraftLoading(false));
  }, [draftId, user, applyDraftToForm]);

  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => {
      saveLocalSubmissionDraft(
        user.id,
        draftFromForm(companyName, contactName, email, phone, urgency, notes, samples),
      );
    }, 800);
    return () => clearTimeout(timer);
  }, [user, companyName, contactName, email, phone, urgency, notes, samples]);

  if (!user) return <Navigate to="/auth" replace />;

  function addSample() {
    setSamples((prev) => [
      ...prev,
      { key: uid(), product_name: '', batch_lot_number: '', sample_count: 1, panel_id: '' },
    ]);
  }

  function removeSample(key: string) {
    if (samples.length > 1) setSamples((prev) => prev.filter((s) => s.key !== key));
  }

  function updateSample(key: string, updates: Partial<SampleRow>) {
    setSamples((prev) => prev.map((s) => (s.key === key ? { ...s, ...updates } : s)));
  }

  async function handleSaveDraft() {
    setError('');
    const validationError = validateDraft(companyName, contactName, email, samples, false);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      const draft = draftFromForm(companyName, contactName, email, phone, urgency, notes, samples);
      const saved = await saveDraftSubmission(user!.id, draft, existingDraftId);
      setExistingDraftId(saved.id);
      setDraftSavedAt(new Date().toISOString());
      navigate(`/dashboard/submissions/new?draft=${saved.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save draft.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const validationError = validateDraft(companyName, contactName, email, samples, true);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      const draft = draftFromForm(companyName, contactName, email, phone, urgency, notes, samples);
      const submission = existingDraftId
        ? await submitDraftSubmission(user!.id, draft, existingDraftId)
        : await createSubmission(user!.id, draft);
      clearLocalSubmissionDraft();
      navigate(`/dashboard/submissions/${submission.id}/confirm`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const { packages, individual } = splitTestPanels(panels);
  const safetyPro = packages.find((p) => p.name.includes('Safety Pro'));

  if (draftLoading) {
    return (
      <DashboardLayout>
        <div className="max-w-3xl h-64 bg-slate-100 rounded-xl animate-pulse" />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">
            {existingDraftId ? 'Continue Draft Submission' : 'New Sample Submission'}
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Submit one or more samples for testing. Save a draft anytime and finish later.
          </p>
          {(draftSavedAt || existingDraftId) && (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mt-3 inline-flex items-center gap-1.5">
              <CheckCircle2 size={14} />
              {existingDraftId ? 'Draft saved to your account' : 'Form autosaved locally'}
              {draftSavedAt && ` · ${new Date(draftSavedAt).toLocaleString()}`}
            </p>
          )}
        </div>

        {safetyPro && (
          <div className="card p-5 mb-6 border-brand-200 bg-brand-50/50">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-brand-700 uppercase tracking-wider mb-1">Featured package</p>
                <h2 className="text-lg font-bold text-slate-900">{safetyPro.name}</h2>
                <p className="text-sm text-slate-600 mt-1">{safetyPro.description}</p>
                <ul className="mt-3 grid sm:grid-cols-2 gap-x-4 gap-y-1">
                  {ATLAS_SAFETY_PRO_INCLUDES.map((item) => (
                    <li key={item} className="text-xs text-slate-600 flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-brand-500 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-2xl font-bold text-brand-700">{formatCurrency(safetyPro.price_per_sample)}</p>
                <p className="text-xs text-slate-500">per sample · {safetyPro.turnaround_days} day TAT</p>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div className="card p-6 space-y-4">
            <h2 className="font-semibold text-slate-900">Contact Information</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Company name</label>
                <input className="input-field" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
              </div>
              <div>
                <label className="label">Contact name</label>
                <input className="input-field" value={contactName} onChange={(e) => setContactName(e.target.value)} required />
              </div>
              <div>
                <label className="label">Email</label>
                <input type="email" className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div>
                <label className="label">Phone</label>
                <input type="tel" className="input-field" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Samples</h2>
              <button type="button" onClick={addSample} className="btn-outline text-sm py-2 px-3">
                <Plus size={14} /> Add sample
              </button>
            </div>

            {samples.map((sample, idx) => (
              <div key={sample.key} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                    <FlaskConical size={14} /> Sample {idx + 1}
                  </span>
                  {samples.length > 1 && (
                    <button type="button" onClick={() => removeSample(sample.key)} className="text-red-500 hover:text-red-700 p-1">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label">Sample / product name</label>
                    <input
                      className="input-field"
                      value={sample.product_name}
                      onChange={(e) => updateSample(sample.key, { product_name: e.target.value })}
                      placeholder="e.g. BPC-157 5mg"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Batch / lot number</label>
                    <input
                      className="input-field"
                      value={sample.batch_lot_number}
                      onChange={(e) => updateSample(sample.key, { batch_lot_number: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label className="label">Number of samples</label>
                    <input
                      type="number"
                      min={1}
                      className="input-field"
                      value={sample.sample_count}
                      onChange={(e) => updateSample(sample.key, { sample_count: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                  <div>
                    <label className="label">Requested test panel</label>
                    <select
                      className="input-field"
                      value={sample.panel_id}
                      onChange={(e) => updateSample(sample.key, { panel_id: e.target.value })}
                      required
                    >
                      <option value="">Select panel…</option>
                      {packages.length > 0 && (
                        <optgroup label="Packages">
                          {packages.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} — {formatCurrency(p.price_per_sample)} ({p.turnaround_days}d)
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {individual.length > 0 && (
                        <optgroup label="Individual panels">
                          {individual.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.turnaround_days}d)
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="card p-6 space-y-4">
            <h2 className="font-semibold text-slate-900">Additional Details</h2>
            <div>
              <label className="label">Urgency / turnaround</label>
              <select className="input-field" value={urgency} onChange={(e) => setUrgency(e.target.value as 'standard' | 'rush')}>
                <option value="standard">Standard (3–5 business days)</option>
                <option value="rush">Rush (1–2 business days)</option>
              </select>
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea
                className="input-field min-h-[80px]"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Special handling, reference PO, etc."
              />
            </div>
            <DocumentUploadPlaceholder />
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <Link to="/dashboard/submissions" className="btn-ghost text-sm text-center">
              Cancel
            </Link>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                disabled={loading}
                onClick={handleSaveDraft}
                className="btn-outline gap-2"
              >
                <Save size={16} />
                {loading ? 'Saving…' : 'Save draft'}
              </button>
              <button type="submit" disabled={loading} className="btn-primary">
                {loading ? 'Submitting…' : 'Submit samples'}
                {!loading && <ArrowRight size={16} />}
              </button>
            </div>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
