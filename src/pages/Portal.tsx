import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Truck, Copy, Check, X, Search, Download, FileText, ExternalLink,
  CheckCircle, XCircle, Clock, CreditCard, FlaskConical,
  Shield, Bell, Key, UserPlus, Lock, AlertTriangle, AlertCircle,
  ChevronDown, ChevronUp, Building2,
} from 'lucide-react';
import { coaClientStatus } from '../lib/statusVocabulary';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { COA, Order, OrderSample, PanelResult, TestPanel } from '../lib/types';
import {
  formatCurrency, formatDate, formatDateTime,
  ORDER_STATUS_LABELS, SAMPLE_STATUS_LABELS, PAYMENT_STATUS_LABELS,
  normalizePaymentStatus, orderIsPayable,
} from '../lib/utils';
import OrderStatusPipeline from '../components/order/OrderStatusPipeline';
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
import OrderShippingChecklist from '../components/order/OrderShippingChecklist';
import AtlasDigitalCoaCard from '../components/order/AtlasDigitalCoaCard';
import OrderNotesThread from '../components/order/OrderNotesThread';
import { assayResultsFromPanels, assayChipStatusesFromPanels, isHeavyMetalPanel, partitionCoaPanels, resolvePanelPass } from '../lib/coaDisplayPanels';
import { TestMode, wizardSampleFromOrderSample } from '../lib/orderCatalog';
import { trackingStageFromStatuses } from '../lib/orderProjection';
import { queueNotification } from '../lib/notifications';
import { hydrateCoaImages } from '../lib/coaImages';
import { hydrateMultiVialPanelResults } from '../lib/labCoaForm';
import { COA_LIST_COLUMNS } from '../lib/coaSelect';
import CoaReadyCelebration from '../components/coa/CoaReadyCelebration';
import BrandedCoaPurchaseModal from '../components/coa/BrandedCoaPurchaseModal';
import OrderBrandingEditor from '../components/portal/OrderBrandingEditor';
import { coaAllowsBrandedCopy } from '../lib/coaProfile';
import { fetchSeenCoaCelebrations, markCoaCelebrationSeen } from '../lib/orderMessages';

type PortalTab = 'home' | 'getting-started' | 'peptide-requests' | 'coas' | 'samples' | 'orders' | 'invoices' | 'payments' | 'account' | 'widget' | 'team';

function ResultBadge({ result }: { result: string }) {
  if (result === 'pass') return <span className="badge-pass"><CheckCircle size={10} /> Pass</span>;
  if (result === 'fail') return <span className="badge-fail"><XCircle size={10} /> Fail</span>;
  return <span className="badge-pending"><Clock size={10} /> Pending</span>;
}

function CoaPublicationBadge({ coa }: { coa: COA }) {
  const { label, tone } = coaClientStatus(coa);
  if (tone === 'published') {
    return <span className="badge-pass"><CheckCircle size={10} /> {label}</span>;
  }
  if (tone === 'ready') {
    return <span className="badge-pass"><CheckCircle size={10} /> {label}</span>;
  }
  if (tone === 'pending') {
    return <span className="badge-pending"><AlertCircle size={10} /> {label}</span>;
  }
  return <span className="badge-pending"><Lock size={10} /> {label}</span>;
}

function panelPassStatus(panel: PanelResult, opts?: { metal?: boolean }): {
  pass: boolean | null;
  label: string;
} {
  const resolved = resolvePanelPass(panel);
  if (resolved === null) return { pass: null, label: 'Pending' };
  const isNetContent = /net content|peptide content/i.test(panel.panel_name)
    && !/^blend content\b/i.test(panel.panel_name);
  if (isNetContent) return { pass: true, label: 'Reported Value' };
  if (opts?.metal) {
    return { pass: resolved, label: resolved ? 'Pass' : 'Fail' };
  }
  return { pass: resolved, label: resolved ? 'Pass' : 'Fail' };
}

