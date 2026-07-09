import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FlaskConical, Plus, Trash2, CheckCircle, AlertCircle, ClipboardList,
  ArrowRight, RefreshCw,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { COA, LabPriority, Order, OrderSample, SampleStatus, UserProfile } from '../lib/types';
import { SAMPLE_STATUS_LABELS } from '../lib/utils';
import { computeCoaContentHash } from '../lib/coaVerify';
import { notifyCoaReady } from '../lib/notifications';
import { matchCoaForSample, clientSubmittedLabel, parseSampleMetadata } from '../lib/coaPanels';
import {
  EMPTY_LAB_RESULTS, LabCoaResults, VIAL_SIZE_OPTIONS, VialSizeOption,
  HEAVY_METAL_NAMES, buildLabResultsFromSample, labResultsToPanelResults,
  parsePurityPercent, parseMolecularWeight, lookupCas, casForSampleName,
} from '../lib/labCoaForm';
import { COA_WORKFLOW_LABELS, coaWorkflowStage, buildWorkflowStagePatch, CoaWorkflowStage } from '../lib/coaWorkflow';
import CoaWorkflowBoard from '../components/lab/CoaWorkflowBoard';
import CompanyFilterSearch from '../components/lab/CompanyFilterSearch';
import TestingQueuePanel from '../components/lab/TestingQueuePanel';
import QueueFilters, { QueueFilterValues } from '../components/lab/QueueFilters';
import { buildQueueItems, filterQueueItems, normalizeLabPriority } from '../lib/labQueue';
import StaffHeader from '../components/layout/StaffHeader';
import { useAuth } from '../context/AuthContext';

type Message = { type: 'success' | 'error'; text: string; slug?: string } | null;
type LabTab = 'queue' | 'issue' | 'workflow';

const BLANK = {
  clientId: '', sampleId: '', orderId: '',
  sampleName: '', displayName: '', companyName: '',
  batchNumber: '', casNumber: '', vialSize: '3ml' as VialSizeOption,
  overallResult: 'pass' as COA['overall_result'],
};


const SAMPLE_STATUSES: SampleStatus[] = ['received', 'analyzing', 'in_review', 'complete'];

const QUEUE_FILTERS_BLANK: QueueFilterValues = {
  company: '', priority: 'all', assignment: 'all', search: '',
};

