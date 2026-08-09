import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  FlaskConical, Plus, Trash2, CheckCircle, AlertCircle, ClipboardList,
  RefreshCw, ArrowLeft,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { COA, Company, LabPriority, Order, OrderSample, SampleStatus, UserProfile } from '../lib/types';
import { computeCoaContentHash } from '../lib/coaVerify';
import { notifyCoaReady, notifyOrderUpdate, notifyOrderEtaUpdated } from '../lib/notifications';
import { clientSubmittedLabel, matrixTypeFromSampleMetadata, parseSampleMetadata } from '../lib/coaPanels';
import { fetchUserCompanies } from '../lib/coaProfile';
import {
  EMPTY_LAB_RESULTS, LabCoaResults, VIAL_SIZE_OPTIONS, VialSizeOption,
  HEAVY_METAL_NAMES, buildLabResultsFromSample, buildLabResultsFromCoa, labResultsToPanelResults,
  parsePurityPercent, parseMolecularWeight, lookupCas, casForSampleName, looksLikeCasNumber, resolveCasNumber,
  ENDOTOXIN_SPEC_EU_ML, ENDOTOXIN_PASS_RESULT, STERILITY_METHOD_LABELS,
  defaultCultureProjectedCompletion,
  HEAVY_METAL_PASS_RESULT, heavyMetalsPassDefaults, heavyMetalsEmptyDefaults, computeLabAssayAverages,
  assayPassSelectValue, assayPassFromSelect, blendConformityVialRows, isBlendTotalConformityRow,
  MAX_PURITY_PERCENT, PURITY_INPUT_HINT, sanitizePurityInput, purityExceedsMax,
  ASSAY_METHOD_LABELS, AssayMethod,
} from '../lib/labCoaForm';
import { COA_WORKFLOW_LABELS, canPrepareCoa, coaWorkflowStage, buildWorkflowStagePatch, CoaWorkflowStage } from '../lib/coaWorkflow';
import {
  appendCoaUpdateLog,
  carryForwardUpdateLog,
  formatPostIssueUpdateNote,
  summarizeCoaContentChanges,
} from '../lib/coaUpdateLog';
import CoaWorkflowBoard from '../components/lab/CoaWorkflowBoard';
import CompanyFilterSearch from '../components/lab/CompanyFilterSearch';
import TestingQueuePanel from '../components/lab/TestingQueuePanel';
import ChemistOrderBriefDrawer from '../components/lab/ChemistOrderBriefDrawer';
import QueueFilters, { QueueFilterValues } from '../components/lab/QueueFilters';
import ClaimVsResultStrip from '../components/lab/ClaimVsResultStrip';
import { buildQueueItems, filterQueueItems, getTestAssignments, normalizeLabPriority } from '../lib/labQueue';
import { sampleIntakeAt, sampleReceivedBy, setSampleStatus } from '../lib/services/orderWorkflow';
import { allocateUniqueSampleCode, isValidSampleCode } from '../lib/sampleCode';
import { formatDate } from '../lib/utils';
import ReceivingDesk from '../components/lab/ReceivingDesk';
import MyBenchPanel from '../components/lab/MyBenchPanel';
import StaffHeader from '../components/layout/StaffHeader';
import LogoDropzone from '../components/account/LogoDropzone';
import ChromatogramDataDropzone from '../components/lab/ChromatogramDataDropzone';
import {
  chromatogramDataFromParsed,
  type ParsedChromatogram,
} from '../lib/chromatogramParse';
import {
  hydrateCoaImages,
  isMissingCoaImageColumnError,
  payloadWithoutImageColumns,
  prepareVialImage,
  resolveImageAsDataUrl,
} from '../lib/coaImages';
import CoaPdfPrepModal from '../components/lab/CoaPdfPrepModal';
import { COA_LIST_COLUMNS } from '../lib/coaSelect';
import { useAuth } from '../context/AuthContext';
import AtlasDigitalCoaCard, { type DigitalCoaAssayResults } from '../components/order/AtlasDigitalCoaCard';
import InteractiveChromatogram from '../components/coa/InteractiveChromatogram';
import OrderActionChecklist from '../components/order/OrderActionChecklist';
import OrderNotesThread from '../components/order/OrderNotesThread';
import OrderEtaEditor from '../components/order/OrderEtaEditor';
import { fetchOrderActionItems, openActionCount } from '../lib/orderActions';
import { LABEL_CLAIM_UNITS, SAMPLE_MATRICES, wizardSampleFromOrderSample, type WizardSample } from '../lib/orderCatalog';
import { assayResultsFromPanels, assayChipStatusesFromPanels } from '../lib/coaDisplayPanels';
import { parseOrderNotes } from '../lib/orderMeta';
const MAX_COA_IMAGE_BYTES = 1024 * 1024;

type Message = { type: 'success' | 'error'; text: string; slug?: string } | null;
type LabTab = 'bench' | 'receive' | 'queue' | 'issue' | 'workflow';

const LAB_TABS: LabTab[] = ['bench', 'receive', 'queue', 'issue', 'workflow'];
const LAB_TAB_LABELS: Record<LabTab, string> = {
  bench: 'My Bench',
  receive: 'Receive',
  queue: 'Testing Queue',
  issue: 'Issue COA',
  workflow: 'COA Workflow',
};

function parseLabTab(value: string | null): LabTab | null {
  return LAB_TABS.includes(value as LabTab) ? (value as LabTab) : null;
}

const BLANK = {
  clientId: '', sampleId: '', orderId: '',
  sampleName: '', displayName: '', companyName: '',
  batchNumber: '', casNumber: '', vialSize: '3ml' as VialSizeOption,
  overallResult: 'pending' as COA['overall_result'],
  accessionNumber: '',
  receivedBy: '',
  receivedDate: '',
  matrixType: '',
  labeledContent: '',
  labelClaimUnit: 'mg',
};

