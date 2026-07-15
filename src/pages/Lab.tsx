import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FlaskConical, Plus, Trash2, CheckCircle, AlertCircle, ExternalLink, ClipboardList,
  ChevronDown, ChevronUp, ArrowRight, FileText,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { COA, Order, OrderSample, OrderStatus, SampleStatus, UserProfile } from '../lib/types';
import { formatDateTime, ORDER_STATUS_LABELS, SAMPLE_STATUS_LABELS } from '../lib/utils';
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
import StaffHeader from '../components/layout/StaffHeader';
import LogoDropzone from '../components/account/LogoDropzone';
import {
  hydrateCoaImages,
  isMissingCoaImageColumnError,
  payloadWithoutImageColumns,
} from '../lib/coaImages';
import CoaPdfPrepModal from '../components/lab/CoaPdfPrepModal';

const MAX_COA_IMAGE_BYTES = 2 * 1024 * 1024;

type Message = { type: 'success' | 'error'; text: string; slug?: string } | null;
type LabTab = 'queue' | 'issue' | 'workflow';

const BLANK = {
  clientId: '', sampleId: '', orderId: '',
  sampleName: '', displayName: '', companyName: '',
  batchNumber: '', casNumber: '', vialSize: '3ml' as VialSizeOption,
  overallResult: 'pass' as COA['overall_result'],
};

const ORDER_STATUSES: OrderStatus[] = ['received', 'processing', 'analyzing', 'in_review', 'complete', 'cancelled'];
const SAMPLE_STATUSES: SampleStatus[] = ['received', 'analyzing', 'in_review', 'complete'];

