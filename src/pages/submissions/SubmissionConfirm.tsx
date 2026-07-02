import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle, ArrowRight } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import ShippingInstructions from '../../components/submissions/ShippingInstructions';
import { fetchSubmission } from '../../lib/services/submissions';
import { Submission } from '../../lib/types';

export default function SubmissionConfirm() {
  const { id } = useParams<{ id: string }>();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetchSubmission(id).then(setSubmission).finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl h-64 bg-slate-100 rounded-xl animate-pulse" />
      </DashboardLayout>
    );
  }

  if (!submission) {
    return (
      <DashboardLayout>
        <div className="card p-8 text-center max-w-md mx-auto">
          <p>Submission not found.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={28} className="text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Submission Received</h1>
          <p className="text-slate-500 mt-2">
            Your submission <span className="font-mono font-medium text-brand-700">{submission.submission_number}</span> has
            been created with {submission.submission_samples?.length ?? 0} sample
            {(submission.submission_samples?.length ?? 0) !== 1 ? 's' : ''}.
          </p>
        </div>

        <ShippingInstructions submission={submission} />

        <div className="flex flex-col sm:flex-row gap-3 mt-6">
          <Link to={`/dashboard/submissions/${submission.id}`} className="btn-primary flex-1">
            Track status <ArrowRight size={16} />
          </Link>
          <Link to="/dashboard/submissions" className="btn-outline flex-1">
            All submissions
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
}
