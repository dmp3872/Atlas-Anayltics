import { Link } from 'react-router-dom';
import { CheckCircle, Plus, LayoutDashboard, Eye } from 'lucide-react';
import { formatDateTime } from '../../../lib/utils';

interface Props {
  orderNumber: string;
  sampleCount: number;
  totalVials: number;
  submittedAt: string;
  status: string;
  onSubmitAnother: () => void;
}

export default function OrderSuccess({
  orderNumber,
  sampleCount,
  totalVials,
  submittedAt,
  status,
  onSubmitAnother,
}: Props) {
  return (
    <div className="max-w-xl mx-auto card border-brand-200 p-6 sm:p-8 text-center shadow-sm">
      <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto mb-4">
        <CheckCircle size={28} />
      </div>
      <h1 className="text-2xl font-bold text-black">Order Submitted Successfully</h1>
      <p className="text-sm text-neutral-500 mt-2">
        Your samples are queued for receiving. Keep your order number for dashboard tracking.
      </p>

      <dl className="mt-6 text-left space-y-2.5 bg-neutral-50 border border-atlas-border rounded-lg p-4 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">Order number</dt>
          <dd className="font-bold text-black">{orderNumber}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">Samples</dt>
          <dd className="font-semibold text-black">{sampleCount}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">Total vials required</dt>
          <dd className="font-semibold text-black">{totalVials}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">Submission date</dt>
          <dd className="font-semibold text-black">{formatDateTime(submittedAt)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">Current status</dt>
          <dd className="font-semibold text-brand-800 capitalize">{status.replace(/_/g, ' ')}</dd>
        </div>
      </dl>

      <div className="mt-6 grid sm:grid-cols-2 gap-2">
        <Link to={`/dashboard?tab=orders`} className="btn-primary gap-2 justify-center">
          <Eye size={16} />
          View Order
        </Link>
        <button type="button" onClick={onSubmitAnother} className="btn-outline gap-2 justify-center">
          <Plus size={16} />
          Submit Another Order
        </button>
        <Link to="/dashboard" className="btn-ghost gap-2 justify-center border border-atlas-border sm:col-span-2">
          <LayoutDashboard size={16} />
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
