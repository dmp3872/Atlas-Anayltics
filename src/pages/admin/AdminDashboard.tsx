import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Filter, FlaskConical, ArrowRight } from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout';
import SubmissionStatusBadge from '../../components/submissions/SubmissionStatusBadge';
import { Submission, SubmissionStatus } from '../../lib/types';
import { fetchAllSubmissions } from '../../lib/services/submissions';
import { SUBMISSION_STATUS_LABELS } from '../../lib/submissionUtils';
import { formatDateTime } from '../../lib/utils';

export default function AdminDashboard() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  async function loadSubmissions() {
    setLoading(true);
    try {
      setSubmissions(await fetchAllSubmissions());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSubmissions();
  }, []);

  const filtered =
    statusFilter === 'all'
      ? submissions
      : submissions.filter((s) => s.status === statusFilter);

  const counts = {
    active: submissions.filter((s) => !['complete', 'archived', 'draft'].includes(s.status)).length,
    qa: submissions.filter((s) => s.status === 'qa_review').length,
    complete: submissions.filter((s) => s.status === 'complete').length,
  };

  const filterOptions: (SubmissionStatus | 'all')[] = [
    'all', 'submitted', 'awaiting_sample', 'sample_received',
    'in_testing', 'qa_review', 'complete',
  ];

  return (
    <AdminLayout>
      <div className="max-w-5xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Submission Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">Manage all client sample submissions</p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Active', value: counts.active },
            { label: 'QA Review', value: counts.qa },
            { label: 'COA Ready', value: counts.complete },
          ].map((stat) => (
            <div key={stat.label} className="card p-4">
              <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
              <p className="text-xs text-slate-500">{stat.label}</p>
            </div>
          ))}
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
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-10 text-center text-slate-500">
            <FlaskConical size={28} className="mx-auto mb-2 text-slate-300" />
            No submissions match this filter.
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((sub) => (
              <Link
                key={sub.id}
                to={`/admin/submissions/${sub.id}`}
                className="card p-4 flex items-center justify-between gap-4 hover:border-brand-300 transition-colors group"
              >
                <div>
                  <p className="font-semibold text-slate-900">{sub.submission_number}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {sub.company_name} · {sub.contact_name} · {formatDateTime(sub.created_at)}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {sub.submission_samples?.length ?? 0} sample(s)
                    {sub.urgency === 'rush' && ' · Rush'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <SubmissionStatusBadge status={sub.status} />
                  <ArrowRight size={16} className="text-slate-300 group-hover:text-brand-500" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
