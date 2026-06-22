import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Filter, FlaskConical, Plus, ArrowRight } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import SubmissionStatusBadge from '../../components/submissions/SubmissionStatusBadge';
import { useAuth } from '../../context/AuthContext';
import { Submission, SubmissionStatus } from '../../lib/types';
import { fetchUserSubmissions } from '../../lib/services/submissions';
import { SUBMISSION_STATUS_LABELS } from '../../lib/submissionUtils';
import { formatDateTime } from '../../lib/utils';

export default function SubmissionList() {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    if (!user) return;
    fetchUserSubmissions(user.id)
      .then(setSubmissions)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  const filtered =
    statusFilter === 'all'
      ? submissions
      : submissions.filter((s) => s.status === statusFilter);

  const filterOptions: (SubmissionStatus | 'all')[] = [
    'all', 'submitted', 'awaiting_sample', 'sample_received',
    'in_testing', 'qa_review', 'complete', 'archived',
  ];

  return (
    <DashboardLayout>
      <div className="max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Sample Submissions</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              {submissions.length} submission{submissions.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Link to="/dashboard/submissions/new" className="btn-primary text-sm gap-1.5">
            <Plus size={15} /> New Submission
          </Link>
        </div>

        <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
          <Filter size={14} className="text-slate-400 flex-shrink-0" />
          {filterOptions.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                statusFilter === s ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {s === 'all' ? 'All' : SUBMISSION_STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center">
            <FlaskConical size={32} className="mx-auto mb-3 text-slate-300" />
            <p className="font-medium text-slate-900 mb-1">No submissions yet</p>
            <p className="text-sm text-slate-500 mb-4">Start a new submission to send samples for testing.</p>
            <Link to="/dashboard/submissions/new" className="btn-primary text-sm">
              Submit Your First Samples
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((sub) => (
              <Link
                key={sub.id}
                to={`/dashboard/submissions/${sub.id}`}
                className="card p-5 flex items-center justify-between gap-4 hover:border-brand-300 transition-colors group"
              >
                <div>
                  <div className="flex items-center gap-2.5 mb-1">
                    <span className="font-semibold text-slate-900">{sub.submission_number}</span>
                    {sub.urgency === 'rush' && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                        Rush
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    {formatDateTime(sub.created_at)} · {sub.submission_samples?.length ?? 0} sample
                    {(sub.submission_samples?.length ?? 0) !== 1 ? 's' : ''} · {sub.company_name}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <SubmissionStatusBadge status={sub.status} />
                  <ArrowRight size={16} className="text-slate-300 group-hover:text-brand-500 transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
