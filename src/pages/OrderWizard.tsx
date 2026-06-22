import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Plus, Trash2, CheckCircle, Zap,
  Package, Beaker, ShoppingCart, Copy, Minus, AlertCircle, X, Search,
} from 'lucide-react';
import AtlasLogo from '../components/brand/AtlasLogo';
import OrderSummarySidebar from '../components/order/OrderSummarySidebar';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { DEFAULT_RECENT_PRODUCTS, searchPeptides } from '../data/peptideCatalog';
import {
  WizardSample, createEmptySample, validateStep1, sampleMetadataPayload,
  INDIVIDUAL_TESTS, FULL_QC_PANEL, SAMPLE_MATRICES, CONFORMITY_PRICE,
  MULTI_BRAND_PRICE, RUSH_PRICE_PER_SAMPLE, MAX_BRANDS_PER_SAMPLE,
  orderTotals, sampleLineTotal,
} from '../lib/orderCatalog';
import { clearOrderDraft, loadOrderDraft, saveOrderDraft } from '../lib/orderDraft';
import { formatCurrency, generateOrderNumber } from '../lib/utils';

const STEPS = [
  { id: 1, label: 'Products', sub: 'Select & configure', icon: Beaker },
  { id: 2, label: 'Options', sub: 'Add-ons & extras', icon: Package },
  { id: 3, label: 'Review', sub: 'Confirm & submit', icon: ShoppingCart },
];