function shortPanelLabel(name: string): string {
  const n = name.toLowerCase();
  const blendMatch = /^blend content\s*[—–-]\s*(.+)$/i.exec(name.trim());
  if (blendMatch) return blendMatch[1].trim() || 'Blend';
  if (n.includes('net purity') || (n.includes('purity') && n.includes('hplc'))) return 'Purity';
  if (n.includes('identification') || n.includes('identity')) return 'Identity';
  if (n === 'net content' || n.includes('total peptide') || (n.includes('net content') && !n.includes('blend'))) return 'Quantity';
  if (n.includes('peptide content') || n.includes('quantit')) return 'Quantity';
  if (n.includes('endotoxin')) return 'Endotoxins';
  if (n.includes('sterility')) return 'Sterility';
  if (n.includes('fentanyl')) return 'Fentanyl';
  if (n.includes('molecular weight') || n.includes('mass')) return 'MW';
  // Strip trailing method noise: "Foo (HPLC)" → "Foo"
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim() || name;
}

type CoaResultLine = {
  key: string;
  label: string;
  value: string;
  pass: boolean | null;
  pending?: boolean;
};

function sampleStillAnalyzing(sample: OrderSample, coa?: COA | null): boolean {
  if (sample.status === 'analyzing' || sample.status === 'in_review' || sample.status === 'received') {
    return true;
  }
  if (!coa) return false;
  if (coa.overall_result === 'pending') return true;
  const stage = coa.coa_workflow_stage;
  return stage === 'testing_in_progress' || stage === 'awaiting_info';
}

function panelResultFilled(panel: PanelResult): boolean {
  const result = (panel.result || '').trim();
  return !!result && !/^pending\b/i.test(result);
}

/** Whether filled COA panels already cover an ordered catalog test name. */
function panelsCoverOrderedTest(testName: string, panels: PanelResult[]): boolean {
  const filled = panels.filter(panelResultFilled);
  if (filled.length === 0) return false;
  const t = testName.toLowerCase();

  if (/heavy\s*metal/.test(t)) {
    return filled.some(p => isHeavyMetalPanel(p.panel_name));
  }
  if (/identity,\s*purity|purity\s*&\s*quantity|identity.*quantity/.test(t)) {
    const hasId = filled.some(p => /ident/i.test(p.panel_name));
    const hasPurity = filled.some(p => /purit/i.test(p.panel_name));
    const hasQty = filled.some(p => /content|quant/i.test(p.panel_name));
    return hasId && hasPurity && hasQty;
  }
  if (/^purity\b/.test(t) || t.includes('hplc')) {
    return filled.some(p => /purit/i.test(p.panel_name));
  }
  if (/sterility/.test(t)) return filled.some(p => /sterility/i.test(p.panel_name));
  if (/endotoxin/.test(t)) return filled.some(p => /endotoxin/i.test(p.panel_name));
  if (/fentanyl/.test(t)) return filled.some(p => /fentanyl/i.test(p.panel_name));
  if (/conformity/.test(t)) {
    // Conformity folds into content/purity lines on the COA.
    return filled.some(p => /content|purit|conformity/i.test(p.panel_name));
  }
  if (/molecular|weight|\bmw\b/.test(t)) {
    return filled.some(p => /molecular|weight/i.test(p.panel_name));
  }

  const short = shortPanelLabel(testName).toLowerCase();
  return filled.some(p => {
    const pl = shortPanelLabel(p.panel_name).toLowerCase();
    const pn = p.panel_name.toLowerCase();
    return pl === short || pn.includes(t) || t.includes(pl);
  });
}

function analysisResultLines(sample: OrderSample): CoaResultLine[] {
  const raw = sample.analysis_results;
  if (!Array.isArray(raw) || raw.length === 0) return [];

  const lines: CoaResultLine[] = [];
  for (const [i, entry] of raw.entries()) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    if (row.ordered === false) continue;
    const labelRaw = String(row.label || row.test || '').trim();
    if (!labelRaw) continue;
    const status = String(row.status || 'pending').toLowerCase();
    const valueRaw = row.value != null ? String(row.value).trim() : '';

    if (status === 'pass' || status === 'fail') {
      lines.push({
        key: `a-${i}`,
        label: shortPanelLabel(labelRaw),
        value: valueRaw || (status === 'pass' ? 'Pass' : 'Fail'),
        pass: status === 'pass',
      });
    } else {
      lines.push({
        key: `a-${i}`,
        label: shortPanelLabel(labelRaw),
        value: 'Pending',
        pass: null,
        pending: true,
      });
    }
  }
  return lines;
}

