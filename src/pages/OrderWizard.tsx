import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Plus, Trash2, CheckCircle, Zap,
  Package, Beaker, ShoppingCart, Copy, Minus, AlertCircle, Search,
  ChevronDown, ChevronUp, Pencil, Check, CreditCard, Bitcoin, Truck,
} from 'lucide-react';
import AtlasLogo from '../components/brand/AtlasLogo';
import OrderSummarySidebar from '../components/order/OrderSummarySidebar';
import OrderCoaProfileSection from '../components/order/OrderCoaProfileSection';
import PrepaidShippingLabel from '../components/order/PrepaidShippingLabel';
import BlendComponentsEditor from '../components/order/BlendComponentsEditor';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { DEFAULT_RECENT_PRODUCTS, searchPeptides } from '../data/peptideCatalog';
import {
  WizardSample, createEmptySample, validateStep1, sampleMetadataPayload,
  INDIVIDUAL_TESTS, ATLAS_PRO_PANEL, FULL_QC_PANEL, SAMPLE_MATRICES, CONFORMITY_PRICE,
  MULTI_BRAND_PRICE, RUSH_PRICE_PER_SAMPLE, MAX_BRANDS_PER_SAMPLE,
  orderTotals, sampleChipLabel, sampleVialCount, bundledTestsForMode, isPackageMode,
  packageIncludesConformity, panelVialsRequired, billableBrandCount, TestMode,
  FENTANYL_OPTION_LABEL, defaultBlendComponents, activeBlendComponents, formatBlendLabel,
  normalizeWizardSample,
} from '../lib/orderCatalog';
import { clearOrderDraft, loadOrderDraft, saveOrderDraft } from '../lib/orderDraft';
import { formatCurrency, generateOrderNumber } from '../lib/utils';
import { generateShippingLabelId } from '../lib/shippingLabel';
import { notifyOrderUpdate } from '../lib/notifications';
import { defaultCompany, fetchUserCompanies } from '../lib/coaProfile';
import { Company } from '../lib/types';

const STEPS = [
  { id: 1, label: 'Products', sub: 'Select & configure', icon: Beaker },
  { id: 2, label: 'Options', sub: 'Add-ons & extras', icon: Package },
  { id: 3, label: 'Review', sub: 'Confirm & submit', icon: ShoppingCart },
];

const SUPPORT_EMAIL = 'info@atlas-analytics.com';

