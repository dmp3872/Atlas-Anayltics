import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ShoppingCart, CheckCircle, Clock, Filter, ArrowRight, Package, Zap,
  XCircle, Download, FlaskConical, AlertCircle
} from 'lucide-react';
import DashboardLayout from '../components/layout/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Order, OrderSample, OrderStatus } from '../lib/types';
import { formatCurrency, formatDateTime, ORDER_STATUS_LABELS, ORDER_STATUS_STEPS, getStatusStep } from '../lib/utils';

type AnalysisTest = {
  test: string;
  label: string;
  ordered: boolean;
  status: 'pending' | 'in_progress' | 'pass' | 'fail';
  value: string | null;
};

type OrderSampleWithAnalysis = OrderSample & { analysis_results?: AnalysisTest[] | null };
type OrderWithAnalysisSamples = Omit<Order, 'order_samples'> & { order_samples?: OrderSampleWithAnalysis[] };

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    received: 'bg-slate-100 text-slate-700',
    awaiting_sample: 'bg-amber-100 text-amber-800',
    processing: 'bg-brand-100 text-brand-800',
    analyzing: 'bg-amber-100 text-amber-700',
    in_review: 'bg-orange-100 text-orange-700',
    complete: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${colors[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {ORDER_STATUS_LABELS[status as keyof typeof ORDER_STATUS_LABELS] ?? status}
    </span>
  );
}

