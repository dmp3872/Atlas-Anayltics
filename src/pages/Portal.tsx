import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import {
  Truck, Copy, Check, X, Search, Download, FileText, ExternalLink,
  CheckCircle, XCircle, Clock, CreditCard, FlaskConical,
  Shield, Bell, Key, UserPlus, Lock, AlertTriangle, Package, MapPin,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { COA, Order, OrderSample, TestPanel } from '../lib/types';
import {
  formatCurrency, formatDate, formatDateTime,
  ORDER_STATUS_LABELS, SAMPLE_STATUS_LABELS, PAYMENT_STATUS_LABELS,
  ORDER_STATUS_STEPS, getStatusStep, normalizePaymentStatus, orderIsPayable,
} from '../lib/utils';
import { downloadCsv } from '../lib/exportCsv';
import {
  loadNotificationPrefs, saveNotificationPrefs,
  loadTeamMembers, saveTeamMembers, TeamMember, NotificationPrefs,
} from '../lib/portalPrefs';
import { loadOrderDraft, draftSummary } from '../lib/orderDraft';
import { canDiscardOrder, discardOrder } from '../lib/orderDiscard';
import { expectedPanelNames, matchCoaForSample } from '../lib/coaPanels';
import { testsForSample } from '../lib/labQueue';
import { SHIPPING_ADDRESS } from '../lib/submissionUtils';
import AccountSettings from '../components/account/AccountSettings';
import ClientPortalLayout from '../components/layout/ClientPortalLayout';
import GettingStarted from '../components/portal/GettingStarted';
import PeptideRequests from '../components/portal/PeptideRequests';
import PortalHome from '../components/portal/PortalHome';
import PrepaidShippingLabel from '../components/order/PrepaidShippingLabel';
import { queueNotification } from '../lib/notifications';
import { hydrateCoaImages } from '../lib/coaImages';
import { COA_LIST_COLUMNS } from '../lib/coaSelect';
import { useUserRole } from '../hooks/useUserRole';

type PortalTab = 'home' | 'getting-started' | 'peptide-requests' | 'coas' | 'samples' | 'orders' | 'invoices' | 'payments' | 'account' | 'widget' | 'team';

function ResultBadge({ result }: { result: string }) {
  if (result === 'pass') return <span className="badge-pass"><CheckCircle size={10} /> Pass</span>;
  if (result === 'fail') return <span className="badge-fail"><XCircle size={10} /> Fail</span>;
  return <span className="badge-pending"><Clock size={10} /> Pending</span>;
}

function CoaPublicationBadge({ coa }: { coa: COA }) {
  if (coa.is_public && coa.coa_workflow_stage === 'published') {
    return <span className="badge-pass"><CheckCircle size={10} /> Published</span>;
  }
  return <span className="badge-pending"><Lock size={10} /> Private Draft</span>;
}

function portalTestsForSample(sample: OrderSample, panels: TestPanel[]): string[] {
  const meta = sample.metadata as Record<string, unknown> | null;
  const hasWizardTestInfo = !!meta && (
    typeof meta.test_mode === 'string' ||
    typeof meta.tests_label === 'string' ||
    Array.isArray(meta.individual_tests)
  );
  return hasWizardTestInfo ? testsForSample(sample) : expectedPanelNames(sample, panels);
}

export default function Portal() {
  const { user, profile } = useAuth();
  const { role } = useUserRole();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const pathTab = location.pathname.includes('/orders') ? 'orders' : location.pathname.includes('/coas') ? 'coas' : null;
  const tab = (params.get('tab') as PortalTab) || pathTab || 'home';

  const [coas, setCoas] = useState<COA[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [samples, setSamples] = useState<OrderSample[]>([]);
  const [panels, setPanels] = useState<TestPanel[]>([]);
  const [loading, setLoading] = useState(true);
  const [shippingOpen, setShippingOpen] = useState(true);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sampleProduct, setSampleProduct] = useState('all');
  const [coaPeptide, setCoaPeptide] = useState('all');
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [discardingOrderId, setDiscardingOrderId] = useState<string | null>(null);

  const [promoCode, setPromoCode] = useState('');
  const [promoMsg, setPromoMsg] = useState('');
  const [notifs, setNotifs] = useState<NotificationPrefs>({ orderUpdates: true, coaReady: true, paymentReceipts: true, promotions: false });
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const orderDraft = user ? loadOrderDraft(user.id) : null;

  useEffect(() => {
    if (!user) return;
    setNotifs(loadNotificationPrefs(user.id));
    setTeam(loadTeamMembers(user.id));
  }, [user]);

  useEffect(() => {
    if (!user) return;

    function loadPortalData() {
      Promise.all([
        supabase.from('coas').select(COA_LIST_COLUMNS).eq('user_id', user!.id).order('issued_at', { ascending: false }),
        supabase.from('orders').select('*').eq('user_id', user!.id).order('created_at', { ascending: false }),
        supabase.from('order_samples').select('*').eq('user_id', user!.id).order('created_at', { ascending: false }),
        supabase.from('test_panels').select('*').eq('is_active', true).order('sort_order'),
      ]).then(([coasRes, ordersRes, samplesRes, panelsRes]) => {
        if (coasRes.data) setCoas((coasRes.data as COA[]).map(hydrateCoaImages));
        if (ordersRes.data) setOrders(ordersRes.data);
        if (samplesRes.data) setSamples(samplesRes.data);
        if (panelsRes.data) setPanels(panelsRes.data);
        setLoading(false);
      });
    }

    loadPortalData();

    const channel = supabase
      .channel(`portal-live-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `user_id=eq.${user.id}` }, loadPortalData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coas', filter: `user_id=eq.${user.id}` }, loadPortalData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_samples', filter: `user_id=eq.${user.id}` }, loadPortalData)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  useEffect(() => {
    const label = params.get('label');
    if (!label || orders.length === 0) return;
    const match = orders.find(o => o.shipping_label_id === label);
    if (match) setExpandedOrders(prev => new Set(prev).add(match.id));
  }, [orders, params]);

  if (!user) return <Navigate to="/auth" replace />;

  function setTab(t: PortalTab) {
    setParams({ tab: t }, { replace: true });
    setSearch('');
    setStatusFilter('all');
    setSampleProduct('all');
    setCoaPeptide('all');
  }

  async function copyAddress() {
    const text = `${SHIPPING_ADDRESS.name}\n${SHIPPING_ADDRESS.line1}\n${SHIPPING_ADDRESS.city}, ${SHIPPING_ADDRESS.state} ${SHIPPING_ADDRESS.zip}\n${SHIPPING_ADDRESS.country}`;
    await navigator.clipboard.writeText(text);
    setCopiedAddr(true);
    setTimeout(() => setCopiedAddr(false), 2000);
  }

  function toggleNotif(key: keyof NotificationPrefs) {
    if (!user) return;
    const next = { ...notifs, [key]: !notifs[key] };
    setNotifs(next);
    saveNotificationPrefs(user.id, next);
    if (next[key]) {
      const labels: Record<keyof NotificationPrefs, string> = {
        orderUpdates: 'Order Updates',
        coaReady: 'COA Ready',
        paymentReceipts: 'Payment Receipts',
        promotions: 'Promotions',
      };
      queueNotification({
        userId: user.id,
        type: key === 'coaReady' ? 'coa_ready' : key === 'paymentReceipts' ? 'payment_receipt' : key === 'promotions' ? 'promotion' : 'order_update',
        subject: `${labels[key]} enabled`,
        body: `You will receive email notifications for: ${labels[key]}.`,
      });
    }
  }

  function inviteMember() {
    if (!user || !inviteEmail.trim()) return;
    const member: TeamMember = {
      id: crypto.randomUUID(),
      email: inviteEmail.trim(),
      role: 'member',
      invitedAt: new Date().toISOString(),
    };
    const next = [...team, member];
    setTeam(next);
    saveTeamMembers(user.id, next);
    setInviteEmail('');
  }

  const coaPeptides = Array.from(new Set(coas.map(c => c.sample_name).filter(Boolean))).sort();

  const filteredCoas = coas.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || [c.sample_name, c.display_name, c.batch_number, c.slug, c.company_name].some(v => v?.toLowerCase().includes(q));
    const matchStatus = statusFilter === 'all' || c.overall_result === statusFilter;
    const matchPeptide = coaPeptide === 'all' || c.sample_name === coaPeptide;
    return matchSearch && matchStatus && matchPeptide;
  });

  const sampleProducts = Array.from(new Set(samples.map(s => s.sample_name).filter(Boolean))).sort();

  const filteredSamples = samples.filter(s => {
    const q = search.toLowerCase();
    const coa = matchCoaForSample(s, coas);
    const order = orders.find(o => o.id === s.order_id);
    const meta = s.metadata as { batch_number?: string } | null;
    const matchSearch = !q || [
      s.sample_name, s.display_name, coa?.slug, order?.order_number,
      meta?.batch_number, coa?.batch_number,
    ].some(v => v?.toLowerCase().includes(q));
    const matchProduct = sampleProduct === 'all' || s.sample_name === sampleProduct;
    return matchSearch && matchProduct;
  });

  const filteredOrders = orders.filter(o => {
    const q = search.toLowerCase();
    const matchSearch = !q || o.order_number.toLowerCase().includes(q) || o.company_name?.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || (
      tab === 'invoices' ? normalizePaymentStatus(o.payment_status) === statusFilter : o.status === statusFilter
    );
    return matchSearch && matchStatus;
  });

  async function handleDiscardOrder(order: Order) {
    if (!canDiscardOrder(order)) return;
    if (!confirm(`Discard order ${order.order_number}? This cannot be undone.`)) return;
    setDiscardingOrderId(order.id);
    const { error } = await discardOrder(order.id);
    if (error) {
      alert(error);
      setDiscardingOrderId(null);
      return;
    }
    setOrders(prev => prev.filter(o => o.id !== order.id));
    setSamples(prev => prev.filter(s => s.order_id !== order.id));
    setExpandedOrders(prev => {
      const next = new Set(prev);
      next.delete(order.id);
      return next;
    });
    setDiscardingOrderId(null);
  }

  return (
    <ClientPortalLayout>
      <div className="space-y-6">
        {orderDraft && tab === 'home' && (
          <div className="card p-4 flex flex-wrap items-center justify-between gap-3 border-brand-300 bg-brand-50">
            <div>
              <p className="font-semibold text-black">Resume your draft order</p>
              <p className="text-sm text-neutral-600">{draftSummary(orderDraft)} · saved {formatDateTime(orderDraft.updatedAt)}</p>
            </div>
            <Link to="/order-new" className="btn-primary text-sm">Continue Order</Link>
          </div>
        )}

        {(tab === 'home' || tab === 'orders') && (
        <div className="card overflow-hidden">
          <button
            onClick={() => setShippingOpen(!shippingOpen)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-neutral-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Truck size={18} className="text-brand-600" />
              <span className="font-semibold text-black text-sm">Shipping Instructions</span>
            </div>
            {shippingOpen ? <ChevronUp size={16} className="text-neutral-400" /> : <ChevronDown size={16} className="text-neutral-400" />}
          </button>
          {shippingOpen && (
            <div className="px-5 py-4 border-t border-atlas-border text-sm space-y-3">
              <p className="text-neutral-600">Ship via <strong>FedEx</strong> or <strong>UPS</strong>. Prepaid labels are generated at checkout.</p>
              <div>
                <p className="font-semibold text-black">{SHIPPING_ADDRESS.name}</p>
                <p className="text-neutral-600">{SHIPPING_ADDRESS.line1}, {SHIPPING_ADDRESS.city}, {SHIPPING_ADDRESS.state} {SHIPPING_ADDRESS.zip}</p>
                <button onClick={copyAddress} className="mt-2 flex items-center gap-1.5 text-brand-700 text-xs font-medium hover:text-brand-600">
                  {copiedAddr ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy address</>}
                </button>
              </div>
            </div>
          )}
        </div>
        )}

        {/* Tab content toolbar */}
        {['coas', 'samples', 'orders', 'invoices'].includes(tab) && (
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={
                  tab === 'coas' ? 'Search by peptide, code, lot, sample, or order #…' :
                  tab === 'samples' ? 'Search by product, lot, order, COA…' :
                  tab === 'orders' ? 'Search orders…' : 'Search invoices…'
                }
                className="input-field pl-9 py-2 text-sm"
              />
            </div>
            {tab === 'coas' && (
              <select value={coaPeptide} onChange={e => setCoaPeptide(e.target.value)} className="input-field py-2 text-sm w-auto">
                <option value="all">All Peptides</option>
                {coaPeptides.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
            {tab === 'samples' ? (
              <select value={sampleProduct} onChange={e => setSampleProduct(e.target.value)} className="input-field py-2 text-sm w-auto">
                <option value="all">All Products</option>
                {sampleProducts.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            ) : tab === 'coas' ? (
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-field py-2 text-sm w-auto">
                <option value="all">All Results</option>
                <option value="pass">Pass</option>
                <option value="fail">Fail</option>
                <option value="pending">Pending</option>
              </select>
            ) : (
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-field py-2 text-sm w-auto">
                <option value="all">All Statuses</option>
                {tab === 'orders' && Object.entries(ORDER_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                {tab === 'invoices' && <><option value="paid">Paid</option><option value="waived">Waived</option><option value="unpaid">Unpaid</option></>}
              </select>
            )}
            <button
              onClick={() => {
                if (tab === 'coas') downloadCsv('coas.csv', ['ID', 'Sample', 'Batch', 'Purity', 'Result', 'Issued'], filteredCoas.map(c => [c.slug, c.sample_name, c.batch_number, c.purity_percent, c.overall_result, formatDate(c.issued_at)]));
                if (tab === 'samples') downloadCsv('samples.csv', ['Sample', 'Type', 'Status', 'Vials', 'Created'], filteredSamples.map(s => [s.sample_name, s.sample_type, s.status, s.vial_count, formatDate(s.created_at)]));
                if (tab === 'orders') downloadCsv('orders.csv', ['Order', 'Status', 'Total', 'Created'], filteredOrders.map(o => [o.order_number, o.status, o.total, formatDate(o.created_at)]));
                if (tab === 'invoices') downloadCsv('invoices.csv', ['Invoice', 'Order', 'Amount', 'Status', 'Date'], filteredOrders.map(o => [o.order_number, o.order_number, o.total, PAYMENT_STATUS_LABELS[normalizePaymentStatus(o.payment_status)], formatDate(o.created_at)]));
              }}
              className="btn-outline text-sm gap-1.5 py-2"
            >
              <Download size={14} /> Export
            </button>
          </div>
        )}

        {loading && !['home', 'getting-started', 'peptide-requests'].includes(tab) ? (
          <div className="card p-12 text-center text-neutral-500">Loading…</div>
        ) : (
          <>
            {tab === 'home' && (
              <PortalHome orders={orders} coaCount={coas.length} loading={loading} />
            )}

            {tab === 'getting-started' && <GettingStarted />}

            {tab === 'peptide-requests' && <PeptideRequests />}
            {/* COAs Tab */}
            {tab === 'coas' && (
              <div className="space-y-4">
                <div>
                  <h1 className="portal-page-title">Your COAs</h1>
                  <p className="portal-page-subtitle">Certificates of analysis from your Atlas Analytics testing. Open a certificate to download a PNG.</p>
                </div>
                <div className="card overflow-hidden">
                {filteredCoas.length === 0 ? (
                  <div className="p-12 text-center">
                    <FileText size={32} className="mx-auto mb-3 text-neutral-300" />
                    <p className="font-medium">No certificates yet</p>
                    <Link to="/order-new" className="btn-primary text-sm mt-4 inline-flex">Submit a Sample</Link>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="portal-data-table">
                      <thead>
                        <tr className="coa-table-header">
                          <th className="text-left px-5 py-3">Name</th>
                          <th className="text-left px-5 py-3">Results</th>
                          <th className="text-left px-5 py-3">Visibility</th>
                          <th className="text-left px-5 py-3">Lot</th>
                          <th className="text-left px-5 py-3">Date</th>
                          <th className="px-5 py-3"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-atlas-border">
                        {filteredCoas.map(coa => (
                          <tr key={coa.id} className="bg-white hover:bg-neutral-50">
                            <td className="px-5 py-3">
                              <p className="font-medium text-black">{coa.display_name || coa.sample_name}</p>
                              <p className="text-xs text-neutral-500 font-mono">{coa.slug.slice(0, 16)}</p>
                            </td>
                            <td className="px-5 py-3"><ResultBadge result={coa.overall_result} /></td>
                            <td className="px-5 py-3"><CoaPublicationBadge coa={coa} /></td>
                            <td className="px-5 py-3 text-neutral-600">{coa.batch_number || '—'}</td>
                            <td className="px-5 py-3 text-neutral-600">{formatDate(coa.issued_at)}</td>
                            <td className="px-5 py-3 text-right">
                              <div className="inline-flex flex-wrap gap-2 justify-end">
                                <Link to={`/coa/${coa.slug}`} className="btn-primary text-xs py-1.5 gap-1 inline-flex">
                                  <ExternalLink size={12} /> Open & download PNG
                                </Link>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                </div>
              </div>
            )}

            {/* Samples Tab */}
            {tab === 'samples' && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-black">Your Samples</h2>
                  <p className="text-sm text-neutral-500 mt-1">Track every sample submitted to Atlas Analytics through testing.</p>
                </div>
                <div className="card overflow-hidden">
                  {filteredSamples.length === 0 ? (
                    <div className="p-12 text-center">
                      <FlaskConical size={32} className="mx-auto mb-3 text-neutral-300" />
                      <p className="font-medium">{samples.length === 0 ? 'No samples yet' : 'No samples match your search'}</p>
                      {samples.length === 0 && (
                        <Link to="/order-new" className="btn-primary text-sm mt-4 inline-flex">Submit a Sample</Link>
                      )}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="coa-table-header">
                            <th className="text-left px-5 py-3">Order</th>
                            <th className="text-left px-5 py-3">Name</th>
                            <th className="text-left px-5 py-3">Results</th>
                            <th className="text-left px-5 py-3">Lot</th>
                            <th className="text-left px-5 py-3">Date</th>
                            <th className="px-5 py-3"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-atlas-border">
                          {filteredSamples.map(s => {
                            const coa = matchCoaForSample(s, coas);
                            const order = orders.find(o => o.id === s.order_id);
                            const meta = s.metadata as { batch_number?: string; labeled_content?: string; tests_label?: string } | null;
                            const lot = meta?.batch_number || coa?.batch_number || '—';
                            return (
                              <tr key={s.id} className="bg-white hover:bg-neutral-50 transition-colors">
                                <td className="px-5 py-3">
                                  {order ? (
                                    <button onClick={() => setTab('orders')} className="font-mono text-xs font-semibold text-brand-700 hover:underline">
                                      {order.order_number}
                                    </button>
                                  ) : <span className="text-neutral-400">—</span>}
                                </td>
                                <td className="px-5 py-3">
                                  <p className="font-medium text-black">{s.display_name || s.sample_name}</p>
                                  {meta?.labeled_content && (
                                    <p className="text-xs text-neutral-500">
                                      {meta.labeled_content}{meta.tests_label ? ` · ${meta.tests_label}` : ''}
                                    </p>
                                  )}
                                </td>
                                <td className="px-5 py-3">
                                  {coa ? (
                                    <ResultBadge result={coa.overall_result} />
                                  ) : (
                                    <span className="badge-pending"><Clock size={10} /> {SAMPLE_STATUS_LABELS[s.status]}</span>
                                  )}
                                </td>
                                <td className="px-5 py-3 text-neutral-600">{lot}</td>
                                <td className="px-5 py-3 text-neutral-600">{formatDate(s.created_at)}</td>
                                <td className="px-5 py-3 text-right">
                                  {coa ? (
                                    <Link to={`/coa/${coa.slug}`} className="btn-outline text-xs py-1.5 gap-1 inline-flex">
                                      <ExternalLink size={12} /> COA
                                    </Link>
                                  ) : s.status === 'complete' ? (
                                    <Link to={`/sample/${s.id}/coa`} className="btn-outline text-xs py-1.5 gap-1 inline-flex">
                                      <ExternalLink size={12} /> COA
                                    </Link>
                                  ) : s.status === 'received' ? (
                                    <span className="text-xs text-neutral-400">Awaiting testing</span>
                                  ) : (
                                    <Link to={`/sample/${s.id}/coa`} className="btn-outline text-xs py-1.5 gap-1 inline-flex whitespace-nowrap border-amber-300 text-amber-700 hover:bg-amber-50">
                                      <Clock size={12} /> Partial COA
                                    </Link>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Orders Tab */}
            {tab === 'orders' && (
              <div className="space-y-3">
                {filteredOrders.length === 0 ? (
                  <div className="card p-12 text-center"><Link to="/order-new" className="btn-primary text-sm">New Order</Link></div>
                ) : filteredOrders.map(order => {
                  const orderSamples = samples.filter(s => s.order_id === order.id);
                  const expanded = expandedOrders.has(order.id);
                  return (
                  <div key={order.id} className="card overflow-hidden">
                    <button
                      onClick={() => setExpandedOrders(prev => {
                        const next = new Set(prev);
                        next.has(order.id) ? next.delete(order.id) : next.add(order.id);
                        return next;
                      })}
                      className="w-full text-left p-5 hover:bg-neutral-50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex items-center gap-3">
                          {expanded ? <ChevronUp size={18} className="text-neutral-400 mt-0.5" /> : <ChevronDown size={18} className="text-neutral-400 mt-0.5" />}
                          <div>
                            <p className="font-bold text-black">{order.order_number}</p>
                            <p className="text-xs text-neutral-500">
                              {formatDateTime(order.created_at)} · {orderSamples.length} sample{orderSamples.length === 1 ? '' : 's'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold">{formatCurrency(order.total)}</p>
                          <span className="text-xs font-semibold uppercase text-brand-700">{ORDER_STATUS_LABELS[order.status]}</span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {ORDER_STATUS_STEPS.map((step, i) => {
                          const idx = getStatusStep(order.status);
                          return (
                            <div key={step} className={`h-1.5 flex-1 rounded-full ${i <= idx ? 'bg-brand-500' : 'bg-neutral-200'}`} />
                          );
                        })}
                      </div>
                    </button>

                    {expanded && (
                      <div className="border-t border-atlas-border divide-y divide-atlas-border">
                        {order.status === 'awaiting_sample' && !orderIsPayable(order.payment_status) && (
                          <div className="px-5 py-3 flex items-start gap-2 text-sm bg-amber-50 border-b border-amber-100 text-amber-800">
                            <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
                            <p>Payment pending — staff will confirm wire/crypto. Card checkout coming soon.</p>
                          </div>
                        )}
                        {order.status === 'awaiting_sample' && orderIsPayable(order.payment_status) && (
                          <div className="p-5 bg-neutral-50 space-y-3">
                            <div className="flex items-start gap-3">
                              <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
                                <Package size={18} className="text-brand-600" />
                              </div>
                              <div>
                                <p className="font-bold text-black text-sm">Shipping Instructions</p>
                                <p className="text-xs text-neutral-500 mt-0.5">Include your order number on the outside of the package.</p>
                              </div>
                            </div>
                            <div className="flex items-start gap-3 bg-white border border-atlas-border rounded-xl p-3">
                              <MapPin size={16} className="text-brand-600 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="font-semibold text-black text-sm">{SHIPPING_ADDRESS.name}</p>
                                <p className="text-xs text-neutral-600 mt-1">
                                  {SHIPPING_ADDRESS.line1}<br />
                                  {SHIPPING_ADDRESS.city}, {SHIPPING_ADDRESS.state} {SHIPPING_ADDRESS.zip}<br />
                                  {SHIPPING_ADDRESS.country}
                                </p>
                                <p className="text-[11px] text-neutral-500 mt-2">Ref: {order.order_number}</p>
                              </div>
                            </div>
                          </div>
                        )}
                        {order.shipping_label_id && (
                          <div className="p-5 bg-neutral-50">
                            <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3">Prepaid Shipping Label</p>
                            <PrepaidShippingLabel labelId={order.shipping_label_id} orderNumber={order.order_number} />
                          </div>
                        )}
                        {order.payment_method === 'crypto' && orderIsPayable(order.payment_status) && (
                          <p className="px-5 py-3 text-xs text-neutral-600 bg-amber-50 border-b border-amber-100">
                            Paid via cryptocurrency · transaction confirmed at checkout
                          </p>
                        )}
                        {orderSamples.length === 0 ? (
                          <p className="px-5 py-4 text-sm text-neutral-500">No samples recorded for this order.</p>
                        ) : orderSamples.map(s => {
                          const coa = matchCoaForSample(s, coas);
                          const meta = s.metadata as { tests_label?: string; batch_number?: string } | null;
                          const tests = portalTestsForSample(s, panels);
                          return (
                            <div key={s.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-semibold text-black">{s.display_name || s.sample_name}</p>
                                  <span className="text-xs text-neutral-400 capitalize">{s.sample_type}</span>
                                  {coa ? <ResultBadge result={coa.overall_result} /> : <span className="badge-pending"><Clock size={10} /> {SAMPLE_STATUS_LABELS[s.status]}</span>}
                                </div>
                                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mt-2 mb-1">
                                  Tests Ordered{meta?.tests_label ? ` · ${meta.tests_label}` : ''}
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {tests.map(t => (
                                    <span key={t} className="inline-block text-xs bg-neutral-100 text-neutral-700 rounded px-2 py-0.5">{t}</span>
                                  ))}
                                </div>
                              </div>
                              <div className="flex-shrink-0">
                                {coa ? (
                                  <Link to={`/coa/${coa.slug}`} className="btn-outline text-xs py-1.5 gap-1 inline-flex whitespace-nowrap">
                                    <ExternalLink size={12} /> View COA
                                  </Link>
                                ) : s.status === 'complete' ? (
                                  <Link to={`/sample/${s.id}/coa`} className="btn-outline text-xs py-1.5 gap-1 inline-flex whitespace-nowrap">
                                    <ExternalLink size={12} /> View COA
                                  </Link>
                                ) : s.status === 'received' ? (
                                  <span className="text-xs text-neutral-400 whitespace-nowrap">Awaiting testing</span>
                                ) : (
                                  <Link to={`/sample/${s.id}/coa`} className="btn-outline text-xs py-1.5 gap-1 inline-flex whitespace-nowrap border-amber-300 text-amber-700 hover:bg-amber-50">
                                    <Clock size={12} /> View partial COA
                                  </Link>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {canDiscardOrder(order) && (
                          <div className="px-5 py-4 border-t border-atlas-border bg-neutral-50">
                            <button
                              type="button"
                              onClick={() => handleDiscardOrder(order)}
                              disabled={discardingOrderId === order.id}
                              className="text-sm text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
                            >
                              {discardingOrderId === order.id ? 'Discarding…' : 'Discard order'}
                            </button>
                            <p className="text-xs text-neutral-500 mt-1">
                              Permanently removes this order before lab processing begins.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}

            {/* Invoices Tab */}
            {tab === 'invoices' && (
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="coa-table-header"><th className="text-left px-5 py-3">Invoice</th><th className="text-left px-5 py-3">Date</th><th className="text-left px-5 py-3">Amount</th><th className="text-left px-5 py-3">Status</th><th className="text-left px-5 py-3"></th></tr></thead>
                  <tbody>
                    {filteredOrders.map((o, i) => {
                      const payment = normalizePaymentStatus(o.payment_status);
                      const paid = orderIsPayable(o.payment_status);
                      return (
                        <tr key={o.id} className={i % 2 ? 'bg-neutral-50' : 'bg-white'}>
                          <td className="px-5 py-3 font-medium">{o.order_number}</td>
                          <td className="px-5 py-3">{formatDate(o.created_at)}</td>
                          <td className="px-5 py-3 font-semibold">{formatCurrency(o.total)}</td>
                          <td className="px-5 py-3"><span className={paid ? 'text-atlas-success font-bold' : 'text-amber-600 font-bold'}>{PAYMENT_STATUS_LABELS[payment]}</span></td>
                          <td className="px-5 py-3"><button className="text-xs text-brand-700 hover:underline">PDF</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {orders.length === 0 && <p className="p-12 text-center text-neutral-500">No invoices yet</p>}
              </div>
            )}

            {/* Payments Tab */}
            {tab === 'payments' && (
              <div className="card p-6">
                {orders.filter(o => orderIsPayable(o.payment_status)).length === 0 ? (
                  <div className="text-center py-8">
                    <CreditCard size={32} className="mx-auto mb-3 text-neutral-300" />
                    <p className="font-medium">No payment records yet</p>
                    <p className="text-sm text-neutral-500 mt-1">Payments appear here once staff confirm your wire, crypto, or waived payment.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {orders.filter(o => orderIsPayable(o.payment_status)).map(o => (
                      <div key={o.id} className="flex justify-between py-3 border-b border-atlas-border last:border-0">
                        <div>
                          <p className="font-medium">{o.order_number}</p>
                          <p className="text-xs text-neutral-500">
                            {o.paid_at ? formatDateTime(o.paid_at) : formatDateTime(o.updated_at)} · {PAYMENT_STATUS_LABELS[normalizePaymentStatus(o.payment_status)]}
                          </p>
                        </div>
                        <p className="font-bold text-atlas-success">{formatCurrency(o.total)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Account Tab */}
            {tab === 'account' && (
              <div className="space-y-6">
                <AccountSettings />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="card p-6">
                    <h3 className="font-bold mb-3 flex items-center gap-2"><CreditCard size={16} /> Balance</h3>
                    <p className="text-3xl font-bold">{formatCurrency(profile?.prepaid_balance ?? 0)}</p>
                    <p className="text-xs text-neutral-500 mt-1">Available prepaid balance</p>
                  </div>
                  <div className="card p-6 space-y-3">
                    <h3 className="font-bold flex items-center gap-2"><Key size={16} /> Promo Code</h3>
                    <div className="flex gap-2">
                      <input value={promoCode} onChange={e => setPromoCode(e.target.value)} placeholder="Enter promo code" className="input-field flex-1" />
                      <button type="button" onClick={() => setPromoMsg(promoCode ? 'Promo code applied at checkout.' : 'Enter a code.')} className="btn-outline">Apply</button>
                    </div>
                    {promoMsg && <p className="text-xs text-brand-700">{promoMsg}</p>}
                  </div>
                  <div className="card p-6 space-y-3">
                    <h3 className="font-bold flex items-center gap-2"><Bell size={16} /> Notifications</h3>
                    {([
                      ['orderUpdates', 'Order Updates', 'When order status changes'],
                      ['coaReady', 'COA Ready', 'When certificates are issued'],
                      ['paymentReceipts', 'Payment Receipts', 'Payment confirmations'],
                      ['promotions', 'Promotions', 'News and special offers'],
                    ] as const).map(([key, label, sub]) => (
                      <label key={key} className="flex items-center justify-between py-2 cursor-pointer">
                        <div><p className="text-sm font-medium">{label}</p><p className="text-xs text-neutral-500">{sub}</p></div>
                        <input type="checkbox" checked={notifs[key]} onChange={() => toggleNotif(key)} className="w-4 h-4 accent-brand-500" />
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Widget Tab */}
            {tab === 'widget' && (
              <div className="card p-6 space-y-4">
                <h3 className="font-bold flex items-center gap-2"><Shield size={16} /> QR-Verified Digital Certificates</h3>
                <p className="text-sm text-neutral-600">Embed COA verification on your product pages. Every certificate includes a scannable verification link.</p>
                <div className="bg-neutral-950 text-brand-400 p-4 rounded-lg font-mono text-xs overflow-x-auto">
                  {`<iframe src="${window.location.origin}/verify?embed=1" width="100%" height="120" frameborder="0"></iframe>`}
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(`<iframe src="${window.location.origin}/verify?embed=1" width="100%" height="120" frameborder="0"></iframe>`)}
                  className="btn-outline text-sm gap-1.5"
                >
                  <Copy size={14} /> Copy Embed Code
                </button>
              </div>
            )}

            {/* Team Tab */}
            {tab === 'team' && (
              <div className="space-y-6">
                <div className="card p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-bold">Team Members</h3>
                      <p className="text-sm text-neutral-500">Manage portal access for your organization</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-4 p-3 bg-neutral-50 rounded-lg">
                    <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-brand-400 text-xs font-bold">{user.email?.[0].toUpperCase()}</div>
                    <div className="flex-1"><p className="text-sm font-medium">{user.email}</p><p className="text-xs text-brand-700">Admin (you)</p></div>
                  </div>
                  {team.map(m => (
                    <div key={m.id} className="flex items-center justify-between py-3 border-t border-atlas-border">
                      <div><p className="text-sm font-medium">{m.email}</p><p className="text-xs text-neutral-500 capitalize">{m.role} · Invited {formatDate(m.invitedAt)}</p></div>
                      <button onClick={() => { const next = team.filter(t => t.id !== m.id); setTeam(next); saveTeamMembers(user!.id, next); }} className="text-red-500 hover:text-red-700"><X size={16} /></button>
                    </div>
                  ))}
                  <div className="flex gap-2 mt-4 pt-4 border-t border-atlas-border">
                    <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="colleague@company.com" className="input-field flex-1" type="email" />
                    <button onClick={inviteMember} className="btn-primary gap-1.5"><UserPlus size={16} /> Invite</button>
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="card p-5">
                    <h4 className="font-semibold text-brand-700 mb-2">Admin</h4>
                    <ul className="text-sm text-neutral-600 space-y-1 list-disc pl-4">
                      <li>View all COAs, samples, orders</li><li>Place new orders</li><li>Manage team & settings</li>
                    </ul>
                  </div>
                  <div className="card p-5">
                    <h4 className="font-semibold text-neutral-700 mb-2">Member</h4>
                    <ul className="text-sm text-neutral-600 space-y-1 list-disc pl-4">
                      <li>View COAs and track orders</li><li>Download COA PDFs</li><li>Cannot place orders</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </ClientPortalLayout>
  );
}