export default function OrderWizard() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [samples, setSamples] = useState<WizardSample[]>([createEmptySample()]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [productSearch, setProductSearch] = useState('');
  const [editingPeptideId, setEditingPeptideId] = useState<string | null>(null);

  const [notes, setNotes] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);
  const [shippingCarrier, setShippingCarrier] = useState('');
  const [shippingTracking, setShippingTracking] = useState('');
  const [companyName, setCompanyName] = useState(profile?.company_name ?? '');
  const [cardholderName, setCardholderName] = useState(profile?.full_name ?? '');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'crypto'>('card');
  const [generatePrepaidLabel, setGeneratePrepaidLabel] = useState(true);
  const [paymentAuthorized, setPaymentAuthorized] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [companiesLoading, setCompaniesLoading] = useState(true);

  const [recentProducts, setRecentProducts] = useState<string[]>(DEFAULT_RECENT_PRODUCTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [validationError, setValidationError] = useState('');

  const { subtotal } = orderTotals(samples, companyName);
  const promoDiscount = promoApplied ? subtotal * 0.1 : 0;
  const total = subtotal - promoDiscount;

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Account';
  const userInitial = displayName.charAt(0).toUpperCase();

  const persistDraft = useCallback(() => {
    if (!user) return;
    saveOrderDraft(user.id, {
      step, samples, notes, promoCode, shippingCarrier, shippingTracking,
      companyName, selectedCompanyId, cardholderName, paymentMethod, generatePrepaidLabel, paymentAuthorized,
    });
  }, [user, step, samples, notes, promoCode, shippingCarrier, shippingTracking, companyName, selectedCompanyId, cardholderName, paymentMethod, generatePrepaidLabel, paymentAuthorized]);

  useEffect(() => {
    if (!user) return;
    const draft = loadOrderDraft(user.id);
    if (draft?.samples?.length) {
      setStep(draft.step);
      setSamples(draft.samples.map(normalizeWizardSample));
      setNotes(draft.notes);
      setPromoCode(draft.promoCode);
      setShippingCarrier(draft.shippingCarrier);
      setShippingTracking(draft.shippingTracking);
      setCompanyName(draft.companyName || profile?.company_name || '');
      setSelectedCompanyId(draft.selectedCompanyId || '');
      setCardholderName(draft.cardholderName || profile?.full_name || '');
      setPaymentMethod(draft.paymentMethod ?? 'card');
      setGeneratePrepaidLabel(draft.generatePrepaidLabel ?? true);
      setPaymentAuthorized(draft.paymentAuthorized);
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    setCompaniesLoading(true);
    const draftId = loadOrderDraft(user.id)?.selectedCompanyId;
    fetchUserCompanies(user.id)
      .then(data => {
        setCompanies(data);
        const pick = data.find(c => c.id === draftId) ?? data.find(c => c.id === selectedCompanyId) ?? defaultCompany(data);
        if (pick) {
          setSelectedCompanyId(pick.id);
          setCompanyName(pick.name);
        }
      })
      .catch(() => setCompanies([]))
      .finally(() => setCompaniesLoading(false));
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    supabase.from('order_samples')
      .select('sample_name')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (!data?.length) return;
        const names = [...new Set(data.map(r => r.sample_name).filter(Boolean))];
        setRecentProducts(prev => [...new Set([...names, ...prev])].slice(0, 8));
      });
  }, [user]);

  useEffect(() => {
    if (profile?.company_name && !companyName) setCompanyName(profile.company_name);
    if (profile?.full_name && !cardholderName) setCardholderName(profile.full_name);
  }, [profile, companyName, cardholderName]);

  useEffect(() => {
    const t = setTimeout(persistDraft, 400);
    return () => clearTimeout(t);
  }, [persistDraft]);

  const catalogResults = useMemo(() => searchPeptides(productSearch), [productSearch]);
  const previewLabelId = useMemo(() => generateShippingLabelId('AA-PREVIEW'), []);

  if (!user) return <Navigate to="/auth" replace />;

  function addBrandFromCompany(sampleId: string, name: string) {
    const sample = samples.find(s => s.id === sampleId);
    if (!sample || !name.trim()) return;
    const existing = sample.brand_names.filter(Boolean);
    if (existing.includes(name.trim()) || existing.length >= MAX_BRANDS_PER_SAMPLE) return;
    updateSample(sampleId, { brand_names: [...existing, name.trim()] });
  }

  function updateSample(id: string, updates: Partial<WizardSample>) {
    setSamples(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    setValidationError('');
  }

  function addSample() {
    const s = createEmptySample();
    setSamples(prev => [...prev, s]);
    setCollapsed(prev => ({ ...prev, [s.id]: false }));
  }

  function duplicateSample(id: string) {
    const src = samples.find(x => x.id === id);
    if (!src) return;
    const { id: _omit, batch_number: _batch, ...rest } = src;
    const copy = createEmptySample({ ...rest, batch_number: '' });
    setSamples(prev => [...prev, copy]);
  }

  function removeSample(id: string) {
    if (samples.length <= 1) return;
    setSamples(prev => prev.filter(s => s.id !== id));
  }

  function selectProduct(id: string, name: string) {
    updateSample(id, {
      sample_name: name,
      display_name: name,
      peptide_identification: name,
      catalog_mode: false,
      is_peptide: true,
    });
    setProductSearch('');
  }

  function toggleIndividualTest(sampleId: string, testId: string) {
    const sample = samples.find(s => s.id === sampleId);
    if (!sample || isPackageMode(sample.test_mode)) return;
    const has = sample.individual_tests.includes(testId);
    updateSample(sampleId, {
      test_mode: 'individual',
      individual_tests: has
        ? sample.individual_tests.filter(t => t !== testId)
        : [...sample.individual_tests, testId],
    });
  }

  function selectTestMode(sampleId: string, mode: TestMode) {
    updateSample(sampleId, {
      test_mode: mode,
      individual_tests: bundledTestsForMode(mode),
      include_fentanyl: mode === 'atlas_pro',
    });
  }

  function syncPrimaryBrandToSamples() {
    const primary = companyName.trim();
    if (!primary) return;
    setSamples(prev => prev.map(s => {
      const names = s.brand_names.filter(Boolean);
      if (names.some(n => n.toLowerCase() === primary.toLowerCase())) return s;
      // Keep the included COA profile brand in metadata; billing/UI filters it from additional brands.
      return { ...s, brand_names: [primary, ...names].slice(0, MAX_BRANDS_PER_SAMPLE) };
    }));
  }

  function addBrandName(sampleId: string) {
    const sample = samples.find(s => s.id === sampleId);
    if (!sample || sample.brand_names.length >= MAX_BRANDS_PER_SAMPLE) return;
    updateSample(sampleId, { brand_names: [...sample.brand_names, ''] });
  }

  function discardDraft() {
    if (!user) return;
    if (!confirm('Discard this draft order?')) return;
    clearOrderDraft(user.id);
    navigate('/dashboard');
  }

  function selectCoaProfile(company: Company) {
    setSelectedCompanyId(company.id);
    setCompanyName(company.name);
    setValidationError('');
  }

  function goNext() {
    if (step === 1) {
      if (!selectedCompanyId || !companies.some(c => c.id === selectedCompanyId)) {
        setValidationError('Create or select a COA profile before continuing.');
        return;
      }
      const err = validateStep1(samples);
      if (err) { setValidationError(err); return; }
      syncPrimaryBrandToSamples();
    }
    setValidationError('');
    setStep(s => s + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function applyPromo() {
    if (promoCode.trim().toUpperCase() === 'ATLAS10') {
      setPromoApplied(true);
      setValidationError('');
    } else {
      setValidationError('Invalid promo code.');
    }
  }

  async function submitOrder() {
    if (!user) return;
    setError('');
    if (!selectedCompanyId || !companies.some(c => c.id === selectedCompanyId)) {
      setValidationError('Select a COA profile before submitting.');
      return;
    }
    const step1Error = validateStep1(samples);
    if (step1Error) {
      setValidationError(step1Error);
      setStep(1);
      return;
    }
    if (!paymentAuthorized) {
      setValidationError('Please authorize payment to submit your order.');
      return;
    }
    setLoading(true);
    try {
      const orderNumber = generateOrderNumber();
      const shippingLabelId = generatePrepaidLabel ? generateShippingLabelId(orderNumber) : '';
      const selectedCoa = companies.find(c => c.id === selectedCompanyId);
      const orderMeta = {
        shipping_carrier: shippingCarrier,
        shipping_tracking: shippingTracking,
        promo_code: promoApplied ? promoCode : null,
        prepaid_label: generatePrepaidLabel,
        coa_profile_id: selectedCompanyId,
        coa_profile_name: selectedCoa?.name ?? companyName,
        samples_detail: samples.map(s => sampleMetadataPayload(s, companyName)),
      };

      const anyRush = samples.some(s => s.rush);
      const orderPayload: Record<string, unknown> = {
        user_id: user.id,
        order_number: orderNumber,
        status: 'awaiting_sample',
        payment_status: 'unpaid',
        rush_processing: anyRush,
        lab_priority: anyRush ? 'high' : 'normal',
        notes: notes ? `${notes}\n\n---\n${JSON.stringify(orderMeta)}` : JSON.stringify(orderMeta),
        subtotal,
        discount_amount: promoDiscount,
        rush_fee: samples.filter(s => s.rush).length * RUSH_PRICE_PER_SAMPLE,
        total,
        first_order_discount: false,
        company_name: selectedCoa?.name ?? companyName,
        prepaid_shipping: generatePrepaidLabel,
        payment_method: paymentMethod,
        shipping_label_id: shippingLabelId,
      };

      let { data: order, error: orderError } = await supabase.from('orders').insert(orderPayload).select().single();
      if (orderError?.message?.includes('payment_method') || orderError?.message?.includes('shipping_label_id')) {
        const { payment_method: _pm, shipping_label_id: _sl, prepaid_shipping: _ps, ...fallback } = orderPayload;
        ({ data: order, error: orderError } = await supabase.from('orders').insert(fallback).select().single());
      }
      if (orderError) throw orderError;

      const sampleRows = samples.map(s => ({
        order_id: order.id,
        user_id: user.id,
        sample_name: s.sample_name,
        display_name: s.display_name || `${s.sample_name} ${s.labeled_content}`.trim(),
        sample_type: s.sample_type,
        vial_count: sampleVialCount(s),
        panel_ids: [],
        status: 'awaiting_sample',
        metadata: sampleMetadataPayload(s, companyName),
      }));

      // Metadata carries test_mode/tests_label — every sample MUST persist it.
      // Never retry without metadata; a sample with no tests on record must
      // fail loudly instead of silently landing in the queue untested.
      const { error: samplesError } = await supabase.from('order_samples').insert(sampleRows);
      if (samplesError) throw samplesError;

      await notifyOrderUpdate(user.id, orderNumber, 'received');
      if (generatePrepaidLabel && shippingLabelId) {
        await notifyOrderUpdate(user.id, orderNumber, `prepaid label ${shippingLabelId} ready`);
      }

      clearOrderDraft(user.id);
      navigate(`/dashboard?tab=orders&label=${encodeURIComponent(shippingLabelId)}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit order.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col">
      <header className="coa-header-bar sticky top-0 z-30 border-b border-neutral-800">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link to="/dashboard"><AtlasLogo variant="light" size="sm" /></Link>
          <div className="absolute left-1/2 -translate-x-1/2 text-center hidden sm:block">
            <p className="font-bold leading-tight">New Testing Order</p>
            <p className="text-[11px] text-neutral-500">Client Portal</p>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 ml-auto">
            <Link to="/dashboard" className="text-sm text-neutral-400 hover:text-white flex items-center gap-1">
              <ArrowLeft size={14} /> <span className="hidden sm:inline">Dashboard</span>
            </Link>
            <div className="flex items-center gap-2 pl-2 border-l border-neutral-700">
              <span className="w-8 h-8 rounded-full bg-brand-500 text-black text-sm font-bold flex items-center justify-center">{userInitial}</span>
              <span className="text-sm font-medium hidden md:inline max-w-[120px] truncate text-neutral-300">{displayName}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-6xl mx-auto w-full px-4 py-6 pb-28">
        {/* Stepper with checkmarks on completed steps */}
        <div className="flex items-center justify-center gap-0 mb-8">
          {STEPS.map((s, i) => {
            const done = step > s.id;
            const active = step === s.id;
            const Icon = done ? Check : s.icon;
            return (
              <div key={s.id} className="flex items-center">
                <div className={`flex flex-col items-center min-w-[80px] sm:min-w-[96px] ${active || done ? 'text-brand-700' : 'text-neutral-400'}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                    done ? 'border-brand-500 bg-brand-500 text-black' :
                    active ? 'border-brand-500 bg-brand-50 text-brand-800' :
                    'border-neutral-300 bg-white'
                  }`}>
                    <Icon size={18} />
                  </div>
                  <span className="text-xs font-semibold mt-1.5">{s.label}</span>
                  <span className="text-[10px] text-neutral-400 hidden sm:block">{s.sub}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-10 sm:w-16 h-0.5 mx-1 mb-5 ${step > s.id ? 'bg-brand-500' : 'bg-neutral-200'}`} />
                )}
              </div>
            );
          })}
        </div>

        {(error || validationError) && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2 text-sm text-red-700">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            {error || validationError}
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">

            {/* ── STEP 1 ── */}
            {step === 1 && (
              <>
                <OrderCoaProfileSection
                  userId={user.id}
                  companies={companies}
                  selectedId={selectedCompanyId || null}
                  onSelect={selectCoaProfile}
                  onCompaniesChange={setCompanies}
                  onProfileSynced={() => refreshProfile()}
                />

                {!companiesLoading && companies.length === 0 && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Create your COA profile above, then add products below.
                  </p>
                )}

                <div>
                  <h2 className="text-xl font-bold text-black">Add Your Products</h2>
                  <p className="text-sm text-neutral-500 mt-1">
                    Select a product from our catalog or enter a custom product, then choose your tests.
                  </p>
                </div>

                {samples.map((sample, idx) => {
                  const isCollapsed = collapsed[sample.id];
                  return (
                    <div key={sample.id} className="card border-brand-200 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 bg-brand-50/60 border-b border-brand-100">
                        <button
                          type="button"
                          onClick={() => setCollapsed(prev => ({ ...prev, [sample.id]: !prev[sample.id] }))}
                          className="flex items-center gap-2 flex-wrap min-w-0 flex-1 text-left hover:opacity-80"
                        >
                          <span className="w-7 h-7 rounded-full bg-brand-500 text-black text-sm font-bold flex items-center justify-center flex-shrink-0">{idx + 1}</span>
                          <span className="font-semibold text-sm sm:text-base truncate">{sampleChipLabel(sample, idx)}</span>
                        </button>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button type="button" onClick={() => duplicateSample(sample.id)} className="p-1.5 hover:bg-white rounded-lg" title="Duplicate sample"><Copy size={14} /></button>
                          {samples.length > 1 && (
                            <button type="button" onClick={() => removeSample(sample.id)} className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg" title="Remove sample"><Trash2 size={14} /></button>
                          )}
                          <button type="button" onClick={() => setCollapsed(prev => ({ ...prev, [sample.id]: !prev[sample.id] }))} className="p-1.5">
                            {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                          </button>
                        </div>
                      </div>

                      {!isCollapsed && (
                        <div className="p-5 space-y-5">
                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">1. Select Product</p>
                              {sample.sample_name && !sample.catalog_mode && (
                                <button onClick={() => updateSample(sample.id, { catalog_mode: true })} className="text-sm text-brand-700 font-medium">Change</button>
                              )}
                            </div>

                            {sample.sample_name && !sample.catalog_mode ? (
                              <div className="border-2 border-brand-500 bg-brand-50 rounded-lg p-3 flex items-center gap-2 mb-4">
                                <CheckCircle size={18} className="text-brand-600 flex-shrink-0" />
                                <span className="font-semibold">{sample.sample_name}</span>
                                {sample.is_peptide && (
                                  <span className="text-sm text-neutral-600">· This is a peptide product</span>
                                )}
                              </div>
                            ) : (
                              <>
                                <div className="relative mb-3">
                                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                                  <input
                                    value={productSearch}
                                    onChange={e => setProductSearch(e.target.value)}
                                    placeholder="Search catalog..."
                                    className="input-field pl-9"
                                  />
                                  {productSearch && catalogResults.length > 0 && (
                                    <div className="absolute z-10 w-full mt-1 border border-atlas-border rounded-lg bg-white shadow-lg max-h-40 overflow-y-auto">
                                      {catalogResults.map(name => (
                                        <button key={name} type="button" onClick={() => selectProduct(sample.id, name)} className="w-full text-left px-3 py-2 text-sm hover:bg-brand-50">{name}</button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-2">Your Recent Products</p>
                                <div className="flex flex-wrap gap-2 mb-4">
                                  {recentProducts.map(p => (
                                    <button
                                      key={p}
                                      type="button"
                                      onClick={() => selectProduct(sample.id, p)}
                                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${sample.sample_name === p ? 'border-brand-500 bg-brand-50 text-brand-800 font-semibold' : 'border-neutral-300 hover:border-brand-400'}`}
                                    >
                                      {p}
                                    </button>
                                  ))}
                                </div>
                              </>
                            )}

                            <div className="grid sm:grid-cols-2 gap-3">
                              <div>
                                <label className="label">Product Name</label>
                                <input value={sample.sample_name} onChange={e => updateSample(sample.id, { sample_name: e.target.value, peptide_identification: sample.peptide_identification || e.target.value })} placeholder="e.g. BPC-157 5mg" className="input-field" />
                              </div>
                              <div>
                                <label className="label">Batch / Lot # *</label>
                                <input value={sample.batch_number} onChange={e => updateSample(sample.id, { batch_number: e.target.value })} placeholder="e.g. LOT-2026-001" className="input-field" />
                              </div>
                              <div>
                                <label className="label">Labeled Content *</label>
                                <input value={sample.labeled_content} onChange={e => updateSample(sample.id, { labeled_content: e.target.value })} placeholder="e.g. 5mg" className="input-field" />
                              </div>
                              <div>
                                <label className="label">Vial Size</label>
                                <input value={sample.vial_size} onChange={e => updateSample(sample.id, { vial_size: e.target.value })} placeholder="e.g. 3mL" className="input-field" />
                              </div>
                              <div>
                                <label className="label">Sample Matrix *</label>
                                <select value={sample.sample_matrix} onChange={e => updateSample(sample.id, { sample_matrix: e.target.value as WizardSample['sample_matrix'] })} className="input-field">
                                  {SAMPLE_MATRICES.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="label">Quantity</label>
                                <input type="number" min={1} max={99} value={sample.quantity} onChange={e => updateSample(sample.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })} className="input-field" placeholder="1" />
                              </div>
                            </div>

                            {sample.is_peptide && (
                              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1">
                                    {sample.sample_type === 'blend' ? (
                                      <>
                                        <p className="text-sm font-semibold text-amber-900">Blend product</p>
                                        <p className="text-xs text-amber-800 mt-1">
                                          Use the product name above (e.g. &quot;Glow Blend&quot;), then list each compound and mg amount below.
                                        </p>
                                        <BlendComponentsEditor
                                          components={sample.blend_components.length ? sample.blend_components : defaultBlendComponents()}
                                          onChange={components => updateSample(sample.id, {
                                            blend_components: components,
                                            blend_compounds: activeBlendComponents(components).length,
                                          })}
                                        />
                                      </>
                                    ) : (
                                      <>
                                        <p className="text-sm font-semibold text-amber-900">Peptide Identification *</p>
                                        <p className="text-xs text-amber-800 mt-1">Enter the actual peptide name (e.g. &quot;Thymosin Beta-4 Acetate&quot;), not the marketing name.</p>
                                        <input
                                          value={sample.peptide_identification}
                                          onChange={e => updateSample(sample.id, { peptide_identification: e.target.value })}
                                          placeholder="e.g. Thymosin Beta-4 Acetate"
                                          className="input-field mt-2 bg-white"
                                        />
                                      </>
                                    )}
                                  </div>
                                  <label className="flex items-center gap-1.5 text-sm whitespace-nowrap mt-1 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={sample.sample_type === 'blend'}
                                      onChange={e => {
                                        const blend = e.target.checked;
                                        updateSample(sample.id, {
                                          sample_type: blend ? 'blend' : 'single',
                                          blend_components: blend
                                            ? (sample.blend_components.length ? sample.blend_components : defaultBlendComponents())
                                            : sample.blend_components,
                                        });
                                      }}
                                      className="rounded"
                                    />
                                    Blend
                                  </label>
                                </div>
                              </div>
                            )}

                            <label className="flex items-center gap-2 text-sm mt-3 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={sample.is_peptide}
                                onChange={e => updateSample(sample.id, { is_peptide: e.target.checked })}
                                className="rounded border-neutral-300 text-brand-600"
                              />
                              This is a peptide product
                            </label>
                          </div>

                          <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3">2. Select Tests</p>

                            <button
                              type="button"
                              onClick={() => selectTestMode(sample.id, 'atlas_pro')}
                              className={`w-full p-4 rounded-xl border-2 text-left mb-2 transition-colors flex gap-3 ${sample.test_mode === 'atlas_pro' ? 'border-brand-500 bg-brand-50' : 'border-neutral-200 hover:border-brand-300'}`}
                            >
                              {sample.test_mode === 'atlas_pro' && <CheckCircle size={20} className="text-brand-600 flex-shrink-0 mt-0.5" />}
                              <div className="flex-1 flex justify-between items-start gap-3">
                                <div>
                                  <p className="font-bold">
                                    {ATLAS_PRO_PANEL.name}
                                    <span className="text-xs font-normal text-brand-800 bg-brand-100 px-2 py-0.5 rounded-full ml-2">Recommended</span>
                                  </p>
                                  <p className="text-sm text-neutral-600 mt-1">{ATLAS_PRO_PANEL.description}</p>
                                  <p className="text-xs text-neutral-500 mt-2">
                                    Includes conformity testing across {ATLAS_PRO_PANEL.vialsRequired} vials (min. 10 mg each).
                                  </p>
                                </div>
                                <span className="font-bold text-brand-800 whitespace-nowrap">{formatCurrency(ATLAS_PRO_PANEL.price)}</span>
                              </div>
                            </button>

                            {sample.test_mode === 'atlas_pro' && (
                              <label className="flex items-start gap-2.5 p-3 mb-2 rounded-lg border border-brand-200 bg-brand-50/60 text-sm cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={sample.include_fentanyl}
                                  onChange={e => updateSample(sample.id, { include_fentanyl: e.target.checked })}
                                  className="mt-0.5 rounded border-neutral-300 text-brand-600"
                                />
                                <span>
                                  <span className="font-medium">{FENTANYL_OPTION_LABEL}</span>
                                  <span className="block text-xs text-neutral-500 mt-0.5">
                                    Included at no extra cost. Uncheck if fentanyl screening is not required.
                                  </span>
                                </span>
                              </label>
                            )}

                            <button
                              type="button"
                              onClick={() => selectTestMode(sample.id, 'full_qc')}
                              className={`w-full p-4 rounded-xl border-2 text-left mb-2 transition-colors flex gap-3 ${sample.test_mode === 'full_qc' ? 'border-brand-500 bg-brand-50' : 'border-neutral-200 hover:border-brand-300'}`}
                            >
                              {sample.test_mode === 'full_qc' && <CheckCircle size={20} className="text-brand-600 flex-shrink-0 mt-0.5" />}
                              <div className="flex-1 flex justify-between items-start gap-3">
                                <div>
                                  <p className="font-bold">{FULL_QC_PANEL.name}</p>
                                  <p className="text-sm text-neutral-600 mt-1">{FULL_QC_PANEL.description}</p>
                                  <p className="text-xs text-neutral-500 mt-2">
                                    Includes conformity across {FULL_QC_PANEL.vialsRequired} vials (min. 10 mg each).
                                  </p>
                                </div>
                                <span className="font-bold text-brand-800 whitespace-nowrap">{formatCurrency(FULL_QC_PANEL.price)}</span>
                              </div>
                            </button>

                            {packageIncludesConformity(sample.test_mode) && (
                              <div className="mb-4 p-4 border border-brand-200 rounded-xl bg-white">
                                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                                  <div>
                                    <p className="font-semibold text-black">Additional Conformity Vials</p>
                                    <p className="text-sm text-neutral-600 mt-1">
                                      Submit extra vials from the same batch for expanded sample-to-sample verification beyond the {panelVialsRequired(sample.test_mode)} included with your package.
                                    </p>
                                    <p className="text-sm font-medium text-brand-800 mt-2">
                                      +{formatCurrency(CONFORMITY_PRICE)} per additional vial
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => updateSample(sample.id, { conformity_extra: Math.max(0, sample.conformity_extra - 1) })}
                                      disabled={sample.conformity_extra <= 0}
                                      className="w-9 h-9 border rounded-lg flex items-center justify-center hover:bg-neutral-50 disabled:opacity-40"
                                    >
                                      <Minus size={14} />
                                    </button>
                                    <span className="font-bold w-8 text-center text-lg">{sample.conformity_extra}</span>
                                    <button
                                      type="button"
                                      onClick={() => updateSample(sample.id, { conformity_extra: sample.conformity_extra + 1 })}
                                      className="w-9 h-9 border rounded-lg flex items-center justify-center hover:bg-brand-50 text-brand-800 font-medium"
                                    >
                                      <Plus size={14} />
                                    </button>
                                  </div>
                                </div>
                                <p className="text-xs text-neutral-500 mt-3 pt-3 border-t border-neutral-100">
                                  Total vials to ship for this sample:{' '}
                                  <strong className="text-black">{sampleVialCount(sample)}</strong>
                                  {sample.conformity_extra > 0 && (
                                    <span className="text-brand-800">
                                      {' '}(+{formatCurrency(sample.conformity_extra * CONFORMITY_PRICE)} add-on)
                                    </span>
                                  )}
                                </p>
                              </div>
                            )}

                            <p className="text-sm text-brand-700 font-medium mb-3">
                              {isPackageMode(sample.test_mode) ? 'Included tests (locked with package)' : 'Or select individual tests'}
                            </p>

                            <div className="space-y-2">
                              {INDIVIDUAL_TESTS.map(test => {
                                const bundled = bundledTestsForMode(sample.test_mode);
                                const locked = isPackageMode(sample.test_mode) && bundled.includes(test.id);
                                const sel = locked || (sample.test_mode === 'individual' && sample.individual_tests.includes(test.id));
                                return (
                                  <button
                                    key={test.id}
                                    type="button"
                                    disabled={locked}
                                    onClick={() => toggleIndividualTest(sample.id, test.id)}
                                    className={`w-full p-3 rounded-lg border-2 text-left flex justify-between items-center gap-3 ${
                                      sel ? 'border-brand-500 bg-brand-50' : 'border-neutral-200 hover:border-brand-300'
                                    } ${locked ? 'opacity-80 cursor-default' : ''}`}
                                  >
                                    <div className="flex items-center gap-2">
                                      {sel && <CheckCircle size={16} className="text-brand-600" />}
                                      <span className="text-sm font-medium">{test.name}</span>
                                      {locked && <span className="text-[10px] uppercase tracking-wide text-brand-700 font-semibold">Included</span>}
                                    </div>
                                    <span className="text-sm font-semibold">{locked ? '—' : formatCurrency(test.price)}</span>
                                  </button>
                                );
                              })}
                            </div>

                            <ul className="text-xs text-neutral-500 space-y-1 list-disc pl-4 mt-4">
                              <li>{ATLAS_PRO_PANEL.name}: {ATLAS_PRO_PANEL.vialsRequired} vials (min. 10 mg each) with conformity included</li>
                              <li>{FULL_QC_PANEL.name}: {FULL_QC_PANEL.vialsRequired} vials with conformity included</li>
                              <li>Additional conformity vials: {formatCurrency(CONFORMITY_PRICE)} per vial (same batch)</li>
                              <li>Individual tests: Submit 1 vial per test (minimum 10 mg each)</li>
                              <li>
                                For quantities under 5 mg total, contact us at{' '}
                                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-700 hover:underline">{SUPPORT_EMAIL}</a>.
                              </li>
                            </ul>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                <button type="button" onClick={addSample} className="w-full py-3 border-2 border-dashed border-neutral-300 rounded-xl text-sm font-medium hover:border-brand-400 hover:bg-brand-50 flex items-center justify-center gap-2">
                  <Plus size={16} /> Add Another Sample
                </button>
              </>
            )}

            {/* ── STEP 2: ILS-style option sections ── */}
            {step === 2 && (
              <>
                <div>
                  <h2 className="text-xl font-bold text-black">Add-Ons &amp; Options</h2>
                  <p className="text-sm text-neutral-500 mt-1">Multi-brand COAs, rush processing, and prepaid shipping.</p>
                </div>

                <div className="card p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-black">Multi-Brand COA</h3>
                      <p className="text-sm text-neutral-600 mt-1">
                        Your COA profile brand is included. Add up to {MAX_BRANDS_PER_SAMPLE - 1} additional brand{MAX_BRANDS_PER_SAMPLE - 1 === 1 ? '' : 's'} per sample.
                      </p>
                      <p className="text-sm font-medium text-brand-800 mt-1">+{formatCurrency(MULTI_BRAND_PRICE)} per additional brand per sample</p>
                    </div>
                  </div>
                  {samples.map((sample, idx) => {
                    const primary = companyName.trim();
                    const additionalBrands = sample.brand_names.filter(
                      b => b.trim() && (!primary || b.trim().toLowerCase() !== primary.toLowerCase()),
                    );
                    const billable = billableBrandCount(sample, companyName);
                    return (
                      <div key={sample.id} className="border-t border-atlas-border pt-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">{sample.sample_name || `Sample ${idx + 1}`}</span>
                          <button
                            type="button"
                            onClick={() => addBrandName(sample.id)}
                            disabled={sample.brand_names.length >= MAX_BRANDS_PER_SAMPLE}
                            className="text-sm text-brand-700 font-medium disabled:opacity-40"
                          >
                            Add Brand
                          </button>
                        </div>
                        {primary && (
                          <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg bg-brand-50 border border-brand-200">
                            <CheckCircle size={14} className="text-brand-600 flex-shrink-0" />
                            <span className="text-sm font-medium text-black">{primary}</span>
                            <span className="text-[10px] uppercase tracking-wide text-brand-700 font-semibold ml-auto">Included</span>
                          </div>
                        )}
                        {additionalBrands.map((brand, bi) => {
                          const brandIndex = sample.brand_names.indexOf(brand);
                          return (
                            <input
                              key={`${sample.id}-${bi}-${brandIndex}`}
                              value={brand}
                              onChange={e => {
                                const next = [...sample.brand_names];
                                next[brandIndex] = e.target.value;
                                updateSample(sample.id, { brand_names: next });
                              }}
                              placeholder="Additional brand name for COA"
                              className="input-field text-sm mb-2"
                            />
                          );
                        })}
                        {billable > 0 && (
                          <p className="text-xs text-neutral-500">
                            {billable} additional brand{billable === 1 ? '' : 's'} · +{formatCurrency(billable * MULTI_BRAND_PRICE)}
                          </p>
                        )}
                        {companies.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {companies
                              .filter(c => {
                                const n = c.name.trim().toLowerCase();
                                if (primary && n === primary.toLowerCase()) return false;
                                return !sample.brand_names.some(b => b.trim().toLowerCase() === n);
                              })
                              .slice(0, 6)
                              .map(c => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => addBrandFromCompany(sample.id, c.name)}
                                  disabled={sample.brand_names.filter(Boolean).length >= MAX_BRANDS_PER_SAMPLE}
                                  className="text-[11px] px-2 py-1 border border-atlas-border rounded hover:bg-brand-50 hover:border-brand-400 disabled:opacity-40"
                                >
                                  + {c.name}
                                </button>
                              ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="card p-5 space-y-4">
                  <div>
                    <h3 className="font-bold text-black">Rush Processing</h3>
                    <p className="text-sm text-neutral-600 mt-1">Get your results faster with priority processing. Select which samples need rush.</p>
                    <p className="text-sm font-medium text-brand-800 mt-1">+{formatCurrency(RUSH_PRICE_PER_SAMPLE)}/sample · &lt;3 business days guaranteed or fee credited back</p>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-atlas-border">
                    {samples.map((sample, idx) => (
                      <button
                        key={sample.id}
                        type="button"
                        onClick={() => updateSample(sample.id, { rush: !sample.rush })}
                        className={`px-3 py-2 rounded-lg text-sm border flex items-center gap-1.5 ${sample.rush ? 'border-amber-400 bg-amber-50 text-amber-900 font-semibold' : 'border-neutral-300 hover:border-amber-300'}`}
                      >
                        <Zap size={14} className={sample.rush ? 'text-amber-500' : 'text-neutral-400'} />
                        {sample.rush ? 'Rush: ' : '+ Add Rush: '}{sample.sample_name || `Sample ${idx + 1}`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="card p-5 space-y-4">
                  <div className="flex items-start gap-3">
                    <Truck size={18} className="text-brand-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <h3 className="font-bold text-black">Prepaid Shipping Label</h3>
                      <p className="text-sm text-neutral-600 mt-1">Generate a prepaid FedEx/UPS label to ship samples to our Austin lab. Included with your order.</p>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={generatePrepaidLabel}
                      onChange={e => setGeneratePrepaidLabel(e.target.checked)}
                      className="w-4 h-4 accent-brand-500"
                    />
                    Generate prepaid shipping label at checkout
                  </label>
                </div>
              </>
            )}

            {/* ── STEP 3: Review ── */}
            {step === 3 && (
              <>
                <div>
                  <h2 className="text-xl font-bold text-black">Review Your Order</h2>
                  <p className="text-sm text-neutral-500 mt-1">Double-check everything before submitting.</p>
                </div>

                {selectedCompanyId && (
                  <div className="card p-4 flex items-center gap-3">
                    {companies.find(c => c.id === selectedCompanyId)?.logo ? (
                      <img
                        src={companies.find(c => c.id === selectedCompanyId)!.logo}
                        alt=""
                        className="h-10 w-10 rounded object-contain bg-neutral-50 border border-neutral-100"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded bg-neutral-100 flex items-center justify-center">
                        <Package size={16} className="text-neutral-400" />
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">COA Profile</p>
                      <p className="font-semibold text-black">{companyName || '—'}</p>
                    </div>
                  </div>
                )}

                {samples.map(s => (
                  <div key={s.id} className="card p-5 relative">
                    {s.test_mode === 'atlas_pro' && (
                      <span className="absolute top-4 right-4 text-xs font-medium bg-brand-100 text-brand-800 px-2.5 py-1 rounded-full border border-brand-200">
                        {ATLAS_PRO_PANEL.name}
                      </span>
                    )}
                    {s.test_mode === 'full_qc' && (
                      <span className="absolute top-4 right-4 text-xs font-medium bg-neutral-100 text-neutral-700 px-2.5 py-1 rounded-full border border-neutral-200">
                        Full QC Panel
                      </span>
                    )}
                    <p className="font-bold text-lg pr-28">{s.sample_name}</p>
                    <p className="text-sm text-neutral-500 mt-1">Batch: {s.batch_number}</p>
                    <p className="text-sm text-neutral-600">{[s.labeled_content, s.vial_size, s.sample_matrix].filter(Boolean).join(' | ')}</p>
                    {isPackageMode(s.test_mode) && (
                      <p className="text-sm text-neutral-600 mt-1">
                        {panelVialsRequired(s.test_mode)} vials incl. conformity
                        {s.conformity_extra > 0 && ` + ${s.conformity_extra} extra (${formatCurrency(s.conformity_extra * CONFORMITY_PRICE)})`}
                        {' · '}{sampleVialCount(s)} vials total
                      </p>
                    )}
                    {s.test_mode === 'atlas_pro' && (
                      <p className="text-sm text-neutral-600 mt-1">
                        {s.include_fentanyl
                          ? `${FENTANYL_OPTION_LABEL} included`
                          : `${FENTANYL_OPTION_LABEL} not requested`}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-3 text-sm">
                      {s.sample_type === 'blend' ? (
                        <span className="text-neutral-600">
                          Blend: <strong>{formatBlendLabel(s.blend_components) || s.sample_name}</strong>
                        </span>
                      ) : editingPeptideId === s.id ? (
                        <>
                          <input
                            value={s.peptide_identification}
                            onChange={e => updateSample(s.id, { peptide_identification: e.target.value })}
                            className="input-field py-1 text-sm flex-1"
                            autoFocus
                          />
                          <button type="button" onClick={() => setEditingPeptideId(null)} className="p-1.5 text-brand-700"><Check size={16} /></button>
                        </>
                      ) : (
                        <>
                          <span className="text-neutral-600">Peptide: <strong>{s.peptide_identification || s.sample_name}</strong></span>
                          <button type="button" onClick={() => setEditingPeptideId(s.id)} className="p-1 text-neutral-400 hover:text-brand-700" title="Edit peptide name"><Pencil size={14} /></button>
                        </>
                      )}
                    </div>
                    {s.rush && <p className="text-xs text-amber-600 mt-2 flex items-center gap-1"><Zap size={12} /> Rush processing</p>}
                  </div>
                ))}

                <div className="card p-5">
                  <label className="label">Promo Code (optional)</label>
                  <div className="flex gap-0 rounded-lg overflow-hidden border border-atlas-border">
                    <input
                      value={promoCode}
                      onChange={e => setPromoCode(e.target.value)}
                      placeholder="ENTER PROMO CODE"
                      className="input-field flex-1 border-0 rounded-none uppercase placeholder:normal-case"
                    />
                    <button type="button" onClick={applyPromo} disabled={!promoCode.trim()} className="px-4 bg-neutral-100 hover:bg-neutral-200 text-sm font-medium border-l border-atlas-border disabled:opacity-40">
                      Apply
                    </button>
                  </div>
                  {promoApplied && <p className="text-xs text-atlas-success mt-2">10% discount applied</p>}
                </div>

                <div className="card p-5">
                  <label className="label">Order Notes (optional)</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any special instructions or notes for the lab team..." className="input-field resize-none" rows={3} />
                </div>

                <div className="card p-5 bg-neutral-50">
                  <h3 className="font-bold text-black flex items-center gap-2 mb-4">
                    Payment
                  </h3>
                  <div className="flex gap-2 mb-4">
                    <button
                      type="button"
                      onClick={() => { setPaymentMethod('card'); setPaymentAuthorized(false); }}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium border rounded-md transition-colors ${paymentMethod === 'card' ? 'bg-black text-white border-black' : 'bg-white border-neutral-300 hover:border-neutral-400'}`}
                    >
                      <CreditCard size={15} /> Credit Card
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPaymentMethod('crypto'); setPaymentAuthorized(false); }}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium border rounded-md transition-colors ${paymentMethod === 'crypto' ? 'bg-black text-white border-black' : 'bg-white border-neutral-300 hover:border-neutral-400'}`}
                    >
                      <Bitcoin size={15} /> Cryptocurrency
                    </button>
                  </div>
                  {paymentMethod === 'card' ? (
                    <>
                      <p className="text-xs text-neutral-600 mb-4">Processed securely via Square.</p>
                      <label className="label">Cardholder Name</label>
                      <input value={cardholderName} onChange={e => setCardholderName(e.target.value)} placeholder="Full name as it appears on card" className="input-field mb-4 bg-white" />
                      <label className="flex items-start gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={paymentAuthorized} onChange={e => setPaymentAuthorized(e.target.checked)} className="mt-1 rounded accent-brand-500" />
                        <span>
                          I authorize Atlas Analytics to charge my credit card for the total shown.
                          I agree to the <Link to="/trust" className="text-brand-700 hover:underline">Terms of Service</Link>.
                        </span>
                      </label>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-neutral-600 mb-4">Pay with BTC, ETH, or USDC. You will receive wallet instructions after submitting.</p>
                      <label className="flex items-start gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={paymentAuthorized} onChange={e => setPaymentAuthorized(e.target.checked)} className="mt-1 rounded accent-brand-500" />
                        <span>
                          I agree to send the exact order total in cryptocurrency within 24 hours of submission.
                          Testing begins once payment is confirmed on-chain.
                        </span>
                      </label>
                    </>
                  )}
                  <div className="mt-4 pt-4 border-t border-neutral-200 space-y-1 text-xs text-neutral-600">
                    <p>Pay by wire or crypto — lab staff will mark your order paid before testing begins.</p>
                    <p className="text-neutral-400">Card checkout (Stripe) coming soon.</p>
                  </div>
                </div>

                {generatePrepaidLabel && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">Label Preview</p>
                    <PrepaidShippingLabel labelId={previewLabelId} orderNumber="Generated at submit" />
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <OrderSummarySidebar samples={samples} step={step} total={step === 3 ? total : undefined} primaryBrand={companyName} />
          </div>
        </div>
      </div>

      {/* Sticky footer nav — matches ILS */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-atlas-border z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => { setValidationError(''); setStep(s => s - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              disabled={step === 1}
              className="btn-ghost gap-1 disabled:opacity-30"
            >
              <ArrowLeft size={16} /> Back
            </button>
            <button
              type="button"
              onClick={discardDraft}
              className="text-sm text-red-600 hover:text-red-700 font-medium flex items-center gap-1.5"
            >
              <Trash2 size={15} /> Discard order
            </button>
          </div>
          {step < 3 ? (
            <button type="button" onClick={goNext} className="btn-primary gap-1 px-8">
              Continue <ArrowRight size={16} />
            </button>
          ) : (
            <button type="button" onClick={submitOrder} disabled={loading || !paymentAuthorized} className="btn-primary gap-1 px-8 disabled:opacity-50">
              {loading ? 'Submitting...' : <>Submit Order <ShoppingCart size={16} /></>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
