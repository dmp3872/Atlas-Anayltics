import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import {
  Package, ClipboardList, TrendingUp, Timer, Activity, FlaskConical,
  Truck, Copy, Check, X, Search, Download, FileText, ExternalLink,
  CheckCircle, XCircle, Clock, LogOut, ShoppingCart, CreditCard,
  Users, Code, Shield, Bell, Key, Plus, UserPlus, Building2,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import AtlasLogo from '../components/brand/AtlasLogo';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { COA, Order, OrderSample, TestPanel } from '../lib/types';
import {
  formatCurrency, formatDate, formatDateTime,
  ORDER_STATUS_LABELS, SAMPLE_STATUS_LABELS,
} from '../lib/utils';
import { downloadCsv } from '../lib/exportCsv';
import {
  loadNotificationPrefs, saveNotificationPrefs,
  loadTeamMembers, saveTeamMembers, TeamMember, NotificationPrefs,
} from '../lib/portalPrefs';
import { loadOrderDraft, draftSummary } from '../lib/orderDraft';
import AccountSettings from '../components/account/AccountSettings';

type PortalTab = 'coas' | 'samples' | 'orders' | 'invoices' | 'payments' | 'account' | 'widget' | 'team';

const TABS: { id: PortalTab; label: string; icon: typeof FileText }[] = [
  { id: 'coas', label: 'COAs', icon: FileText },
  { id: 'samples', label: 'Samples', icon: FlaskConical },
  { id: 'orders', label: 'Orders', icon: ShoppingCart },
  { id: 'invoices', label: 'Inv', icon: ClipboardList },
  { id: 'payments', label: 'Pay', icon: CreditCard },
  { id: 'account', label: 'Acct', icon: Building2 },
  { id: 'widget', label: 'Widget', icon: Code },
  { id: 'team', label: 'Team', icon: Users },
];

const SHIPPING_ADDRESS = `Atlas Analytics\n1234 Research Blvd\nAustin, TX 78701`;

function ResultBadge({ result }: { result: string }) {
  if (result === 'pass') return <span className="badge-pass"><CheckCircle size={10} /> Pass</span>;
  if (result === 'fail') return <span className="badge-fail"><XCircle size={10} /> Fail</span>;
  return <span className="badge-pending"><Clock size={10} /> Pending</span>;
}

export default function Portal() {
  const { user, profile, signOut } = useAuth();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const pathTab = location.pathname.includes('/orders') ? 'orders' : location.pathname.includes('/coas') ? 'coas' : null;
  const tab = (params.get('tab') as PortalTab) || pathTab || 'coas';

  const [coas, setCoas] = useState<COA[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [samples, setSamples] = useState<OrderSample[]>([]);
  const [panels, setPanels] = useState<TestPanel[]>([]);
  const [loading, setLoading] = useState(true);
  const [shippingOpen, setShippingOpen] = useState(true);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedCoas, setSelectedCoas] = useState<Set<string>>(new Set());

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
    Promise.all([
      supabase.from('coas').select('*').eq('user_id', user.id).order('issued_at', { ascending: false }),
      supabase.from('orders').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('order_samples').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('test_panels').select('*').eq('is_active', true).order('sort_order'),
    ]).then(([coasRes, ordersRes, samplesRes, panelsRes]) => {
      if (coasRes.data) setCoas(coasRes.data);
      if (ordersRes.data) setOrders(ordersRes.data);
      if (samplesRes.data) setSamples(samplesRes.data);
      if (panelsRes.data) setPanels(panelsRes.data);
      setLoading(false);
    });
  }, [user]);

  const stats = useMemo(() => {
    const passCount = coas.filter(c => c.overall_result === 'pass').length;
    const passRate = coas.length ? Math.round((passCount / coas.length) * 100) : 0;
    const products = new Set(samples.map(s => s.sample_name).filter(Boolean)).size;
    const inProgress = orders.filter(o => !['complete', 'cancelled'].includes(o.status)).length;
    const testsRun = coas.reduce((n, c) => n + (Array.isArray(c.panel_results) ? c.panel_results.length : 0), 0);
    const tats = coas.filter(c => c.order_id).map(c => {
      const order = orders.find(o => o.id === c.order_id);
      if (!order) return null;
      return (new Date(c.issued_at).getTime() - new Date(order.created_at).getTime()) / 86400000;
    }).filter((d): d is number => d !== null);
    const avgTat = tats.length ? Math.round(tats.reduce((a, b) => a + b, 0) / tats.length) : 0;
    return { samples: samples.length, testsRun, passRate, avgTat, inProgress, products };
  }, [coas, orders, samples]);

  if (!user) return <Navigate to="/auth" replace />;

  function setTab(t: PortalTab) {
    setParams({ tab: t }, { replace: true });
    setSearch('');
    setStatusFilter('all');
  }

  async function copyAddress() {
    await navigator.clipboard.writeText(SHIPPING_ADDRESS.replace(/\\n/g, '\n'));
    setCopiedAddr(true);
    setTimeout(() => setCopiedAddr(false), 2000);
  }

  function toggleNotif(key: keyof NotificationPrefs) {
    if (!user) return;
    const next = { ...notifs, [key]: !notifs[key] };
    setNotifs(next);
    saveNotificationPrefs(user.id, next);
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

  const filteredCoas = coas.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || [c.sample_name, c.display_name, c.batch_number, c.slug, c.company_name].some(v => v?.toLowerCase().includes(q));
    const matchStatus = statusFilter === 'all' || c.overall_result === statusFilter;
    return matchSearch && matchStatus;
  });

  const filteredSamples = samples.filter(s => {
    const q = search.toLowerCase();
    const coa = coas.find(c => c.sample_id === s.id);
    return !q || [s.sample_name, s.display_name, coa?.slug].some(v => v?.toLowerCase().includes(q));
  });

  const filteredOrders = orders.filter(o => {
    const q = search.toLowerCase();
    const matchSearch = !q || o.order_number.toLowerCase().includes(q) || o.company_name?.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const displayName = profile?.company_name || profile?.full_name || user.email?.split('@')[0] || 'Client';

  return (
    <div className="min-h-screen bg-neutral-100">
      {/* Header */}
      <header className="bg-white border-b border-atlas-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <AtlasLogo size="sm" />
            <div className="hidden sm:block border-l border-atlas-border pl-4">
              <p className="font-bold text-black truncate">{displayName}</p>
              <p className="text-xs text-neutral-500">Client Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTab('samples')}
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg"
            >
              <FlaskConical size={16} /> Track Samples
            </button>
            <Link to="/order-new" className="btn-primary text-sm gap-1.5">
              <Plus size={16} /> New Order
            </Link>
            <button onClick={() => signOut()} className="p-2 text-neutral-500 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Sign out">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {orderDraft && (
          <div className="card p-4 flex flex-wrap items-center justify-between gap-3 border-brand-300 bg-brand-50">
            <div>
              <p className="font-semibold text-black">Resume your draft order</p>
              <p className="text-sm text-neutral-600">{draftSummary(orderDraft)} · saved {formatDateTime(orderDraft.updatedAt)}</p>
            </div>
            <Link to="/order-new" className="btn-primary text-sm">Continue Order</Link>
          </div>
        )}

        {/* Shipping banner */}
        <div className="card overflow-hidden">
          <button
            onClick={() => setShippingOpen(!shippingOpen)}
            className="w-full flex items-center justify-between px-5 py-4 bg-brand-50 hover:bg-brand-100/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Truck size={20} className="text-brand-600" />
              <span className="font-semibold text-black">Shipping Instructions</span>
            </div>
            {shippingOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
          {shippingOpen && (
            <div className="px-5 py-4 border-t border-atlas-border text-sm space-y-3">
              <p className="text-neutral-600">Ship all samples via <strong>FedEx</strong> or <strong>UPS</strong> only. We receive Monday–Friday.</p>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-black">Atlas Analytics</p>
                  <p className="text-neutral-600">1234 Research Blvd, Austin, TX 78701</p>
                  <button onClick={copyAddress} className="mt-2 flex items-center gap-1.5 text-brand-700 text-xs font-medium hover:text-brand-600">
                    {copiedAddr ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy address</>}
                  </button>
                </div>
              </div>
              <ul className="list-disc pl-5 text-neutral-600 space-y-1">
                <li>Bubble wrap all vials individually</li>
                <li>Use adequate padding in the box</li>
                <li>Print your order confirmation and include it in the shipment</li>
              </ul>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Samples', value: stats.samples, icon: Package },
            { label: 'Tests Run', value: stats.testsRun, icon: ClipboardList },
            { label: 'Pass Rate', value: `${stats.passRate}%`, icon: TrendingUp, accent: stats.passRate >= 90 ? 'text-atlas-success' : '' },
            { label: 'Avg. TAT', value: `${stats.avgTat || '—'}d`, icon: Timer, sub: 'Business days' },
            { label: 'In Progress', value: stats.inProgress, icon: Activity },
            { label: 'Products', value: stats.products, icon: FlaskConical },
          ].map(s => (
            <div key={s.label} className="card p-4">
              <s.icon size={16} className="text-brand-500 mb-2" />
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{s.label}</p>
              <p className={`text-2xl font-bold text-black ${s.accent ?? ''}`}>{s.value}</p>
              {s.sub && <p className="text-[10px] text-neutral-400">{s.sub}</p>}
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                tab === t.id ? 'bg-black text-brand-400' : 'bg-white text-neutral-600 hover:bg-neutral-50 border border-atlas-border'
              }`}
            >
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>

        {/* Tab content toolbar */}
        {['coas', 'samples', 'orders', 'invoices'].includes(tab) && (
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={
                  tab === 'coas' ? 'Search certificates...' :
                  tab === 'samples' ? 'Search by product, lot, order, COA...' :
                  tab === 'orders' ? 'Search orders...' : 'Search invoices...'
                }
                className="input-field pl-9 py-2 text-sm"
              />
            </div>
            {tab !== 'samples' && (
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-field py-2 text-sm w-auto">
                <option value="all">All Statuses</option>
                {tab === 'coas' && <><option value="pass">Pass</option><option value="fail">Fail</option><option value="pending">Pending</option></>}
                {tab === 'orders' && Object.entries(ORDER_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                {tab === 'invoices' && <><option value="complete">Paid</option><option value="received">Pending</option></>}
              </select>
            )}
            <button
              onClick={() => {
                if (tab === 'coas') downloadCsv('coas.csv', ['ID', 'Sample', 'Batch', 'Purity', 'Result', 'Issued'], filteredCoas.map(c => [c.slug, c.sample_name, c.batch_number, c.purity_percent, c.overall_result, formatDate(c.issued_at)]));
                if (tab === 'samples') downloadCsv('samples.csv', ['Sample', 'Type', 'Status', 'Vials', 'Created'], filteredSamples.map(s => [s.sample_name, s.sample_type, s.status, s.vial_count, formatDate(s.created_at)]));
                if (tab === 'orders') downloadCsv('orders.csv', ['Order', 'Status', 'Total', 'Created'], filteredOrders.map(o => [o.order_number, o.status, o.total, formatDate(o.created_at)]));
                if (tab === 'invoices') downloadCsv('invoices.csv', ['Invoice', 'Order', 'Amount', 'Status', 'Date'], filteredOrders.map(o => [o.order_number, o.order_number, o.total, o.status === 'complete' ? 'Paid' : 'Pending', formatDate(o.created_at)]));
              }}
              className="btn-outline text-sm gap-1.5 py-2"
            >
              <Download size={14} /> Export CSV
            </button>
          </div>
        )}

        {loading ? (
          <div className="card p-12 text-center text-neutral-500">Loading...</div>
        ) : (
          <>
            {/* COAs Tab */}
            {tab === 'coas' && (
              <div className="card overflow-hidden">
                {filteredCoas.length === 0 ? (
                  <div className="p-12 text-center">
                    <FileText size={32} className="mx-auto mb-3 text-neutral-300" />
                    <p className="font-medium">No certificates yet</p>
                    <Link to="/order-new" className="btn-primary text-sm mt-4 inline-flex">Place Your First Order</Link>
                  </div>
                ) : (
                  <div className="divide-y divide-atlas-border">
                    {filteredCoas.map(coa => (
                      <div key={coa.id} className="flex items-center gap-4 px-5 py-4 hover:bg-neutral-50">
                        <input
                          type="checkbox"
                          checked={selectedCoas.has(coa.id)}
                          onChange={() => setSelectedCoas(prev => {
                            const next = new Set(prev);
                            next.has(coa.id) ? next.delete(coa.id) : next.add(coa.id);
                            return next;
                          })}
                          className="rounded border-neutral-300"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link to={`/coa/${coa.slug}`} className="font-semibold text-black hover:text-brand-700">{coa.slug.toUpperCase().slice(0, 16)}</Link>
                            <ResultBadge result={coa.overall_result} />
                          </div>
                          <p className="text-sm text-neutral-600 truncate">{coa.display_name || coa.sample_name}</p>
                          <p className="text-xs text-neutral-400">{formatDate(coa.issued_at)} · {coa.purity_percent ? `${coa.purity_percent}% purity` : ''}</p>
                        </div>
                        <Link to={`/coa/${coa.slug}`} className="btn-outline text-xs py-1.5 gap-1"><ExternalLink size={12} /> View</Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Samples Tab */}
            {tab === 'samples' && (
              <div className="card overflow-hidden">
                {filteredSamples.length === 0 ? (
                  <div className="p-12 text-center text-neutral-500">No samples yet</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead><tr className="coa-table-header"><th className="text-left px-5 py-3">Sample</th><th className="text-left px-5 py-3">Batch / Lot</th><th className="text-left px-5 py-3">Type</th><th className="text-left px-5 py-3">Status</th><th className="text-left px-5 py-3">Vials</th><th className="text-left px-5 py-3">COA</th></tr></thead>
                    <tbody>
                      {filteredSamples.map((s, i) => {
                        const coa = coas.find(c => c.sample_id === s.id);
                        const meta = s.metadata as { batch_number?: string; labeled_content?: string; tests_label?: string } | null;
                        return (
                          <tr key={s.id} className={i % 2 ? 'bg-neutral-50' : 'bg-white'}>
                            <td className="px-5 py-3">
                              <p className="font-medium">{s.display_name || s.sample_name}</p>
                              {meta?.labeled_content && <p className="text-xs text-neutral-500">{meta.labeled_content}{meta.tests_label ? ` · ${meta.tests_label}` : ''}</p>}
                            </td>
                            <td className="px-5 py-3 text-neutral-600">{meta?.batch_number || coa?.batch_number || '—'}</td>
                            <td className="px-5 py-3 capitalize">{s.sample_type}</td>
                            <td className="px-5 py-3"><span className="text-xs font-semibold uppercase">{SAMPLE_STATUS_LABELS[s.status]}</span></td>
                            <td className="px-5 py-3">{s.vial_count}</td>
                            <td className="px-5 py-3">{coa ? <Link to={`/coa/${coa.slug}`} className="text-brand-700 hover:underline">{coa.slug.slice(0, 12)}</Link> : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Orders Tab */}
            {tab === 'orders' && (
              <div className="space-y-3">
                {filteredOrders.length === 0 ? (
                  <div className="card p-12 text-center"><Link to="/order-new" className="btn-primary text-sm">New Order</Link></div>
                ) : filteredOrders.map(order => (
                  <div key={order.id} className="card p-5">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <p className="font-bold text-black">{order.order_number}</p>
                        <p className="text-xs text-neutral-500">{formatDateTime(order.created_at)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">{formatCurrency(order.total)}</p>
                        <span className="text-xs font-semibold uppercase text-brand-700">{ORDER_STATUS_LABELS[order.status]}</span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {['received', 'processing', 'analyzing', 'in_review', 'complete'].map((step, i) => {
                        const idx = ['received', 'processing', 'analyzing', 'in_review', 'complete'].indexOf(order.status);
                        return (
                          <div key={step} className={`h-1.5 flex-1 rounded-full ${i <= idx ? 'bg-brand-500' : 'bg-neutral-200'}`} />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Invoices Tab */}
            {tab === 'invoices' && (
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="coa-table-header"><th className="text-left px-5 py-3">Invoice</th><th className="text-left px-5 py-3">Date</th><th className="text-left px-5 py-3">Amount</th><th className="text-left px-5 py-3">Status</th><th className="text-left px-5 py-3"></th></tr></thead>
                  <tbody>
                    {filteredOrders.map((o, i) => (
                      <tr key={o.id} className={i % 2 ? 'bg-neutral-50' : 'bg-white'}>
                        <td className="px-5 py-3 font-medium">{o.order_number}</td>
                        <td className="px-5 py-3">{formatDate(o.created_at)}</td>
                        <td className="px-5 py-3 font-semibold">{formatCurrency(o.total)}</td>
                        <td className="px-5 py-3"><span className={o.status === 'complete' ? 'text-atlas-success font-bold' : 'text-amber-600 font-bold'}>{o.status === 'complete' ? 'Paid' : 'Pending'}</span></td>
                        <td className="px-5 py-3"><button className="text-xs text-brand-700 hover:underline">PDF</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {orders.length === 0 && <p className="p-12 text-center text-neutral-500">No invoices yet</p>}
              </div>
            )}

            {/* Payments Tab */}
            {tab === 'payments' && (
              <div className="card p-6">
                {orders.filter(o => o.status === 'complete').length === 0 ? (
                  <div className="text-center py-8">
                    <CreditCard size={32} className="mx-auto mb-3 text-neutral-300" />
                    <p className="font-medium">No payment records yet</p>
                    <p className="text-sm text-neutral-500 mt-1">Payments appear here after order completion.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {orders.filter(o => o.status === 'complete').map(o => (
                      <div key={o.id} className="flex justify-between py-3 border-b border-atlas-border last:border-0">
                        <div><p className="font-medium">{o.order_number}</p><p className="text-xs text-neutral-500">{formatDateTime(o.updated_at)}</p></div>
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
      </main>
    </div>
  );
}
