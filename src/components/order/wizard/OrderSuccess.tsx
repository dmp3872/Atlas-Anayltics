import { useNavigate } from 'react-router-dom';
import { CheckCircle, Plus, LayoutDashboard, Eye } from 'lucide-react';
import { formatDateTime } from '../../../lib/utils';
import { resolveUserRole, roleHome } from '../../../lib/roles';
import { useAuth } from '../../../context/AuthContext';
import AtlasDigitalCoaCard from '../AtlasDigitalCoaCard';
import OrderShippingChecklist from '../OrderShippingChecklist';
import { createEmptySample } from '../../../lib/orderCatalog';

interface Props {
  orderId: string;
  orderNumber: string;
  sampleCount: number;
  totalVials: number;
  submittedAt: string;
  status: string;
  shippingLabelId?: string | null;
  shippingPreboarded?: boolean | null;
  onSubmitAnother: () => void;
}

export default function OrderSuccess({
  orderId,
  orderNumber,
  sampleCount,
  totalVials,
  submittedAt,
  status,
  shippingLabelId,
  shippingPreboarded,
  onSubmitAnother,
}: Props) {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const role = resolveUserRole(profile, user?.email);
  const preboarded = shippingPreboarded ?? !!profile?.shipping_preboarded;

  const trackerSample = createEmptySample({
    sample_name: orderNumber,
    primary_test_id: 'atlas_pro',
    test_mode: 'atlas_pro',
  });

  const viewOrderPath =
    role === 'admin'
      ? `/admin/orders/${encodeURIComponent(orderId)}`
      : role === 'chemist'
        ? '/lab'
        : `/dashboard?tab=orders&order=${encodeURIComponent(orderId)}`;

  const homePath = role === 'client' ? '/dashboard' : roleHome(role);
  const homeLabel = role === 'client' ? 'Return to Dashboard' : 'Return Home';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <div className="relative z-10 card border-brand-200 p-6 sm:p-8 text-center shadow-sm">
          <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={28} />
          </div>
          <h1 className="text-2xl font-bold text-black">Order Submitted Successfully</h1>
          <p className="text-sm text-neutral-500 mt-2">
            Your samples are queued for receiving. Follow the shipping checklist for your account type, then track with the Atlas Verified card.
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
            <button
              type="button"
              onClick={() => navigate(viewOrderPath)}
              className="btn-primary gap-2 justify-center"
            >
              <Eye size={16} />
              View Order
            </button>
            <button
              type="button"
              onClick={() => onSubmitAnother()}
              className="btn-outline gap-2 justify-center"
            >
              <Plus size={16} />
              Submit Another Order
            </button>
            <button
              type="button"
              onClick={() => navigate(homePath)}
              className="btn-ghost gap-2 justify-center border border-atlas-border sm:col-span-2"
            >
              <LayoutDashboard size={16} />
              {homeLabel}
            </button>
          </div>
        </div>

        <div className="relative z-0 max-w-xs mx-auto w-full overflow-hidden isolate">
          <AtlasDigitalCoaCard
            samples={[trackerSample]}
            companyName={orderNumber}
            stage="submitted"
            trackingStage="awaiting_sample"
            readinessPercent={100}
          />
        </div>
      </div>

      {role === 'client' && (
        <OrderShippingChecklist
          orderNumber={orderNumber}
          shippingPreboarded={preboarded}
          shippingLabelId={shippingLabelId}
        />
      )}
    </div>
  );
}