function OrderPipeline({ status }: { status: string }) {
  const steps = ORDER_STATUS_STEPS;
  const currentIdx = getStatusStep(status as OrderStatus);
  const labels = ORDER_STATUS_LABELS;
  return (
    <div className="flex items-center">
      {steps.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={step} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-colors ${
                done ? 'bg-brand-500 border-brand-500' :
                active ? 'border-brand-500 bg-white' :
                'border-slate-200 bg-white'
              }`}>
                {done ? <CheckCircle size={14} className="text-white" /> :
                 active ? <div className="w-2.5 h-2.5 rounded-full bg-brand-500 animate-pulse" /> :
                 <div className="w-2 h-2 rounded-full bg-slate-200" />}
              </div>
              <span className={`text-xs mt-1.5 font-medium text-center w-14 leading-tight ${i <= currentIdx ? 'text-brand-600' : 'text-slate-400'}`}>
                {labels[step]}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 mb-4 ${done ? 'bg-brand-500' : 'bg-slate-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function AnalysisTestBadge({ test }: { test: AnalysisTest }) {
  if (!test.ordered) return null;

  if (test.status === 'pass') {
    return (
      <div className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
        <div className="flex items-center gap-2">
          <CheckCircle size={14} className="text-emerald-500 flex-shrink-0" />
          <span className="text-sm font-medium text-slate-800">{test.label}</span>
        </div>
        <div className="flex items-center gap-2">
          {test.value && <span className="text-xs text-slate-500">{test.value}</span>}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
            Pass
          </span>
        </div>
      </div>
    );
  }

  if (test.status === 'fail') {
    return (
      <div className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
        <div className="flex items-center gap-2">
          <XCircle size={14} className="text-red-500 flex-shrink-0" />
          <span className="text-sm font-medium text-slate-800">{test.label}</span>
        </div>
        <div className="flex items-center gap-2">
          {test.value && <span className="text-xs text-slate-500">{test.value}</span>}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
            Failed
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
      <div className="flex items-center gap-2">
        <Clock size={14} className="text-amber-400 flex-shrink-0 animate-pulse" />
        <span className="text-sm font-medium text-slate-500">{test.label}</span>
      </div>
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">
        In Progress
      </span>
    </div>
  );
}

function SampleAnalysisCard({ sample, orderStatus }: { sample: OrderSampleWithAnalysis; orderStatus: string }) {
  const tests: AnalysisTest[] = sample.analysis_results ?? [];
  const orderedTests = tests.filter(t => t.ordered);
  const allDone = orderedTests.length > 0 && orderedTests.every(t => t.status === 'pass' || t.status === 'fail');
  const hasAnyResult = orderedTests.some(t => t.status === 'pass' || t.status === 'fail');
  const showAnalysis = orderStatus === 'analyzing' || orderStatus === 'in_review' || orderStatus === 'complete';

  const dotColor = sample.status === 'complete' ? 'bg-emerald-500' :
    sample.status === 'in_review' ? 'bg-orange-400' :
    sample.status === 'analyzing' ? 'bg-amber-400 animate-pulse' :
    'bg-slate-300';

  const badgeClass = sample.status === 'complete' ? 'bg-emerald-100 text-emerald-700' :
    sample.status === 'in_review' ? 'bg-orange-100 text-orange-700' :
    sample.status === 'analyzing' ? 'bg-amber-100 text-amber-700' :
    'bg-slate-100 text-slate-500';

  return (
    <div className="bg-slate-50 rounded-xl overflow-hidden border border-slate-200">
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">{sample.sample_name}</p>
            <p className="text-xs text-slate-500 capitalize">{sample.sample_type} · {sample.vial_count} vial{sample.vial_count !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {hasAnyResult && (
            <button
              onClick={(e) => { e.stopPropagation(); alert('PDF generation coming soon — this will download the current COA state.'); }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-brand-50 text-brand-700 hover:bg-brand-100 border border-brand-200 transition-colors"
            >
              <Download size={11} /> Download COA
            </button>
          )}
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1 ${badgeClass}`}>
            {sample.status === 'complete' ? <><CheckCircle size={10} /> Complete</> : <><Clock size={10} /> In Progress</>}
          </span>
        </div>
      </div>

      {showAnalysis && orderedTests.length > 0 && (
        <div className="px-3 pb-3 border-t border-slate-200 pt-2">
          <div className="flex items-center gap-1.5 mb-2">
            <FlaskConical size={11} className="text-slate-400" />
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Analysis Tests</span>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 px-3 divide-y divide-slate-100">
            {orderedTests.map(t => <AnalysisTestBadge key={t.test} test={t} />)}
          </div>
          {!allDone && (
            <div className="flex items-center gap-1.5 mt-2">
              <AlertCircle size={11} className="text-amber-500" />
              <p className="text-xs text-amber-600">Some tests are still in progress — results will appear as they complete.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function OrderHistory() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const newOrderId = searchParams.get('new');
  const [orders, setOrders] = useState<OrderWithAnalysisSamples[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(newOrderId);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('orders')
      .select('*, order_samples(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setOrders(data as OrderWithAnalysisSamples[]);
        setLoading(false);
      });
  }, [user]);

  const filtered = statusFilter === 'all'
    ? orders
    : orders.filter(o => o.status === statusFilter);

  return (
    <DashboardLayout>
      <div className="max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Orders</h1>
            <p className="text-slate-500 text-sm mt-0.5">{orders.length} total order{orders.length !== 1 ? 's' : ''}</p>
          </div>
          <Link to="/order-new" className="btn-primary text-sm gap-1.5">
            <Package size={15} /> New Order
          </Link>
        </div>

        <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
          <Filter size={14} className="text-slate-400 flex-shrink-0" />
          {['all', 'awaiting_sample', 'processing', 'analyzing', 'in_review', 'complete'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                statusFilter === s ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {s === 'all' ? 'All' : ORDER_STATUS_LABELS[s as keyof typeof ORDER_STATUS_LABELS]}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center">
            <ShoppingCart size={32} className="mx-auto mb-3 text-slate-300" />
            <p className="font-medium text-slate-900 mb-1">No orders found</p>
            <p className="text-sm text-slate-500 mb-4">
              {statusFilter === 'all' ? "You haven't submitted any orders yet." : `No orders with status "${statusFilter}".`}
            </p>
            <Link to="/order-new" className="btn-primary text-sm">Submit Your First Samples</Link>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((order) => (
              <div key={order.id} className={`card transition-all ${order.id === newOrderId ? 'ring-2 ring-brand-500 ring-offset-2' : ''}`}>
                <button
                  onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                  className="w-full p-5 text-left"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2.5 mb-1">
                        <span className="font-semibold text-slate-900">{order.order_number}</span>
                        {order.id === newOrderId && (
                          <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium">Just submitted</span>
                        )}
                        {order.rush_processing && (
                          <span className="flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                            <Zap size={10} /> Rush
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        {formatDateTime(order.created_at)} · {order.order_samples?.length ?? 0} sample{(order.order_samples?.length ?? 0) !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-slate-900 mb-1">{formatCurrency(order.total)}</p>
                      <StatusBadge status={order.status} />
                    </div>
                  </div>
                </button>

                {expandedOrder === order.id && (
                  <div className="px-5 pb-5 border-t border-slate-100 pt-4">
                    <div className="mb-5 overflow-x-auto pb-2">
                      <OrderPipeline status={order.status} />
                    </div>

                    {order.order_samples && order.order_samples.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Samples</h4>
                        <div className="space-y-3">
                          {order.order_samples.map((sample) => (
                            <SampleAnalysisCard key={sample.id} sample={sample} orderStatus={order.status} />
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="text-xs text-slate-500 space-y-1 bg-slate-50 rounded-lg p-3">
                      <div className="flex justify-between">
                        <span>Subtotal</span>
                        <span>{formatCurrency(order.subtotal)}</span>
                      </div>
                      {order.discount_amount > 0 && (
                        <div className="flex justify-between text-emerald-600">
                          <span>Discount</span>
                          <span>−{formatCurrency(order.discount_amount)}</span>
                        </div>
                      )}
                      {order.rush_fee > 0 && (
                        <div className="flex justify-between text-amber-600">
                          <span>Rush fee</span>
                          <span>+{formatCurrency(order.rush_fee)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-semibold text-slate-900 text-sm pt-1 border-t border-slate-200 mt-1">
                        <span>Total</span>
                        <span>{formatCurrency(order.total)}</span>
                      </div>
                    </div>

                    {order.status === 'complete' && (
                      <Link to="/dashboard/coas" className="flex items-center gap-2 mt-3 text-sm text-brand-600 font-medium hover:text-brand-700">
                        <ArrowRight size={14} /> View COAs for this order
                      </Link>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
