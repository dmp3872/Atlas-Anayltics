import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  AlertCircle, ArrowLeft, ArrowRight, Beaker, Check, ClipboardList, FlaskConical,
} from 'lucide-react';
import AtlasLogo from '../components/brand/AtlasLogo';
import AtlasOrderSnapshot from '../components/order/AtlasOrderSnapshot';
import AtlasDigitalCoaCard from '../components/order/AtlasDigitalCoaCard';
import StepSelectTesting from '../components/order/wizard/StepSelectTesting';
import StepSampleInfo from '../components/order/wizard/StepSampleInfo';
import StepReviewSubmit from '../components/order/wizard/StepReviewSubmit';
import OrderSuccess from '../components/order/wizard/OrderSuccess';
import type { SimulatedPaymentMethod } from '../components/order/wizard/OrderPaymentPlaceholder';
import { useAuth } from '../context/AuthContext';
import { resolveUserRole, roleHome } from '../lib/roles';
import { supabase } from '../lib/supabase';
import {
  LAB_TEST_SERVICES,
  LabTestService,
  RUSH_PRICE_PER_SAMPLE,
  SampleCategory,
  WizardSample,
  applyCategoryDefaults,
  applyPrimaryTest,
  createEmptySample,
  formatLabelClaim,
  mergeCatalogWithDbPanels,
  normalizeWizardSample,
  orderTotals,
  sampleMetadataPayload,
  sampleVialCount,
  toggleAlaCarteAssay,
  validateSampleInformation,
  validateTestingSelection,
} from '../lib/orderCatalog';
import { clearOrderDraft, loadOrderDraft, saveOrderDraft } from '../lib/orderDraft';
import { generateOrderNumber } from '../lib/utils';
import { generateShippingLabelId } from '../lib/shippingLabel';
import { notifyOrderUpdate } from '../lib/notifications';
import { defaultCompany, fetchUserCompanies } from '../lib/coaProfile';
import { Company } from '../lib/types';
import { computeOrderReadiness } from '../lib/orderReadiness';
import { wizardStageFromStep } from '../lib/orderProjection';

const STEPS = [
  { id: 1, label: 'Select Testing', sub: 'Category & assays', icon: FlaskConical },
  { id: 2, label: 'Sample Info', sub: 'Details & lots', icon: Beaker },
  { id: 3, label: 'Review', sub: 'Confirm & submit', icon: ClipboardList },
];

interface SuccessInfo {
  orderId: string;
  orderNumber: string;
  sampleCount: number;
  totalVials: number;
  submittedAt: string;
  status: string;
}

