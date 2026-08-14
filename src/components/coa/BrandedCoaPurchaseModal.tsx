import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Building2, Loader, Plus, Wallet, X } from 'lucide-react';
import { Company, COA } from '../../lib/types';
import {
  fetchUserCompanies,
  purchaseBrandedCoaCopy,
  saveCoaProfile,
} from '../../lib/coaProfile';
import { POST_ISSUE_BRAND_FEE } from '../../lib/orderCatalog';
import { formatCurrency } from '../../lib/utils';
import OrderPaymentPlaceholder, {
  SimulatedPaymentMethod,
} from '../order/wizard/OrderPaymentPlaceholder';
import CoaProfileFormFields, {
  EMPTY_COA_PROFILE_FORM,
  CoaProfileFormState,
} from '../order/CoaProfileFormFields';

interface Props {
  open: boolean;
  coa: Pick<COA, 'id' | 'slug' | 'company_name' | 'sample_name' | 'display_name'>;
  userId: string;
  prepaidBalance?: number;
  onClose: () => void;
  onPurchased: (slug: string) => void;
}

export default function BrandedCoaPurchaseModal({
  open,
  coa,
  userId,
  prepaidBalance = 0,
  onClose,
  onPurchased,
}: Props) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [method, setMethod] = useState<SimulatedPaymentMethod>('card');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<CoaProfileFormState>(EMPTY_COA_PROFILE_FORM);
  const [savingProfile, setSavingProfile] = useState(false);

  const currentBrand = (coa.company_name || '').trim().toLowerCase();
  const otherCompanies = useMemo(
    () => companies.filter(c => c.name.trim().toLowerCase() !== currentBrand),
    [companies, currentBrand],
  );
  const canPrepaid = prepaidBalance >= POST_ISSUE_BRAND_FEE;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setShowNew(false);
    setForm(EMPTY_COA_PROFILE_FORM);
    void fetchUserCompanies(userId)
      .then(list => {
        if (cancelled) return;
        setCompanies(list);
        const first = list.find(c => c.name.trim().toLowerCase() !== currentBrand);
        setSelectedId(first?.id ?? null);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load COA profiles.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, userId, currentBrand]);

  if (!open) return null;

  async function createProfile() {
    setSavingProfile(true);
    setError('');
    const { company, error: saveError } = await saveCoaProfile(userId, form, {
      existingCount: companies.length,
    });
    setSavingProfile(false);
    if (saveError || !company) {
      setError(saveError?.message || 'Could not save that COA profile.');
      return;
    }
    setCompanies(prev => [...prev, company]);
    setSelectedId(company.id);
    setShowNew(false);
    setForm(EMPTY_COA_PROFILE_FORM);
  }

  async function fulfill(paymentMethod: 'card' | 'crypto' | 'prepaid') {
    if (!selectedId) {
      throw new Error('Select a brand profile for the new certificate.');
    }
    setBusy(true);
    setError('');
    try {
      const result = await purchaseBrandedCoaCopy({
        sourceCoaId: coa.id,
        companyId: selectedId,
        paymentMethod,
      });
      onPurchased(result.slug);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create the branded COA.';
      setError(message);
      throw err;
    } finally {
      setBusy(false);
    }
  }

  const sampleLabel = coa.display_name || coa.sample_name || 'this sample';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl border border-atlas-border shadow-xl">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-atlas-border">
          <div>
            <h2 className="text-lg font-bold text-black flex items-center gap-2">
              <Building2 size={18} className="text-brand-600" />
              Branded COA
            </h2>
            <p className="text-sm text-neutral-600 mt-1">
              Get a copy of {sampleLabel} under a different brand for{' '}
              <strong>{formatCurrency(POST_ISSUE_BRAND_FEE)}</strong>. Results stay the same;
              header logo and watermark switch to the profile you pick.
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost p-1.5 shrink-0" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-neutral-500 inline-flex items-center gap-2">
              <Loader size={14} className="animate-spin" /> Loading profiles…
            </p>
          ) : (
            <>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-2">
                  Brand for the new certificate
                </p>
                {otherCompanies.length === 0 && !showNew ? (
                  <p className="text-sm text-neutral-600">
                    Add another COA profile to use a different brand.{' '}
                    <Link to="/dashboard?tab=account" className="text-brand-700 font-semibold hover:underline">
                      Manage profiles
                    </Link>
                  </p>
                ) : (
                  <div className="grid gap-2">
                    {otherCompanies.map(company => {
                      const active = company.id === selectedId;
                      return (
                        <button
                          key={company.id}
                          type="button"
                          onClick={() => setSelectedId(company.id)}
                          className={`p-3 rounded-xl border-2 text-left flex items-center gap-3 transition-colors ${
                            active ? 'border-brand-500 bg-brand-50/60' : 'border-neutral-200 hover:border-brand-300'
                          }`}
                        >
                          {company.logo ? (
                            <img
                              src={company.logo}
                              alt=""
                              className="h-9 w-9 rounded object-contain bg-white border border-neutral-100 shrink-0"
                            />
                          ) : (
                            <div className="h-9 w-9 rounded bg-neutral-100 flex items-center justify-center shrink-0">
                              <Building2 size={14} className="text-neutral-400" />
                            </div>
                          )}
                          <span className="font-semibold text-sm truncate">{company.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <button
                  type="button"
                  className="btn-ghost text-sm mt-2 px-0 gap-1.5 text-brand-700"
                  onClick={() => setShowNew(v => !v)}
                >
                  <Plus size={14} /> {showNew ? 'Cancel new profile' : 'Create a new COA profile'}
                </button>
              </div>

              {showNew && (
                <div className="rounded-xl border border-atlas-border p-3 space-y-3">
                  <CoaProfileFormFields
                    compact
                    form={form}
                    onChange={patch => setForm(prev => ({ ...prev, ...patch }))}
                    onError={setError}
                  />
                  <button
                    type="button"
                    className="btn-outline text-sm py-2"
                    disabled={savingProfile || !form.name.trim()}
                    onClick={() => void createProfile()}
                  >
                    {savingProfile ? 'Saving…' : 'Save profile'}
                  </button>
                </div>
              )}

              {selectedId && (
                <>
                  {canPrepaid && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void fulfill('prepaid').catch(() => undefined)}
                      className="w-full rounded-xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3 text-left"
                    >
                      <p className="text-sm font-bold text-emerald-900 flex items-center gap-2">
                        <Wallet size={16} /> Use prepaid balance
                      </p>
                      <p className="text-xs text-emerald-800 mt-0.5">
                        {formatCurrency(POST_ISSUE_BRAND_FEE)} from {formatCurrency(prepaidBalance)} available
                      </p>
                    </button>
                  )}

                  <OrderPaymentPlaceholder
                    amount={POST_ISSUE_BRAND_FEE}
                    paid={false}
                    method={method}
                    onMethodChange={setMethod}
                    onPaidChange={() => undefined}
                    onAuthorized={() => fulfill(method)}
                    description={`Pay ${formatCurrency(POST_ISSUE_BRAND_FEE)} to issue a branded copy instantly. Live Stripe / crypto checkout comes later.`}
                    payButtonLabel={`Pay ${formatCurrency(POST_ISSUE_BRAND_FEE)} and issue branded COA`}
                    processingLabel="Issuing branded COA…"
                    footerNote="Simulated payment until live checkout is connected. The branded certificate is created immediately after authorization."
                  />
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
