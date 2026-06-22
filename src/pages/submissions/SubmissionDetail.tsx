import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, FileText, FlaskConical } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import ActivityLog from '../../components/admin/ActivityLog';
import SubmissionStatusBadge from '../../components/submissions/SubmissionStatusBadge';
import SubmissionStatusPipeline from '../../components/submissions/SubmissionStatusPipeline';
import ShippingInstructions from '../../components/submissions/ShippingInstructions';
import { useAuth } from '../../context/AuthContext';
import { Submission, StatusHistoryEntry, TestPanel } from '../../lib/types';
import {
  fetchCOAForSample,
  fetchSubmission,
  fetchSubmissionHistory,
  fetchTestPanels,
} from '../../lib/services/submissions';
import { formatDateTime } from '../../lib/utils';

export default function SubmissionDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  const [panels, setPanels] = useState<TestPanel[]>([]);
  const [coaSlugs, setCoaSlugs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !user) return;
    Promise.all([
      fetchSubmission(id),
      fetchSubmissionHistory(id),
      fetchTestPanels(),
    ]).then(async ([sub, hist, pnl]) => {
      if (sub && sub.user_id !== user.id) {
        setSubmission(null);
        return;
      }
      setSubmission(sub);
      setHistory(hist);
      setPanels(pnl);
      if (sub?.submission_samples) {
        const slugs: Record<string, string> = {};
        for (const s of sub.submission_samples) {
          const coa = await fetchCOAForSample(s.id);
          if (coa?.slug) slugs[s.id] = coa.slug;
        }
        setCoaSlugs(slugs);
      }
    }).finally(() => setLoading(false));
  }, [id, user]);

  const panelName = (panelId: string | null) =>
    panels.find((p) => p.id === panelId)?.name ?? '—';

  if (loading) {
    return (
      <DashboardLayout>
        <div className="max-w-3xl h-48 bg-slate-100 rounded-xl animate-pulse" />
      </DashboardLayout>
    );
  }

  if (!submission) {
    return (
      <DashboardLayout>
        <div className="card p-8 text-center">
          <p className="text-slate-600">Submission not found.</p>
          <Link to="/dashboard/submissions" className="btn-primary text-sm mt-4 inline-flex">
            Back to submissions
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const showShipping = ['submitted', 'awaiting_sample'].includes(submission.status);

  return (
    <DashboardLayout>
      <div className="max-w-3xl">
        <Link to="/dashboard/submissions" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
          <ArrowLeft size={14} /> All submissions
        </Link>

        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{submission.submission_number}</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Submitted {formatDateTime(submission.created_at)} · {submission.company_name}
            </p>
          </div>
          <SubmissionStatusBadge status={submission.status} />
        </div>

        <div className="card p-5 mb-6 overflow-x-auto">
          <SubmissionStatusPipeline status={submission.status} />
        </div>

        {showShipping && (
          <div className="mb-6">
            <ShippingInstructions submission={submission} />
          </div>
        )}

        <div className="card p-6 mb-6">
          <h2 className="font-semibold text-slate-900 mb-4">Samples</h2>
          <div className="space-y-3">
            {(submission.submission_samples ?? []).map((sample) => (
              <div key={sample.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900 flex items-center gap-1.5">
                      <FlaskConical size={14} className="text-brand-600" />
                      {sample.product_name}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 font-mono">{sample.sample_number}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Lot: {sample.batch_lot_number || '—'} · Qty: {sample.sample_count} · Panel: {panelName(sample.panel_id)}
                    </p>
                  </div>
                  <SubmissionStatusBadge status={sample.status} />
                </div>
                {coaSlugs[sample.id] && submission.status === 'complete' && (
                  <Link
                    to={`/coa/${coaSlugs[sample.id]}`}
                    className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium text-brand-700 hover:text-brand-800 bg-brand-50 border border-brand-200 rounded-lg px-3 py-1.5"
                  >
                    <FileText size={14} /> View COA
                  </Link>
                )}
                {submission.status === 'complete' && !coaSlugs[sample.id] && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium text-slate-500 cursor-not-allowed"
                    disabled
                  >
                    <Download size={14} /> COA pending release
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="card p-6 mb-6">
          <h2 className="font-semibold text-slate-900 mb-4">Contact</h2>
          <dl className="grid sm:grid-cols-2 gap-3 text-sm">
            <div><dt className="text-slate-500">Contact</dt><dd className="font-medium">{submission.contact_name}</dd></div>
            <div><dt className="text-slate-500">Email</dt><dd className="font-medium">{submission.email}</dd></div>
            <div><dt className="text-slate-500">Phone</dt><dd className="font-medium">{submission.phone || '—'}</dd></div>
            <div><dt className="text-slate-500">Urgency</dt><dd className="font-medium capitalize">{submission.urgency}</dd></div>
          </dl>
          {submission.notes && (
            <p className="text-sm text-slate-600 mt-4 pt-4 border-t border-slate-100">
              <span className="font-medium text-slate-700">Notes: </span>{submission.notes}
            </p>
          )}
        </div>

        <div className="card p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Activity Log</h2>
          <ActivityLog entries={history} />
        </div>
      </div>
    </DashboardLayout>
  );
}
