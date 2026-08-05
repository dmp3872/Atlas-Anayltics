import { useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle, AlertCircle, Loader, Save } from 'lucide-react';
import { Company, COA, Order, OrderSample } from '../../lib/types';
import { fetchUserCompanies } from '../../lib/coaProfile';
import { hasIssuedCoaForSample, parseSampleMetadata } from '../../lib/coaPanels';
import { parseOrderNotes, serializeOrderNotes } from '../../lib/orderMeta';
import { MULTI_BRAND_PRICE } from '../../lib/orderCatalog';
import { formatCurrency } from '../../lib/utils';
import { supabase } from '../../lib/supabase';

interface Props {
  userId: string;
  order: Order;
  samples: OrderSample[];
  coas: COA[];
  onSaved: (next: { order: Order; samples: OrderSample[] }) => void;
}

export default function OrderBrandingEditor({ userId, order, samples, coas, onSaved }: Props) {
  const editableSamples = useMemo(
    () => samples.filter(s => !hasIssuedCoaForSample(s, coas) && s.status !== 'complete'),
    [samples, coas],
  );

  const [companies, setCompanies] = useState<Company[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  /** sampleId → selected company ids (includes primary when checked for that sample). */
  const [sampleBrandIds, setSampleBrandIds] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const editableSampleKey = editableSamples.map(s => s.id).sort().join(',');

  useEffect(() => {
    let cancelled = false;
    setLoadingCompanies(true);
    void fetchUserCompanies(userId)
      .then(list => {
        if (cancelled) return;
        setCompanies(list);
        const { meta } = parseOrderNotes(order.notes);
        const fromMeta = typeof meta.coa_profile_id === 'string' ? meta.coa_profile_id : '';
        const byName = list.find(c => c.name === order.company_name);
        const byId = list.find(c => c.id === fromMeta);
        const primary = byId || byName || list.find(c => c.is_default) || list[0] || null;
        setPrimaryId(primary?.id ?? null);

        const nextSelections: Record<string, string[]> = {};
        for (const sample of samples) {
          if (hasIssuedCoaForSample(sample, coas) || sample.status === 'complete') continue;
          const metaBrands = parseSampleMetadata(sample.metadata).brand_names?.filter(Boolean) ?? [];
          const ids = new Set<string>();
          if (primary) ids.add(primary.id);
          for (const name of metaBrands) {
            const hit = list.find(c => c.name === name);
            if (hit) ids.add(hit.id);
          }
          nextSelections[sample.id] = [...ids];
        }
        setSampleBrandIds(nextSelections);
      })
      .catch(err => {
        if (!cancelled) {
          setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Could not load COA profiles.' });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCompanies(false);
      });
    return () => { cancelled = true; };
  }, [userId, order.id, order.company_name, order.notes, editableSampleKey, samples, coas]);

  if (editableSamples.length === 0) return null;

  const primary = companies.find(c => c.id === primaryId) || null;

  function toggleSampleBrand(sampleId: string, companyId: string) {
    setSampleBrandIds(prev => {
      const current = prev[sampleId] || [];
      const has = current.includes(companyId);
      // Keep at least the primary brand selected when available.
      if (has && companyId === primaryId && current.length <= 1) return prev;
      const next = has ? current.filter(id => id !== companyId) : [...current, companyId];
      return { ...prev, [sampleId]: next };
    });
    setMsg(null);
  }

  function selectPrimary(company: Company) {
    setPrimaryId(company.id);
    setSampleBrandIds(prev => {
      const next: Record<string, string[]> = {};
      for (const sample of editableSamples) {
        const cur = new Set(prev[sample.id] || []);
        cur.add(company.id);
        next[sample.id] = [...cur];
      }
      return next;
    });
    setMsg(null);
  }

  async function handleSave() {
    if (!primary) {
      setMsg({ type: 'error', text: 'Select a primary COA profile for this order.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const { freeText, meta } = parseOrderNotes(order.notes);
      const detail = Array.isArray(meta.samples_detail)
        ? meta.samples_detail.map(row => ({ ...row }))
        : [];

      const updatedSamples: OrderSample[] = [];
      let sampleUpdateFailed = false;

      for (const sample of editableSamples) {
        const selectedIds = sampleBrandIds[sample.id] || [primary.id];
        const selectedCompanies = selectedIds
          .map(id => companies.find(c => c.id === id))
          .filter((c): c is Company => !!c);
        const brandNames = selectedCompanies
          .map(c => c.name)
          .filter(name => name.trim().toLowerCase() !== primary.name.trim().toLowerCase());

        const prevMeta = parseSampleMetadata(sample.metadata);
        const metadata = { ...prevMeta, brand_names: brandNames };

        // Keep notes samples_detail in sync (works even before sample UPDATE RLS is applied).
        const sampleName = (sample.sample_name || '').trim().toLowerCase();
        const displayName = (sample.display_name || '').trim().toLowerCase();
        let matchedDetail = false;
        for (const row of detail) {
          const rowName = String(row.peptide_identification || row.sample_name || '').trim().toLowerCase();
          if (rowName && (rowName === sampleName || rowName === displayName)) {
            row.brand_names = brandNames;
            matchedDetail = true;
          }
        }
        if (!matchedDetail) {
          detail.push({
            sample_name: sample.sample_name,
            peptide_identification: sample.sample_name,
            brand_names: brandNames,
          });
        }

        const { data: updatedSample, error: sampleError } = await supabase
          .from('order_samples')
          .update({ metadata })
          .eq('id', sample.id)
          .select('*')
          .single();
        if (sampleError) {
          sampleUpdateFailed = true;
          console.warn('Sample branding update blocked; order notes will carry brand_names.', sampleError.message);
        } else if (updatedSample) {
          updatedSamples.push(updatedSample);
        } else {
          updatedSamples.push({ ...sample, metadata });
        }
      }

      const notes = serializeOrderNotes(freeText, {
        ...meta,
        coa_profile_id: primary.id,
        coa_profile_name: primary.name,
        samples_detail: detail,
      });
      const { data: updatedOrder, error: orderError } = await supabase
        .from('orders')
        .update({ company_name: primary.name, notes })
        .eq('id', order.id)
        .select('*')
        .single();
      if (orderError) throw orderError;

      onSaved({
        order: updatedOrder as Order,
        samples: updatedSamples.length > 0
          ? updatedSamples
          : editableSamples.map(s => {
              const selectedIds = sampleBrandIds[s.id] || [primary.id];
              const brandNames = selectedIds
                .map(id => companies.find(c => c.id === id)?.name)
                .filter((n): n is string => !!n)
                .filter(name => name.trim().toLowerCase() !== primary.name.trim().toLowerCase());
              return {
                ...s,
                metadata: { ...parseSampleMetadata(s.metadata), brand_names: brandNames },
              };
            }),
      });
      setMsg({
        type: 'success',
        text: sampleUpdateFailed
          ? 'COA branding saved on the order. Ask Atlas to apply the sample-update policy if brand chips don’t stick after refresh.'
          : 'COA branding saved. Lab will issue a certificate for each selected profile.',
      });
    } catch (err) {
      setMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not save branding.',
      });
    } finally {
      setBusy(false);
    }
  }

  const extraBrandCount = editableSamples.reduce((sum, sample) => {
    const ids = sampleBrandIds[sample.id] || [];
    return sum + ids.filter(id => id !== primaryId).length;
  }, 0);

  return (
    <div className="px-5 py-4 bg-brand-50/40 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-black flex items-center gap-2">
          <Building2 size={15} className="text-brand-600" />
          COA branding
        </h3>
        <p className="text-xs text-neutral-600 mt-1">
          Certificates aren&apos;t complete yet — choose which brand profiles should get a COA.
          Extra brands are {formatCurrency(MULTI_BRAND_PRICE)} each.
        </p>
      </div>

      {msg && (
        <div className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${
          msg.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {msg.type === 'success'
            ? <CheckCircle size={15} className="shrink-0 mt-0.5" />
            : <AlertCircle size={15} className="shrink-0 mt-0.5" />}
          {msg.text}
        </div>
      )}

      {loadingCompanies ? (
        <p className="text-sm text-neutral-500 inline-flex items-center gap-2">
          <Loader size={14} className="animate-spin" /> Loading profiles…
        </p>
      ) : companies.length === 0 ? (
        <p className="text-sm text-amber-800">
          No COA profiles yet. Add one under Account → COA Profiles, then return here.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
              Primary profile for this order
            </p>
            <div className="grid sm:grid-cols-2 gap-2">
              {companies.map(company => {
                const active = company.id === primaryId;
                return (
                  <button
                    key={company.id}
                    type="button"
                    onClick={() => selectPrimary(company)}
                    className={`p-3 rounded-xl border-2 text-left flex items-center gap-3 transition-colors ${
                      active ? 'border-brand-500 bg-white' : 'border-neutral-200 bg-white/70 hover:border-brand-300'
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
                    {active && <CheckCircle size={15} className="text-brand-600 shrink-0 ml-auto" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
              Brands receiving a COA (per sample)
            </p>
            {editableSamples.map(sample => {
              const selected = new Set(sampleBrandIds[sample.id] || (primaryId ? [primaryId] : []));
              return (
                <div key={sample.id} className="rounded-xl border border-atlas-border bg-white p-3 space-y-2">
                  <p className="text-sm font-semibold text-black">
                    {sample.display_name || sample.sample_name}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {companies.map(company => {
                      const checked = selected.has(company.id);
                      const isPrimary = company.id === primaryId;
                      return (
                        <label
                          key={company.id}
                          className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs cursor-pointer transition-colors ${
                            checked
                              ? 'border-brand-400 bg-brand-50 text-brand-900'
                              : 'border-neutral-200 text-neutral-600 hover:border-brand-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="rounded border-atlas-border"
                            checked={checked}
                            onChange={() => toggleSampleBrand(sample.id, company.id)}
                          />
                          <span className="font-semibold">{company.name}</span>
                          {isPrimary && (
                            <span className="text-[10px] uppercase tracking-wide text-brand-600">Primary</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {extraBrandCount > 0 && (
            <p className="text-xs text-neutral-600">
              {extraBrandCount} extra brand COA{extraBrandCount === 1 ? '' : 's'} · about{' '}
              {formatCurrency(extraBrandCount * MULTI_BRAND_PRICE)} in multi-brand fees
              (confirm with Atlas if your invoice needs updating).
            </p>
          )}

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={busy || !primary}
            className="btn-primary text-sm py-2 gap-2 disabled:opacity-50"
          >
            {busy ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
            {busy ? 'Saving…' : 'Save branding'}
          </button>
        </>
      )}
    </div>
  );
}