function localDateInputValue(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isoToLocalDateInput(iso: string | null | undefined): string {
  if (!iso) return localDateInputValue();
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return localDateInputValue();
  return localDateInputValue(d);
}

/** Store noon local so the calendar day stays stable across timezones. */
function localDateInputToIso(dateInput: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((dateInput || '').trim());
  if (!match) return new Date().toISOString();
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}


const QUEUE_FILTERS_BLANK: QueueFilterValues = {
  company: '', priority: 'all', assignment: 'all', search: '',
};

export default function Lab() {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [params, setParams] = useSearchParams();
  const tab = parseLabTab(params.get('tab')) ?? 'bench';
  const returnTab = parseLabTab(params.get('from')) ?? 'queue';

  function setTab(next: LabTab, opts?: { from?: LabTab; replace?: boolean }) {
    setParams(prev => {
      const nextParams = new URLSearchParams(prev);
      nextParams.set('tab', next);
      if (opts?.from) nextParams.set('from', opts.from);
      else if (next !== 'issue') nextParams.delete('from');
      return nextParams;
    }, { replace: opts?.replace ?? false });
  }

  const [clients, setClients] = useState<UserProfile[]>([]);
  const [allProfiles, setAllProfiles] = useState<UserProfile[]>([]);
  const [chemists, setChemists] = useState<UserProfile[]>([]);
  const [samples, setSamples] = useState<OrderSample[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [coas, setCoas] = useState<COA[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [etaSavingOrderId, setEtaSavingOrderId] = useState<string | null>(null);
  const [briefOrderId, setBriefOrderId] = useState<string | null>(null);
  const [msg, setMsg] = useState<Message>(null);
  const [queueView, setQueueView] = useState<'pending' | 'all'>('pending');
  const [queueFilters, setQueueFilters] = useState<QueueFilterValues>({ ...QUEUE_FILTERS_BLANK });

  const [movingCoaId, setMovingCoaId] = useState<string | null>(null);
  const [workflowCompanyFilter, setWorkflowCompanyFilter] = useState('');
  const [form, setForm] = useState({ ...BLANK });
  const [editingCoaId, setEditingCoaId] = useState<string | null>(null);
  const [labResults, setLabResults] = useState<LabCoaResults>({ ...EMPTY_LAB_RESULTS });
  const [vialImage, setVialImage] = useState('');
  const [chromatographImage, setChromatographImage] = useState('');
  const [chromatogramParsed, setChromatogramParsed] = useState<ParsedChromatogram | null>(null);
  const [clientCompanies, setClientCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [preferredBrandName, setPreferredBrandName] = useState('');
  const [applyHeaderLogo, setApplyHeaderLogo] = useState(true);
  const [applyWatermark, setApplyWatermark] = useState(true);
  const [casSuggestions, setCasSuggestions] = useState<{ name: string; cas: string }[]>([]);
  const [showCasSuggestions, setShowCasSuggestions] = useState(false);
  const [prepCoa, setPrepCoa] = useState<COA | null>(null);
  const [intakeSampleLive, setIntakeSampleLive] = useState<OrderSample | null>(null);
  const [issueOpenActions, setIssueOpenActions] = useState(0);

  const selectedCompany = clientCompanies.find(c => c.id === selectedCompanyId) ?? null;
  const onIssueOpenActionsChange = useCallback((count: number) => {
    setIssueOpenActions(count);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!form.clientId) {
      setClientCompanies([]);
      setSelectedCompanyId('');
      return;
    }
    fetchUserCompanies(form.clientId)
      .then(list => {
        if (cancelled) return;
        setClientCompanies(list);
        const want = (preferredBrandName || form.companyName || '').trim().toLowerCase();
        const named = want
          ? list.find(c => c.name.trim().toLowerCase() === want)
            ?? list.find(c => {
              const n = c.name.trim().toLowerCase();
              return n.includes(want) || want.includes(n);
            })
          : undefined;
        const pick = named ?? list.find(c => c.is_default) ?? list[0];
        setSelectedCompanyId(pick?.id ?? '');
        if (pick?.name) {
          setForm(prev => ({
            ...prev,
            companyName: named ? pick.name : (prev.companyName || pick.name),
          }));
        }
        setApplyHeaderLogo(!!pick?.logo);
        setApplyWatermark(!!pick?.chromatograph_background);
      })
      .catch((err) => {
        console.error('Failed to load client COA profiles', err);
        if (!cancelled) {
          setClientCompanies([]);
          setSelectedCompanyId('');
        }
      });
    return () => { cancelled = true; };
  }, [form.clientId, preferredBrandName]);

  // When opening Issue COA blank, default received-by to the chemist and date to today.
  useEffect(() => {
    if (tab !== 'issue') return;
    setForm(prev => {
      const chemistName = (profile?.full_name || '').trim();
      const next = { ...prev };
      let changed = false;
      if (!next.receivedBy.trim() && chemistName) {
        next.receivedBy = chemistName;
        changed = true;
      }
      if (!next.receivedDate.trim()) {
        next.receivedDate = localDateInputValue();
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [tab, profile?.full_name]);

  async function loadAll() {
    setLoading(true);
    const [p, s, o, c] = await Promise.all([
      supabase.from('user_profiles').select('*'),
      supabase.from('order_samples').select('*').order('created_at', { ascending: false }),
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('coas').select(COA_LIST_COLUMNS).order('issued_at', { ascending: false }),
    ]);
    if (p.data) {
      setAllProfiles(p.data);
      setClients(p.data.filter(u => (u.role ?? 'client') === 'client'));
      setChemists(p.data.filter(u => u.role === 'chemist' || u.role === 'admin'));
    }
    if (s.data) setSamples(s.data);
    if (o.data) setOrders(o.data);
    if (c.data) setCoas((c.data as COA[]).map(hydrateCoaImages));
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadIntakeSample() {
      if (!form.sampleId) {
        setIntakeSampleLive(null);
        return;
      }
      const fromQueue = samples.find(s => s.id === form.sampleId) || null;
      if (fromQueue) setIntakeSampleLive(fromQueue);
      const fresh = await supabase
        .from('order_samples')
        .select('id, metadata, received_at, status, created_at, accession_number')
        .eq('id', form.sampleId)
        .maybeSingle();
      let row = fresh.data as OrderSample | null;
      if (fresh.error && /received_at/i.test(fresh.error.message || '')) {
        const retry = await supabase
          .from('order_samples')
          .select('id, metadata, status, created_at, accession_number')
          .eq('id', form.sampleId)
          .maybeSingle();
        row = retry.data as OrderSample | null;
      }
      if (!cancelled && row) {
        setIntakeSampleLive({ ...(fromQueue || ({} as OrderSample)), ...row });
      }
    }
    void loadIntakeSample();
    return () => { cancelled = true; };
  }, [form.sampleId, samples]);


  useEffect(() => {
    const channel = supabase
      .channel('lab-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_samples' }, () => { loadAll(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => { loadAll(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coas' }, () => { loadAll(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const normalizedOrders = useMemo(
    () => orders.map(o => ({ ...o, lab_priority: normalizeLabPriority(o.lab_priority) })),
    [orders],
  );

  // Single source of truth for "awaiting COA" — used for the queue tab badge,
  // the Awaiting work button, the Issue COA sidebar, and the Workflow lane.
  const pendingQueueItems = useMemo(
    () => buildQueueItems(samples, normalizedOrders, coas, true),
    [samples, normalizedOrders, coas],
  );
  const pendingQueueCount = pendingQueueItems.length;
  const pendingSamples = useMemo(() => pendingQueueItems.map(i => i.sample), [pendingQueueItems]);

  const workflowActiveCount = useMemo(
    () => coas.filter(c => coaWorkflowStage(c) !== 'published').length,
    [coas],
  );

  const workflowCompanyOptions = useMemo(() => {
    const names = new Set<string>();
    for (const coa of coas) {
      const name = coa.company_name?.trim();
      if (name) names.add(name);
    }
    for (const item of pendingQueueItems) {
      const name = item.order.company_name?.trim();
      if (name) names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [coas, pendingQueueItems]);

  const filteredWorkflowCoas = useMemo(() => {
    const q = workflowCompanyFilter.trim().toLowerCase();
    if (!q) return coas;
    return coas.filter(c => (c.company_name ?? '').toLowerCase().includes(q));
  }, [coas, workflowCompanyFilter]);

  const filteredPendingQueueItems = useMemo(() => {
    const q = workflowCompanyFilter.trim().toLowerCase();
    if (!q) return pendingQueueItems;
    return pendingQueueItems.filter(item => (item.order.company_name ?? '').toLowerCase().includes(q));
  }, [pendingQueueItems, workflowCompanyFilter]);

  const queueItems = useMemo(
    () => (queueView === 'pending' ? pendingQueueItems : buildQueueItems(samples, normalizedOrders, coas, false)),
    [samples, normalizedOrders, coas, queueView, pendingQueueItems],
  );

  const queueCompanyOptions = useMemo(() => {
    const names = new Set<string>();
    for (const order of orders) {
      const name = order.company_name?.trim();
      if (name) names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [orders]);

  const filteredQueueItems = useMemo(
    () => filterQueueItems(queueItems, {
      priority: queueFilters.priority,
      company: queueFilters.company,
      assignedTo: queueFilters.assignment === 'all' ? 'all' : queueFilters.assignment === 'mine' ? (user?.id ?? 'unassigned') : 'unassigned',
      search: queueFilters.search,
    }),
    [queueItems, queueFilters, user?.id],
  );

  const chemistOptions = useMemo(
    () => chemists.map(c => ({ id: c.id, name: c.full_name || clientSubmittedLabel(c, c.company_name) })),
    [chemists],
  );

  const reviewerOptions = useMemo(
    () => allProfiles
      .filter(u => u.role === 'chemist' || u.role === 'admin' || u.role === 'reviewer')
      .map(u => ({
        id: u.id,
        name: u.full_name || clientSubmittedLabel(u, u.company_name),
        role: u.role === 'admin' ? 'lab director' : u.role || undefined,
      })),
    [allProfiles],
  );

  function clientLabel(id: string) {
    const c = clients.find(x => x.id === id);
    if (!c) return id.slice(0, 8);
    return clientSubmittedLabel(c, c.company_name);
  }

  function clientOptionLabel(c: UserProfile) {
    return clientSubmittedLabel(c, c.company_name);
  }

  function prefillFromSample(s: OrderSample) {
    const meta = parseSampleMetadata(s.metadata);
    const client = clients.find(c => c.id === s.user_id);
    const order = orders.find(o => o.id === s.order_id);
    const cas = casForSampleName(s.sample_name)
      || (looksLikeCasNumber(meta.peptide_identification || '') ? (meta.peptide_identification || '').trim() : '');
    const brandHint = meta.brand_names?.[0] || order?.company_name || client?.company_name || '';
    const chemistName = (profile?.full_name || '').trim();
    setEditingCoaId(null);
    setForm({
      ...BLANK,
      clientId: s.user_id,
      sampleId: s.id,
      orderId: s.order_id ?? '',
      sampleName: s.sample_name,
      displayName: s.display_name || s.sample_name,
      companyName: brandHint,
      batchNumber: meta.batch_number ?? '',
      casNumber: cas,
      vialSize: (VIAL_SIZE_OPTIONS.includes(meta.vial_size as VialSizeOption) ? meta.vial_size : '3ml') as VialSizeOption,
      accessionNumber: (s.accession_number || '').trim().toUpperCase(),
      receivedBy: sampleReceivedBy(s) || chemistName,
      receivedDate: isoToLocalDateInput(sampleIntakeAt(s)) || localDateInputValue(),
      matrixType: matrixTypeFromSampleMetadata(s.metadata) || meta.sample_matrix || '',
      labeledContent: meta.labeled_content || '',
      labelClaimUnit: meta.label_claim_unit || 'mg',
    });
    setPreferredBrandName(brandHint);
    setLabResults(buildLabResultsFromSample(s.metadata, s.sample_name));
    setVialImage('');
    setChromatographImage('');
    setChromatogramParsed(null);
    setCasSuggestions(cas ? lookupCas(cas) : []);
    setShowCasSuggestions(false);
    setMsg(null);
    setTab('issue', { from: tab === 'issue' ? returnTab : tab });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function restartCoa(coa: COA) {
    const sample = coa.sample_id ? samples.find(s => s.id === coa.sample_id) : undefined;
    const meta = parseSampleMetadata(sample?.metadata ?? {});
    const client = clients.find(c => c.id === coa.user_id);
    const order = coa.order_id ? orders.find(o => o.id === coa.order_id) : undefined;
    const cas = resolveCasNumber(
      coa.peptide_sequence,
      coa.sample_name,
      coa.display_name,
      meta.peptide_identification,
    );
    const brandHint = coa.company_name || meta.brand_names?.[0] || order?.company_name || client?.company_name || '';
    const vialFromCoa = (coa.chromatogram_data as { vial_size?: string } | null)?.vial_size;
    const summary = (coa.result_summary && typeof coa.result_summary === 'object')
      ? coa.result_summary as Record<string, unknown>
      : {};
    const summaryReceivedBy = typeof summary.received_by === 'string' ? summary.received_by.trim() : '';
    const summaryReceivedAt = typeof summary.received_at === 'string' ? summary.received_at : '';
    const summaryMatrix = (
      (typeof summary.matrix_type === 'string' && summary.matrix_type.trim())
      || (typeof summary.sample_matrix === 'string' && summary.sample_matrix.trim())
      || (typeof (coa.chromatogram_data as { sample_matrix?: string } | null)?.sample_matrix === 'string'
        ? (coa.chromatogram_data as { sample_matrix?: string }).sample_matrix!.trim()
        : '')
      || matrixTypeFromSampleMetadata(sample?.metadata)
      || meta.sample_matrix
      || ''
    );
    const summaryClaim = (
      (typeof summary.labeled_content === 'string' && summary.labeled_content.trim())
      || meta.labeled_content
      || ''
    );
    const summaryClaimUnit = (
      (typeof summary.label_claim_unit === 'string' && summary.label_claim_unit.trim())
      || meta.label_claim_unit
      || 'mg'
    );
    const chemistName = (profile?.full_name || '').trim();
    setEditingCoaId(coa.id);
    setForm({
      ...BLANK,
      clientId: coa.user_id,
      sampleId: coa.sample_id || sample?.id || '',
      orderId: coa.order_id || sample?.order_id || '',
      sampleName: coa.sample_name,
      displayName: coa.display_name || coa.sample_name,
      companyName: brandHint,
      batchNumber: coa.batch_number || meta.batch_number || '',
      casNumber: cas,
      vialSize: (VIAL_SIZE_OPTIONS.includes(vialFromCoa as VialSizeOption)
        ? vialFromCoa
        : VIAL_SIZE_OPTIONS.includes(meta.vial_size as VialSizeOption)
          ? meta.vial_size
          : '3ml') as VialSizeOption,
      overallResult: coa.overall_result === 'fail' || coa.overall_result === 'pending'
        ? coa.overall_result
        : 'pass',
      accessionNumber: (coa.accession_number || coa.slug || sample?.accession_number || '').trim().toUpperCase(),
      receivedBy: summaryReceivedBy || sampleReceivedBy(sample) || chemistName,
      receivedDate: isoToLocalDateInput(summaryReceivedAt || sampleIntakeAt(sample)) || localDateInputValue(),
      matrixType: summaryMatrix,
      labeledContent: summaryClaim,
      labelClaimUnit: summaryClaimUnit,
    });
    setPreferredBrandName(brandHint);
    const nextResults = buildLabResultsFromCoa(coa, sample?.metadata);
    const intake = isoToLocalDateInput(summaryReceivedAt || sampleIntakeAt(sample)) || localDateInputValue();
    if (
      nextResults.sterilityMethod === 'culture_14_day'
      && nextResults.sterilityPass === null
      && !nextResults.sterilityProjectedCompletion.trim()
    ) {
      nextResults.sterilityProjectedCompletion = defaultCultureProjectedCompletion(intake);
    }
    setLabResults(nextResults);
    setVialImage(coa.vial_image || '');
    setChromatographImage(coa.hplc_image || '');
    {
      const chrom = (coa.chromatogram_data && typeof coa.chromatogram_data === 'object')
        ? coa.chromatogram_data
        : null;
      const pts = Array.isArray(chrom?.points) ? chrom.points : [];
      if (pts.length >= 2) {
        setChromatogramParsed({
          points: pts,
          retention_time: Number(chrom?.retention_time) || pts.reduce((a, b) => (b.y > a.y ? b : a), pts[0]).x,
          source_filename: chrom?.source_filename || 'Saved chromatogram data',
          original_count: Number(chrom?.point_count) || pts.length,
        });
      } else {
        setChromatogramParsed(null);
      }
    }
    setCasSuggestions(cas ? lookupCas(cas) : []);
    setShowCasSuggestions(false);
    setMsg({
      type: 'success',
      text: `Restarting ${coa.display_name || coa.sample_name} — edit results and save to re-issue.`,
      slug: coa.slug,
    });
    setTab('issue', { from: tab === 'issue' ? returnTab : tab });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateResults(patch: Partial<LabCoaResults>) {
    const next = { ...patch };
    if (typeof next.netPurity === 'string') next.netPurity = sanitizePurityInput(next.netPurity);
    setLabResults(prev => ({ ...prev, ...next }));
  }

  function updateHeavyMetal(metal: typeof HEAVY_METAL_NAMES[number], value: string) {
    setLabResults(prev => ({
      ...prev,
      heavyMetals: { ...prev.heavyMetals, [metal]: value },
    }));
  }

  function addConformityPeptide() {
    setLabResults(prev => {
      if (prev.blendPeptides.some(p => p.name.trim())) {
        // Blend: append one full vial set with peptide names auto-filled + a total row.
        const vialNum = Math.floor(prev.conformityPeptides.filter(r => isBlendTotalConformityRow(r.name)).length) + 2;
        return {
          ...prev,
          conformityPeptides: [
            ...prev.conformityPeptides,
            { name: `Total (vial ${vialNum})`, netContent: '', netPurity: '' },
            ...blendConformityVialRows(prev.blendPeptides),
          ],
        };
      }
      return {
        ...prev,
        conformityPeptides: [...prev.conformityPeptides, { name: '', netContent: '', netPurity: '' }],
      };
    });
  }

  function updateConformityPeptide(index: number, patch: Partial<{ name: string; netContent: string; netPurity: string }>) {
    const next = { ...patch };
    if (typeof next.netPurity === 'string') next.netPurity = sanitizePurityInput(next.netPurity);
    setLabResults(prev => ({
      ...prev,
      conformityPeptides: prev.conformityPeptides.map((row, i) => (i === index ? { ...row, ...next } : row)),
    }));
  }

  function removeConformityPeptide(index: number) {
    setLabResults(prev => ({
      ...prev,
      conformityPeptides: prev.conformityPeptides.filter((_, i) => i !== index),
    }));
  }

  function update(patch: Partial<typeof BLANK>) {
    setForm(prev => ({ ...prev, ...patch }));
  }

  const linkedSample = form.sampleId
    ? (intakeSampleLive?.id === form.sampleId ? intakeSampleLive : samples.find(s => s.id === form.sampleId) || null)
    : null;
  const linkedMeta = linkedSample ? parseSampleMetadata(linkedSample.metadata) : null;
  const linkedOrder = form.orderId ? orders.find(o => o.id === form.orderId) : null;
  const linkedClient = form.clientId ? clients.find(c => c.id === form.clientId) : undefined;

  const issuePreviewSample = useMemo(() => {
    return wizardSampleFromOrderSample(
      {
        sample_name: linkedSample?.sample_name,
        display_name: linkedSample?.display_name,
        sample_type: linkedSample?.sample_type,
        metadata: linkedMeta ?? linkedSample?.metadata,
      },
      {
        sample_name: form.sampleName || linkedSample?.sample_name || '',
        display_name: form.displayName || linkedSample?.display_name || form.sampleName,
        batch_number: form.batchNumber || linkedMeta?.batch_number || '',
        labeled_content: form.labeledContent || linkedMeta?.labeled_content || '',
        label_claim_unit: form.labelClaimUnit || linkedMeta?.label_claim_unit || 'mg',
        include_fentanyl: !!labResults.includeFentanyl || !!linkedMeta?.include_fentanyl,
        sample_matrix: (form.matrixType || linkedMeta?.sample_matrix || undefined) as WizardSample['sample_matrix'] | undefined,
      },
    );
  }, [
    form.sampleName, form.displayName, form.batchNumber, form.matrixType,
    form.labeledContent, form.labelClaimUnit, linkedMeta, linkedSample, labResults.includeFentanyl,
  ]);

  const issueAssayResults = useMemo((): DigitalCoaAssayResults | null => {
    const panels = labResultsToPanelResults(labResults, {
      labeledContent: form.labeledContent || linkedMeta?.labeled_content || '',
      labelClaimUnit: form.labelClaimUnit || linkedMeta?.label_claim_unit || 'mg',
    });
    const fromPanels = assayResultsFromPanels(panels, {
      quantityUnit: form.labelClaimUnit || linkedMeta?.label_claim_unit || 'mg',
    });
    const purity = parsePurityPercent(labResults.netPurity);
    const quantityMatch = labResults.netContent.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    const quantity = quantityMatch ? Number(quantityMatch[0]) : null;
    const identity = labResults.identification.trim()
      ? [form.overallResult !== 'fail']
      : undefined;

    if (!fromPanels && purity == null && quantity == null && !identity) return null;
    return {
      purity: fromPanels?.purity ?? (purity != null ? [purity] : undefined),
      quantity: fromPanels?.quantity ?? (quantity != null ? [quantity] : undefined),
      identity: fromPanels?.identity ?? identity,
      quantityUnit: form.labelClaimUnit || linkedMeta?.label_claim_unit || 'mg',
    };
  }, [labResults, form.labelClaimUnit, form.labeledContent, linkedMeta?.label_claim_unit, linkedMeta?.labeled_content, form.overallResult]);

  const issueAssayStatuses = useMemo(() => {
    const panels = labResultsToPanelResults(labResults, {
      labeledContent: form.labeledContent || linkedMeta?.labeled_content || '',
      labelClaimUnit: form.labelClaimUnit || linkedMeta?.label_claim_unit || 'mg',
    });
    return assayChipStatusesFromPanels(panels);
  }, [labResults, form.labeledContent, form.labelClaimUnit, linkedMeta?.labeled_content, linkedMeta?.label_claim_unit]);

  const issueTrackingStage =
    form.overallResult === 'pass' || form.overallResult === 'fail'
      ? 'in_review'
      : linkedSample?.status === 'analyzing'
        ? 'analyzing'
        : linkedSample?.status === 'received'
          ? 'received'
          : 'awaiting_sample';


  async function insertCoa(payload: Record<string, unknown>) {
    const selectCols = 'slug, display_name, sample_name, user_id';
    const first = await supabase.from('coas').insert(payload).select(selectCols).single();
    if (!first.error || !isMissingCoaImageColumnError(first.error.message)) return first;

    // Keep vial/watermark columns when only the new HPLC photo column is missing.
    if (/hplc_image/i.test(first.error.message || '') && 'hplc_image' in payload) {
      const hplc = typeof payload.hplc_image === 'string' ? payload.hplc_image : '';
      const { hplc_image: _h, result_summary, ...rest } = payload;
      const summary =
        result_summary && typeof result_summary === 'object' && !Array.isArray(result_summary)
          ? (result_summary as Record<string, unknown>)
          : {};
      const withoutHplcCol = {
        ...rest,
        result_summary: hplc ? { ...summary, hplc_image: hplc } : summary,
      };
      const retry = await supabase.from('coas').insert(withoutHplcCol).select(selectCols).single();
      if (!retry.error || !isMissingCoaImageColumnError(retry.error.message)) return retry;
    }

    return supabase
      .from('coas')
      .insert(payloadWithoutImageColumns(payload))
      .select(selectCols)
      .single();
  }

  async function issueCoaForBrand(
    base: Record<string, unknown>,
    brandName: string,
    createdAt?: string | null,
  ) {
    const slug = await allocateUniqueSampleCode(createdAt || new Date());
    const brandPayload = { ...base, company_name: brandName, sample_id: null, slug };
    await insertCoa(brandPayload);
  }

  async function updateSampleStatus(sampleId: string, status: SampleStatus) {
    const sample = samples.find(s => s.id === sampleId);
    if (!sample) return;
    const order = orders.find(o => o.id === sample.order_id);
    const { error, sample: updated } = await setSampleStatus(sample, status, {
      changedBy: user?.id,
      order,
      note: `Status → ${status}`,
    });
    if (error) { setMsg({ type: 'error', text: error.message }); return; }
    if (updated) setSamples(prev => prev.map(s => s.id === sampleId ? updated : s));
    if (order && status === 'analyzing') {
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'analyzing' } : o));
    }
  }

  async function assignSample(sampleId: string, userId: string | null) {
    const assigned_at = userId ? new Date().toISOString() : null;
    setSamples(prev => prev.map(s => s.id === sampleId ? { ...s, assigned_to: userId, assigned_at } : s));
    const { error } = await supabase.from('order_samples').update({ assigned_to: userId, assigned_at }).eq('id', sampleId);
    if (error) {
      setMsg({ type: 'error', text: error.message });
      loadAll();
      return;
    }
    // Claiming work moves sample into analyzing when still at received
    if (userId) {
      const sample = samples.find(s => s.id === sampleId);
      if (sample && sample.status === 'received') {
        await updateSampleStatus(sampleId, 'analyzing');
      }
    }
  }

  async function assignSampleTest(sampleId: string, testName: string, userId: string | null) {
    const sample = samples.find(s => s.id === sampleId);
    if (!sample) return;
    const prevMeta = (sample.metadata && typeof sample.metadata === 'object' && !Array.isArray(sample.metadata))
      ? { ...(sample.metadata as Record<string, unknown>) }
      : {};
    const nextAssignments = { ...getTestAssignments(sample) };
    if (userId) nextAssignments[testName] = userId;
    else delete nextAssignments[testName];
    const metadata = { ...prevMeta, test_assignments: nextAssignments };
    setSamples(prev => prev.map(s => (s.id === sampleId ? { ...s, metadata } : s)));
    const { error } = await supabase.from('order_samples').update({ metadata }).eq('id', sampleId);
    if (error) {
      setMsg({ type: 'error', text: error.message });
      loadAll();
      return;
    }
    if (userId && sample.status === 'received') {
      await updateSampleStatus(sampleId, 'analyzing');
    }
  }

  async function claimSample(sampleId: string) {
    if (!user) return;
    await assignSample(sampleId, user.id);
  }

  async function releaseSample(sampleId: string) {
    await assignSample(sampleId, null);
  }

  async function setSamplePriority(sampleId: string, priority: LabPriority | null) {
    setSamples(prev => prev.map(s => (s.id === sampleId ? { ...s, lab_priority: priority } : s)));
    const { error } = await supabase
      .from('order_samples')
      .update({ lab_priority: priority })
      .eq('id', sampleId);
    if (error) {
      setMsg({ type: 'error', text: error.message });
      loadAll();
    }
  }

  async function saveOrderEta(order: Order, iso: string | null) {
    setEtaSavingOrderId(order.id);
    try {
      const { error } = await supabase
        .from('orders')
        .update({
          estimated_ready_at: iso,
          due_at: iso ?? order.due_at ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id);
      if (error) {
        setMsg({ type: 'error', text: error.message });
        return;
      }
      setOrders(prev => prev.map(o => (
        o.id === order.id
          ? { ...o, estimated_ready_at: iso, due_at: iso ?? o.due_at }
          : o
      )));
      if (iso) {
        await notifyOrderEtaUpdated(
          order.user_id,
          order.order_number,
          formatDate(iso),
        );
      }
      setMsg({
        type: 'success',
        text: iso ? `ETA set to ${formatDate(iso)}.` : 'ETA cleared.',
      });
    } finally {
      setEtaSavingOrderId(null);
    }
  }

  async function moveCoaToStage(
    coa: COA,
    targetStage: CoaWorkflowStage,
    opts?: { reviewAssignedTo?: string | null; force?: boolean },
  ) {
    const currentStage = coaWorkflowStage(coa);
    if (currentStage === targetStage && targetStage !== 'pending_review') return;

    if (targetStage === 'testing_in_progress') {
      const publishedWarning = currentStage === 'published'
        ? 'This COA is currently visible to the client. Moving it back will unpublish it.\n\n'
        : '';
      const ok = window.confirm(
        `${publishedWarning}Move “${coa.display_name || coa.sample_name}” back to Testing in Progress?\n\nSignatures and publish state will be cleared. Use Restart COA to edit results and re-issue.`,
      );
      if (!ok) return;
    }

    // Chemists may override stopping points (open checklist, incomplete review) and publish.
    if (targetStage === 'published' && !opts?.force) {
      const warnings: string[] = [];
      if (currentStage !== 'verified' && currentStage !== 'published') {
        warnings.push(
          `This COA is still in “${COA_WORKFLOW_LABELS[currentStage]}” (review / sign-off not complete).`,
        );
      }
      if (coa.order_id) {
        try {
          const open = openActionCount(await fetchOrderActionItems(coa.order_id));
          if (open > 0) {
            warnings.push(
              `${open} open publish checklist action${open === 1 ? '' : 's'} still pending.`,
            );
          }
        } catch (err) {
          // Checklist table may not be migrated yet — allow publish to continue.
          console.warn('Publish checklist check unavailable:', err);
        }
      }
      if (warnings.length > 0) {
        const ok = window.confirm(
          [
            'Publish override?',
            '',
            ...warnings,
            '',
            'Publish this COA anyway?',
          ].join('\n'),
        );
        if (!ok) return;
      }
    }

    setMovingCoaId(coa.id);
    setMsg(null);

    const patch = buildWorkflowStagePatch(coa, targetStage, {
      reviewAssignedTo: opts?.reviewAssignedTo,
    });
    if (targetStage === 'pending_review' && opts?.reviewAssignedTo) {
      patch.review_assigned_to = opts.reviewAssignedTo;
    }
    if (targetStage === 'verified' && user?.id) {
      patch.verified_by = user.id;
    }
    const stageLogNote =
      targetStage === 'published' ? 'Published'
        : targetStage === 'verified' ? 'Verified (signatures 2/2)'
          : targetStage === 'pending_review' ? 'Sent for review'
            : targetStage === 'testing_in_progress' ? 'Returned to testing'
              : null;
    if (stageLogNote) {
      patch.result_summary = appendCoaUpdateLog(
        coa.result_summary as Record<string, unknown>,
        stageLogNote,
      );
    }
    const { data: updatedRow, error } = await supabase
      .from('coas')
      .update(patch)
      .eq('id', coa.id)
      .select(COA_LIST_COLUMNS)
      .maybeSingle();

    if (error) {
      setMsg({ type: 'error', text: error.message });
      setMovingCoaId(null);
      return;
    }
    if (!updatedRow) {
      setMsg({
        type: 'error',
        text: 'Could not move this COA — the update was blocked or no row changed. Try again or refresh.',
      });
      setMovingCoaId(null);
      return;
    }

    const updatedCoa = hydrateCoaImages({ ...coa, ...(updatedRow as COA) });
    if (coaWorkflowStage(updatedCoa) !== targetStage) {
      setMsg({
        type: 'error',
        text: `Move failed to stick — still in ${COA_WORKFLOW_LABELS[coaWorkflowStage(updatedCoa)]}.`,
      });
      setMovingCoaId(null);
      return;
    }

    if (targetStage === 'published' && !coa.published_at) {
      const notifyErr = await notifyCoaReady(coa.user_id, coa.display_name || coa.sample_name, coa.slug);
      if (notifyErr) console.warn('COA ready notify failed:', notifyErr);
      const order = orders.find(o => o.id === coa.order_id);
      if (order) await notifyOrderUpdate(coa.user_id, order.order_number, 'coa_published');
    }

    if (targetStage === 'published') {
      if (coa.sample_id) {
        await supabase.from('order_samples').update({ status: 'complete' }).eq('id', coa.sample_id);
        setSamples(prev => prev.map(s => (s.id === coa.sample_id ? { ...s, status: 'complete' } : s)));
      }

      if (coa.order_id) {
        const orderSamples = samples.filter(s => s.order_id === coa.order_id);
        const allSamplesDone = orderSamples.length > 0 && orderSamples.every(s => {
          if (s.id === coa.sample_id) return true;
          if (s.status === 'complete') return true;
          return coas.some(c => c.sample_id === s.id && (
            c.id === coa.id || coaWorkflowStage(c) === 'published'
          ));
        });
        if (allSamplesDone) {
          await supabase.from('orders').update({ status: 'complete' }).eq('id', coa.order_id);
          setOrders(prev => prev.map(o => o.id === coa.order_id ? { ...o, status: 'complete' } : o));
        }
      }
    }

    if (targetStage === 'testing_in_progress') {
      if (coa.sample_id) {
        await supabase.from('order_samples').update({ status: 'analyzing' }).eq('id', coa.sample_id);
        setSamples(prev => prev.map(s => (s.id === coa.sample_id ? { ...s, status: 'analyzing' } : s)));
      }
      if (coa.order_id) {
        await supabase.from('orders').update({ status: 'analyzing' }).eq('id', coa.order_id);
        setOrders(prev => prev.map(o => o.id === coa.order_id ? { ...o, status: 'analyzing' } : o));
      }
    }

    setCoas(prev => prev.map(c => (c.id === coa.id ? { ...c, ...updatedCoa } : c)));
    setMsg({
      type: 'success',
      text: targetStage === 'testing_in_progress'
        ? `Moved to Testing in Progress. Use Restart COA to edit and re-issue.`
        : `Moved to ${COA_WORKFLOW_LABELS[targetStage]}.`,
      slug: coa.slug,
    });
    setMovingCoaId(null);
  }

  async function saveCoa(e: React.FormEvent) {
    e.preventDefault();
    if (!form.clientId) { setMsg({ type: 'error', text: 'Select the client this COA belongs to.' }); return; }
    if (!form.sampleName.trim()) { setMsg({ type: 'error', text: 'Enter a sample name.' }); return; }
    if (!form.receivedBy.trim()) {
      setMsg({ type: 'error', text: 'Enter who received this sample (Received by).' });
      return;
    }
    if (!form.receivedDate.trim()) {
      setMsg({ type: 'error', text: 'Enter the received date.' });
      return;
    }
    const overMaxPurity =
      purityExceedsMax(labResults.netPurity)
      || labResults.conformityPeptides.some(r => purityExceedsMax(r.netPurity));
    if (overMaxPurity) {
      setMsg({
        type: 'error',
        text: `Purity cannot exceed ${MAX_PURITY_PERCENT.toFixed(2)}% (±0.18%). 100% is not allowed.`,
      });
      return;
    }

    setSaving(true);
    setMsg(null);

    try {
      const intakeForProjection = form.receivedDate.trim()
        || isoToLocalDateInput(sampleIntakeAt(linkedSample))
        || localDateInputValue();
      const orderedIncludes = linkedSample
        ? buildLabResultsFromSample(linkedSample.metadata, linkedSample.sample_name)
        : null;
      const resultsForPanels: LabCoaResults = {
        ...labResults,
        includeSterility: labResults.includeSterility || !!orderedIncludes?.includeSterility,
        includeEndotoxin: labResults.includeEndotoxin || !!orderedIncludes?.includeEndotoxin,
        includeHeavyMetals: labResults.includeHeavyMetals || !!orderedIncludes?.includeHeavyMetals,
        includeFentanyl: labResults.includeFentanyl || !!orderedIncludes?.includeFentanyl,
        sterilityMethod:
          labResults.includeSterility || orderedIncludes?.includeSterility
            ? (labResults.sterilityMethod === 'pcr' && orderedIncludes?.sterilityMethod === 'culture_14_day'
              ? 'culture_14_day'
              : labResults.sterilityMethod)
            : labResults.sterilityMethod,
        sterilityProjectedCompletion:
          (labResults.sterilityMethod === 'culture_14_day'
            || orderedIncludes?.sterilityMethod === 'culture_14_day')
          && labResults.sterilityPass === null
            ? (labResults.sterilityProjectedCompletion.trim()
              || defaultCultureProjectedCompletion(intakeForProjection))
            : '',
      };
      const cleanPanels = labResultsToPanelResults(resultsForPanels, {
        labeledContent: form.labeledContent.trim() || linkedMeta?.labeled_content || '',
        labelClaimUnit: form.labelClaimUnit.trim() || linkedMeta?.label_claim_unit || 'mg',
      });

      const purityNum = parsePurityPercent(labResults.netPurity);
      const includeMw = labResults.includeMolecularWeight && !!labResults.molecularWeight.trim();
      const mwNum = includeMw ? parseMolecularWeight(labResults.molecularWeight) : null;
      const content_hash = computeCoaContentHash({
        sample_name: form.sampleName.trim(),
        batch_number: form.batchNumber.trim(),
        purity_percent: purityNum,
        panel_results: cleanPanels,
      });

      const coaCompanyProfile = selectedCompany
        ?? clientCompanies.find(c => c.is_default)
        ?? clientCompanies[0]
        ?? null;
      const chemistByline = (profile?.full_name || '').trim() || undefined;

      const headerLogoRaw = applyHeaderLogo ? (coaCompanyProfile?.logo || '') : '';
      const watermarkRaw = applyWatermark ? (coaCompanyProfile?.chromatograph_background || '') : '';
      const [companyLogoRaw, watermarkRawResolved, hplcRawResolved, vialResolved] = await Promise.all([
        headerLogoRaw ? resolveImageAsDataUrl(headerLogoRaw) : Promise.resolve(''),
        watermarkRaw ? resolveImageAsDataUrl(watermarkRaw) : Promise.resolve(''),
        chromatographImage ? resolveImageAsDataUrl(chromatographImage) : Promise.resolve(''),
        vialImage ? prepareVialImage(vialImage) : Promise.resolve(''),
      ]);
      // Prefer compressed copies; fall back to raw only when still a short data/http URL.
      const pickImage = (resolved: string, raw: string) => {
        if (resolved) return resolved;
        if (!raw) return '';
        if (raw.startsWith('data:image/') && raw.length > 400_000) return '';
        return raw;
      };
      const companyLogo = pickImage(companyLogoRaw, headerLogoRaw);
      const watermarkImage = pickImage(watermarkRawResolved, watermarkRaw);
      const hplcImage = hplcRawResolved;
      const vialForSave = vialResolved || (vialImage.length <= 400_000 ? vialImage : '');

      // Fresh sample row so Matrix Type / Received Date are snapshotted even if the
      // queue list was stale or incomplete.
      let intakeSample = linkedSample;
      if (form.sampleId) {
        const fresh = await supabase
          .from('order_samples')
          .select('id, metadata, received_at, status, created_at, accession_number')
          .eq('id', form.sampleId)
          .maybeSingle();
        const freshSample = fresh.error && /received_at/i.test(fresh.error.message || '')
          ? (await supabase
              .from('order_samples')
              .select('id, metadata, status, created_at, accession_number')
              .eq('id', form.sampleId)
              .maybeSingle()).data
          : fresh.data;
        if (freshSample) {
          intakeSample = freshSample as typeof linkedSample;
        }
      }
      const intakeAt = sampleIntakeAt(intakeSample);
      const formReceivedAt = localDateInputToIso(form.receivedDate);
      const receivedAtIso = formReceivedAt || intakeAt || new Date().toISOString();
      const receivedDate = formatDate(receivedAtIso);
      const receivedByName = form.receivedBy.trim();
      const assayAverages = computeLabAssayAverages(labResults);
      const avgPurityNum = parsePurityPercent(assayAverages.avg_purity);
      const storedPurity = avgPurityNum ?? purityNum;
      // Chemist-assigned LIMS ID wins; fall back to sample LIMS ID or allocate YYMM-XXXXXX.
      const sampleCreatedAt =
        (intakeSample && 'created_at' in intakeSample && typeof intakeSample.created_at === 'string'
          ? intakeSample.created_at
          : null)
        || linkedSample?.created_at
        || new Date().toISOString();
      const typedAccession = form.accessionNumber.trim().toUpperCase();
      const existingAccession = (
        typedAccession
        || (intakeSample && 'accession_number' in intakeSample
          ? (intakeSample as { accession_number?: string | null }).accession_number
          : null)
        || linkedSample?.accession_number
        || ''
      ).trim().toUpperCase();
      if (typedAccession && !isValidSampleCode(typedAccession)) {
        setMsg({
          type: 'error',
          text: 'LIMS ID must look like YYMM-XXXXXX (e.g. 2608-K7M4Q9). Use Generate or leave blank to auto-assign.',
        });
        setSaving(false);
        return;
      }
      const sampleCode = isValidSampleCode(existingAccession)
        ? existingAccession
        : await allocateUniqueSampleCode(sampleCreatedAt);
      const resolvedSampleMatrix = (
        form.matrixType.trim()
        || matrixTypeFromSampleMetadata(intakeSample?.metadata)
        || linkedMeta?.sample_matrix
        || ''
      ).trim();

      const chromatogram_data = chromatogramParsed
        ? chromatogramDataFromParsed(chromatogramParsed, {
            vial_size: form.vialSize,
            ...(resolvedSampleMatrix ? { sample_matrix: resolvedSampleMatrix } : {}),
          })
        : {
            vial_size: form.vialSize,
            ...(resolvedSampleMatrix ? { sample_matrix: resolvedSampleMatrix } : {}),
          };

      const payload = {
        user_id: form.clientId,
        sample_id: form.sampleId || null,
        order_id: form.orderId || null,
        slug: sampleCode,
        accession_number: sampleCode,
        sample_name: form.sampleName.trim(),
        display_name: form.displayName.trim() || form.sampleName.trim(),
        company_name: (form.companyName.trim() || coaCompanyProfile?.name || '').trim(),
        company_logo: companyLogo,
        peptide_sequence: looksLikeCasNumber(form.casNumber.trim())
          ? form.casNumber.trim()
          : (resolveCasNumber(form.casNumber, form.sampleName, form.displayName) || ''),
        batch_number: form.batchNumber.trim(),
        purity_percent: storedPurity,
        molecular_weight: mwNum,
        panel_results: cleanPanels,
        chromatogram_data,
        vial_image: vialForSave || '',
        chromatogram_image: watermarkImage,
        hplc_image: hplcImage || '',
        result_summary: (() => {
          const existing = editingCoaId ? coas.find(c => c.id === editingCoaId) : undefined;
          const baseSummary = {
            include_molecular_weight: includeMw,
            molecular_weight: includeMw ? labResults.molecularWeight.trim() : '',
            sterility_method: resultsForPanels.sterilityMethod,
            sterility_pass: resultsForPanels.sterilityPass,
            sterility_method_label: STERILITY_METHOD_LABELS[resultsForPanels.sterilityMethod],
            sterility_specification: 'Not Detected',
            sterility_projected_completion:
              resultsForPanels.sterilityMethod === 'culture_14_day' && resultsForPanels.sterilityPass === null
                ? resultsForPanels.sterilityProjectedCompletion.trim()
                : '',
            assay_method: labResults.assayMethod,
            assay_method_label: ASSAY_METHOD_LABELS[labResults.assayMethod],
            endotoxin_eu_ml: labResults.endotoxinEuMl.trim(),
            endotoxin_pass: labResults.endotoxinPass,
            heavy_metals_pass: labResults.heavyMetalsPass,
            heavy_metals: labResults.heavyMetals,
            blend_peptides: labResults.blendPeptides,
            // Pre-calculate Prepare COA averages from assay + conformity vials.
            avg_net_peptide_content: assayAverages.avg_net_peptide_content,
            avg_purity: assayAverages.avg_purity,
            mean_of_vials_tested: assayAverages.mean_of_vials_tested,
            vials_tested: assayAverages.mean_of_vials_tested,
            content_values: assayAverages.content_values,
            purity_values: assayAverages.purity_values,
            apply_company_logo: applyHeaderLogo,
            apply_watermark: applyWatermark,
            coa_profile_id: coaCompanyProfile?.id ?? null,
            received_at: receivedAtIso,
            received_date: receivedDate,
            received_by: receivedByName,
            ...(resolvedSampleMatrix ? { matrix_type: resolvedSampleMatrix, sample_matrix: resolvedSampleMatrix } : {}),
            category: linkedMeta?.category || '',
            test_mode: linkedMeta?.test_mode || '',
            include_endotoxin: !!resultsForPanels.includeEndotoxin,
            include_heavy_metals: !!resultsForPanels.includeHeavyMetals,
            include_sterility: !!resultsForPanels.includeSterility,
            include_fentanyl: !!resultsForPanels.includeFentanyl,
            labeled_content: form.labeledContent.trim() || linkedMeta?.labeled_content || '',
            label_claim_unit: form.labelClaimUnit.trim() || linkedMeta?.label_claim_unit || 'mg',
            include_cas_number: !!looksLikeCasNumber(form.casNumber.trim())
              || !!resolveCasNumber(form.casNumber, form.sampleName, form.displayName),
          };
          const withPrior = carryForwardUpdateLog(
            existing?.result_summary as Record<string, unknown> | undefined,
            baseSummary,
          );
          if (editingCoaId && existing) {
            const detail = summarizeCoaContentChanges(
              { panel_results: existing.panel_results, overall_result: existing.overall_result },
              { panel_results: cleanPanels, overall_result: form.overallResult },
            );
            const existingStage = coaWorkflowStage(existing);
            const keepLive = existingStage === 'published' || existingStage === 'verified' || !!existing.is_public;
            return appendCoaUpdateLog(
              withPrior,
              keepLive
                ? formatPostIssueUpdateNote(existing, detail || 'Certificate details updated')
                : (detail ? `Re-issued · ${detail}` : 'Certificate re-issued'),
              { by: chemistByline },
            );
          }
          return appendCoaUpdateLog(
            withPrior,
            'Certificate issued',
            { by: chemistByline },
          );
        })(),
        overall_result: form.overallResult,
        is_public: false,
        coa_workflow_stage: 'issued',
        content_hash,
        signature: `AA-${Date.now().toString(36).toUpperCase()}`,
      };

      const wasRestart = !!editingCoaId;
      const existingForEdit = editingCoaId ? coas.find(c => c.id === editingCoaId) : undefined;
      const existingStageForEdit = existingForEdit ? coaWorkflowStage(existingForEdit) : null;
      const keepPublished = !!existingForEdit && (
        existingStageForEdit === 'published' || !!existingForEdit.is_public
      );
      const keepVerified = !!existingForEdit && existingStageForEdit === 'verified' && !keepPublished;
      const keepLive = keepPublished || keepVerified;
      let issuedSlug = sampleCode;

      if (editingCoaId) {
        const existing = existingForEdit;
        const { signature: _sig, slug: _slug, ...updateFields } = payload;
        // Editing a live published/verified COA keeps it client-visible — no unpublish bounce.
        const restartPatch = {
          ...updateFields,
          slug: existing?.slug || sampleCode,
          signature: existing?.signature || payload.signature,
          review_assigned_to: keepLive ? (existing?.review_assigned_to ?? null) : null,
          verified_at: keepLive ? (existing?.verified_at ?? null) : null,
          verified_by: keepLive ? (existing?.verified_by ?? null) : null,
          published_at: keepPublished ? (existing?.published_at ?? new Date().toISOString()) : null,
          is_public: keepPublished,
          coa_workflow_stage: (
            keepPublished ? 'published' : keepVerified ? 'verified' : 'issued'
          ) as CoaWorkflowStage,
        };
        const { error } = await supabase.from('coas').update(restartPatch).eq('id', editingCoaId);
        if (error) {
          setMsg({ type: 'error', text: error.message });
          return;
        }
        issuedSlug = String(restartPatch.slug);
        setCoas(prev => prev.map(c => (
          c.id === editingCoaId ? { ...c, ...restartPatch, id: editingCoaId } as COA : c
        )));
      } else {
        const { data, error } = await insertCoa(payload);

        if (error) {
          setMsg({ type: 'error', text: error.message });
          return;
        }
        issuedSlug = data?.slug || sampleCode;

        const sampleRow = form.sampleId ? samples.find(s => s.id === form.sampleId) : null;
        const linkedOrder = form.orderId ? orders.find(o => o.id === form.orderId) : undefined;
        const metaBrands = (sampleRow?.metadata as { brand_names?: string[] } | null)?.brand_names?.filter(Boolean) ?? [];
        let noteBrands: string[] = [];
        if (linkedOrder?.notes && sampleRow) {
          const { meta } = parseOrderNotes(linkedOrder.notes);
          const detail = Array.isArray(meta.samples_detail) ? meta.samples_detail : [];
          const sampleName = (sampleRow.sample_name || '').trim().toLowerCase();
          const displayName = (sampleRow.display_name || '').trim().toLowerCase();
          for (const row of detail) {
            const rowName = String(row.peptide_identification || row.sample_name || '').trim().toLowerCase();
            if (rowName && (rowName === sampleName || rowName === displayName) && Array.isArray(row.brand_names)) {
              noteBrands = row.brand_names.filter((n): n is string => typeof n === 'string' && !!n.trim());
            }
          }
        }
        const brandNames = [...new Set([...metaBrands, ...noteBrands])];
        const primaryBrand = String(payload.company_name || '').trim().toLowerCase();
        for (const brand of brandNames) {
          if (!brand.trim()) continue;
          if (primaryBrand && brand.trim().toLowerCase() === primaryBrand) continue;
          await issueCoaForBrand({ ...payload, coa_workflow_stage: 'issued' }, brand, sampleCreatedAt);
        }
      }

      if (form.sampleId && !keepLive) {
        const sampleRow = samples.find(s => s.id === form.sampleId) || intakeSample;
        const prevMeta =
          sampleRow?.metadata && typeof sampleRow.metadata === 'object' ? sampleRow.metadata : {};
        const samplePatch: Record<string, unknown> = {
          accession_number: sampleCode,
          received_at: receivedAtIso,
          metadata: {
            ...prevMeta,
            received_at: receivedAtIso,
            sample_code: sampleCode,
            received_by: receivedByName,
            ...(resolvedSampleMatrix ? { sample_matrix: resolvedSampleMatrix } : {}),
            ...(form.labeledContent.trim()
              ? {
                  labeled_content: form.labeledContent.trim(),
                  label_claim_unit: form.labelClaimUnit.trim() || 'mg',
                }
              : {}),
          },
          status: 'in_review',
        };
        const sampleUpdate = await supabase
          .from('order_samples')
          .update(samplePatch)
          .eq('id', form.sampleId);
        if (sampleUpdate.error && /received_at/i.test(sampleUpdate.error.message || '')) {
          const { received_at: _drop, ...withoutCol } = samplePatch;
          await supabase.from('order_samples').update(withoutCol).eq('id', form.sampleId);
        }
        const orderId = form.orderId;
        if (orderId) await supabase.from('orders').update({ status: 'in_review' }).eq('id', orderId);
      }

      setForm({ ...BLANK });
      setEditingCoaId(null);
      setLabResults({ ...EMPTY_LAB_RESULTS });
      setVialImage('');
      setChromatographImage('');
      setChromatogramParsed(null);
      setApplyHeaderLogo(true);
      setApplyWatermark(true);
      setCasSuggestions([]);
      setShowCasSuggestions(false);
      setMsg({
        type: 'success',
        text: wasRestart
          ? (keepLive
            ? 'COA updated in place — still live for the client. Changes are on the update log.'
            : 'COA restarted and re-issued (private). Send for review when ready.')
          : 'COA issued (private). Verify it, then publish for the client.',
        slug: issuedSlug,
      });
      setWorkflowCompanyFilter('');
      setTab('workflow');
      loadAll();
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Could not issue COA. Try smaller images and retry.';
      setMsg({ type: 'error', text });
    } finally {
      setSaving(false);
    }
  }

  const receiveCount = useMemo(() => {
    return samples.filter(s => {
      const order = orders.find(o => o.id === s.order_id);
      if (!order || order.status === 'cancelled' || order.status === 'complete') return false;
      return s.status === 'awaiting_sample' || order.payment_status === 'unpaid' || !order.payment_status;
    }).length;
  }, [samples, orders]);

  const tabs: { id: LabTab; label: string; count?: number }[] = [
    { id: 'bench', label: LAB_TAB_LABELS.bench },
    { id: 'receive', label: LAB_TAB_LABELS.receive, count: receiveCount || undefined },
    { id: 'queue', label: LAB_TAB_LABELS.queue, count: pendingQueueCount || undefined },
    { id: 'issue', label: LAB_TAB_LABELS.issue },
    { id: 'workflow', label: LAB_TAB_LABELS.workflow, count: workflowActiveCount || undefined },
  ];

  return (
    <div className="min-h-screen bg-neutral-100">
      <StaffHeader title="Lab Console">
        <button
          type="button"
          onClick={() => loadAll()}
          disabled={loading}
          className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-900 rounded-md disabled:opacity-50"
          title="Refresh queue"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </StaffHeader>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-black flex items-center gap-2">
            <FlaskConical size={24} className="text-brand-500" /> Lab Console
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            My Bench → Receive → Testing queue → Issue COA → Workflow (verify &amp; publish).
          </p>
        </div>

        <div className="flex gap-1 border-b border-atlas-border mb-6 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                tab === t.id ? 'border-brand-500 text-black' : 'border-transparent text-neutral-500 hover:text-black'
              }`}
            >
              {t.label}
              {t.count != null && t.count > 0 && (
                <span className="ml-1.5 text-xs bg-brand-100 text-brand-800 px-1.5 py-0.5 rounded-full">{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {msg && (
          <div className={`flex items-start gap-2 p-3 rounded-lg border text-sm mb-6 ${
            msg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {msg.type === 'success' ? <CheckCircle size={16} className="flex-shrink-0 mt-0.5" /> : <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />}
            <span>
              {msg.text}
              {msg.slug && (
                <>
                  {' '}
                  <button
                    type="button"
                    className="font-semibold underline"
                    onClick={() => {
                      if (msg.slug) window.open(`/coa/${encodeURIComponent(msg.slug)}`, '_blank', 'noopener,noreferrer');
                    }}
                  >
                    Open certificate
                  </button>
                  {' · '}
                  {(() => {
                    const issued = coas.find(c => c.slug === msg.slug);
                    if (!issued || !canPrepareCoa(issued)) return null;
                    return (
                      <>
                        <button
                          type="button"
                          className="font-semibold underline"
                          onClick={() => setPrepCoa(issued)}
                        >
                          Prepare
                        </button>
                        {' · '}
                      </>
                    );
                  })()}
                  <Link to={`/coa/${msg.slug}`} className="font-semibold underline">Web view</Link>
                </>
              )}
            </span>
          </div>
        )}

        {tab === 'bench' && user && (
          <MyBenchPanel
            userId={user.id}
            queueItems={pendingQueueItems}
            coas={coas}
            orders={normalizedOrders}
            samples={samples}
            onOpenQueue={() => setTab('queue')}
            onOpenWorkflow={() => setTab('workflow')}
            onIssueCoa={prefillFromSample}
            onUpdatePendingCoa={coa => setPrepCoa(coa)}
          />
        )}

        {tab === 'receive' && (
          <ReceivingDesk
            orders={orders}
            samples={samples}
            clients={clients}
            onChanged={loadAll}
          />
        )}

        {tab === 'queue' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-neutral-600">
                Work top-down: <span className="text-red-700 font-medium">urgent</span>, then{' '}
                <span className="text-amber-700 font-medium">high</span>, then normal. Assign a lead chemist or per-test owner, claim work, and open{' '}
                <span className="font-medium text-neutral-800">Order brief</span> / Notes for client context.
                {isAdmin ? (
                  <> Admins set order priority in <Link to="/admin" className="font-semibold text-brand-700 hover:underline">Admin → Orders</Link>.</>
                ) : (
                  <> Priority overrides stay in Admin.</>
                )}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setQueueView('pending')}
                  className={`px-3 py-1.5 text-sm rounded-md border ${queueView === 'pending' ? 'bg-black text-white border-black' : 'border-atlas-border'}`}
                >
                  Awaiting work ({pendingSamples.length})
                </button>
                <button
                  type="button"
                  onClick={() => setQueueView('all')}
                  className={`px-3 py-1.5 text-sm rounded-md border ${queueView === 'all' ? 'bg-black text-white border-black' : 'border-atlas-border'}`}
                >
                  All samples
                </button>
              </div>
            </div>

            <QueueFilters
              values={queueFilters}
              onChange={patch => setQueueFilters(prev => ({ ...prev, ...patch }))}
              companies={queueCompanyOptions}
              hasCurrentUser={!!user}
            />

            <TestingQueuePanel
              items={filteredQueueItems}
              loading={loading}
              onIssueCoa={prefillFromSample}
              onUpdateStatus={updateSampleStatus}
              chemists={chemistOptions}
              currentUserId={user?.id}
              onClaim={claimSample}
              onRelease={releaseSample}
              onAssign={assignSample}
              onAssignTest={assignSampleTest}
              onSetSamplePriority={isAdmin ? setSamplePriority : undefined}
              onOpenOrderBrief={setBriefOrderId}
            />
          </div>
        )}

        {tab === 'issue' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <form onSubmit={saveCoa} className="lg:col-span-2 card p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setTab(returnTab)}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-brand-700"
                >
                  <ArrowLeft size={14} /> Back to {LAB_TAB_LABELS[returnTab]}
                </button>
                <p className="text-xs text-neutral-500">
                  {editingCoaId
                    ? (() => {
                      const editing = coas.find(c => c.id === editingCoaId);
                      if (!editing) return 'Editing COA';
                      const st = coaWorkflowStage(editing);
                      if (st === 'published' || editing.is_public) return 'Editing live published COA';
                      if (st === 'verified') return 'Editing verified COA';
                      return 'Restarting COA';
                    })()
                    : 'Issue new COA'}
                </p>
              </div>
              <p className="text-xs text-neutral-500 bg-neutral-50 border border-atlas-border rounded-md px-3 py-2">
                {editingCoaId ? (
                  <>
                    Restarting an existing COA — edits update the same certificate (LIMS ID stays the same), then return it to <strong>Issued</strong> for review.
                  </>
                ) : (
                  <>
                    Step 1 of 3: Issue creates a <strong>private</strong> COA. After review, verify it in Workflow, then publish for the client.
                  </>
                )}
              </p>

              {form.sampleId && (
                <div className="rounded-lg border border-brand-200 bg-brand-50/60 px-4 py-3 text-sm">
                  <p className="font-semibold text-black">Loaded from client submission</p>
                  <p className="text-neutral-700 mt-1">
                    Submitted by{' '}
                    <strong>{clientSubmittedLabel(linkedClient, linkedOrder?.company_name)}</strong>
                    {form.labeledContent.trim() && (
                      <> · Net content claim: <strong>{form.labeledContent.trim()}{form.labelClaimUnit ? ` ${form.labelClaimUnit}` : ''}</strong></>
                    )}
                    {labResults.includeFentanyl && (
                      <> · <strong>Fentanyl Detection</strong> requested</>
                    )}
                  </p>
                </div>
              )}

              <ClaimVsResultStrip
                labelClaim={form.labeledContent || linkedMeta?.labeled_content || ''}
                labelClaimUnit={form.labelClaimUnit || linkedMeta?.label_claim_unit || 'mg'}
                results={labResults}
                overallResult={form.overallResult}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Client <span className="text-red-500">*</span></label>
                  <select value={form.clientId} onChange={e => {
                    const client = clients.find(c => c.id === e.target.value);
                    setPreferredBrandName(client?.company_name || '');
                    update({ clientId: e.target.value, companyName: client?.company_name || '' });
                  }} className="input-field">
                    <option value="">Select client…</option>
                    {form.clientId && !clients.some(c => c.id === form.clientId) && (
                      <option value={form.clientId}>{clientLabel(form.clientId)}</option>
                    )}
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{clientOptionLabel(c)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">COA profile (brand)</label>
                  <select
                    value={selectedCompanyId}
                    onChange={e => {
                      const id = e.target.value;
                      setSelectedCompanyId(id);
                      const co = clientCompanies.find(c => c.id === id);
                      if (co) {
                        update({ companyName: co.name });
                        setApplyHeaderLogo(!!co.logo);
                        setApplyWatermark(!!co.chromatograph_background);
                      }
                    }}
                    className="input-field"
                    disabled={!form.clientId || clientCompanies.length === 0}
                  >
                    {clientCompanies.length === 0 ? (
                      <option value="">
                        {form.clientId ? 'No COA profiles found for this client' : 'Select a client first'}
                      </option>
                    ) : (
                      clientCompanies.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}{c.is_default ? ' (default)' : ''}
                          {c.logo ? ' · logo' : ''}
                          {c.chromatograph_background ? ' · watermark' : ''}
                        </option>
                      ))
                    )}
                  </select>
                  {form.clientId && clientCompanies.length > 0 && (
                    <p className="text-xs text-neutral-500 mt-1">
                      {clientCompanies.length} profile{clientCompanies.length === 1 ? '' : 's'} loaded for this client.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="label">Company Name (on COA)</label>
                <input value={form.companyName} onChange={e => update({ companyName: e.target.value })} className="input-field" placeholder="Client company" />
              </div>

              {selectedCompany && (
                <div className="rounded-lg border border-atlas-border bg-neutral-50/80 p-4 space-y-3">
                  <p className="text-sm font-semibold text-black">Apply from client profile</p>
                  <p className="text-xs text-neutral-500">
                    Images are saved on the client&apos;s COA profile. Chemist only chooses whether to apply them.
                  </p>
                  <div className="flex flex-wrap gap-6 items-start">
                    <label className="inline-flex items-start gap-2 text-sm text-neutral-800 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5 rounded border-atlas-border"
                        checked={applyHeaderLogo}
                        disabled={!selectedCompany.logo}
                        onChange={e => setApplyHeaderLogo(e.target.checked)}
                      />
                      <span>
                        Company logo (header)
                        {!selectedCompany.logo && (
                          <span className="block text-xs text-neutral-500">Not uploaded on this profile</span>
                        )}
                        {!!selectedCompany.logo && (
                          <img src={selectedCompany.logo} alt="" className="mt-1 h-10 w-10 object-contain border border-atlas-border bg-white rounded" />
                        )}
                      </span>
                    </label>
                    <label className="inline-flex items-start gap-2 text-sm text-neutral-800 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5 rounded border-atlas-border"
                        checked={applyWatermark}
                        disabled={!selectedCompany.chromatograph_background}
                        onChange={e => setApplyWatermark(e.target.checked)}
                      />
                      <span>
                        Chromatogram watermark
                        {!selectedCompany.chromatograph_background && (
                          <span className="block text-xs text-neutral-500">Not uploaded on this profile</span>
                        )}
                        {!!selectedCompany.chromatograph_background && (
                          <img src={selectedCompany.chromatograph_background} alt="" className="mt-1 h-10 w-10 object-contain border border-atlas-border bg-white rounded opacity-70" />
                        )}
                      </span>
                    </label>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Sample Name <span className="text-red-500">*</span></label>
                  <input value={form.sampleName} onChange={e => update({ sampleName: e.target.value })} className="input-field" placeholder="e.g. BPC-157" />
                </div>
                <div>
                  <label className="label">Display Name</label>
                  <input value={form.displayName} onChange={e => update({ displayName: e.target.value })} className="input-field" placeholder="e.g. BPC-157 5mg" />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div><label className="label">Batch / Lot</label><input value={form.batchNumber} onChange={e => update({ batchNumber: e.target.value })} className="input-field" /></div>
                <div>
                  <label className="label">Vial Size</label>
                  <select value={form.vialSize} onChange={e => update({ vialSize: e.target.value as VialSizeOption })} className="input-field">
                    {VIAL_SIZE_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Overall</label>
                  <select value={form.overallResult} onChange={e => update({ overallResult: e.target.value as COA['overall_result'] })} className="input-field">
                    <option value="pass">Pass</option><option value="fail">Fail</option><option value="pending">Pending</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="label">
                    Label claim
                    {!form.labeledContent.trim() && (
                      <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                        Not on order — enter for COA
                      </span>
                    )}
                  </label>
                  <input
                    className={`input-field ${!form.labeledContent.trim() ? 'border-amber-300 bg-amber-50/40' : ''}`}
                    value={form.labeledContent}
                    onChange={e => update({ labeledContent: e.target.value })}
                    placeholder="e.g. 10"
                    inputMode="decimal"
                  />
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Client / vial claim amount. Prefills from the order when available — chemists can enter or correct it here.
                  </p>
                </div>
                <div>
                  <label className="label">Claim unit</label>
                  <select
                    className="input-field"
                    value={form.labelClaimUnit}
                    onChange={e => update({ labelClaimUnit: e.target.value })}
                  >
                    {LABEL_CLAIM_UNITS.map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                    {form.labelClaimUnit
                      && !(LABEL_CLAIM_UNITS as readonly string[]).includes(form.labelClaimUnit) && (
                      <option value={form.labelClaimUnit}>{form.labelClaimUnit}</option>
                    )}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">LIMS ID</label>
                  <div className="flex gap-2">
                    <input
                      className="input-field font-mono flex-1"
                      value={form.accessionNumber}
                      onChange={e => update({ accessionNumber: e.target.value.toUpperCase() })}
                      placeholder="YYMM-XXXXXX"
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      className="btn-secondary text-xs px-3 whitespace-nowrap"
                      onClick={async () => {
                        const code = await allocateUniqueSampleCode(new Date());
                        update({ accessionNumber: code });
                      }}
                    >
                      Generate
                    </button>
                  </div>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Assign here if not set at Receiving. This is the LIMS ID on the certificate.
                  </p>
                </div>
                <div>
                  <label className="label">Received by</label>
                  <div className="flex gap-2">
                    <input
                      className="input-field flex-1"
                      value={form.receivedBy}
                      onChange={e => update({ receivedBy: e.target.value })}
                      placeholder="Full name"
                      autoComplete="name"
                    />
                    <button
                      type="button"
                      className="btn-secondary text-xs px-3 whitespace-nowrap"
                      disabled={!(profile?.full_name || '').trim()}
                      onClick={() => update({ receivedBy: (profile?.full_name || '').trim() })}
                      title="Use your name"
                    >
                      Me
                    </button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Matrix Type</label>
                  <select
                    className="input-field"
                    value={form.matrixType}
                    onChange={e => update({ matrixType: e.target.value })}
                  >
                    <option value="">Select matrix type…</option>
                    {SAMPLE_MATRICES.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                    {form.matrixType && !(SAMPLE_MATRICES as readonly string[]).includes(form.matrixType) && (
                      <option value={form.matrixType}>{form.matrixType}</option>
                    )}
                  </select>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Prefills from the order when available — change it here if needed for the COA.
                  </p>
                </div>
                <div>
                  <label className="label">Received date (COA)</label>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      className="input-field flex-1"
                      value={form.receivedDate || localDateInputValue()}
                      onChange={e => {
                        const nextDate = e.target.value;
                        update({ receivedDate: nextDate });
                        if (
                          labResults.sterilityMethod === 'culture_14_day'
                          && labResults.sterilityPass === null
                        ) {
                          updateResults({
                            sterilityProjectedCompletion: defaultCultureProjectedCompletion(nextDate),
                          });
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn-secondary text-xs px-3 whitespace-nowrap"
                      onClick={() => {
                        const today = localDateInputValue();
                        update({ receivedDate: today });
                        if (
                          labResults.sterilityMethod === 'culture_14_day'
                          && labResults.sterilityPass === null
                        ) {
                          updateResults({
                            sterilityProjectedCompletion: defaultCultureProjectedCompletion(today),
                          });
                        }
                      }}
                      title="Use today (issue day)"
                    >
                      Today
                    </button>
                  </div>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Defaults to the day you issue the COA. Change only if intake was a different day.
                  </p>
                </div>
              </div>
              <div className="relative">
                <label className="label">CAS Number</label>
                <input
                  value={form.casNumber}
                  onChange={e => {
                    update({ casNumber: e.target.value });
                    setCasSuggestions(lookupCas(e.target.value));
                    setShowCasSuggestions(true);
                  }}
                  onFocus={() => {
                    setCasSuggestions(lookupCas(form.casNumber));
                    setShowCasSuggestions(true);
                  }}
                  onBlur={() => setTimeout(() => setShowCasSuggestions(false), 150)}
                  className="input-field"
                  placeholder="e.g. 137266-51-2"
                  autoComplete="off"
                />
                {showCasSuggestions && casSuggestions.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full bg-white border border-atlas-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {casSuggestions.map(hit => (
                      <li key={`${hit.name}-${hit.cas}`}>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-brand-50"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => {
                            update({ casNumber: hit.cas });
                            setShowCasSuggestions(false);
                          }}
                        >
                          <span className="font-medium">{hit.name}</span>
                          <span className="text-neutral-500 ml-2">{hit.cas}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <label className="label mb-3 block">Test Results</label>
                <div className="space-y-4 rounded-lg border border-atlas-border p-4 bg-neutral-50/50">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="label">Assay method (ID / Content / Purity)</label>
                      <select
                        value={labResults.assayMethod}
                        onChange={e => updateResults({ assayMethod: e.target.value as AssayMethod })}
                        className="input-field max-w-md"
                      >
                        <option value="hplc_uv_vis">{ASSAY_METHOD_LABELS.hplc_uv_vis}</option>
                        <option value="lcms">{ASSAY_METHOD_LABELS.lcms}</option>
                      </select>
                      <p className="text-xs text-neutral-500 mt-1">
                        Shown on the COA for Identification, Net Content, and Net Purity.
                      </p>
                    </div>
                    <div>
                      <label className="label">Identification</label>
                      <input
                        value={labResults.identification}
                        onChange={e => updateResults({ identification: e.target.value })}
                        className="input-field"
                        placeholder={labResults.blendPeptides.length > 0 ? 'e.g. BPC-157 + TB-500' : 'Peptide identification'}
                      />
                      {labResults.blendPeptides.length > 0 && (
                        <p className="text-xs text-neutral-500 mt-1">Blend — list all peptides identified in this sample.</p>
                      )}
                    </div>
                    <div>
                      <label className="label">
                        {labResults.blendPeptides.length > 0 ? 'Total peptide content (tested)' : 'Net Content (tested)'}
                      </label>
                      <input
                        value={labResults.netContent}
                        onChange={e => updateResults({ netContent: e.target.value })}
                        className="input-field"
                        placeholder={labResults.blendPeptides.length > 0 ? 'Total measured mg for the blend' : 'Measured mg — not label claim'}
                      />
                    </div>
                    <div>
                      <label className="label">
                        {labResults.blendPeptides.length > 0 ? 'Total purity (%)' : 'Net Purity (%)'}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        max={MAX_PURITY_PERCENT}
                        value={labResults.netPurity}
                        onChange={e => updateResults({ netPurity: e.target.value })}
                        className="input-field"
                        placeholder="e.g. 99.2"
                      />
                      <p className="text-xs text-neutral-500 mt-1">{PURITY_INPUT_HINT}</p>
                      {labResults.blendPeptides.length > 0 && (
                        <p className="text-xs text-neutral-500 mt-1">One purity for the whole blend — not per peptide.</p>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label className="label mb-0">Molecular Weight (Da)</label>
                        <label className="inline-flex items-center gap-1.5 text-xs text-neutral-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={labResults.includeMolecularWeight}
                            onChange={e => updateResults({ includeMolecularWeight: e.target.checked })}
                            className="rounded border-atlas-border"
                          />
                          Include on COA
                        </label>
                      </div>
                      <input
                        type="number"
                        step="0.1"
                        value={labResults.molecularWeight}
                        onChange={e => updateResults({ molecularWeight: e.target.value })}
                        disabled={!labResults.includeMolecularWeight}
                        className="input-field disabled:opacity-50"
                        placeholder="e.g. 1419.5"
                      />
                    </div>
                  </div>
                  {labResults.blendPeptides.length > 0 && (
                    <div className="rounded-lg border border-brand-200 bg-white p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-black">Blend components</p>
                          <p className="text-xs text-neutral-500">
                            Each ordered peptide appears on the COA. Enter tested net content only — purity is total above.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => updateResults({
                            blendPeptides: [...labResults.blendPeptides, { name: '', claimMg: '', netContent: '' }],
                          })}
                          className="text-xs text-brand-700 font-medium inline-flex items-center gap-1"
                        >
                          <Plus size={13} /> Add peptide
                        </button>
                      </div>
                      <div className="space-y-2">
                        {labResults.blendPeptides.map((row, i) => (
                          <div key={i} className="grid grid-cols-12 gap-2 items-end">
                            <div className="col-span-4">
                              <label className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Peptide</label>
                              <input
                                value={row.name}
                                onChange={e => updateResults({
                                  blendPeptides: labResults.blendPeptides.map((r, idx) => (
                                    idx === i ? { ...r, name: e.target.value } : r
                                  )),
                                })}
                                className="input-field py-1.5 text-sm mt-0.5"
                                placeholder="Peptide name"
                              />
                            </div>
                            <div className="col-span-3">
                              <label className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Claim (mg)</label>
                              <input
                                value={row.claimMg}
                                onChange={e => updateResults({
                                  blendPeptides: labResults.blendPeptides.map((r, idx) => (
                                    idx === i ? { ...r, claimMg: e.target.value } : r
                                  )),
                                })}
                                className="input-field py-1.5 text-sm mt-0.5"
                                placeholder="Label claim"
                              />
                            </div>
                            <div className="col-span-3">
                              <label className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Net content tested</label>
                              <input
                                value={row.netContent}
                                onChange={e => updateResults({
                                  blendPeptides: labResults.blendPeptides.map((r, idx) => (
                                    idx === i ? { ...r, netContent: e.target.value } : r
                                  )),
                                })}
                                className="input-field py-1.5 text-sm mt-0.5"
                                placeholder="Measured mg"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => updateResults({
                                blendPeptides: labResults.blendPeptides.filter((_, idx) => idx !== i),
                              })}
                              className="col-span-2 text-neutral-400 hover:text-red-600 flex justify-center pb-2"
                              title="Remove peptide"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="grid sm:grid-cols-2 gap-4">
                    {labResults.includeSterility && (
                      <>
                    <div>
                      <label className="label">Sterility method</label>
                      <select
                        value={labResults.sterilityMethod}
                        onChange={e => {
                          const next = e.target.value as LabCoaResults['sterilityMethod'];
                          const intake = form.receivedDate.trim()
                            || isoToLocalDateInput(sampleIntakeAt(linkedSample))
                            || localDateInputValue();
                          updateResults({
                            sterilityMethod: next,
                            sterilityProjectedCompletion:
                              next === 'culture_14_day'
                                ? defaultCultureProjectedCompletion(intake)
                                : '',
                          });
                        }}
                        className="input-field"
                      >
                        <option value="pcr">{STERILITY_METHOD_LABELS.pcr}</option>
                        <option value="culture_14_day">{STERILITY_METHOD_LABELS.culture_14_day}</option>
                      </select>
                      <p className="text-xs text-neutral-500 mt-1">
                        Shown on COA as Sterility ({STERILITY_METHOD_LABELS[labResults.sterilityMethod]}) · Spec: Not Detected
                      </p>
                    </div>
                    <div>
                      <label className="label">Sterility result</label>
                      <select
                        value={assayPassSelectValue(labResults.sterilityPass)}
                        onChange={e => updateResults({ sterilityPass: assayPassFromSelect(e.target.value) })}
                        className="input-field"
                      >
                        <option value="pending">Pending</option>
                        <option value="pass">Not Detected — PASS</option>
                        <option value="fail">Detected — FAIL</option>
                      </select>
                    </div>
                    {labResults.sterilityMethod === 'culture_14_day' && labResults.sterilityPass === null && (
                      <div className="sm:col-span-2">
                        <label className="label" htmlFor="sterility-projected">
                          Projected completion date
                          <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                            14-day culture
                          </span>
                        </label>
                        <input
                          id="sterility-projected"
                          type="date"
                          value={labResults.sterilityProjectedCompletion}
                          onChange={e => updateResults({ sterilityProjectedCompletion: e.target.value })}
                          className="input-field max-w-xs"
                        />
                        <p className="text-xs text-neutral-500 mt-1">
                          Defaults to 14 days after sample intake
                          {form.receivedDate.trim() ? ` (${form.receivedDate}).` : '.'}
                          {' '}Shown on the COA while sterility is Pending.
                        </p>
                      </div>
                    )}
                      </>
                    )}
                    {labResults.includeEndotoxin && (
                      <>
                        <div>
                          <label className="label">Endotoxin (LAL) — EU/mL</label>
                          <input
                            type="text"
                            value={labResults.endotoxinEuMl}
                            onChange={e => updateResults({ endotoxinEuMl: e.target.value })}
                            disabled={labResults.endotoxinPass === null}
                            className="input-field disabled:opacity-50"
                            placeholder={labResults.endotoxinPass === null ? 'Pending' : ENDOTOXIN_PASS_RESULT}
                          />
                          <p className="text-xs text-neutral-500 mt-1">Spec: {ENDOTOXIN_SPEC_EU_ML}</p>
                        </div>
                        <div>
                          <label className="label">Endotoxin (LAL) conformity</label>
                          <select
                            value={assayPassSelectValue(labResults.endotoxinPass)}
                            onChange={e => {
                              const next = assayPassFromSelect(e.target.value);
                              updateResults({
                                endotoxinPass: next,
                                ...(next === true ? { endotoxinEuMl: ENDOTOXIN_PASS_RESULT } : {}),
                                ...(next === null ? { endotoxinEuMl: '' } : {}),
                              });
                            }}
                            className="input-field"
                          >
                            <option value="pending">Pending</option>
                            <option value="pass">PASS</option>
                            <option value="fail">FAIL</option>
                          </select>
                        </div>
                      </>
                    )}
                    {labResults.includeFentanyl && (
                      <div>
                        <label className="label">Fentanyl Detection</label>
                        <select value={labResults.fentanylPass ? 'none_detected' : 'detected'} onChange={e => updateResults({ fentanylPass: e.target.value === 'none_detected' })} className="input-field">
                          <option value="none_detected">Not Detected — PASS</option>
                          <option value="detected">Detected — FAIL</option>
                        </select>
                      </div>
                    )}
                  </div>
                  {labResults.includeHeavyMetals && (
                  <div>
                    <div className="grid sm:grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="label">Heavy Metals</label>
                        <p className="text-xs text-neutral-500 mt-1">USP {'<232>'} limits apply per metal</p>
                      </div>
                      <div>
                        <label className="label">Heavy metals conformity</label>
                        <select
                          value={assayPassSelectValue(labResults.heavyMetalsPass)}
                          onChange={e => {
                            const next = assayPassFromSelect(e.target.value);
                            updateResults({
                              heavyMetalsPass: next,
                              ...(next === true ? { heavyMetals: heavyMetalsPassDefaults() } : {}),
                              ...(next === null ? { heavyMetals: heavyMetalsEmptyDefaults() } : {}),
                            });
                          }}
                          className="input-field"
                        >
                          <option value="pending">Pending</option>
                          <option value="pass">PASS — Not Detected</option>
                          <option value="fail">FAIL — enter measured values</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {HEAVY_METAL_NAMES.map(metal => (
                        <div key={metal}>
                          <label className="text-xs text-neutral-500 mb-1 block">{metal}</label>
                          <input
                            type="text"
                            value={labResults.heavyMetals[metal]}
                            onChange={e => updateHeavyMetal(metal, e.target.value)}
                            disabled={labResults.heavyMetalsPass === null}
                            className="input-field py-1.5 text-sm disabled:opacity-50"
                            placeholder={labResults.heavyMetalsPass === null ? 'Pending' : HEAVY_METAL_PASS_RESULT}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  )}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="label mb-0">Conformity (additional measured vials)</label>
                      <button type="button" onClick={addConformityPeptide} className="text-xs text-brand-700 font-medium inline-flex items-center gap-1">
                        <Plus size={13} />
                        {labResults.blendPeptides.length > 0 ? 'Add vial' : 'Add peptide'}
                      </button>
                    </div>
                    {labResults.conformityPeptides.length === 0 ? (
                      <p className="text-xs text-neutral-500">
                        {labResults.blendPeptides.length > 0
                          ? 'Optional. Add a vial to enter another set of per-peptide net content (names auto-fill from the blend). Total purity stays above.'
                          : 'Optional. Add a row only for each extra vial or peptide measured. Average net content uses tested values only — never the label claim.'}
                      </p>
                    ) : labResults.blendPeptides.length > 0 ? (
                      <div className="space-y-3">
                        {(() => {
                          // Group: Total row opens a vial, followed by blend peptide rows.
                          const groups: { totalIdx: number | null; peptideIdxs: number[] }[] = [];
                          let current: { totalIdx: number | null; peptideIdxs: number[] } | null = null;
                          labResults.conformityPeptides.forEach((row, i) => {
                            if (isBlendTotalConformityRow(row.name)) {
                              current = { totalIdx: i, peptideIdxs: [] };
                              groups.push(current);
                              return;
                            }
                            if (!current) {
                              current = { totalIdx: null, peptideIdxs: [] };
                              groups.push(current);
                            }
                            current.peptideIdxs.push(i);
                          });
                          return groups.map((group, gIdx) => (
                            <div key={gIdx} className="rounded-lg border border-atlas-border bg-white p-3 space-y-2">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">
                                Conformity vial {gIdx + 2}
                              </p>
                              {group.totalIdx != null && (
                                <div className="grid grid-cols-12 gap-2 items-end">
                                  <div className="col-span-4">
                                    <label className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Total</label>
                                    <input
                                      value={labResults.conformityPeptides[group.totalIdx].name}
                                      onChange={e => updateConformityPeptide(group.totalIdx!, { name: e.target.value })}
                                      className="input-field py-1.5 text-sm mt-0.5"
                                    />
                                  </div>
                                  <div className="col-span-3">
                                    <label className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Total content</label>
                                    <input
                                      value={labResults.conformityPeptides[group.totalIdx].netContent}
                                      onChange={e => updateConformityPeptide(group.totalIdx!, { netContent: e.target.value })}
                                      className="input-field py-1.5 text-sm mt-0.5"
                                      placeholder="Measured mg"
                                    />
                                  </div>
                                  <div className="col-span-3">
                                    <label className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Total purity %</label>
                                    <input
                                      type="number"
                                      step="0.01"
                                      min={0}
                                      max={MAX_PURITY_PERCENT}
                                      value={labResults.conformityPeptides[group.totalIdx].netPurity}
                                      onChange={e => updateConformityPeptide(group.totalIdx!, { netPurity: e.target.value })}
                                      className="input-field py-1.5 text-sm mt-0.5"
                                      placeholder="e.g. 99.2"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const remove = new Set([group.totalIdx!, ...group.peptideIdxs]);
                                      setLabResults(prev => ({
                                        ...prev,
                                        conformityPeptides: prev.conformityPeptides.filter((_, i) => !remove.has(i)),
                                      }));
                                    }}
                                    className="col-span-2 text-neutral-400 hover:text-red-600 flex justify-center pb-2"
                                    title="Remove vial"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </div>
                              )}
                              {group.peptideIdxs.map(i => {
                                const row = labResults.conformityPeptides[i];
                                const claim = labResults.blendPeptides.find(
                                  p => p.name.trim().toLowerCase() === row.name.trim().toLowerCase(),
                                )?.claimMg || '';
                                return (
                                  <div key={i} className="grid grid-cols-12 gap-2 items-end">
                                    <div className="col-span-4">
                                      <label className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Peptide</label>
                                      <input
                                        value={row.name}
                                        onChange={e => updateConformityPeptide(i, { name: e.target.value })}
                                        className="input-field py-1.5 text-sm mt-0.5"
                                        placeholder="Peptide name"
                                      />
                                    </div>
                                    <div className="col-span-3">
                                      <label className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Claim (mg)</label>
                                      <input
                                        value={claim}
                                        readOnly
                                        className="input-field py-1.5 text-sm mt-0.5 bg-neutral-50 text-neutral-600"
                                        placeholder="—"
                                      />
                                    </div>
                                    <div className="col-span-3">
                                      <label className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Net content tested</label>
                                      <input
                                        value={row.netContent}
                                        onChange={e => updateConformityPeptide(i, { netContent: e.target.value })}
                                        className="input-field py-1.5 text-sm mt-0.5"
                                        placeholder="Measured mg"
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => removeConformityPeptide(i)}
                                      className="col-span-2 text-neutral-400 hover:text-red-600 flex justify-center pb-2"
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          ));
                        })()}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {labResults.conformityPeptides.map((row, i) => (
                          <div key={i} className="grid grid-cols-12 gap-2 items-center">
                            <input value={row.name} onChange={e => updateConformityPeptide(i, { name: e.target.value })} className="input-field col-span-4 py-1.5 text-sm" placeholder="Peptide" />
                            <input value={row.netContent} onChange={e => updateConformityPeptide(i, { netContent: e.target.value })} className="input-field col-span-3 py-1.5 text-sm" placeholder="Net content" />
                            <input
                              type="number"
                              step="0.01"
                              min={0}
                              max={MAX_PURITY_PERCENT}
                              value={row.netPurity}
                              onChange={e => updateConformityPeptide(i, { netPurity: e.target.value })}
                              className="input-field col-span-3 py-1.5 text-sm"
                              placeholder="Net purity %"
                            />
                            <button type="button" onClick={() => removeConformityPeptide(i)} className="col-span-2 text-neutral-400 hover:text-red-600 flex justify-center"><Trash2 size={15} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="label mb-2 block">Vial photo</label>
                  <p className="text-xs text-neutral-500 mb-2">
                    Chemist upload. Empty background is auto-cropped. Header logo comes from the client profile above.
                  </p>
                  <LogoDropzone
                    value={vialImage}
                    onChange={setVialImage}
                    onError={text => setMsg({ type: 'error', text })}
                    maxBytes={MAX_COA_IMAGE_BYTES}
                    prompt="a vial photo"
                    hint="JPG or PNG of the physical vial, up to 2 MB"
                  />
                </div>
                <div>
                  <label className="label mb-2 block">Chromatograph photo</label>
                  <p className="text-xs text-neutral-500 mb-2">
                    Unique HPLC / chromatograph image for this sample. Client watermark logo is applied automatically when enabled above.
                  </p>
                  <LogoDropzone
                    value={chromatographImage}
                    onChange={setChromatographImage}
                    onError={text => setMsg({ type: 'error', text })}
                    maxBytes={MAX_COA_IMAGE_BYTES}
                    prompt="a chromatograph"
                    hint="JPG or PNG of this run’s chromatograph, up to 2 MB"
                  />
                  {applyWatermark && selectedCompany?.chromatograph_background && (
                    <p className="text-[11px] text-brand-800 mt-2">
                      Watermark will be overlaid from {selectedCompany.name || 'this COA profile'}.
                    </p>
                  )}
                  {applyWatermark && !selectedCompany?.chromatograph_background && (
                    <p className="text-[11px] text-amber-800 mt-2">
                      No watermark on this profile — upload one on the client COA profile, or Atlas logo is used as fallback on the PDF.
                    </p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <label className="label mb-2 block">Raw chromatogram data</label>
                  <p className="text-xs text-neutral-500 mb-2">
                    Optional CSV/TSV from the HPLC (retention time + intensity). When attached, the digital COA plots this measured trace instead of the demo curve.
                  </p>
                  <ChromatogramDataDropzone
                    parsed={chromatogramParsed}
                    onParsed={setChromatogramParsed}
                    onError={text => setMsg({ type: 'error', text })}
                  />
                  {chromatogramParsed && (
                    <div className="mt-3 max-w-xl">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                        Measured chromatogram preview
                      </p>
                      <InteractiveChromatogram
                        data={{
                          points: chromatogramParsed.points,
                          retention_time: chromatogramParsed.retention_time,
                          source: 'measured',
                          source_filename: chromatogramParsed.source_filename,
                          point_count: chromatogramParsed.original_count,
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
              <button type="submit" disabled={saving} className="btn-primary w-full gap-2">
                <CheckCircle size={16} /> {
                  (() => {
                    const editing = editingCoaId ? coas.find(c => c.id === editingCoaId) : undefined;
                    const live = !!editing && (
                      coaWorkflowStage(editing) === 'published'
                      || coaWorkflowStage(editing) === 'verified'
                      || !!editing.is_public
                    );
                    if (saving) return editingCoaId ? (live ? 'Saving…' : 'Re-issuing…') : 'Issuing…';
                    if (!editingCoaId) return 'Issue COA (Private)';
                    return live ? 'Save COA (keep live)' : 'Re-issue COA (Private)';
                  })()
                }
              </button>
            </form>
            <div className="space-y-4">
              <div className="card p-4">
                <p className="mb-3 text-sm font-bold text-black">Live digital COA</p>
                <p className="mb-3 text-xs text-neutral-500">
                  Same card the client will see — updates as you enter results.
                </p>
                <div className="mx-auto max-w-[300px]">
                  <AtlasDigitalCoaCard
                    samples={[issuePreviewSample]}
                    companyName={form.companyName || linkedOrder?.company_name || ''}
                    stage="tracking"
                    trackingStage={issueTrackingStage}
                    accession={form.accessionNumber.trim() || linkedSample?.accession_number || null}
                    readinessPercent={
                      labResults.netPurity.trim() && labResults.netContent.trim() && labResults.identification.trim()
                        ? 100
                        : 55
                    }
                    overallResult={form.overallResult}
                    assayResults={issueAssayResults}
                    assayStatuses={issueAssayStatuses}
                  />
                </div>
              </div>

              <div className="card overflow-hidden h-fit">
                <div className="px-5 py-3 border-b border-atlas-border flex items-center gap-2">
                  <ClipboardList size={15} className="text-brand-500" />
                  <h3 className="font-bold text-sm">Quick load — pending samples</h3>
                </div>
                <div className="divide-y divide-atlas-border max-h-[320px] overflow-y-auto">
                  {pendingSamples.length === 0 ? (
                    <p className="p-5 text-sm text-neutral-500">All samples have COAs.</p>
                  ) : pendingSamples.slice(0, 20).map(s => {
                    const order = orders.find(o => o.id === s.order_id);
                    const brand = parseSampleMetadata(s.metadata).brand_names?.[0] || order?.company_name;
                    return (
                    <button key={s.id} type="button" onClick={() => prefillFromSample(s)} className="w-full text-left px-5 py-3 hover:bg-neutral-50">
                      <p className="font-medium text-sm">{s.display_name || s.sample_name}</p>
                      <p className="text-xs text-neutral-500">
                        {brand || clientLabel(s.user_id)}
                        {order?.order_number ? ` · ${order.order_number}` : ''}
                      </p>
                    </button>
                    );
                  })}
                </div>
              </div>

              {form.orderId && (
                <>
                  {linkedOrder && (
                    <OrderEtaEditor
                      compact
                      estimatedReadyAt={linkedOrder.estimated_ready_at}
                      dueAt={linkedOrder.due_at}
                      onSave={async (iso) => {
                        const { error } = await supabase
                          .from('orders')
                          .update({
                            estimated_ready_at: iso,
                            due_at: iso ?? linkedOrder.due_at ?? null,
                            updated_at: new Date().toISOString(),
                          })
                          .eq('id', linkedOrder.id);
                        if (error) {
                          setMsg({ type: 'error', text: error.message });
                          return;
                        }
                        setOrders(prev => prev.map(o => (
                          o.id === linkedOrder.id
                            ? { ...o, estimated_ready_at: iso, due_at: iso ?? o.due_at }
                            : o
                        )));
                        if (iso) {
                          await notifyOrderEtaUpdated(
                            linkedOrder.user_id,
                            linkedOrder.order_number,
                            formatDate(iso),
                          );
                        }
                        setMsg({
                          type: 'success',
                          text: iso ? `ETA set to ${formatDate(iso)}.` : 'ETA cleared.',
                        });
                      }}
                    />
                  )}
                  <OrderNotesThread
                    orderId={form.orderId}
                    sampleId={form.sampleId || null}
                    compact
                    allowActions
                  />
                  <OrderActionChecklist
                    orderId={form.orderId}
                    compact
                    onOpenCountChange={onIssueOpenActionsChange}
                  />
                  {issueOpenActions > 0 && (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      {issueOpenActions} open checklist action{issueOpenActions === 1 ? '' : 's'}.
                      Clear them when you can — or confirm override when publishing.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {tab === 'workflow' && (
          <div className="space-y-4">
            <p className="text-sm text-neutral-600">
              Testing → Issued → Pending Review (assign lab director/chemist, signatures 1/2) → Verified (2/2) → Published.
              Open ETA / Notes on any card to update the client-visible ready date or leave staff/client notes.
              Use Back to testing to rework an issued COA, then Restart COA to edit results and re-issue.
              Cards marked Assigned to you are yours to work or sign off. Use Publish now to override checklist or incomplete review when needed.
            </p>
            <CompanyFilterSearch
              value={workflowCompanyFilter}
              onChange={setWorkflowCompanyFilter}
              companies={workflowCompanyOptions}
            />
            <CoaWorkflowBoard
              coas={filteredWorkflowCoas}
              onMoveCoa={moveCoaToStage}
              movingId={movingCoaId}
              onCoaImagesSaved={updated => {
                setCoas(prev => prev.map(c => (c.id === updated.id ? hydrateCoaImages(updated) : c)));
              }}
              pendingSamples={filteredPendingQueueItems}
              onIssueCoa={prefillFromSample}
              onRestartCoa={restartCoa}
              onSaveOrderEta={saveOrderEta}
              etaSavingOrderId={etaSavingOrderId}
              chemists={chemistOptions}
              reviewers={reviewerOptions}
              clients={allProfiles}
              orders={orders}
              samples={samples}
              currentUserId={user?.id}
              isAdmin={isAdmin}
            />
          </div>
        )}
      </main>

      {prepCoa && (
        <CoaPdfPrepModal
          coa={prepCoa}
          sampleMetadata={
            prepCoa.sample_id
              ? (samples.find(s => s.id === prepCoa.sample_id)?.metadata ?? null)
              : null
          }
          onClose={() => setPrepCoa(null)}
          onSaved={updated => {
            setCoas(prev => prev.map(c => (c.id === updated.id ? hydrateCoaImages(updated) : c)));
          }}
        />
      )}

      {briefOrderId && (
        <ChemistOrderBriefDrawer
          orderId={briefOrderId}
          onClose={() => setBriefOrderId(null)}
          onOrderUpdated={updated => {
            setOrders(prev => prev.map(o => (o.id === updated.id ? { ...o, ...updated } : o)));
          }}
        />
      )}
    </div>
  );
}