function coaResultLines(coa: COA, opts?: { inProgress?: boolean }): CoaResultLine[] {
  const inProgress = !!opts?.inProgress;
  const panels = Array.isArray(coa.panel_results) ? coa.panel_results : [];
  const { main, metals } = partitionCoaPanels(panels);
  const lines: CoaResultLine[] = [];

  for (const [i, panel] of main.entries()) {
    const filled = panelResultFilled(panel);
    if (inProgress && !filled) continue; // pending ordered tests added separately
    const status = panelPassStatus(panel);
    const pending = status.label === 'Pending';
    const value = filled
      ? `${panel.result}${panel.unit ? ` ${panel.unit}` : ''}`
      : pending
        ? 'Pending'
        : '—';
    lines.push({
      key: `m-${i}`,
      label: shortPanelLabel(panel.panel_name),
      value,
      pass: status.pass,
      pending: pending || undefined,
    });
  }
  for (const [i, panel] of metals.entries()) {
    const filled = panelResultFilled(panel);
    if (inProgress && !filled) continue;
    const status = panelPassStatus(panel, { metal: true });
    const pending = status.label === 'Pending';
    const value = filled
      ? `${panel.result}${panel.unit ? ` ${panel.unit}` : ''}`
      : pending
        ? 'Pending'
        : 'Not Detected';
    lines.push({
      key: `h-${i}`,
      label: shortPanelLabel(panel.panel_name),
      value,
      pass: status.pass,
      pending: pending || undefined,
    });
  }
  return lines;
}

function buildSampleResultLines(
  sample: OrderSample,
  coa: COA | undefined,
  catalogPanels: TestPanel[],
): CoaResultLine[] {
  const fromAnalysis = analysisResultLines(sample);
  if (fromAnalysis.length > 0) return fromAnalysis;

  const inProgress = sampleStillAnalyzing(sample, coa);
  const coaPanels = Array.isArray(coa?.panel_results) ? coa!.panel_results : [];
  const expected = portalTestsForSample(sample, catalogPanels);

  if (coa && !inProgress) {
    return coaResultLines(coa, { inProgress: false });
  }

  if (!coa) {
    // Finished samples without a certificate yet — don't invent a pending checklist.
    if (sample.status === 'complete') return [];
    return expected
      .filter(test => !/conformity/i.test(test))
      .map(test => ({
        key: `p-${test}`,
        label: shortPanelLabel(test),
        value: 'Pending',
        pass: null as boolean | null,
        pending: true,
      }));
  }

  const filledLines = coaResultLines(coa, { inProgress: true });
  const pendingLines: CoaResultLine[] = [];

  for (const test of expected) {
    if (/conformity/i.test(test)) continue;
    if (panelsCoverOrderedTest(test, coaPanels)) continue;
    const label = shortPanelLabel(test);
    if (filledLines.some(l => l.label.toLowerCase() === label.toLowerCase())) continue;
    if (pendingLines.some(l => l.label.toLowerCase() === label.toLowerCase())) continue;
    pendingLines.push({
      key: `p-${test}`,
      label,
      value: 'Pending',
      pass: null,
      pending: true,
    });
  }

  // Heavy metals: if any filled, also surface remaining empty metals as pending while analyzing.
  if (coaPanels.some(p => isHeavyMetalPanel(p.panel_name) && panelResultFilled(p))) {
    const { metals } = partitionCoaPanels(coaPanels);
    for (const [i, panel] of metals.entries()) {
      if (panelResultFilled(panel)) continue;
      const label = shortPanelLabel(panel.panel_name);
      if (filledLines.some(l => l.label.toLowerCase() === label.toLowerCase())) continue;
      if (pendingLines.some(l => l.label.toLowerCase() === label.toLowerCase())) continue;
      pendingLines.push({
        key: `hm-p-${i}`,
        label,
        value: 'Pending',
        pass: null,
        pending: true,
      });
    }
  }

  return [...filledLines, ...pendingLines];
}