export default function Lab() {
  const [tab, setTab] = useState<LabTab>('queue');
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [samples, setSamples] = useState<OrderSample[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [coas, setCoas] = useState<COA[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<Message>(null);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [queueFilter, setQueueFilter] = useState<'all' | 'pending'>('all');

  const [movingCoaId, setMovingCoaId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...BLANK });
  const [labResults, setLabResults] = useState<LabCoaResults>({ ...EMPTY_LAB_RESULTS });
  const [vialImage, setVialImage] = useState('');
  const [chromatogramImage, setChromatogramImage] = useState('');
  const [casSuggestions, setCasSuggestions] = useState<{ name: string; cas: string }[]>([]);
  const [showCasSuggestions, setShowCasSuggestions] = useState(false);
  const [prepCoa, setPrepCoa] = useState<COA | null>(null);

  async function loadAll() {
    setLoading(true);
    const [p, s, o, c] = await Promise.all([
      supabase.from('user_profiles').select('*'),
      supabase.from('order_samples').select('*').order('created_at', { ascending: false }),
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('coas').select('*').order('issued_at', { ascending: false }),
    ]);
    if (p.data) setClients(p.data.filter(u => (u.role ?? 'client') === 'client'));
    if (s.data) setSamples(s.data);
    if (o.data) setOrders(o.data);
    if (c.data) setCoas((c.data as COA[]).map(hydrateCoaImages));
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  const pendingSamples = useMemo(
    () => samples.filter(s => !matchCoaForSample(s, coas)),
    [samples, coas],
  );

  const workflowActiveCount = useMemo(
    () => coas.filter(c => coaWorkflowStage(c) !== 'published').length,
    [coas],
  );

  const filteredOrders = useMemo(() => {
    if (queueFilter !== 'pending') return orders;
    const pendingOrderIds = new Set(pendingSamples.map(s => s.order_id));
    return orders.filter(o => pendingOrderIds.has(o.id));
  }, [orders, pendingSamples, queueFilter]);

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
    const selectCols = 'slug, display_name, sample_name, user_id';
    const first = await supabase.from('coas').insert(payload).select(selectCols).single();
    if (!first.error || !isMissingCoaImageColumnError(first.error.message)) return first;
    return supabase
      .from('coas')
      .insert(payloadWithoutImageColumns(payload))
      .select(selectCols)
      .single();
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

  async function updateOrderStatus(orderId: string, status: OrderStatus) {
    const { error } = await supabase.from('orders').update({ status, updated_at: new Date().toISOString() }).eq('id', orderId);
    if (error) { setMsg({ type: 'error', text: error.message }); return; }
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
  }

  async function updateSampleStatus(sampleId: string, status: SampleStatus) {
    const { error } = await supabase.from('order_samples').update({ status }).eq('id', sampleId);
    if (error) { setMsg({ type: 'error', text: error.message }); return; }
    setSamples(prev => prev.map(s => s.id === sampleId ? { ...s, status } : s));
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
      vial_image: vialImage || '',
      chromatogram_image: chromatogramImage || '',
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
    setVialImage('');
    setChromatogramImage('');
    setCasSuggestions([]);
    setShowCasSuggestions(false);
    setMsg({ type: 'success', text: 'COA issued (private). Verify it, then publish for the client.', slug: data?.slug });
    setSaving(false);
    setTab('workflow');
    loadAll();
  }

  const tabs: { id: LabTab; label: string; count?: number }[] = [
    { id: 'queue', label: 'Testing Queue', count: pendingSamples.length || undefined },
    { id: 'issue', label: 'Issue COA' },
    { id: 'workflow', label: 'COA Workflow', count: workflowActiveCount || undefined },
  ];

  return (
    <div className="min-h-screen bg-neutral-100">
      <StaffHeader title="Lab Console" />
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
              {msg.slug && (
                <>
                  {' '}
                  <button
                    type="button"
                    className="font-semibold underline"
                    onClick={() => {
                      const issued = coas.find(c => c.slug === msg.slug);
                      if (issued) setPrepCoa(issued);
                    }}
                  >
                    View PDF
                  </button>
                  {' · '}
                  <Link to={`/coa/${msg.slug}`} className="font-semibold underline">Web view</Link>
                </>
              )}
            </span>
          </div>
        )}

        {tab === 'queue' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setQueueFilter('all')} className={`px-3 py-1.5 text-sm rounded-md border ${queueFilter === 'all' ? 'bg-black text-white border-black' : 'border-atlas-border'}`}>All orders ({orders.length})</button>
              <button type="button" onClick={() => setQueueFilter('pending')} className={`px-3 py-1.5 text-sm rounded-md border ${queueFilter === 'pending' ? 'bg-black text-white border-black' : 'border-atlas-border'}`}>Awaiting COA ({pendingSamples.length})</button>
            </div>

            {loading ? (
              <div className="card p-8 text-center text-neutral-500">Loading…</div>
            ) : filteredOrders.length === 0 ? (
              <div className="card p-8 text-center text-neutral-500">No orders in this view.</div>
            ) : (
              filteredOrders.map(order => {
                const orderSamples = samples.filter(s => s.order_id === order.id);
                const expanded = expandedOrders.has(order.id);
                return (
                  <div key={order.id} className="card overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedOrders(prev => {
                        const next = new Set(prev);
                        next.has(order.id) ? next.delete(order.id) : next.add(order.id);
                        return next;
                      })}
                      className="w-full text-left p-5 hover:bg-neutral-50 transition-colors"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          {expanded ? <ChevronUp size={18} className="text-neutral-400 mt-0.5" /> : <ChevronDown size={18} className="text-neutral-400 mt-0.5" />}
                          <div>
                            <p className="font-bold text-black">{order.order_number}</p>
                            <p className="text-xs text-neutral-500">{clientLabel(order.user_id)} · {formatDateTime(order.created_at)} · {orderSamples.length} sample{orderSamples.length === 1 ? '' : 's'}</p>
                          </div>
                        </div>
                        <select
                          value={order.status}
                          onClick={e => e.stopPropagation()}
                          onChange={e => updateOrderStatus(order.id, e.target.value as OrderStatus)}
                          className="input-field py-1.5 text-xs w-auto"
                        >
                          {ORDER_STATUSES.map(s => <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>)}
                        </select>
                      </div>
                    </button>
                    {expanded && (
                      <div className="border-t border-atlas-border divide-y divide-atlas-border">
                        {orderSamples.map(s => {
                          const coa = matchCoaForSample(s, coas);
                          const stage = coa ? coaWorkflowStage(coa) : null;
                          return (
                            <div key={s.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-black">{s.display_name || s.sample_name}</p>
                                <p className="text-xs text-neutral-500 capitalize">{s.sample_type} · {s.vial_count} vial{s.vial_count === 1 ? '' : 's'}</p>
                                {coa && (
                                  <p className="text-xs text-brand-700 mt-1">
                                    COA: {COA_WORKFLOW_LABELS[stage!]}
                                    {coa.is_public && ' · Public'}
                                  </p>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <select
                                  value={s.status}
                                  onChange={e => updateSampleStatus(s.id, e.target.value as SampleStatus)}
                                  className="input-field py-1.5 text-xs"
                                >
                                  {SAMPLE_STATUSES.map(st => <option key={st} value={st}>{SAMPLE_STATUS_LABELS[st]}</option>)}
                                </select>
                                {!coa ? (
                                  <button type="button" onClick={() => prefillFromSample(s)} className="btn-primary text-xs py-1.5 gap-1">
                                    Issue COA <ArrowRight size={12} />
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => setPrepCoa(coa)}
                                      className="btn-primary text-xs py-1.5 gap-1"
                                    >
                                      <FileText size={12} /> View PDF
                                    </button>
                                    <Link to={`/coa/${coa.slug}`} className="btn-outline text-xs py-1.5 gap-1"><ExternalLink size={12} /> Web view</Link>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label mb-2 block">Vial photo (COA PDF)</label>
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
                  <label className="label mb-2 block">Chromatogram photo (COA PDF)</label>
                  <LogoDropzone
                    value={chromatogramImage}
                    onChange={setChromatogramImage}
                    onError={text => setMsg({ type: 'error', text })}
                    maxBytes={MAX_COA_IMAGE_BYTES}
                    prompt="a chromatogram"
                    hint="JPG or PNG instrument trace, up to 2 MB"
                  />
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
          <CoaWorkflowBoard
            coas={coas}
            onMoveCoa={moveCoaToStage}
            movingId={movingCoaId}
            onCoaImagesSaved={updated => {
              setCoas(prev => prev.map(c => (c.id === updated.id ? hydrateCoaImages(updated) : c)));
            }}
          />
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
