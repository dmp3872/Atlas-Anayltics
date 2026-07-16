import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FlaskConical, Plus, Trash2, CheckCircle, AlertCircle, ClipboardList,
  RefreshCw,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { COA, Company, LabPriority, Order, OrderSample, SampleStatus, UserProfile } from '../lib/types';
import { computeCoaContentHash } from '../lib/coaVerify';
import { notifyCoaReady, notifyOrderUpdate } from '../lib/notifications';
import { clientSubmittedLabel, matrixTypeFromSampleMetadata, parseSampleMetadata } from '../lib/coaPanels';
import { allocateUniqueSampleCode, isValidSampleCode } from '../lib/sampleCode';
import { fetchUserCompanies } from '../lib/coaProfile';
import {
  EMPTY_LAB_RESULTS, LabCoaResults, VIAL_SIZE_OPTIONS, VialSizeOption,
  HEAVY_METAL_NAMES, buildLabResultsFromSample, labResultsToPanelResults,
  parsePurityPercent, parseMolecularWeight, lookupCas, casForSampleName,
  ENDOTOXIN_SPEC_EU_ML, ENDOTOXIN_PASS_RESULT, STERILITY_METHOD_LABELS,
  HEAVY_METAL_PASS_RESULT, heavyMetalsPassDefaults, computeLabAssayAverages,
} from '../lib/labCoaForm';
import { COA_WORKFLOW_LABELS, canPrepareCoa, coaWorkflowStage, buildWorkflowStagePatch, CoaWorkflowStage } from '../lib/coaWorkflow';
import CoaWorkflowBoard from '../components/lab/CoaWorkflowBoard';
import CompanyFilterSearch from '../components/lab/CompanyFilterSearch';
import TestingQueuePanel from '../components/lab/TestingQueuePanel';
import QueueFilters, { QueueFilterValues } from '../components/lab/QueueFilters';
import { buildQueueItems, filterQueueItems, normalizeLabPriority } from '../lib/labQueue';
import { sampleIntakeAt, sampleReceivedBy, setSampleStatus } from '../lib/services/orderWorkflow';
import { formatDate } from '../lib/utils';
import ReceivingDesk from '../components/lab/ReceivingDesk';
import StaffHeader from '../components/layout/StaffHeader';
import LogoDropzone from '../components/account/LogoDropzone';
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

const MAX_COA_IMAGE_BYTES = 1024 * 1024;

type Message = { type: 'success' | 'error'; text: string; slug?: string } | null;
type LabTab = 'receive' | 'queue' | 'issue' | 'workflow';

const BLANK = {
  clientId: '', sampleId: '', orderId: '',
  sampleName: '', displayName: '', companyName: '',
  batchNumber: '', casNumber: '', vialSize: '3ml' as VialSizeOption,
  overallResult: 'pass' as COA['overall_result'],
};


const QUEUE_FILTERS_BLANK: QueueFilterValues = {
  company: '', priority: 'all', assignment: 'all', search: '',
};