function ResultLinesList({ lines, previewCount = 5 }: { lines: CoaResultLine[]; previewCount?: number }) {
  const [expanded, setExpanded] = useState(false);

  if (lines.length === 0) {
    return <span className="text-[11px] text-neutral-400">Results pending</span>;
  }

  const visible = expanded ? lines : lines.slice(0, previewCount);
  const hidden = Math.max(0, lines.length - previewCount);

  return (
    <div className="space-y-0.5 min-w-[10rem]">
      {visible.map(line => {
        const tone = line.pending
          ? 'text-neutral-400'
          : line.pass === true
            ? 'text-emerald-700'
            : line.pass === false
              ? 'text-red-600'
              : 'text-neutral-500';
        return (
          <div key={line.key} className={`flex items-start gap-1 text-[11px] leading-snug ${tone}`}>
            {line.pending ? (
              <Clock size={11} className="mt-0.5 flex-shrink-0 text-neutral-400" />
            ) : line.pass === true ? (
              <CheckCircle size={11} className="mt-0.5 flex-shrink-0" />
            ) : line.pass === false ? (
              <XCircle size={11} className="mt-0.5 flex-shrink-0" />
            ) : (
              <span className="w-[11px] flex-shrink-0" />
            )}
            <span className="min-w-0">
              <span className="font-medium">{line.label}:</span>{' '}
              <span className={line.pending ? 'italic' : 'tabular-nums'}>{line.value}</span>
            </span>
          </div>
        );
      })}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-brand-700 hover:underline"
        >
          {expanded ? 'Show less' : `Additional results (+${hidden})`}
        </button>
      )}
    </div>
  );
}

/** Compact Accumark-style result stack: small green/red lines in the Results column. */
function CoaTestResultsList({ coa, previewCount = 5 }: { coa: COA; previewCount?: number }) {
  const inProgress =
    coa.overall_result === 'pending'
    || coa.coa_workflow_stage === 'testing_in_progress'
    || coa.coa_workflow_stage === 'awaiting_info';
  const lines = inProgress
    ? (() => {
        const filled = coaResultLines(coa, { inProgress: true });
        const panels = Array.isArray(coa.panel_results) ? coa.panel_results : [];
        const pending = panels
          .filter(p => !panelResultFilled(p) && !isHeavyMetalPanel(p.panel_name))
          .map((p, i) => ({
            key: `coa-p-${i}`,
            label: shortPanelLabel(p.panel_name),
            value: 'Pending',
            pass: null as boolean | null,
            pending: true,
          }));
        // Dedupe pending labels already shown as filled
        const pendingUnique = pending.filter(
          p => !filled.some(f => f.label.toLowerCase() === p.label.toLowerCase()),
        );
        return [...filled, ...pendingUnique];
      })()
    : coaResultLines(coa, { inProgress: false });
  return <ResultLinesList lines={lines} previewCount={previewCount} />;
}