export default function OrderWizard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [samples, setSamples] = useState<WizardSample[]>([createEmptySample()]);
  const [activeSampleId, setActiveSampleId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [showIndividualTests, setShowIndividualTests] = useState<Record<string, boolean>>({});

  const [notes, setNotes] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);
  const [shippingCarrier, setShippingCarrier] = useState('');
  const [shippingTracking, setShippingTracking] = useState('');
  const [companyName, setCompanyName] = useState(profile?.company_name ?? '');
  const [cardholderName, setCardholderName] = useState(profile?.full_name ?? '');
  const [paymentAuthorized, setPaymentAuthorized] = useState(false);

  const [recentProducts, setRecentProducts] = useState<string[]>(DEFAULT_RECENT_PRODUCTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [validationError, setValidationError] = useState('');

  const activeId = activeSampleId ?? samples[0]?.id ?? null;
  const { subtotal } = orderTotals(samples);
  const promoDiscount = promoApplied ? subtotal * 0.1 : 0;
  const total = subtotal - promoDiscount;

  const persistDraft = useCallback(() => {
    if (!user) return;
    saveOrderDraft(user.id, {
      step, samples, notes, promoCode, shippingCarrier, shippingTracking,
      companyName, cardholderName, paymentAuthorized,
    });
  }, [user, step, samples, notes, promoCode, shippingCarrier, shippingTracking, companyName, cardholderName, paymentAuthorized]);

  useEffect(() => {
    if (!user) return;
    const draft = loadOrderDraft(user.id);
    if (draft?.samples?.length) {
      setStep(draft.step);
      setSamples(draft.samples);
      setNotes(draft.notes);
      setPromoCode(draft.promoCode);
      setShippingCarrier(draft.shippingCarrier);
      setShippingTracking(draft.shippingTracking);
      setCompanyName(draft.companyName || profile?.company_name || '');
      setCardholderName(draft.cardholderName || profile?.full_name || '');
      setPaymentAuthorized(draft.paymentAuthorized);
      setActiveSampleId(draft.samples[0]?.id ?? null);
    }
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

  if (!user) return <Navigate to="/auth" replace />;

  function updateSample(id: string, updates: Partial<WizardSample>) {
    setSamples(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    setValidationError('');
  }

  function addSample() {
    const s = createEmptySample();
    setSamples(prev => [...prev, s]);
    setActiveSampleId(s.id);
  }

  function duplicateSample(id: string) {
    const src = samples.find(x => x.id === id);
    if (!src) return;
    const { id: _omit, batch_number: _batch, ...rest } = src;
    const copy = createEmptySample({ ...rest, batch_number: '' });
    setSamples(prev => [...prev, copy]);
    setActiveSampleId(copy.id);
  }

  function removeSample(id: string) {
    if (samples.length <= 1) return;
    setSamples(prev => prev.filter(s => s.id !== id));
    if (activeId === id) setActiveSampleId(samples.find(s => s.id !== id)?.id ?? null);
  }

  function selectProduct(id: string, name: string) {
    updateSample(id, {
      sample_name: name,
      display_name: name,
      peptide_identification: name,
      catalog_mode: false,
    });
    setProductSearch('');
  }

  function toggleIndividualTest(sampleId: string, testId: string) {
    const sample = samples.find(s => s.id === sampleId);
    if (!sample) return;
    const has = sample.individual_tests.includes(testId);
    updateSample(sampleId, {
      test_mode: 'individual',
      individual_tests: has
        ? sample.individual_tests.filter(t => t !== testId)
        : [...sample.individual_tests, testId],
    });
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

  function goNext() {
    if (step === 1) {
      const err = validateStep1(samples);
      if (err) { setValidationError(err); return; }
    }
    setValidationError('');
    setStep(s => s + 1);
  }

  function applyPromo() {
    if (promoCode.trim().toUpperCase() === 'ATLAS10') setPromoApplied(true);
    else setValidationError('Invalid promo code.');
  }

  async function submitOrder() {
    setError('');
    if (!paymentAuthorized) {
      setValidationError('Please authorize payment to submit your order.');
      return;
    }
    setLoading(true);
    try {
      const orderNumber = generateOrderNumber();
      const orderMeta = {
        shipping_carrier: shippingCarrier,
        shipping_tracking: shippingTracking,
        promo_code: promoApplied ? promoCode : null,
        samples_detail: samples.map(sampleMetadataPayload),
      };

      const { data: order, error: orderError } = await supabase.from('orders').insert({
        user_id: user.id,
        order_number: orderNumber,
        rush_processing: samples.some(s => s.rush),
        notes: notes ? `${notes}\n\n---\n${JSON.stringify(orderMeta)}` : JSON.stringify(orderMeta),
        subtotal,
        discount_amount: promoDiscount,
        rush_fee: samples.filter(s => s.rush).length * RUSH_PRICE_PER_SAMPLE,
        total,
        first_order_discount: false,
        company_name: companyName,
      }).select().single();
      if (orderError) throw orderError;

      const sampleRows = samples.map(s => ({
        order_id: order.id,
        user_id: user.id,
        sample_name: s.sample_name,
        display_name: s.display_name || `${s.sample_name} ${s.labeled_content}`.trim(),
        sample_type: s.sample_type,
        vial_count: s.test_mode === 'full_qc' ? FULL_QC_PANEL.vialsRequired : Math.max(1, s.individual_tests.length),
        panel_ids: [],
        metadata: sampleMetadataPayload(s),
      }));

      let { error: samplesError } = await supabase.from('order_samples').insert(sampleRows);
      if (samplesError?.message?.includes('metadata')) {
        const fallback = sampleRows.map(({ metadata: _m, ...row }) => row);
        ({ error: samplesError } = await supabase.from('order_samples').insert(fallback));
      }
      if (samplesError) throw samplesError;

      clearOrderDraft(user.id);
      navigate('/dashboard?tab=orders');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit order.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-100">
      <header className="bg-white border-b border-atlas-border sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2 text-sm text-neutral-600 hover:text-black">
            <ArrowLeft size={16} /> Back to Dashboard
          </Link>
          <div className="text-center">
            <p className="font-bold text-black">New Testing Order</p>
            <p className="text-xs text-neutral-500">Client Portal</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={discardDraft} className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1">
              <X size={14} /> Discard
            </button>
            <AtlasLogo size="sm" showWordmark={false} />
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Stepper */}
        <div className="flex items-center justify-center gap-0 mb-8">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center">
              <div className={`flex flex-col items-center min-w-[88px] ${step >= s.id ? 'text-brand-700' : 'text-neutral-400'}`}>
                <div className={`w-11 h-11 rounded-full flex items-center justify-center border-2 ${step >= s.id ? 'border-brand-500 bg-brand-50' : 'border-neutral-300 bg-white'}`}>
                  <s.icon size={18} />
                </div>
                <span className="text-xs font-semibold mt-1">{s.label}</span>
                <span className="text-[10px] text-neutral-400">{s.sub}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-12 sm:w-20 h-0.5 mx-1 mb-5 ${step > s.id ? 'bg-brand-500' : 'bg-neutral-200'}`} />
              )}
            </div>
          ))}
        </div>

        {(error || validationError) && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2 text-sm text-red-700">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            {error || validationError}
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">

            {/* ── STEP 1: Products + Tests ── */}
            {step === 1 && (
              <>
                <div>
                  <h2 className="text-xl font-bold text-black">Add Your Products</h2>
                  <p className="text-sm text-neutral-500 mt-1">
                    Select a product from our catalog or enter a custom product, then choose your tests.
                  </p>
                </div>

                {/* Sample tabs */}
                <div className="flex flex-wrap gap-2">
                  {samples.map((s, idx) => (
                    <button
                      key={s.id}
                      onClick={() => setActiveSampleId(s.id)}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${activeId === s.id ? 'border-brand-500 bg-brand-50 text-brand-900 font-semibold' : 'border-neutral-300 hover:border-brand-300'}`}
                    >
                      {idx + 1} {s.sample_name || 'New sample'}
                      {s.batch_number ? ` · ${s.batch_number}` : ''}
                    </button>
                  ))}
                  <button onClick={addSample} className="px-3 py-1.5 rounded-full text-sm border border-dashed border-neutral-400 hover:border-brand-400 text-neutral-600">
                    + Add
                  </button>
                </div>

                {samples.filter(s => s.id === activeId).map((sample, idx) => (
                  <div key={sample.id} className="card p-5 border-brand-200 space-y-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-8 h-8 rounded-full bg-brand-500 text-black text-sm font-bold flex items-center justify-center">{samples.findIndex(s => s.id === sample.id) + 1}</span>
                        <span className="font-bold text-lg">{sample.sample_name || 'Select a product'}</span>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => duplicateSample(sample.id)} className="p-2 hover:bg-neutral-100 rounded-lg" title="Duplicate"><Copy size={15} /></button>
                        {samples.length > 1 && (
                          <button onClick={() => removeSample(sample.id)} className="p-2 hover:bg-red-50 text-red-500 rounded-lg"><Trash2 size={15} /></button>
                        )}
                      </div>
                    </div>

                    {/* 1. Select Product */}
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3">1. Select Product</p>

                      {sample.sample_name && !sample.catalog_mode ? (
                        <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg mb-3">
                          <span className="font-semibold">{sample.sample_name}</span>
                          <button onClick={() => updateSample(sample.id, { catalog_mode: true })} className="text-sm text-brand-700 font-medium">Change</button>
                        </div>
                      ) : (
                        <div className="mb-3">
                          <div className="relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                            <input
                              value={productSearch}
                              onChange={e => setProductSearch(e.target.value)}
                              placeholder="Search catalog (e.g. BPC-157, ION-3RT, KLOW)..."
                              className="input-field pl-9"
                            />
                          </div>
                          {productSearch && catalogResults.length > 0 && (
                            <div className="mt-1 border border-atlas-border rounded-lg bg-white shadow-sm max-h-40 overflow-y-auto">
                              {catalogResults.map(name => (
                                <button key={name} onClick={() => selectProduct(sample.id, name)} className="w-full text-left px-3 py-2 text-sm hover:bg-brand-50">{name}</button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-2">Your Recent Products</p>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {recentProducts.map(p => (
                          <button
                            key={p}
                            onClick={() => selectProduct(sample.id, p)}
                            className={`px-3 py-1.5 rounded-full text-sm border ${sample.sample_name === p ? 'border-brand-500 bg-brand-50 text-brand-800 font-semibold' : 'border-neutral-300 hover:border-brand-400'}`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>

                      <label className="flex items-center gap-2 text-sm mb-4 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={sample.is_peptide}
                          onChange={e => updateSample(sample.id, { is_peptide: e.target.checked })}
                          className="rounded border-neutral-300 text-brand-600"
                        />
                        This is a peptide product
                      </label>

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
                          <input type="number" min={1} max={99} value={sample.quantity} onChange={e => updateSample(sample.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })} className="input-field" />
                        </div>
                      </div>

                      {sample.is_peptide && (
                        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-amber-900">Peptide Identification *</p>
                              <p className="text-xs text-amber-800 mt-1">Enter the actual peptide name (e.g. &quot;Thymosin Beta-4 Acetate&quot;), not the marketing name.</p>
                              <input
                                value={sample.peptide_identification}
                                onChange={e => updateSample(sample.id, { peptide_identification: e.target.value })}
                                placeholder="e.g. Thymosin Beta-4 Acetate"
                                className="input-field mt-2 bg-white"
                              />
                            </div>
                            <label className="flex items-center gap-1.5 text-sm whitespace-nowrap mt-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={sample.sample_type === 'blend'}
                                onChange={e => updateSample(sample.id, { sample_type: e.target.checked ? 'blend' : 'single' })}
                                className="rounded"
                              />
                              Blend
                            </label>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 2. Select Tests */}
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3">2. Select Tests</p>

                      <button
                        onClick={() => updateSample(sample.id, { test_mode: 'full_qc', individual_tests: [] })}
                        className={`w-full p-4 rounded-xl border-2 text-left mb-2 transition-colors ${sample.test_mode === 'full_qc' ? 'border-brand-500 bg-brand-50' : 'border-neutral-200 hover:border-brand-300'}`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-bold">{FULL_QC_PANEL.name} <span className="text-xs font-normal text-brand-700 bg-brand-100 px-2 py-0.5 rounded-full ml-1">Recommended</span></p>
                            <p className="text-sm text-neutral-600 mt-1">{FULL_QC_PANEL.description}</p>
                          </div>
                          <span className="font-bold text-brand-800">{formatCurrency(FULL_QC_PANEL.price)}</span>
                        </div>
                      </button>

                      <button
                        onClick={() => setShowIndividualTests(prev => ({ ...prev, [sample.id]: !prev[sample.id] }))}
                        className="text-sm text-brand-700 font-medium mb-3 hover:underline"
                      >
                        {showIndividualTests[sample.id] ? 'Hide individual tests' : 'Or select individual tests'}
                      </button>

                      {(showIndividualTests[sample.id] || sample.test_mode === 'individual') && (
                        <div className="space-y-2">
                          {INDIVIDUAL_TESTS.map(test => {
                            const sel = sample.individual_tests.includes(test.id);
                            return (
                              <button
                                key={test.id}
                                onClick={() => toggleIndividualTest(sample.id, test.id)}
                                className={`w-full p-3 rounded-lg border-2 text-left flex justify-between items-center ${sel ? 'border-brand-500 bg-brand-50' : 'border-neutral-200 hover:border-brand-300'}`}
                              >
                                <span className="text-sm font-medium">{test.name}</span>
                                <span className="text-sm font-semibold">{formatCurrency(test.price)}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      <ul className="text-xs text-neutral-500 space-y-1 list-disc pl-4 mt-4">
                        <li>Full QC Panel: Submit 3 vials (minimum 10 mg each)</li>
                        <li>Individual tests: Submit 1 vial per test (minimum 10 mg each)</li>
                        <li>For quantities under 5 mg total, contact us at info@atlas-analytics.com</li>
                      </ul>
                    </div>
                  </div>
                ))}

                <button onClick={addSample} className="w-full py-3 border-2 border-dashed border-neutral-300 rounded-xl text-sm font-medium hover:border-brand-400 hover:bg-brand-50 flex items-center justify-center gap-2">
                  <Plus size={16} /> Add Another Sample
                </button>
              </>
            )}

            {/* ── STEP 2: Add-ons & Shipping ── */}
            {step === 2 && (
              <>
                <div>
                  <h2 className="text-xl font-bold text-black">Add-Ons &amp; Options</h2>
                  <p className="text-sm text-neutral-500 mt-1">Enhance your order with conformity testing, multi-brand COAs, or rush processing.</p>
                </div>

                <div className="card p-5">
                  <label className="label">Company Name (on COA)</label>
                  <input value={companyName} onChange={e => setCompanyName(e.target.value)} className="input-field" />
                </div>

                {samples.map((sample, idx) => (
                  <div key={sample.id} className="card p-5 space-y-4">
                    <p className="font-bold">{idx + 1}. {sample.sample_name} <span className="text-neutral-400 font-normal text-sm">· {sample.batch_number}</span></p>

                    {/* Conformity */}
                    <div className="flex items-center justify-between py-2 border-b border-atlas-border">
                      <div>
                        <p className="font-semibold text-sm">Conformity Testing</p>
                        <p className="text-xs text-neutral-500">+{formatCurrency(CONFORMITY_PRICE)} per additional conformity sample</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateSample(sample.id, { conformity_extra: Math.max(0, sample.conformity_extra - 1) })} className="w-8 h-8 border rounded-lg flex items-center justify-center"><Minus size={14} /></button>
                        <span className="font-bold w-6 text-center">{sample.conformity_extra}</span>
                        <button onClick={() => updateSample(sample.id, { conformity_extra: sample.conformity_extra + 1 })} className="w-8 h-8 border rounded-lg flex items-center justify-center"><Plus size={14} /></button>
                      </div>
                    </div>

                    {/* Multi-brand COA */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="font-semibold text-sm">Multi-Brand COA</p>
                          <p className="text-xs text-neutral-500">+{formatCurrency(MULTI_BRAND_PRICE)} per brand · up to {MAX_BRANDS_PER_SAMPLE}</p>
                        </div>
                        <button onClick={() => addBrandName(sample.id)} disabled={sample.brand_names.length >= MAX_BRANDS_PER_SAMPLE} className="text-sm text-brand-700 font-medium disabled:opacity-40">+ Add Brand</button>
                      </div>
                      {sample.brand_names.map((brand, bi) => (
                        <input
                          key={bi}
                          value={brand}
                          onChange={e => {
                            const next = [...sample.brand_names];
                            next[bi] = e.target.value;
                            updateSample(sample.id, { brand_names: next });
                          }}
                          placeholder="Brand name for COA"
                          className="input-field text-sm mb-2"
                        />
                      ))}
                    </div>

                    {/* Rush */}
                    <button
                      onClick={() => updateSample(sample.id, { rush: !sample.rush })}
                      className={`w-full p-4 rounded-xl border-2 text-left flex items-center gap-3 ${sample.rush ? 'border-amber-400 bg-amber-50' : 'border-neutral-200'}`}
                    >
                      <Zap size={18} className="text-amber-500 flex-shrink-0" />
                      <div>
                        <p className="font-semibold text-sm">Rush Processing</p>
                        <p className="text-xs text-neutral-500">+{formatCurrency(RUSH_PRICE_PER_SAMPLE)}/sample · &lt;3 business days guaranteed or fee credited back</p>
                      </div>
                    </button>
                  </div>
                ))}

                <div className="card p-5">
                  <h3 className="font-bold mb-1">Shipping Information</h3>
                  <p className="text-xs text-neutral-500 mb-4">Optional — add tracking if you&apos;ve already shipped your samples.</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label">Carrier</label>
                      <input value={shippingCarrier} onChange={e => setShippingCarrier(e.target.value)} placeholder="e.g. USPS, FedEx, UPS" className="input-field" />
                    </div>
                    <div>
                      <label className="label">Tracking Number</label>
                      <input value={shippingTracking} onChange={e => setShippingTracking(e.target.value)} placeholder="Optional" className="input-field" />
                    </div>
                  </div>
                  <p className="text-xs text-neutral-400 mt-3">You can also add or update tracking later from the Orders tab.</p>
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

                {samples.map((s, i) => (
                  <div key={s.id} className="card p-5">
                    <p className="font-bold text-lg">{s.sample_name}</p>
                    <p className="text-sm text-neutral-500">Batch: {s.batch_number}</p>
                    <p className="text-sm text-neutral-600">{[s.labeled_content, s.vial_size, s.sample_matrix].filter(Boolean).join(' | ')}</p>
                    <p className="text-sm mt-2">{s.test_mode === 'full_qc' ? FULL_QC_PANEL.name : `${s.individual_tests.length} individual test(s)`}</p>
                    {s.rush && <p className="text-xs text-amber-600 mt-1">Rush processing</p>}
                    <p className="text-sm font-semibold text-brand-800 mt-2">{formatCurrency(sampleLineTotal(s))}</p>
                  </div>
                ))}

                <div className="card p-5">
                  <label className="label">Promo Code (optional)</label>
                  <div className="flex gap-2">
                    <input value={promoCode} onChange={e => setPromoCode(e.target.value)} placeholder="Enter promo code" className="input-field flex-1" />
                    <button onClick={applyPromo} disabled={!promoCode.trim()} className="btn-secondary whitespace-nowrap">Apply</button>
                  </div>
                  {promoApplied && <p className="text-xs text-atlas-success mt-2">10% discount applied (ATLAS10)</p>}
                </div>

                <div className="card p-5">
                  <label className="label">Order Notes (optional)</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any special instructions or notes for the lab team..." className="input-field resize-none" rows={3} />
                </div>

                <div className="card p-5 border-brand-200">
                  <h3 className="font-bold mb-1">Payment Authorization</h3>
                  <p className="text-xs text-neutral-500 mb-4">Required for credit card payments.</p>
                  <label className="label">Cardholder Name</label>
                  <input value={cardholderName} onChange={e => setCardholderName(e.target.value)} placeholder="Full name as it appears on card" className="input-field mb-4" />
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={paymentAuthorized} onChange={e => setPaymentAuthorized(e.target.checked)} className="mt-1 rounded" />
                    <span>
                      I authorize Atlas Analytics to charge my credit card for the total amount shown for analytical testing services.
                      I agree to the Terms of Service and confirm that I am the authorized cardholder.
                    </span>
                  </label>
                </div>

                {promoDiscount > 0 && (
                  <div className="flex justify-between text-atlas-success text-sm px-1">
                    <span>Promo discount (10%)</span>
                    <span>−{formatCurrency(promoDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-xl px-1">
                  <span>Order Total</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </>
            )}

            {/* Nav */}
            <div className="flex justify-between pt-4">
              <button onClick={() => { setValidationError(''); setStep(s => s - 1); }} disabled={step === 1} className="btn-ghost gap-1 disabled:opacity-30">
                <ArrowLeft size={16} /> Back
              </button>
              {step < 3 ? (
                <button onClick={goNext} className="btn-primary gap-1">
                  Continue <ArrowRight size={16} />
                </button>
              ) : (
                <button onClick={submitOrder} disabled={loading || !paymentAuthorized} className="btn-primary gap-1 disabled:opacity-50">
                  {loading ? 'Submitting...' : <>Submit Order <CheckCircle size={16} /></>}
                </button>
              )}
            </div>
          </div>

          <div className="hidden lg:block">
            <OrderSummarySidebar samples={samples} step={step} />
          </div>
        </div>
      </div>
    </div>
  );
}