export default function Lab() {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [tab, setTab] = useState<LabTab>('queue');
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [allProfiles, setAllProfiles] = useState<UserProfile[]>([]);
  const [chemists, setChemists] = useState<UserProfile[]>([]);
  const [samples, setSamples] = useState<OrderSample[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [coas, setCoas] = useState<COA[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<Message>(null);
  const [queueView, setQueueView] = useState<'pending' | 'all'>('pending');
  const [queueFilters, setQueueFilters] = useState<QueueFilterValues>({ ...QUEUE_FILTERS_BLANK });

  const [movingCoaId, setMovingCoaId] = useState<string | null>(null);
  const [workflowCompanyFilter, setWorkflowCompanyFilter] = useState('');
  const [form, setForm] = useState({ ...BLANK });
  const [labResults, setLabResults] = useState<LabCoaResults>({ ...EMPTY_LAB_RESULTS });
  const [vialImage, setVialImage] = useState('');
  const [chromatographImage, setChromatographImage] = useState('');
  const [clientCompanies, setClientCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [preferredBrandName, setPreferredBrandName] = useState('');
  const [applyHeaderLogo, setApplyHeaderLogo] = useState(true);
  const [applyWatermark, setApplyWatermark] = useState(true);
  const [casSuggestions, setCasSuggestions] = useState<{ name: string; cas: string }[]>([]);
  const [showCasSuggestions, setShowCasSuggestions] = useState(false);
  const [prepCoa, setPrepCoa] = useState<COA | null>(null);

  const selectedCompany = clientCompanies.find(c => c.id === selectedCompanyId) ?? null;

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
    const cas = casForSampleName(s.sample_name) || meta.peptide_identification?.trim() || '';
    const brandHint = meta.brand_names?.[0] || order?.company_name || client?.company_name || '';
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
    });
    setPreferredBrandName(brandHint);
    setLabResults(buildLabResultsFromSample(s.metadata, s.sample_name));
    setCasSuggestions(cas ? lookupCas(cas) : []);
    setShowCasSuggestions(false);
    setMsg(null);
    setTab('issue');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateResults(patch: Partial<LabCoaResults>) {
    setLabResults(prev => ({ ...prev, ...patch }));
  }

  function updateHeavyMetal(metal: typeof HEAVY_METAL_NAMES[number], value: string) {
    setLabResults(prev => ({
      ...prev,
      heavyMetals: { ...prev.heavyMetals, [metal]: value },
    }));
  }

  function addConformityPeptide() {
    setLabResults(prev => ({
      ...prev,
      conformityPeptides: [...prev.conformityPeptides, { name: '', netContent: '', netPurity: '' }],
    }));
  }

  function updateConformityPeptide(index: number, patch: Partial<{ name: string; netContent: string; netPurity: string }>) {
    setLabResults(prev => ({
      ...prev,
      conformityPeptides: prev.conformityPeptides.map((row, i) => (i === index ? { ...row, ...patch } : row)),
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

  const linkedSample = form.sampleId ? samples.find(s => s.id === form.sampleId) : null;
  const linkedMeta = linkedSample ? parseSampleMetadata(linkedSample.metadata) : null;
  const linkedOrder = form.orderId ? orders.find(o => o.id === form.orderId) : null;
  const linkedClient = form.clientId ? clients.find(c => c.id === form.clientId) : undefined;


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

  async function moveCoaToStage(
    coa: COA,
    targetStage: CoaWorkflowStage,
    opts?: { reviewAssignedTo?: string | null },
  ) {
    if (coaWorkflowStage(coa) === targetStage && targetStage !== 'pending_review') return;

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
    const { error } = await supabase.from('coas').update(patch).eq('id', coa.id);

    if (error) {
      setMsg({ type: 'error', text: error.message });
      setMovingCoaId(null);
      return;
    }

    if (targetStage === 'published' && !coa.published_at) {
      const notifyErr = await notifyCoaReady(coa.user_id, coa.display_name || coa.sample_name, coa.slug);
      if (notifyErr) console.warn('COA ready notify failed:', notifyErr);
      const order = orders.find(o => o.id === coa.order_id);
      if (order) await notifyOrderUpdate(coa.user_id, order.order_number, 'COA published');
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
          return coas.some(c => c.sample_id === s.id && coaWorkflowStage(c) === 'published');
        });
        if (allSamplesDone) {
          await supabase.from('orders').update({ status: 'complete' }).eq('id', coa.order_id);
          setOrders(prev => prev.map(o => o.id === coa.order_id ? { ...o, status: 'complete' } : o));
        }
      }
    }

    setCoas(prev => prev.map(c => (c.id === coa.id ? { ...c, ...patch } as COA : c)));
    setMsg({
      type: 'success',
      text: `Moved to ${COA_WORKFLOW_LABELS[targetStage]}.`,
      slug: coa.slug,
    });
    setMovingCoaId(null);
  }

  async function saveCoa(e: React.FormEvent) {
    e.preventDefault();
    if (!form.clientId) { setMsg({ type: 'error', text: 'Select the client this COA belongs to.' }); return; }
    if (!form.sampleName.trim()) { setMsg({ type: 'error', text: 'Enter a sample name.' }); return; }

    setSaving(true);
    setMsg(null);

    try {
      const cleanPanels = labResultsToPanelResults(labResults);

      const purityNum = parsePurityPercent(labResults.netPurity);
      const includeMw = labResults.includeMolecularWeight && !!labResults.molecularWeight.trim();
      const mwNum = includeMw ? parseMolecularWeight(labResults.molecularWeight) : null;
      const content_hash = computeCoaContentHash({
        sample_name: form.sampleName.trim(),
        batch_number: form.batchNumber.trim(),
        purity_percent: purityNum,
        panel_results: cleanPanels,
      });

      const profile = selectedCompany
        ?? clientCompanies.find(c => c.is_default)
        ?? clientCompanies[0]
        ?? null;

      const headerLogoRaw = applyHeaderLogo ? (profile?.logo || '') : '';
      const watermarkRaw = applyWatermark ? (profile?.chromatograph_background || '') : '';
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
      let matrixType = matrixTypeFromSampleMetadata(linkedMeta);
      if (form.sampleId) {
        const { data: freshSample } = await supabase
          .from('order_samples')
          .select('id, metadata, received_at, status, created_at, accession_number')
          .eq('id', form.sampleId)
          .maybeSingle();
        if (freshSample) {
          intakeSample = freshSample as typeof linkedSample;
          matrixType = matrixTypeFromSampleMetadata(freshSample.metadata) || matrixType;
        }
      }
      const intakeAt = sampleIntakeAt(intakeSample);
      const receivedDate = intakeAt ? formatDate(intakeAt) : '';
      const assayAverages = computeLabAssayAverages(labResults);
      const avgPurityNum = parsePurityPercent(assayAverages.avg_purity);
      const storedPurity = avgPurityNum ?? purityNum;
      // Prefer accession assigned at Receiving; otherwise allocate a new YY-XXXXXX.
      const sampleCreatedAt =
        (intakeSample && 'created_at' in intakeSample && typeof intakeSample.created_at === 'string'
          ? intakeSample.created_at
          : null)
        || linkedSample?.created_at
        || new Date().toISOString();
      const existingAccession = (
        (intakeSample && 'accession_number' in intakeSample
          ? (intakeSample as { accession_number?: string | null }).accession_number
          : null)
        || linkedSample?.accession_number
        || ''
      ).trim().toUpperCase();
      const sampleCode = isValidSampleCode(existingAccession)
        ? existingAccession
        : await allocateUniqueSampleCode(sampleCreatedAt);

      const payload = {
        user_id: form.clientId,
        sample_id: form.sampleId || null,
        order_id: form.orderId || null,
        slug: sampleCode,
        sample_name: form.sampleName.trim(),
        display_name: form.displayName.trim() || form.sampleName.trim(),
        company_name: (form.companyName.trim() || profile?.name || '').trim(),
        company_logo: companyLogo,
        peptide_sequence: form.casNumber.trim(),
        batch_number: form.batchNumber.trim(),
        purity_percent: storedPurity,
        molecular_weight: mwNum,
        panel_results: cleanPanels,
        chromatogram_data: {
          vial_size: form.vialSize,
          ...(matrixType ? { sample_matrix: matrixType } : {}),
        },
        vial_image: vialForSave || '',
        chromatogram_image: watermarkImage,
        hplc_image: hplcImage || '',
        result_summary: {
          include_molecular_weight: includeMw,
          molecular_weight: includeMw ? labResults.molecularWeight.trim() : '',
          sterility_method: labResults.sterilityMethod,
          sterility_pass: labResults.sterilityPass,
          sterility_method_label: STERILITY_METHOD_LABELS[labResults.sterilityMethod],
          sterility_specification: 'Not Detected',
          endotoxin_eu_ml: labResults.endotoxinEuMl.trim(),
          endotoxin_pass: labResults.endotoxinPass,
          // Pre-calculate Prepare COA averages from assay + conformity vials.
          avg_net_peptide_content: assayAverages.avg_net_peptide_content,
          avg_purity: assayAverages.avg_purity,
          mean_of_vials_tested: assayAverages.mean_of_vials_tested,
          vials_tested: assayAverages.mean_of_vials_tested,
          content_values: assayAverages.content_values,
          purity_values: assayAverages.purity_values,
          apply_company_logo: applyHeaderLogo,
          apply_watermark: applyWatermark,
          coa_profile_id: profile?.id ?? null,
          // Auto-filled from lab intake / accession (Receiving Desk).
          received_at: intakeAt || '',
          received_date: receivedDate,
          ...(matrixType ? { matrix_type: matrixType, sample_matrix: matrixType } : {}),
        },
        overall_result: form.overallResult,
        is_public: false,
        coa_workflow_stage: 'issued',
        content_hash,
        signature: `AA-${Date.now().toString(36).toUpperCase()}`,
      };

      const { data, error } = await insertCoa(payload);

      if (error) {
        setMsg({ type: 'error', text: error.message });
        return;
      }

      const sampleRow = form.sampleId ? samples.find(s => s.id === form.sampleId) : null;
      const brandNames = (sampleRow?.metadata as { brand_names?: string[] } | null)?.brand_names?.filter(Boolean) ?? [];
      for (const brand of brandNames) {
        await issueCoaForBrand({ ...payload, coa_workflow_stage: 'issued' }, brand, sampleCreatedAt);
      }

      if (form.sampleId) {
        await supabase.from('order_samples').update({ status: 'in_review' }).eq('id', form.sampleId);
        const orderId = form.orderId;
        if (orderId) await supabase.from('orders').update({ status: 'in_review' }).eq('id', orderId);
      }

      setForm({ ...BLANK });
      setLabResults({ ...EMPTY_LAB_RESULTS });
      setVialImage('');
      setChromatographImage('');
      setApplyHeaderLogo(true);
      setApplyWatermark(true);
      setCasSuggestions([]);
      setShowCasSuggestions(false);
      setMsg({ type: 'success', text: 'COA issued (private). Verify it, then publish for the client.', slug: data?.slug });
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
    { id: 'receive', label: 'Receive', count: receiveCount || undefined },
    { id: 'queue', label: 'Testing Queue', count: pendingQueueCount || undefined },
    { id: 'issue', label: 'Issue COA' },
    { id: 'workflow', label: 'COA Workflow', count: workflowActiveCount || undefined },
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
            Receive samples → Testing queue → Issue COA → Workflow (verify &amp; publish).
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
                <span className="text-amber-700 font-medium">high</span>, then normal. Claim a sample to own it.
                {isAdmin ? (
                  <> Admins set order priority in <Link to="/admin" className="font-semibold text-brand-700 hover:underline">Admin → Orders</Link>.</>
                ) : (
                  <> Lab directors set priority in Admin.</>
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
              onAssign={isAdmin ? assignSample : undefined}
              onSetSamplePriority={isAdmin ? setSamplePriority : undefined}
            />
          </div>
        )}

        {tab === 'issue' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <form onSubmit={saveCoa} className="lg:col-span-2 card p-6 space-y-5">
              <p className="text-xs text-neutral-500 bg-neutral-50 border border-atlas-border rounded-md px-3 py-2">
                Step 1 of 3: Issue creates a <strong>private</strong> COA. After review, verify it in Workflow, then publish for the client.
              </p>

              {form.sampleId && (
                <div className="rounded-lg border border-brand-200 bg-brand-50/60 px-4 py-3 text-sm">
                  <p className="font-semibold text-black">Loaded from client submission</p>
                  <p className="text-neutral-700 mt-1">
                    Submitted by{' '}
                    <strong>{clientSubmittedLabel(linkedClient, linkedOrder?.company_name)}</strong>
                    {linkedMeta?.labeled_content && (
                      <> · Net content claim: <strong>{linkedMeta.labeled_content}</strong></>
                    )}
                    {labResults.includeFentanyl && (
                      <> · <strong>Fentanyl Detection</strong> requested</>
                    )}
                  </p>
                </div>
              )}

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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Sample Code / Accession</label>
                  <input
                    className="input-field bg-neutral-50 font-mono"
                    readOnly
                    value={(linkedSample?.accession_number || '').trim() || 'Assigned at Receiving (YY-XXXXXX)'}
                  />
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Auto-set when received — becomes the COA Sample Code on Issue.
                  </p>
                </div>
                <div>
                  <label className="label">Received by</label>
                  <input
                    className="input-field bg-neutral-50"
                    readOnly
                    value={sampleReceivedBy(linkedSample) || 'Set when sample is received'}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Matrix Type</label>
                  <input
                    className="input-field bg-neutral-50"
                    readOnly
                    value={matrixTypeFromSampleMetadata(linkedMeta) || '—'}
                  />
                  <p className="text-[11px] text-neutral-500 mt-1">
                    From the order sample (Lyophilized, Liquid/Solution, etc.).
                  </p>
                </div>
                <div>
                  <label className="label">Received date (COA)</label>
                  <input
                    className="input-field bg-neutral-50"
                    readOnly
                    value={(() => {
                      const at = sampleIntakeAt(linkedSample);
                      return at ? formatDate(at) : 'Set when sample is accessioned at Receiving';
                    })()}
                  />
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Auto-filled from Receiving Desk intake — not editable here.
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
                    <div>
                      <label className="label">Identification</label>
                      <input value={labResults.identification} onChange={e => updateResults({ identification: e.target.value })} className="input-field" placeholder="Peptide identification" />
                    </div>
                    <div>
                      <label className="label">Net Content</label>
                      <input value={labResults.netContent} onChange={e => updateResults({ netContent: e.target.value })} className="input-field" placeholder="e.g. 5 mg" />
                    </div>
                    <div>
                      <label className="label">Net Purity (%)</label>
                      <input type="number" step="0.1" value={labResults.netPurity} onChange={e => updateResults({ netPurity: e.target.value })} className="input-field" placeholder="e.g. 99.2" />
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
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Sterility method</label>
                      <select
                        value={labResults.sterilityMethod}
                        onChange={e => updateResults({ sterilityMethod: e.target.value as LabCoaResults['sterilityMethod'] })}
                        className="input-field"
                      >
                        <option value="pcr">{STERILITY_METHOD_LABELS.pcr}</option>
                        <option value="culture_14_day">{STERILITY_METHOD_LABELS.culture_14_day}</option>
                      </select>
                      <p className="text-xs text-neutral-500 mt-1">Specification: Not Detected</p>
                    </div>
                    <div>
                      <label className="label">Sterility result</label>
                      <select value={labResults.sterilityPass ? 'pass' : 'fail'} onChange={e => updateResults({ sterilityPass: e.target.value === 'pass' })} className="input-field">
                        <option value="pass">Not Detected — PASS</option>
                        <option value="fail">Detected — FAIL</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Endotoxin (EU/mL)</label>
                      <input
                        type="text"
                        value={labResults.endotoxinEuMl}
                        onChange={e => updateResults({ endotoxinEuMl: e.target.value })}
                        className="input-field"
                        placeholder={ENDOTOXIN_PASS_RESULT}
                      />
                      <p className="text-xs text-neutral-500 mt-1">Spec: {ENDOTOXIN_SPEC_EU_ML}</p>
                    </div>
                    <div>
                      <label className="label">Endotoxin conformity</label>
                      <select
                        value={labResults.endotoxinPass ? 'pass' : 'fail'}
                        onChange={e => {
                          const pass = e.target.value === 'pass';
                          updateResults({
                            endotoxinPass: pass,
                            ...(pass ? { endotoxinEuMl: ENDOTOXIN_PASS_RESULT } : {}),
                          });
                        }}
                        className="input-field"
                      >
                        <option value="pass">PASS</option>
                        <option value="fail">FAIL</option>
                      </select>
                    </div>
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
                  <div>
                    <div className="grid sm:grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="label">Heavy Metals</label>
                        <p className="text-xs text-neutral-500 mt-1">USP {'<232>'} limits apply per metal</p>
                      </div>
                      <div>
                        <label className="label">Heavy metals conformity</label>
                        <select
                          value={labResults.heavyMetalsPass ? 'pass' : 'fail'}
                          onChange={e => {
                            const pass = e.target.value === 'pass';
                            updateResults({
                              heavyMetalsPass: pass,
                              ...(pass ? { heavyMetals: heavyMetalsPassDefaults() } : {}),
                            });
                          }}
                          className="input-field"
                        >
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
                            className="input-field py-1.5 text-sm"
                            placeholder={HEAVY_METAL_PASS_RESULT}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="label mb-0">Conformity (multiple peptides)</label>
                      <button type="button" onClick={addConformityPeptide} className="text-xs text-brand-700 font-medium inline-flex items-center gap-1">
                        <Plus size={13} /> Add peptide
                      </button>
                    </div>
                    {labResults.conformityPeptides.length === 0 ? (
                      <p className="text-xs text-neutral-500">Add rows for sample-to-sample conformity results.</p>
                    ) : (
                      <div className="space-y-2">
                        {labResults.conformityPeptides.map((row, i) => (
                          <div key={i} className="grid grid-cols-12 gap-2 items-center">
                            <input value={row.name} onChange={e => updateConformityPeptide(i, { name: e.target.value })} className="input-field col-span-4 py-1.5 text-sm" placeholder="Peptide" />
                            <input value={row.netContent} onChange={e => updateConformityPeptide(i, { netContent: e.target.value })} className="input-field col-span-3 py-1.5 text-sm" placeholder="Net content" />
                            <input value={row.netPurity} onChange={e => updateConformityPeptide(i, { netPurity: e.target.value })} className="input-field col-span-3 py-1.5 text-sm" placeholder="Net purity %" />
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
              </div>
              <button type="submit" disabled={saving} className="btn-primary w-full gap-2">
                <CheckCircle size={16} /> {saving ? 'Issuing…' : 'Issue COA (Private)'}
              </button>
            </form>
            <div className="card overflow-hidden h-fit">
              <div className="px-5 py-3 border-b border-atlas-border flex items-center gap-2">
                <ClipboardList size={15} className="text-brand-500" />
                <h3 className="font-bold text-sm">Quick load — pending samples</h3>
              </div>
              <div className="divide-y divide-atlas-border max-h-[520px] overflow-y-auto">
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
          </div>
        )}

        {tab === 'workflow' && (
          <div className="space-y-4">
            <p className="text-sm text-neutral-600">
              Testing → Issued → Pending Review (assign lab director/chemist, signatures 1/2) → Verified (2/2) → Published.
              Cards marked Assigned to you are yours to work or sign off.
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
              chemists={chemistOptions}
              reviewers={reviewerOptions}
              clients={allProfiles}
              orders={orders}
              samples={samples}
              currentUserId={user?.id}
            />
          </div>
        )}
      </main>

      {prepCoa && (
        <CoaPdfPrepModal
          coa={prepCoa}
          onClose={() => setPrepCoa(null)}
          onSaved={updated => {
            setCoas(prev => prev.map(c => (c.id === updated.id ? hydrateCoaImages(updated) : c)));
          }}
        />
      )}
    </div>
  );
}
