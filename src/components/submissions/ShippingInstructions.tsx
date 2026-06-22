import { Package, MapPin, AlertCircle } from 'lucide-react';
import { Submission, SubmissionSample } from '../../lib/types';
import { SHIPPING_ADDRESS } from '../../lib/submissionUtils';

interface Props {
  submission: Submission;
  samples?: SubmissionSample[];
}

export default function ShippingInstructions({ submission, samples }: Props) {
  const sampleList = samples ?? submission.submission_samples ?? [];

  return (
    <div className="card p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
          <Package size={20} className="text-brand-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Shipping Instructions</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Include your submission ID on the outside of the package.
          </p>
        </div>
      </div>

      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          Submission ID
        </p>
        <p className="text-xl font-bold text-brand-700 font-mono">{submission.submission_number}</p>
      </div>

      {sampleList.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Sample IDs
          </p>
          <div className="space-y-2">
            {sampleList.map((s) => (
              <div key={s.id} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2">
                <span className="text-sm text-slate-700">{s.product_name}</span>
                <span className="text-sm font-mono font-medium text-slate-900">{s.sample_number}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-start gap-3 bg-white border border-slate-200 rounded-xl p-4">
        <MapPin size={18} className="text-brand-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-slate-900">{SHIPPING_ADDRESS.name}</p>
          <p className="text-sm text-slate-600 mt-1">
            {SHIPPING_ADDRESS.line1}<br />
            {SHIPPING_ADDRESS.city}, {SHIPPING_ADDRESS.state} {SHIPPING_ADDRESS.zip}<br />
            {SHIPPING_ADDRESS.country}
          </p>
          <p className="text-xs text-slate-500 mt-2">
            Attn: {submission.contact_name} · Ref: {submission.submission_number}
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
        <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
        <p>
          Ship samples in appropriate containers with cold pack if required. Status will update to
          &quot;Sample Received&quot; once we check in your package.
        </p>
      </div>
    </div>
  );
}