export default function OrderWizard() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const role = resolveUserRole(profile, user?.email);
  const homePath = role === 'client' ? '/dashboard' : roleHome(role);

  const [step, setStep] = useState(1);
  const [samples, setSamples] = useState<WizardSample[]>([createEmptySample()]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);
  const [companyName, setCompanyName] = useState(profile?.company_name ?? '');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [catalog, setCatalog] = useState<LabTestService[]>(LAB_TEST_SERVICES);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [confirmations, setConfirmations] = useState({
    accurate: false,
    labelsMatch: false,
    agreeTerms: false,
  });
  const [paymentPaid, setPaymentPaid] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<SimulatedPaymentMethod>('card');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [validationError, setValidationError] = useState('');
  const [success, setSuccess] = useState<SuccessInfo | null>(null);
  const [previewPackageId, setPreviewPackageId] = useState<'full_qc' | 'atlas_pro' | null>(null);

  const { subtotal, totalVials, sampleCount } = orderTotals(samples, companyName, catalog);
  const promoDiscount = promoApplied ? subtotal * 0.1 : 0;
  const total = Math.max(0, subtotal - promoDiscount);
  // Checkout readiness for UI includes payment; submit gating keeps payment separate
  // so "Pay & submit" can authorize in the same click.
  const readiness = computeOrderReadiness({
    samples,
    includeCheckout: step === 3,
    hasCoaProfile: !!selectedCompanyId,
    confirmations,
    paymentPaid,
  });
  const readinessExceptPayment = computeOrderReadiness({
    samples,
    includeCheckout: step === 3,
    hasCoaProfile: !!selectedCompanyId,
    confirmations,
    paymentPaid: true,
  });
  const wizardStage = wizardStageFromStep(step);

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Account';
  const userInitial = displayName.charAt(0).toUpperCase();
  const selectedCompany = companies.find(c => c.id === selectedCompanyId) ?? null;

  const templateSample = samples[0] ?? createEmptySample();

  const persistDraft = useCallback(() => {
    if (!user || success) return;
    saveOrderDraft(user.id, {
      step,
      samples,
      notes,
      promoCode,
      shippingCarrier: '',
      shippingTracking: '',
      companyName,
      selectedCompanyId,
      cardholderName: profile?.full_name ?? '',
      paymentMethod,
      generatePrepaidLabel: true,
      paymentAuthorized: paymentPaid,
    });
  }, [user, success, step, samples, notes, promoCode, companyName, selectedCompanyId, profile?.full_name, paymentMethod, paymentPaid]);

  useEffect(() => {
    if (!user) return;
    const draft = loadOrderDraft(user.id);
    if (draft?.samples?.length) {
      setStep(Math.min(3, Math.max(1, draft.step)));
      setSamples(draft.samples.map(normalizeWizardSample));
      setNotes(draft.notes);
      setPromoCode(draft.promoCode);
      setCompanyName(draft.companyName || profile?.company_name || '');
      setSelectedCompanyId(draft.selectedCompanyId || '');
      if (draft.paymentMethod === 'crypto' || draft.paymentMethod === 'card') {
        setPaymentMethod(draft.paymentMethod);
      }
      if (draft.promoCode.trim().toUpperCase() === 'ATLAS10') setPromoApplied(true);
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
    let cancelled = false;
    setCatalogLoading(true);
    supabase
      .from('test_panels')
      .select('id, name, description, price_per_sample, is_active')
      .eq('is_active', true)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          console.warn('test_panels pricing refresh failed:', err.message);
          setCatalogError('Could not refresh live pricing from the laboratory database.');
          setCatalog(LAB_TEST_SERVICES);
        } else {
          setCatalogError(null);
          setCatalog(mergeCatalogWithDbPanels(LAB_TEST_SERVICES, data ?? []));
        }
        setCatalogLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (profile?.company_name && !companyName) setCompanyName(profile.company_name);
  }, [profile, companyName]);

  useEffect(() => {
    const t = setTimeout(persistDraft, 400);
    return () => clearTimeout(t);
  }, [persistDraft]);

  const readyExceptPayment = useMemo(() => {
    if (!confirmations.accurate || !confirmations.labelsMatch || !confirmations.agreeTerms) return false;
    if (validateTestingSelection(samples) || validateSampleInformation(samples)) return false;
    if (!selectedCompanyId) return false;
    return readinessExceptPayment.sampleBlocking.length === 0
      && readinessExceptPayment.blocking.every(b => !/payment/i.test(b));
  }, [confirmations, samples, selectedCompanyId, readinessExceptPayment.sampleBlocking.length, readinessExceptPayment.blocking]);

  const canSubmit = useMemo(() => {
    if (loading) return false;
    if (!paymentPaid) return false;
    return readyExceptPayment;
  }, [loading, paymentPaid, readyExceptPayment]);

  // Re-authorize payment if the billed total changes after a simulated charge.
  useEffect(() => {
    setPaymentPaid(false);
  }, [total]);

  if (!user) return <Navigate to="/auth" replace />;

  function updateSample(id: string, updates: Partial<WizardSample>) {
    setSamples(prev => prev.map(s => (s.id === id ? { ...s, ...updates } : s)));
    setValidationError('');
  }

  function updateAllSamples(mutator: (s: WizardSample) => WizardSample) {
    setSamples(prev => prev.map(mutator));
    setValidationError('');
  }

  function handleCategoryChange(category: SampleCategory) {
    updateAllSamples(s => ({ ...s, ...applyCategoryDefaults(category) }));
  }

  function handleOtherMaterialChange(matrix: WizardSample['sample_matrix']) {
    updateAllSamples(s => ({ ...s, category: 'other', sample_matrix: matrix, is_peptide: false }));
  }

  function handleSelectPrimary(testId: string) {
    updateAllSamples(s => ({
      ...applyPrimaryTest(s, testId),
      conformity_extra: testId === 'atlas_pro' ? s.conformity_extra : 0,
    }));
  }

  function handleToggleAlaCarte(testId: string) {
    updateAllSamples(s => toggleAlaCarteAssay(s, testId));
  }

  function handleToggleFentanyl(include: boolean) {
    updateAllSamples(s => ({ ...s, include_fentanyl: include }));
  }

  function handleConformityExtraChange(count: number) {
    updateAllSamples(s => ({ ...s, conformity_extra: Math.max(0, Math.round(count)) }));
  }

  function addSample() {
    const template = samples[0];
    const { id: _id, ...rest } = template ?? createEmptySample();
    const next = createEmptySample({
      ...rest,
      sample_name: '',
      display_name: '',
      batch_number: '',
      client_reference: '',
      labeled_content: '',
      peptide_identification: rest.category === 'single_peptide' ? '' : rest.peptide_identification,
      blend_components: rest.sample_type === 'blend'
        ? rest.blend_components.map(c => ({ ...c }))
        : [],
    });
    setSamples(prev => [...prev, next]);
    setCollapsed(prev => ({ ...prev, [next.id]: false }));
  }

  function duplicateSample(id: string) {
    const src = samples.find(x => x.id === id);
    if (!src) return;
    const { id: _id, batch_number: _lot, client_reference: _ref, ...rest } = src;
    const copy = createEmptySample({
      ...rest,
      batch_number: '',
      client_reference: '',
      blend_components: src.blend_components.map(c => ({ ...c })),
      individual_tests: [...src.individual_tests],
      brand_names: [...src.brand_names],
    });
    setSamples(prev => [...prev, copy]);
    setCollapsed(prev => ({ ...prev, [copy.id]: false }));
  }

  function removeSample(id: string) {
    if (samples.length <= 1) return;
    setSamples(prev => prev.filter(s => s.id !== id));
  }

  function selectCoaProfile(company: Company) {
    setSelectedCompanyId(company.id);
    setCompanyName(company.name);
    setValidationError('');
  }

  function goNext() {
    if (step === 1) {
      const err = validateTestingSelection(samples);
      if (err) { setValidationError(err); return; }
    }
    if (step === 2) {
      if (!selectedCompanyId || !companies.some(c => c.id === selectedCompanyId)) {
        setValidationError('Create or select a COA profile before continuing.');
        return;
      }
      const err = validateSampleInformation(samples);
      if (err) { setValidationError(err); return; }
    }
    setValidationError('');
    setStep(s => Math.min(3, s + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goBack() {
    setValidationError('');
    setStep(s => Math.max(1, s - 1));
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

  async function submitOrder(opts?: { forcePaid?: boolean; method?: SimulatedPaymentMethod }) {
    if (!user || loading) return;
    setError('');
    setValidationError('');

    const paid = opts?.forcePaid === true || paymentPaid;
    const method = opts?.method ?? paymentMethod;

    if (!readyExceptPayment) {
      setValidationError('Complete confirmations and required fields before paying / submitting.');
      throw new Error('Complete confirmations and required fields before paying / submitting.');
    }
    if (!paid) {
      setValidationError('Simulate payment on the review page before submitting.');
      throw new Error('Simulate payment on the review page before submitting.');
    }

    if (opts?.forcePaid) setPaymentPaid(true);
    if (opts?.method) setPaymentMethod(opts.method);

    setLoading(true);
    try {
      const orderNumber = generateOrderNumber();
      const shippingLabelId = generateShippingLabelId(orderNumber);
      const orderMeta = {
        prepaid_label: true,
        promo_code: promoApplied ? promoCode : null,
        coa_profile_id: selectedCompanyId,
        coa_profile_name: selectedCompany?.name ?? companyName,
        samples_detail: samples.map(s => sampleMetadataPayload(s, companyName, catalog)),
        payment_simulation: true,
        payment_provider: method === 'crypto' ? 'crypto_placeholder' : 'stripe_placeholder',
      };

      const anyRush = samples.some(s => s.rush);
      const orderPayload: Record<string, unknown> = {
        user_id: user.id,
        order_number: orderNumber,
        status: 'awaiting_sample',
        payment_status: 'paid',
        paid_at: new Date().toISOString(),
        payment_note:
          method === 'crypto'
            ? 'Simulated crypto payment (placeholder)'
            : 'Simulated Stripe card payment (placeholder)',
        rush_processing: anyRush,
        lab_priority: anyRush ? 'high' : 'normal',
        notes: notes ? `${notes}\n\n---\n${JSON.stringify(orderMeta)}` : JSON.stringify(orderMeta),
        subtotal,
        discount_amount: promoDiscount,
        rush_fee: samples.filter(s => s.rush).length * RUSH_PRICE_PER_SAMPLE,
        total,
        first_order_discount: false,
        company_name: selectedCompany?.name ?? companyName,
        prepaid_shipping: true,
        payment_method: method,
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
        display_name: s.display_name || `${s.sample_name} ${formatLabelClaim(s.labeled_content, s.label_claim_unit)}`.trim(),
        sample_type: s.sample_type,
        vial_count: sampleVialCount(s, catalog),
        panel_ids: [],
        status: 'awaiting_sample',
        metadata: sampleMetadataPayload(s, companyName, catalog),
      }));

      const { error: samplesError } = await supabase.from('order_samples').insert(sampleRows);
      if (samplesError) throw samplesError;

      await notifyOrderUpdate(user.id, orderNumber, 'received');
      clearOrderDraft(user.id);

      setSuccess({
        orderId: order.id,
        orderNumber,
        sampleCount,
        totalVials,
        submittedAt: order.created_at || new Date().toISOString(),
        status: order.status || 'awaiting_sample',
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit order.');
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function handleCardPayAndSubmit() {
    await submitOrder({ forcePaid: true, method: 'card' });
  }

  function resetForAnotherOrder() {
    if (user) clearOrderDraft(user.id);
    setSuccess(null);
    setStep(1);
    setSamples([createEmptySample()]);
    setCollapsed({});
    setNotes('');
    setPromoCode('');
    setPromoApplied(false);
    setConfirmations({ accurate: false, labelsMatch: false, agreeTerms: false });
    setPaymentPaid(false);
    setPaymentMethod('card');
    setPreviewPackageId(null);
    setError('');
    setValidationError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (success) {
    return (
      <div className="min-h-screen bg-neutral-100 flex flex-col">
        <header className="coa-header-bar sticky top-0 z-30 border-b border-neutral-800">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <button type="button" onClick={() => navigate(homePath)} className="text-left">
              <AtlasLogo variant="light" size="sm" />
            </button>
            <p className="font-bold text-white hidden sm:block">Order Confirmation</p>
            <button
              type="button"
              onClick={() => navigate(homePath)}
              className="text-sm text-neutral-400 hover:text-white"
            >
              {role === 'client' ? 'Dashboard' : 'Home'}
            </button>
          </div>
        </header>
        <div className="flex-1 max-w-6xl mx-auto w-full px-4 py-10">
          <OrderSuccess
            orderId={success.orderId}
            orderNumber={success.orderNumber}
            sampleCount={success.sampleCount}
            totalVials={success.totalVials}
            submittedAt={success.submittedAt}
            status={success.status}
            onSubmitAnother={resetForAnotherOrder}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col">
      <header className="coa-header-bar sticky top-0 z-30 border-b border-neutral-800">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link to="/dashboard"><AtlasLogo variant="light" size="sm" /></Link>
          <div className="absolute left-1/2 -translate-x-1/2 text-center hidden sm:block">
            <p className="font-bold leading-tight text-white">Submit Samples for Testing</p>
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
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-black">Submit Samples for Testing</h1>
          <p className="text-sm text-neutral-600 mt-1 max-w-2xl">
            Select your testing services, enter your sample information, and review your order before submission.
          </p>
        </div>

        <div className="flex items-center justify-center gap-0 mb-8">
          {STEPS.map((s, i) => {
            const done = step > s.id;
            const active = step === s.id;
            const Icon = done ? Check : s.icon;
            return (
              <div key={s.id} className="flex items-center">
                <div className={`flex flex-col items-center min-w-[72px] sm:min-w-[110px] ${active || done ? 'text-brand-700' : 'text-neutral-400'}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                    done ? 'border-brand-500 bg-brand-500 text-black' :
                    active ? 'border-brand-500 bg-brand-50 text-brand-800' :
                    'border-neutral-300 bg-white'
                  }`}>
                    <Icon size={18} />
                  </div>
                  <span className="text-xs font-semibold mt-1.5 text-center">{s.label}</span>
                  <span className="text-[10px] text-neutral-400 hidden sm:block">{s.sub}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-8 sm:w-14 h-0.5 mx-1 mb-5 ${step > s.id ? 'bg-brand-500' : 'bg-neutral-200'}`} />
                )}
              </div>
            );
          })}
        </div>

        {(error || validationError) && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2 text-sm text-red-700" role="alert">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            {error || validationError}
          </div>
        )}

        <div className="lg:hidden mb-4 space-y-4">
          <div className="max-w-xs mx-auto">
            <AtlasDigitalCoaCard
              samples={samples}
              catalog={catalog}
              companyName={selectedCompany?.name ?? companyName}
              stage={wizardStage}
              previewPackageId={previewPackageId}
              readinessPercent={readiness.percent}
            />
          </div>
          <AtlasOrderSnapshot
            samples={samples}
            catalog={catalog}
            discount={promoDiscount}
            readiness={readiness}
            includeCheckout={step === 3}
          />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {step === 1 && (
              <StepSelectTesting
                category={templateSample.category}
                onCategoryChange={handleCategoryChange}
                onOtherMaterialChange={handleOtherMaterialChange}
                sample={templateSample}
                catalog={catalog}
                onSelectPrimary={handleSelectPrimary}
                onToggleAlaCarte={handleToggleAlaCarte}
                onToggleFentanyl={handleToggleFentanyl}
                onConformityExtraChange={handleConformityExtraChange}
                onPreviewPackageChange={setPreviewPackageId}
                catalogLoading={catalogLoading}
                catalogError={catalogError}
              />
            )}

            {step === 2 && (
              <StepSampleInfo
                samples={samples}
                catalog={catalog}
                collapsed={collapsed}
                setCollapsed={setCollapsed}
                updateSample={updateSample}
                addSample={addSample}
                duplicateSample={duplicateSample}
                removeSample={removeSample}
                userId={user.id}
                companies={companies}
                selectedCompanyId={selectedCompanyId}
                onSelectCompany={selectCoaProfile}
                onCompaniesChange={setCompanies}
                onProfileSynced={() => refreshProfile()}
                companiesLoading={companiesLoading}
              />
            )}

            {step === 3 && (
              <StepReviewSubmit
                samples={samples}
                catalog={catalog}
                companyName={companyName}
                selectedCompany={selectedCompany}
                discount={promoDiscount}
                confirmations={confirmations}
                onConfirmationChange={patch => setConfirmations(prev => ({ ...prev, ...patch }))}
                onEditSample={() => setStep(2)}
                notes={notes}
                onNotesChange={setNotes}
                promoCode={promoCode}
                onPromoCodeChange={v => { setPromoCode(v); setPromoApplied(false); }}
                promoApplied={promoApplied}
                onApplyPromo={applyPromo}
                paymentPaid={paymentPaid}
                onPaymentPaidChange={setPaymentPaid}
                paymentMethod={paymentMethod}
                onPaymentMethodChange={method => {
                  setPaymentMethod(method);
                  setPaymentPaid(false);
                }}
                onCardPayAndSubmit={handleCardPayAndSubmit}
                readiness={readiness}
              />
            )}
          </div>

          <div className="hidden lg:block space-y-5 sticky top-24">
            <AtlasDigitalCoaCard
              samples={samples}
              catalog={catalog}
              companyName={selectedCompany?.name ?? companyName}
              stage={wizardStage}
              previewPackageId={previewPackageId}
              readinessPercent={readiness.percent}
            />
            <AtlasOrderSnapshot
              samples={samples}
              catalog={catalog}
              discount={promoDiscount}
              readiness={readiness}
              includeCheckout={step === 3}
            />
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 z-20 border-t border-atlas-border bg-white/95 backdrop-blur px-4 py-3">
        <div className="max-w-6xl mx-auto flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2">
          <div className="flex gap-2">
            {step > 1 ? (
              <button type="button" onClick={goBack} className="btn-outline gap-2" disabled={loading}>
                <ArrowLeft size={16} />
                Back
              </button>
            ) : (
              <Link to="/dashboard" className="btn-ghost border border-atlas-border">Cancel</Link>
            )}
          </div>
          {step < 3 ? (
            <button type="button" onClick={goNext} className="btn-primary gap-2">
              Continue
              <ArrowRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void submitOrder().catch(() => undefined)}
              disabled={!canSubmit}
              className="btn-primary gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Submitting…' : 'Submit Laboratory Order'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
