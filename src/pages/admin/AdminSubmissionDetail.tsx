import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, Package, FlaskConical, CheckCircle, FileText, Save,
} from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout';
import ActivityLog from '../../components/admin/ActivityLog';
import SubmissionStatusBadge from '../../components/submissions/SubmissionStatusBadge';
import SubmissionStatusPipeline from '../../components/submissions/SubmissionStatusPipeline';
import { useAuth } from '../../context/AuthContext';
import { Submission, SubmissionStatus, StatusHistoryEntry, TestPanel } from '../../lib/types';
import {
  assignSamplePanel,
  fetchAllSubmissions,
  fetchCOAForSample,
  fetchSubmissionHistory,
  fetchTestPanels,
  releaseCOA,
  updateSubmissionStatus,
  upsertSampleResult,
} from '../../lib/services/submissions';
import { parseResultFormData } from '../../lib/coaBuilder';
import { ADMIN_NEXT_STATUS, SUBMISSION_STATUS_LABELS } from '../../lib/submissionUtils';

export default function AdminSubmissionDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  const [panels, setPanels] = useState<TestPanel[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [note, setNote] = useState('');
  const [resultNotes, setResultNotes] = useState<Record<string, string>>({});
  const [resultPurity, setResultPurity] = useState<Record<string, string>>({});
  const [resultPass, setResultPass] = useState<Record<string, boolean>>({});
  const [coaSlugs, setCoaSlugs] = useState<Record<string, string>>({});

  async function reload() {
    if (!id) return;
    const [all, hist, pnl] = await Promise.all([
      fetchAllSubmissions(),
      fetchSubmissionHistory(id),
      fetchTestPanels(),
    ]);
    const sub = all.find((s) => s.id === id) ?? null;
    setSubmission(sub);
    setHistory(hist);
    setPanels(pnl);
    if (sub?.submission_samples) {
      const slugs: Record<string, string> = {};
      const notes: Record<string, string> = {};
      const purity: Record<string, string> = {};
      const pass: Record<string, boolean> = {};
      for (const s of sub.submission_samples) {
        const coa = await fetchCOAForSample(s.id);
        if (coa?.slug) slugs[s.id] = coa.slug;
        const result = s.submission_results?.[0];
        const parsed = parseResultFormData(result?.result_data);
        if (parsed.notes) notes[s.id] = parsed.notes;
        if (parsed.purity_percent != null) purity[s.id] = String(parsed.purity_percent);
        if (parsed.overall_pass != null) pass[s.id] = parsed.overall_pass;
        else if (result?.overall_pass != null) pass[s.id] = result.overall_pass;
      }
      setCoaSlugs(slugs);
      setResultNotes(notes);
      setResultPurity(purity);
      setResultPass(pass);
    }
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, [id]);

  async function handleStatusChange(newStatus: SubmissionStatus) {
    if (!submission || !user) return;
    setActionLoading(true);
    try {
      await updateSubmissionStatus(
        submission.id,
        newStatus,
        note || `Status updated to ${SUBMISSION_STATUS_LABELS[newStatus]}`,
        user.id,
      );
      setNote('');
      await reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAssignPanel(sampleId: string, panelId: string) {
    if (!submission || !user) return;
    setActionLoading(true);
    try {
      await assignSamplePanel(sampleId, panelId, submission.id, user.id);
      await reload();
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSaveResult(sampleId: string, panelId: string | null) {
    if (!submission || !user) return;
    setActionLoading(true);
    try {
      const purityValue = resultPurity[sampleId]?.trim();
      const purity = purityValue ? parseFloat(purityValue) : null;
      await upsertSampleResult(
        sampleId,
        panelId,
        {
          notes: resultNotes[sampleId] ?? '',
          purity_percent: Number.isFinite(purity) ? purity : null,
          overall_pass: resultPass[sampleId] ?? null,
        },
        resultPass[sampleId] ?? null,
        user.id,
        submission.id,
      );
      await reload();
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReleaseCOA(sampleId: string) {
    if (!submission || !user) return;
    const sample = submission.submission_samples?.find((s) => s.id === sampleId);
    if (!sample) return;
    setActionLoading(true);
    try {
      const slug = await releaseCOA(submission, sample, user.id, panels);
      setCoaSlugs((prev) => ({ ...prev, [sampleId]: slug }));
      await reload();
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="h-64 bg-slate-100 rounded-xl animate-pulse" />
      </AdminLayout>
    );
  }

  if (!submission) {
    return (
      <AdminLayout>
        <div className="card p-8 text-center">Submission not found.</div>
      </AdminLayout>
    );
  }

  const nextStatuses = ADMIN_NEXT_STATUS[submission.status] ?? [];

  return (
    <AdminLayout>
      <div className="max-w-4xl">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
          <ArrowLeft size={14} /> All submissions
        </Link>

        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{submission.submission_number}</h1>
            <p className="text-sm text-slate-500">{submission.company_name} · {submission.contact_name}</p>
          </div>
          <SubmissionStatusBadge status={submission.status} />
        </div>

        <div className="card p-5 mb-6 overflow-x-auto">
          <SubmissionStatusPipeline status={submission.status} />
        </div>

        {/* Status actions */}
        <div className="card p-6 mb-6">
          <h2 className="font-semibold text-slate-900 mb-4">Update Status</h2>
          <textarea
            className="input-field min-h-[60px] mb-3"
            placeholder="Optional note for activity log…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {submission.status === 'submitted' && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => handleStatusChange('awaiting_sample')}
                className="btn-outline text-sm"
              >
                <Package size={14} /> Mark Awaiting Sample
              </button>
            )}
            {nextStatuses.map((status) => (
              <button
                key={status}
                type="button"
                disabled={actionLoading}
                onClick={() => handleStatusChange(status)}
                className="btn-primary text-sm"
              >
                → {SUBMISSION_STATUS_LABELS[status]}
              </button>
            ))}
            {submission.status === 'qa_review' && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => handleStatusChange('complete')}
                className="btn-secondary text-sm"
              >
                <CheckCircle size={14} /> Approve & mark COA Ready
              </button>
            )}
          </div>
        </div>

        {/* Samples */}
        <div className="card p-6 mb-6 space-y-4">
          <h2 className="font-semibold text-slate-900">Samples</h2>
          {(submission.submission_samples ?? []).map((sample) => (
            <div key={sample.id} className="border border-slate-200 rounded-xl p-4 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium flex items-center gap-1.5">
                    <FlaskConical size={14} className="text-brand-600" />
                    {sample.product_name}
                  </p>
                  <p className="text-xs font-mono text-slate-500">{sample.sample_number}</p>
                </div>
                <SubmissionStatusBadge status={sample.status} />
              </div>

              <div>
                <label className="label">Assign test panel</label>
                <select
                  className="input-field"
                  value={sample.panel_id ?? ''}
                  onChange={(e) => handleAssignPanel(sample.id, e.target.value)}
                >
                  <option value="">Select panel…</option>
                  {panels.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="bg-slate-50 rounded-lg p-3 space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase">Result entry</p>
                <div>
                  <label className="label">HPLC purity (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    max={100}
                    className="input-field text-sm"
                    placeholder="e.g. 98.4"
                    value={resultPurity[sample.id] ?? ''}
                    onChange={(e) => setResultPurity((prev) => ({ ...prev, [sample.id]: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">Analyst notes</label>
                  <textarea
                    className="input-field min-h-[60px] text-sm"
                    placeholder="Preliminary observations, impurity peaks, etc."
                    value={resultNotes[sample.id] ?? ''}
                    onChange={(e) => setResultNotes((prev) => ({ ...prev, [sample.id]: e.target.value }))}
                  />
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={resultPass[sample.id] ?? false}
                      onChange={(e) => setResultPass((prev) => ({ ...prev, [sample.id]: e.target.checked }))}
                    />
                    Overall pass
                  </label>
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleSaveResult(sample.id, sample.panel_id)}
                    className="btn-outline text-sm py-1.5 px-3"
                  >
                    <Save size={13} /> Save result
                  </button>
                </div>
              </div>

              {submission.status === 'qa_review' || submission.status === 'complete' ? (
                coaSlugs[sample.id] ? (
                  <Link
                    to={`/coa/${coaSlugs[sample.id]}`}
                    className="inline-flex items-center gap-1.5 text-sm text-brand-700 font-medium"
                  >
                    <FileText size={14} /> View released COA
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleReleaseCOA(sample.id)}
                    className="btn-primary text-sm"
                  >
                    <FileText size={14} /> Release COA to client
                  </button>
                )
              ) : null}
            </div>
          ))}
        </div>

        <div className="card p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Activity Log</h2>
          <ActivityLog entries={history} />
        </div>
      </div>
    </AdminLayout>
  );
}