function SampleTestResultsList({
  sample,
  coa,
  panels,
  previewCount = 5,
}: {
  sample: OrderSample;
  coa?: COA;
  panels: TestPanel[];
  previewCount?: number;
}) {
  const lines = buildSampleResultLines(sample, coa, panels);
  return <ResultLinesList lines={lines} previewCount={previewCount} />;
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
  const { user, profile, refreshProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
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
  const [celebrationCoa, setCelebrationCoa] = useState<COA | null>(null);
  const [brandCoa, setBrandCoa] = useState<COA | null>(null);

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
      ]).then(async ([coasRes, ordersRes, samplesRes, panelsRes]) => {
        const nextCoas = coasRes.data
          ? (coasRes.data as unknown as COA[]).map(hydrateCoaImages)
          : [];
        if (coasRes.data) setCoas(nextCoas);
        if (ordersRes.data) setOrders(ordersRes.data);
        if (samplesRes.data) setSamples(samplesRes.data);
        if (panelsRes.data) setPanels(panelsRes.data);
        try {
          const seen = await fetchSeenCoaCelebrations(user!.id);
          const ready = nextCoas.find(
            coa =>
              coa.is_public &&
              (coa.coa_workflow_stage === 'published' || !!coa.published_at) &&
              !seen.has(coa.id),
          );
          if (ready) {
            // Mark before opening so realtime refreshes cannot reopen the same celebration.
            await markCoaCelebrationSeen(user!.id, ready.id);
            setCelebrationCoa(current => current ?? ready);
          }
        } catch (celebrationError) {
          // The portal remains fully usable before this optional migration is applied.
          console.warn('COA celebration check unavailable:', celebrationError);
        }
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
    if (orders.length === 0) return;
    const label = params.get('label');
    const orderParam = params.get('order');
    const match = orderParam
      ? orders.find(o => o.id === orderParam || o.order_number === orderParam)
      : label
        ? orders.find(o => o.shipping_label_id === label)
        : undefined;
    if (!match) return;
    setExpandedOrders(prev => new Set(prev).add(match.id));
    if (params.get('tab') === 'orders' || location.pathname.includes('/orders')) {
      const t = window.setTimeout(() => {
        document.getElementById(`portal-order-${match.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
      return () => window.clearTimeout(t);
    }
  }, [orders, params, location.pathname]);

  if (!user) return <Navigate to="/auth" replace />;

  /** Jump from Samples → Orders with that order expanded. */
  function openOrder(order: Order) {
    setSearch('');
    setStatusFilter('all');
    setSampleProduct('all');
    setCoaPeptide('all');
    setExpandedOrders(prev => new Set(prev).add(order.id));
    setParams({ tab: 'orders', order: order.order_number }, { replace: true });
  }

  /** Open this sample's COA in the portal overlay (or sample COA page if not issued yet). */
  function openSampleCoa(sample: OrderSample, coa: COA | undefined) {
    if (coa) {
      setCelebrationCoa(coa);
      return;
    }
    navigate(`/sample/${sample.id}/coa`);
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
    if (key === 'orderUpdates') {
      void supabase.from('user_profiles').update({ notify_email: next.orderUpdates }).eq('id', user.id);
    }
    if (next[key]) {
      const labels: Record<keyof NotificationPrefs, string> = {
        orderUpdates: 'Order Updates',
        coaReady: 'COA Ready',
        paymentReceipts: 'Payment Receipts',
        promotions: 'Promotions',
      };
      void queueNotification({
        userId: user.id,
        type: key === 'coaReady' ? 'coa_ready' : key === 'paymentReceipts' ? 'payment_receipt' : key === 'promotions' ? 'promotion' : 'order_update',
        subject: `${labels[key]} enabled`,
        body: `You will receive notifications for: ${labels[key]}.`,
      });
    }
  }

  async function toggleSmsNotify() {
    if (!user) return;
    const next = !(profile?.notify_sms);
    const { error } = await supabase.from('user_profiles').update({ notify_sms: next }).eq('id', user.id);
    if (error) {
      setPromoMsg(`Could not update SMS preference: ${error.message}`);
      return;
    }
    await refreshProfile();
    setPromoMsg(next
      ? 'SMS updates enabled (requires a phone number on your account).'
      : 'SMS updates disabled.');
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
      s.sample_name, s.display_name, s.accession_number, coa?.slug, coa?.accession_number, order?.order_number,
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
      {celebrationCoa && (
        <CoaReadyCelebration
          coa={celebrationCoa}
          sample={samples.find(sample => sample.id === celebrationCoa.sample_id)}
          onClose={() => setCelebrationCoa(null)}
        />
      )}
      {brandCoa && user && (
        <BrandedCoaPurchaseModal
          open
          coa={brandCoa}
          userId={user.id}
          prepaidBalance={profile?.prepaid_balance ?? 0}
          onClose={() => setBrandCoa(null)}
          onPurchased={(slug) => {
            setBrandCoa(null);
            void refreshProfile();
            navigate(`/coa/${slug}`);
          }}
        />
      )}
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
                  tab === 'samples' ? 'Search by product, LIMS ID, lot, order…' :
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
              <PortalHome
                orders={orders}
                samples={samples}
                coas={coas}
                coaCount={coas.length}
                loading={loading}
              />
            )}

            {tab === 'getting-started' && <GettingStarted />}

            {tab === 'peptide-requests' && <PeptideRequests />}
            {/* COAs Tab */}
            {tab === 'coas' && (
              <div className="space-y-4">
                <div>
                  <h1 className="portal-page-title">Your COAs</h1>
                  <p className="portal-page-subtitle">
                    Certificates of analysis from your Atlas Analytics testing. Green = pass, red = fail.
                  </p>
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
                      <table className="portal-data-table w-full text-sm">
                        <thead>
                          <tr className="coa-table-header">
                            <th className="text-left px-4 py-2.5">Name</th>
                            <th className="text-left px-4 py-2.5">Results</th>
                            <th className="text-left px-4 py-2.5">Lot</th>
                            <th className="text-left px-4 py-2.5">Date</th>
                            <th className="px-4 py-2.5"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-atlas-border">
                          {filteredCoas.map(coa => {
                            const order = orders.find(o => o.id === coa.order_id);
                            return (
                              <tr key={coa.id} className="bg-white hover:bg-neutral-50/80 align-top">
                                <td className="px-4 py-3 min-w-[10rem]">
                                  <p className="font-semibold text-black text-sm leading-snug">
                                    {coa.display_name || coa.sample_name}
                                  </p>
                                  {coa.company_name ? (
                                    <p className="text-[11px] text-neutral-500 mt-0.5 truncate">
                                      {coa.company_name}
                                    </p>
                                  ) : null}
                                  <p className="text-[11px] text-neutral-500 mt-0.5 font-mono">
                                    {coa.accession_number || coa.slug.slice(0, 14)}
                                    {order?.order_number ? ` · ${order.order_number}` : ''}
                                  </p>
                                  <div className="mt-1.5 flex flex-wrap gap-1">
                                    <ResultBadge result={coa.overall_result} />
                                    <CoaPublicationBadge coa={coa} />
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <CoaTestResultsList coa={coa} />
                                </td>
                                <td className="px-4 py-3 text-xs text-neutral-600 whitespace-nowrap">
                                  {coa.batch_number || '—'}
                                </td>
                                <td className="px-4 py-3 text-xs text-neutral-600 whitespace-nowrap">
                                  {formatDate(coa.issued_at)}
                                </td>
                                <td className="px-4 py-3 text-right whitespace-nowrap">
                                  <div className="inline-flex flex-col items-end gap-1">
                                    <Link
                                      to={`/coa/${coa.slug}`}
                                      className="btn-outline text-[11px] py-1 px-2 gap-1 inline-flex"
                                    >
                                      <ExternalLink size={11} /> Open
                                    </Link>
                                    {coaAllowsBrandedCopy(coa) && (
                                      <button
                                        type="button"
                                        onClick={() => setBrandCoa(coa)}
                                        className="btn-ghost text-[11px] py-1 px-2 gap-1 inline-flex text-brand-700"
                                      >
                                        <Building2 size={11} /> Additional COA $50
                                      </button>
                                    )}
                                  </div>
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

            {/* Samples Tab */}
            {tab === 'samples' && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-black">Your Samples</h2>
                  <p className="text-sm text-neutral-500 mt-1">
                    Track every sample submitted to Atlas Analytics. Completed results show in green and red; tests still in progress show as Pending.
                  </p>
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
                            <th className="text-left px-4 py-2.5">Order / LIMS ID</th>
                            <th className="text-left px-4 py-2.5">Name</th>
                            <th className="text-left px-4 py-2.5">Results</th>
                            <th className="text-left px-4 py-2.5">Lot</th>
                            <th className="text-left px-4 py-2.5">Date</th>
                            <th className="px-4 py-2.5"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-atlas-border">
                          {filteredSamples.map(s => {
                            const coa = matchCoaForSample(s, coas);
                            const order = orders.find(o => o.id === s.order_id);
                            const meta = s.metadata as { batch_number?: string; labeled_content?: string; tests_label?: string } | null;
                            const lot = meta?.batch_number || coa?.batch_number || '—';
                            const sampleCode = (
                              s.accession_number?.trim()
                              || coa?.accession_number?.trim()
                              || coa?.slug?.trim()
                              || ''
                            );
                            return (
                              <tr key={s.id} className="bg-white hover:bg-neutral-50/80 transition-colors align-top">
                                <td className="px-4 py-3">
                                  {order ? (
                                    <button
                                      type="button"
                                      onClick={() => openOrder(order)}
                                      className="font-mono text-xs font-semibold text-brand-700 hover:underline"
                                      title="Open this order"
                                    >
                                      {order.order_number}
                                    </button>
                                  ) : <span className="text-neutral-400">—</span>}
                                  {sampleCode ? (
                                    <button
                                      type="button"
                                      onClick={() => openSampleCoa(s, coa)}
                                      className="block mt-1 font-mono text-[11px] text-neutral-500 hover:text-brand-700 hover:underline"
                                      title={coa ? 'Open COA for this sample' : 'Open sample COA'}
                                    >
                                      {sampleCode}
                                    </button>
                                  ) : null}
                                </td>
                                <td className="px-4 py-3 min-w-[9rem]">
                                  <p className="font-semibold text-black text-sm leading-snug">{s.display_name || s.sample_name}</p>
                                  {meta?.labeled_content && (
                                    <p className="text-[11px] text-neutral-500 mt-0.5">
                                      {meta.labeled_content}{meta.tests_label ? ` · ${meta.tests_label}` : ''}
                                    </p>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  <SampleTestResultsList sample={s} coa={coa} panels={panels} />
                                </td>
                                <td className="px-4 py-3 text-xs text-neutral-600 whitespace-nowrap">{lot}</td>
                                <td className="px-4 py-3 text-xs text-neutral-600 whitespace-nowrap">{formatDate(s.created_at)}</td>
                                <td className="px-4 py-3 text-right whitespace-nowrap">
                                  {coa ? (
                                    <button
                                      type="button"
                                      onClick={() => openSampleCoa(s, coa)}
                                      className="btn-outline text-[11px] py-1 px-2 gap-1 inline-flex"
                                    >
                                      <ExternalLink size={11} /> COA
                                    </button>
                                  ) : s.status === 'complete' ? (
                                    <Link to={`/sample/${s.id}/coa`} className="btn-outline text-[11px] py-1 px-2 gap-1 inline-flex">
                                      <ExternalLink size={11} /> COA
                                    </Link>
                                  ) : s.status === 'received' ? (
                                    <span className="text-[11px] text-neutral-400">Awaiting testing</span>
                                  ) : (
                                    <Link to={`/sample/${s.id}/coa`} className="btn-outline text-[11px] py-1 px-2 gap-1 inline-flex whitespace-nowrap border-amber-300 text-amber-700 hover:bg-amber-50">
                                      <Clock size={11} /> Partial
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
                  <div key={order.id} id={`portal-order-${order.id}`} className="card overflow-hidden">
                    <button
                      onClick={() => setExpandedOrders(prev => {
                        const next = new Set(prev);
                        if (next.has(order.id)) next.delete(order.id);
                        else next.add(order.id);
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
                          {(order.estimated_ready_at || order.due_at) && order.status !== 'complete' && order.status !== 'cancelled' && (
                            <p className="mt-1 text-[11px] text-neutral-500">
                              Est. ready {formatDate(order.estimated_ready_at || order.due_at || '')}
                            </p>
                          )}
                        </div>
                      </div>
                      <OrderStatusPipeline status={order.status} size="compact" />
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
                          <div className="p-5 bg-neutral-50">
                            <OrderShippingChecklist
                              orderNumber={order.order_number}
                              shippingPreboarded={order.shipping_preboarded ?? profile?.shipping_preboarded}
                              shippingLabelId={order.shipping_label_id}
                              compact
                            />
                          </div>
                        )}
                        {!!order.shipping_label_id && order.status !== 'awaiting_sample' && (
                          <div className="px-5 py-3 text-xs text-neutral-600 bg-neutral-50">
                            Prepaid label on file: <span className="font-mono font-semibold">{order.shipping_label_id}</span>
                          </div>
                        )}
                        {(order.estimated_ready_at || order.due_at) && (
                          <div className="px-5 py-3 flex items-center justify-between gap-3 bg-brand-50/50 text-sm">
                            <span className="text-neutral-600">Estimated ready date</span>
                            <span className="font-semibold text-brand-900">
                              {formatDate(order.estimated_ready_at || order.due_at || '')}
                            </span>
                          </div>
                        )}
                        <OrderBrandingEditor
                          userId={user!.id}
                          order={order}
                          samples={orderSamples}
                          coas={coas}
                          onSaved={({ order: nextOrder, samples: nextSamples }) => {
                            setOrders(prev => prev.map(o => (o.id === nextOrder.id ? nextOrder : o)));
                            if (nextSamples.length > 0) {
                              setSamples(prev => prev.map(s => {
                                const hit = nextSamples.find(u => u.id === s.id);
                                return hit || s;
                              }));
                            }
                          }}
                        />
                        {order.payment_method === 'crypto' && orderIsPayable(order.payment_status) && (
                          <p className="px-5 py-3 text-xs text-neutral-600 bg-amber-50 border-b border-amber-100">
                            Paid via cryptocurrency · transaction confirmed at checkout
                          </p>
                        )}
                        {orderSamples.length === 0 ? (
                          <p className="px-5 py-4 text-sm text-neutral-500">No samples recorded for this order.</p>
                        ) : orderSamples.map(s => {
                          const coa = matchCoaForSample(s, coas);
                          const meta = s.metadata as {
                            tests_label?: string;
                            batch_number?: string;
                            test_mode?: TestMode;
                            labeled_content?: string;
                            label_claim_unit?: string;
                            include_fentanyl?: boolean;
                            conformity_extra?: number;
                            primary_test_id?: string;
                            sample_matrix?: string;
                            category?: string;
                          } | null;
                          const tests = portalTestsForSample(s, panels);
                          const trackerSample = wizardSampleFromOrderSample(s, {
                            batch_number:
                              (coa?.batch_number || '').trim()
                              || (typeof meta?.batch_number === 'string' ? meta.batch_number.trim() : '')
                              || undefined,
                          });
                          const trackStage = trackingStageFromStatuses({
                            orderStatus: order.status,
                            sampleStatus: s.status,
                            hasIssuedCoa: !!coa,
                          });
                          return (
                            <div key={s.id} className="px-5 py-4 flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-semibold text-black">{s.display_name || s.sample_name}</p>
                                  <span className="text-xs text-neutral-400 capitalize">
                                    {meta?.sample_matrix || meta?.category || s.sample_type}
                                  </span>
                                  {coa ? <ResultBadge result={coa.overall_result} /> : <span className="badge-pending"><Clock size={10} /> {SAMPLE_STATUS_LABELS[s.status]}</span>}
                                </div>
                                {(() => {
                                  const brands = [
                                    order.company_name,
                                    ...((s.metadata as { brand_names?: string[] } | null)?.brand_names || []),
                                  ].filter((n, i, arr) => !!n && arr.findIndex(x => x?.toLowerCase() === n.toLowerCase()) === i);
                                  if (brands.length === 0) return null;
                                  return (
                                    <p className="text-xs text-neutral-500 mt-1">
                                      COA brand{brands.length === 1 ? '' : 's'}: {brands.join(' · ')}
                                    </p>
                                  );
                                })()}
                                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mt-2 mb-1">
                                  Tests Ordered{meta?.tests_label ? ` · ${meta.tests_label}` : ''}
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {tests.map(t => (
                                    <span key={t} className="inline-block text-xs bg-neutral-100 text-neutral-700 rounded px-2 py-0.5">{t}</span>
                                  ))}
                                </div>
                                <div className="mt-4 max-w-[280px]">
                                  <AtlasDigitalCoaCard
                                    samples={[trackerSample]}
                                    companyName={order.company_name || profile?.company_name || ''}
                                    stage="tracking"
                                    trackingStage={trackStage}
                                    accession={s.accession_number || null}
                                    readinessPercent={100}
                                    overallResult={
                                      coa?.overall_result === 'pass' || coa?.overall_result === 'fail'
                                        ? coa.overall_result
                                        : undefined
                                    }
                                    assayResults={
                                      coa
                                        ? assayResultsFromPanels(
                                          hydrateMultiVialPanelResults(
                                            coa.panel_results,
                                            coa.result_summary as Record<string, unknown> | null,
                                          ),
                                          {
                                            quantityUnit: meta?.label_claim_unit || 'mg',
                                          },
                                        )
                                        : null
                                    }
                                    assayStatuses={
                                      coa
                                        ? assayChipStatusesFromPanels(
                                          hydrateMultiVialPanelResults(
                                            coa.panel_results,
                                            coa.result_summary as Record<string, unknown> | null,
                                          ),
                                        )
                                        : null
                                    }
                                  />
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
                        <div className="border-t border-atlas-border bg-neutral-50 p-4 sm:p-5">
                          <OrderNotesThread orderId={order.id} compact />
                        </div>
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
                    <label className="flex items-center justify-between py-2 cursor-pointer border-t border-atlas-border pt-3">
                      <div>
                        <p className="text-sm font-medium">SMS stage updates</p>
                        <p className="text-xs text-neutral-500">
                          Text alerts at receiving, testing, review, and COA ready
                          {profile?.phone ? '' : ' · add a phone number in account settings first'}
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={!!profile?.notify_sms}
                        onChange={() => void toggleSmsNotify()}
                        disabled={!profile?.phone?.trim()}
                        className="w-4 h-4 accent-brand-500"
                      />
                    </label>
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
