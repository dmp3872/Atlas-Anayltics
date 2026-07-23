import { useEffect, useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle, Clock, Shield, XCircle, FlaskConical,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Order, OrderSample, TestPanel } from '../lib/types';
import { formatDateTime, SAMPLE_STATUS_LABELS } from '../lib/utils';
import { expectedPanelNames, sampleProgress } from '../lib/coaPanels';
import { useAuth } from '../context/AuthContext';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import AtlasLogo from '../components/brand/AtlasLogo';

export default function SampleCOA() {
  const { sampleId } = useParams<{ sampleId: string }>();
  const { user, profile, loading: authLoading } = useAuth();
  const [sample, setSample] = useState<OrderSample | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [panels, setPanels] = useState<TestPanel[]>([]);
  const [completedSlug, setCompletedSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!sampleId || authLoading) return;
    setLoading(true);
    setNotFound(false);
    (async () => {
      const { data: s } = await supabase.from('order_samples').select('*').eq('id', sampleId).maybeSingle();
      if (!s) { setNotFound(true); setLoading(false); return; }
      setSample(s);

      // If a certificate already exists for this sample, send the user there.
      const { data: coa } = await supabase.from('coas').select('slug').eq('sample_id', s.id).maybeSingle();
      if (coa?.slug) { setCompletedSlug(coa.slug); setLoading(false); return; }

      // Fall back to matching an existing certificate by batch number.
      const sMeta = s.metadata as { batch_number?: string } | null;
      const batch = sMeta?.batch_number?.trim();
      if (batch) {
        const { data: byBatch } = await supabase.from('coas').select('slug').eq('batch_number', batch).limit(1).maybeSingle();
        if (byBatch?.slug) { setCompletedSlug(byBatch.slug); setLoading(false); return; }
      }

      const [{ data: o }, { data: p }] = await Promise.all([
        s.order_id ? supabase.from('orders').select('*').eq('id', s.order_id).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from('test_panels').select('*').eq('is_active', true).order('sort_order'),
      ]);
      setOrder(o ?? null);
      setPanels(p ?? []);
      setLoading(false);
    })();
  }, [sampleId, user, authLoading]);

  if (!authLoading && !user) return <Navigate to="/auth" replace />;
  if (completedSlug) return <Navigate to={`/coa/${completedSlug}`} replace />;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (notFound || !sample) return (
    <>
      <Header />
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <XCircle size={28} className="text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-black mb-2">Sample Not Found</h1>
          <p className="text-neutral-500 mb-6">We couldn&apos;t find this sample or you don&apos;t have access to it.</p>
          <Link to="/dashboard/orders" className="btn-primary">Back to Orders</Link>
        </div>
      </div>
      <Footer />
    </>
  );

  const meta = sample.metadata as { batch_number?: string; labeled_content?: string; tests_label?: string } | null;
  const panelNames = expectedPanelNames(sample, panels);
  const done = sample.status === 'complete';
  const progress = sampleProgress(sample.status);
  const completedCount = done ? panelNames.length : Math.round(progress * panelNames.length);
  const companyLogo = profile?.company_logo || '';

  const infoFields = [
    { label: 'Client', value: profile?.company_name || '—' },
    { label: 'Sample Code', value: sample.id.slice(0, 12).toUpperCase() },
    { label: 'Sample Name', value: sample.display_name || sample.sample_name },
    { label: 'Batch Number', value: meta?.batch_number || '—' },
    { label: 'Order', value: order?.order_number || '—' },
    { label: 'Received', value: order ? formatDateTime(order.created_at) : formatDateTime(sample.created_at) },
    { label: 'Status', value: SAMPLE_STATUS_LABELS[sample.status] },
    { label: 'Test Package', value: meta?.tests_label || 'Testing package pending' },
  ];

  return (
    <>
      <Header />
      <div className="min-h-screen bg-white">
        <div className="coa-header-bar">
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <AtlasLogo variant="light" size="md" />
              {companyLogo && (
                <>
                  <span className="hidden sm:block h-8 w-px bg-neutral-700" />
                  <img src={companyLogo} alt="Company logo" className="h-10 max-w-[140px] object-contain" />
                </>
              )}
            </div>
            <div className="text-right">
              <h1 className="text-sm sm:text-base font-bold text-brand-500 uppercase tracking-[0.25em]">
                Certificate of Analysis
              </h1>
              {done ? (
                <p className="text-xs text-atlas-success mt-1 font-semibold uppercase tracking-wide">Analyses Complete</p>
              ) : (
                <p className="text-xs text-amber-400 mt-1 font-semibold uppercase tracking-wide">Preliminary · In Progress</p>
              )}
            </div>
          </div>
        </div>
        <div className="coa-gold-divider" />

        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <Link to="/dashboard/orders" className="inline-flex items-center gap-1.5 text-neutral-500 hover:text-brand-600 text-sm mb-6 transition-colors">
            <ArrowLeft size={14} /> Back to Orders
          </Link>

          {done ? (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-emerald-50 border border-emerald-200 mb-8">
              <CheckCircle size={18} className="text-atlas-success flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-emerald-900 text-sm">All analyses complete</p>
                <p className="text-sm text-emerald-800">Every ordered test has been completed and reviewed. The final signed certificate is being generated and will appear under your COAs shortly.</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200 mb-8">
              <Clock size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-900 text-sm">Testing in progress</p>
                <p className="text-sm text-amber-800">This is a partial certificate. Completed analyses appear below; remaining sections are marked <strong>Pending</strong> and will populate as each test finishes.</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-0 mb-8">
            {infoFields.map(({ label, value }) => (
              <div key={label} className="py-3 border-b border-atlas-border">
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</p>
                <p className="text-sm font-medium text-black mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {/* Progress */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Analysis Progress</p>
              <p className="text-xs font-semibold text-black">{completedCount} of {panelNames.length} complete</p>
            </div>
            <div className="h-2 w-full bg-neutral-200 rounded-full overflow-hidden">
              <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          </div>

          {/* Chromatogram placeholder */}
          <div className="mb-8 border border-atlas-border bg-neutral-50 flex flex-col items-center justify-center py-12 text-center">
            <FlaskConical size={28} className="text-neutral-300 mb-2" />
            <p className="text-sm font-medium text-neutral-500">
              {done ? 'HPLC Chromatogram on final certificate' : 'HPLC Chromatogram pending'}
            </p>
            <p className="text-xs text-neutral-400">
              {done ? 'The full chromatogram appears on your issued COA.' : 'Available once purity analysis is complete.'}
            </p>
          </div>

          {/* Panel table */}
          <div className="mb-8 overflow-hidden border border-atlas-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="coa-table-header">
                  <th className="text-left px-4 py-3">Test</th>
                  <th className="text-left px-4 py-3">Result</th>
                  <th className="text-left px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {panelNames.map((name, i) => {
                  const done = i < completedCount;
                  return (
                    <tr key={name} className={i % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}>
                      <td className="px-4 py-3 font-medium text-black border-t border-atlas-border">{name}</td>
                      <td className="px-4 py-3 text-neutral-600 border-t border-atlas-border">{done ? 'Meets specification' : '—'}</td>
                      <td className="px-4 py-3 border-t border-atlas-border">
                        {done ? (
                          <span className="inline-flex items-center gap-1 text-atlas-success font-bold uppercase text-xs"><CheckCircle size={13} /> Complete</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-600 font-bold uppercase text-xs"><Clock size={13} /> Pending</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-2 text-xs text-neutral-500 bg-neutral-50 p-3 border border-atlas-border">
            <Shield size={12} className="text-brand-500 flex-shrink-0" />
            A signed, tamper-proof certificate is issued automatically once all analyses are reviewed.
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
