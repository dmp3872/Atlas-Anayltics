import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Building2, CheckCircle, CreditCard, Loader, Plus, Wallet, X } from 'lucide-react';
import { Company, COA } from '../../lib/types';
import {
  fetchUserCompanies,
  purchaseBrandedCoaCopy,
  saveCoaProfile,
} from '../../lib/coaProfile';
import { POST_ISSUE_BRAND_FEE } from '../../lib/orderCatalog';
import { formatCurrency } from '../../lib/utils';
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

type Mode = 'existing' | 'new';

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
  const [mode, setMode] = useState<Mode>('existing');
  const [form, setForm] = useState<CoaProfileFormState>(EMPTY_COA_PROFILE_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const currentBrand = (coa.company_name || '').trim().toLowerCase();
  const otherCompanies = useMemo(
    () => companies.filter(c => c.name.trim().toLowerCase() !== currentBrand),
    [companies, currentBrand],
  );
  const canPrepaid = prepaidBalance >= POST_ISSUE_BRAND_FEE;
  const newNameOk = form.name.trim().length > 0
    && form.name.trim().toLowerCase() !== currentBrand;
  const canCheckout = mode === 'new' ? newNameOk : Boolean(selectedId);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setForm(EMPTY_COA_PROFILE_FORM);
    void fetchUserCompanies(userId)
      .then(list => {
        if (cancelled) return;
        setCompanies(list);
        const others = list.filter(c => c.name.trim().toLowerCase() !== currentBrand);
        if (others.length === 0) {
          setMode('new');
          setSelectedId(null);
        } else {
          setMode('existing');
          setSelectedId(others[0]?.id ?? null);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load COA profiles.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, userId, currentBrand]);

  if (!open) return null;

  async function resolveCompanyId(): Promise<string> {
    if (mode === 'existing') {
      if (!selectedId) throw new Error('Select a brand profile for the new certificate.');
      return selectedId;
    }
    if (!newNameOk) {
      throw new Error(
        currentBrand && form.name.trim().toLowerCase() === currentBrand
          ? 'Enter a different brand name than the current certificate.'
          : 'Enter a brand name for the new certificate.',
      );
    }
    const { company, error: saveError } = await saveCoaProfile(userId, form, {
      existingCount: companies.length,
    });
    if (saveError || !company) {
      throw new Error(saveError?.message || 'Could not save that COA profile.');
    }
    setCompanies(prev => [...prev, company]);
    setSelectedId(company.id);
    return company.id;
  }

  async function checkout(paymentMethod: 'card' | 'crypto' | 'prepaid') {
    setBusy(true);
    setError('');
    try {
      const companyId = await resolveCompanyId();
      const result = await purchaseBrandedCoaCopy({
        sourceCoaId: coa.id,
        companyId,
        paymentMethod,
      });
      onPurchased(result.slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the branded COA.');
    } finally {
      setBusy(false);
    }
  }

  const sampleLabel = coa.display_name || coa.sample_name || 'this sample';

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="additional-coa-title"
        className="relative z-[81] w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl border border-atlas-border shadow-xl"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-atlas-border">
          <div>
            <h2 id="additional-coa-title" className="text-lg font-bold text-black flex items-center gap-2">
              <Building2 size={18} className="text-brand-600" />
              Additional COA
            </h2>
            <p className="text-sm text-neutral-600 mt-1">
              Get a copy of <strong>{sampleLabel}</strong> under another brand for{' '}
              <strong>{formatCurrency(POST_ISSUE_BRAND_FEE)}</strong>. Assay results stay the same;
              only the header logo and watermark change.
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
              <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Brand source">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'existing'}
                  disabled={otherCompanies.length === 0}
                  onClick={() => {
                    setMode('existing');
                    setError('');
                    if (!selectedId && otherCompanies[0]) setSelectedId(otherCompanies[0].id);
                  }}
                  className={`rounded-xl border-2 px-3 py-2.5 text-left text-sm transition-colors disabled:opacity-40 ${
                    mode === 'existing'
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-neutral-200 hover:border-brand-300'
                  }`}
                >
                  <p className="font-bold text-black">Saved brand</p>
                  <p className="text-xs text-neutral-500 mt-0.5">Pick an existing COA profile</p>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'new'}
                  onClick={() => {
                    setMode('new');
                    setError('');
                  }}
                  className={`rounded-xl border-2 px-3 py-2.5 text-left text-sm transition-colors ${
                    mode === 'new'
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-neutral-200 hover:border-brand-300'
                  }`}
                >
                  <p className="font-bold text-black inline-flex items-center gap-1">
                    <Plus size={14} /> New branding
                  </p>
                  <p className="text-xs text-neutral-500 mt-0.5">Name + logo for this COA</p>
                </button>
              </div>

              {mode === 'existing' ? (
                otherCompanies.length === 0 ? (
                  <p className="text-sm text-neutral-600">
                    No other profiles yet. Switch to <strong>New branding</strong>, or manage profiles in{' '}
                    <Link to="/dashboard?tab=account" className="text-brand-700 font-semibold hover:underline">
                      Account
                    </Link>.
                  </p>
                ) : (
                  <div className="grid gap-2">
                    {otherCompanies.map(company => {
                      const active = company.id === selectedId;
                      return (
                        <button
                          key={company.id}
                          type="button"
                          onClick={() => {
                            setSelectedId(company.id);
                            setError('');
                          }}
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
                          <span className="font-semibold text-sm truncate flex-1">{company.name}</span>
                          {active && <CheckCircle size={16} className="text-brand-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )
              ) : (
                <div className="rounded-xl border border-atlas-border p-3 space-y-3 bg-neutral-50/50">
                  <p className="text-xs text-neutral-600">
                    This brand is saved to your account and applied to the new certificate right away.
                  </p>
                  <CoaProfileFormFields
                    compact
                    form={form}
                    onChange={patch => {
                      setForm(prev => ({ ...prev, ...patch }));
                      setError('');
                    }}
                    onError={setError}
                  />
                </div>
              )}

              <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-black">Checkout</p>
                    <p className="text-sm text-neutral-600 mt-0.5">
                      {formatCurrency(POST_ISSUE_BRAND_FEE)} · simulated payment until live card checkout is connected
                    </p>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-1 rounded shrink-0">
                    Simulation
                  </span>
                </div>

                {canPrepaid && (
                  <button
                    type="button"
                    disabled={busy || !canCheckout}
                    onClick={() => void checkout('prepaid')}
                    className="w-full rounded-xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3 text-left disabled:opacity-50"
                  >
                    <p className="text-sm font-bold text-emerald-900 flex items-center gap-2">
                      <Wallet size={16} /> Use prepaid balance
                    </p>
                    <p className="text-xs text-emerald-800 mt-0.5">
                      {formatCurrency(POST_ISSUE_BRAND_FEE)} from {formatCurrency(prepaidBalance)} available
                    </p>
                  </button>
                )}

                <button
                  type="button"
                  disabled={busy || !canCheckout}
                  onClick={() => void checkout('card')}
                  className="btn-primary w-full gap-2 justify-center disabled:opacity-50"
                >
                  {busy ? (
                    <>
                      <Loader size={16} className="animate-spin" /> Issuing additional COA…
                    </>
                  ) : (
                    <>
                      <CreditCard size={16} />
                      Pay {formatCurrency(POST_ISSUE_BRAND_FEE)} &amp; issue COA
                    </>
                  )}
                </button>
                {!canCheckout && (
                  <p className="text-xs text-neutral-500">
                    {mode === 'new'
                      ? 'Enter a brand name above to continue.'
                      : 'Select a brand profile to continue.'}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