export default function Lab() {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [tab, setTab] = useState<LabTab>('queue');
  const [clients, setClients] = useState<UserProfile[]>([]);
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
  const [casSuggestions, setCasSuggestions] = useState<{ name: string; cas: string }[]>([]);
  const [showCasSuggestions, setShowCasSuggestions] = useState(false);

  async function loadAll() {
    setLoading(true);
    const [p, s, o, c] = await Promise.all([
      supabase.from('user_profiles').select('*'),
      supabase.from('order_samples').select('*').order('created_at', { ascending: false }),
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('coas').select('*').order('issued_at', { ascending: false }),
    ]);
    if (p.data) {
      setClients(p.data.filter(u => (u.role ?? 'client') === 'client'));
      setChemists(p.data.filter(u => u.role === 'chemist' || u.role === 'admin'));
    }
    if (s.data) setSamples(s.data);
    if (o.data) setOrders(o.data);
    if (c.data) setCoas(c.data);
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

  const pendingSamples = useMemo(
    () => samples.filter(s => !matchCoaForSample(s, coas)),
    [samples, coas],
  );

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
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [coas]);

  const filteredWorkflowCoas = useMemo(() => {
    const q = workflowCompanyFilter.trim().toLowerCase();
    if (!q) return coas;
    return coas.filter(c => (c.company_name ?? '').toLowerCase().includes(q));
  }, [coas, workflowCompanyFilter]);

  const pendingQueueCount = useMemo(
    () => buildQueueItems(
      samples,
      orders.map(o => ({ ...o, lab_priority: normalizeLabPriority(o.lab_priority) })),
      coas,
      true,
    ).length,
    [samples, orders, coas],
  );

  const queueItems = useMemo(
    () => buildQueueItems(
      samples,
      orders.map(o => ({ ...o, lab_priority: normalizeLabPriority(o.lab_priority) })),
      coas,
      queueView === 'pending',
    ),
    [samples, orders, coas, queueView],
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
    setForm({
      ...BLANK,
      clientId: s.user_id,
      sampleId: s.id,
      orderId: s.order_id ?? '',
      sampleName: s.sample_name,
      displayName: s.display_name || s.sample_name,
      companyName: order?.company_name || client?.company_name || '',
      batchNumber: meta.batch_number ?? '',
      casNumber: cas,
      vialSize: (VIAL_SIZE_OPTIONS.includes(meta.vial_size as VialSizeOption) ? meta.vial_size : '3ml') as VialSizeOption,
    });
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
    return supabase.from('coas').insert(payload).select('slug, display_name, sample_name, user_id').single();
  }

  async function issueCoaForBrand(
    base: Record<string, unknown>,
    brandName: string,
    clientId: string,
    sampleName: string,
  ) {
    const brandPayload = { ...base, company_name: brandName, sample_id: null };
    await insertCoa(brandPayload);
  }

  async function updateSampleStatus(sampleId: string, status: SampleStatus) {
    const { error } = await supabase.from('order_samples').update({ status }).eq('id', sampleId);
    if (error) { setMsg({ type: 'error', text: error.message }); return; }
    setSamples(prev => prev.map(s => s.id === sampleId ? { ...s, status } : s));
  }

  async function assignSample(sampleId: string, userId: string | null) {
    const assigned_at = userId ? new Date().toISOString() : null;
    setSamples(prev => prev.map(s => s.id === sampleId ? { ...s, assigned_to: userId, assigned_at } : s));
    const { error } = await supabase.from('order_samples').update({ assigned_to: userId, assigned_at }).eq('id', sampleId);
    if (error) {
      setMsg({ type: 'error', text: error.message });
      loadAll();
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

  async function moveCoaToStage(coa: COA, targetStage: CoaWorkflowStage) {
    if (coaWorkflowStage(coa) === targetStage) return;

    setMovingCoaId(coa.id);
    setMsg(null);

    const patch = buildWorkflowStagePatch(coa, targetStage);
    const { error } = await supabase.from('coas').update(patch).eq('id', coa.id);

    if (error) {
      setMsg({ type: 'error', text: error.message });
      setMovingCoaId(null);
      return;
    }

    if (targetStage === 'published' && !coa.published_at) {
      await notifyCoaReady(coa.user_id, coa.display_name || coa.sample_name, coa.slug);
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

    const cleanPanels = labResultsToPanelResults(labResults);

    const purityNum = parsePurityPercent(labResults.netPurity);
    const mwNum = parseMolecularWeight(labResults.molecularWeight);
    const content_hash = computeCoaContentHash({
      sample_name: form.sampleName.trim(),
      batch_number: form.batchNumber.trim(),
      purity_percent: purityNum,
      panel_results: cleanPanels,
    });

    const payload = {
      user_id: form.clientId,
      sample_id: form.sampleId || null,
      order_id: form.orderId || null,
      sample_name: form.sampleName.trim(),
      display_name: form.displayName.trim() || form.sampleName.trim(),
      company_name: form.companyName.trim(),
      peptide_sequence: form.casNumber.trim(),
      batch_number: form.batchNumber.trim(),
      purity_percent: purityNum,
      molecular_weight: mwNum,
      panel_results: cleanPanels,
      chromatogram_data: { vial_size: form.vialSize },
      overall_result: form.overallResult,
      is_public: false,
      coa_workflow_stage: 'issued',
      content_hash,
      signature: `AA-${Date.now().toString(36).toUpperCase()}`,
    };

    const { data, error } = await insertCoa(payload);

    if (error) {
      setMsg({ type: 'error', text: error.message });
      setSaving(false);
      return;
    }

    const linkedSample = form.sampleId ? samples.find(s => s.id === form.sampleId) : null;
    const brandNames = (linkedSample?.metadata as { brand_names?: string[] } | null)?.brand_names?.filter(Boolean) ?? [];
    for (const brand of brandNames) {
      await issueCoaForBrand({ ...payload, coa_workflow_stage: 'issued' }, brand, form.clientId, form.sampleName.trim());
    }

    if (form.sampleId) {
      await supabase.from('order_samples').update({ status: 'in_review' }).eq('id', form.sampleId);
      const orderId = form.orderId;
      if (orderId) await supabase.from('orders').update({ status: 'in_review' }).eq('id', orderId);
    }

    setForm({ ...BLANK });
    setLabResults({ ...EMPTY_LAB_RESULTS });
    setCasSuggestions([]);
    setShowCasSuggestions(false);
    setMsg({ type: 'success', text: 'COA issued (private). Verify it, then publish for the client.', slug: data?.slug });
    setSaving(false);
    setTab('workflow');
    loadAll();
  }

  const tabs: { id: LabTab; label: string; count?: number }[] = [
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
            Manage testing orders → Issue COA → Verify → Publish public for clients.
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
              {msg.slug && <> <Link to={`/coa/${msg.slug}`} className="font-semibold underline">View COA</Link></>}
            </span>
          </div>
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
                    update({ clientId: e.target.value, companyName: client?.company_name || form.companyName });
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
                  <label className="label">Company Name (on COA)</label>
                  <input value={form.companyName} onChange={e => update({ companyName: e.target.value })} className="input-field" placeholder="Client company" />
                </div>
              </div>
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
                      <label className="label">Molecular Weight (Da)</label>
                      <input type="number" step="0.1" value={labResults.molecularWeight} onChange={e => updateResults({ molecularWeight: e.target.value })} className="input-field" placeholder="e.g. 1419.5" />
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Sterility</label>
                      <select value={labResults.sterilityPass ? 'pass' : 'fail'} onChange={e => updateResults({ sterilityPass: e.target.value === 'pass' })} className="input-field">
                        <option value="pass">Pass</option>
                        <option value="fail">Fail</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Endotoxin (EU/mg)</label>
                      <input type="number" step="0.01" value={labResults.endotoxinEuMg} onChange={e => updateResults({ endotoxinEuMg: e.target.value })} className="input-field" placeholder="e.g. 0.25" />
                    </div>
                    {labResults.includeFentanyl && (
                      <div>
                        <label className="label">Fentanyl Detection</label>
                        <select value={labResults.fentanylPass ? 'pass' : 'fail'} onChange={e => updateResults({ fentanylPass: e.target.value === 'pass' })} className="input-field">
                          <option value="pass">Pass</option>
                          <option value="fail">Fail</option>
                        </select>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="label mb-2">Heavy Metals (ppm)</label>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {HEAVY_METAL_NAMES.map(metal => (
                        <div key={metal}>
                          <label className="text-xs text-neutral-500 mb-1 block">{metal}</label>
                          <input
                            type="number"
                            step="0.001"
                            value={labResults.heavyMetals[metal]}
                            onChange={e => updateHeavyMetal(metal, e.target.value)}
                            className="input-field py-1.5 text-sm"
                            placeholder="ppm"
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
                ) : pendingSamples.slice(0, 20).map(s => (
                  <button key={s.id} type="button" onClick={() => prefillFromSample(s)} className="w-full text-left px-5 py-3 hover:bg-neutral-50">
                    <p className="font-medium text-sm">{s.display_name || s.sample_name}</p>
                    <p className="text-xs text-neutral-500">{clientLabel(s.user_id)}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'workflow' && (
          <div className="space-y-4">
            <CompanyFilterSearch
              value={workflowCompanyFilter}
              onChange={setWorkflowCompanyFilter}
              companies={workflowCompanyOptions}
            />
            <CoaWorkflowBoard
              coas={filteredWorkflowCoas}
              onMoveCoa={moveCoaToStage}
              movingId={movingCoaId}
            />
          </div>
        )}
      </main>
    </div>
  );
}
