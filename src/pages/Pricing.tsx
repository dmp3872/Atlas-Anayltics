import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Zap, ArrowRight, Info, Minus, Plus } from 'lucide-react';
import { TestPanel } from '../lib/types';
import { fetchTestPanels, splitTestPanels } from '../lib/services/submissions';
import {
  formatCurrency,
  getVolumeDiscount,
  RUSH_FEE_PER_SAMPLE,
  FIRST_ORDER_DISCOUNT,
  VOLUME_DISCOUNTS,
  BASE_PRICE_PER_SAMPLE,
  BLEND_SURCHARGE_PER_COMPOUND,
  CONFORMITY_VIAL_PRICE,
} from '../lib/utils';
import { ATLAS_SAFETY_PRO_INCLUDES, ATLAS_SAFETY_PRO_PRICE } from '../lib/submissionUtils';

interface BlendSample {
  id: number;
  compounds: number;
}

export default function Pricing() {
  const [addOnPanels, setAddOnPanels] = useState<TestPanel[]>([]);
  const [packagePanels, setPackagePanels] = useState<TestPanel[]>([]);
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);
  const [sampleCount, setSampleCount] = useState(1);
  const [blendSamples, setBlendSamples] = useState<BlendSample[]>([]);
  const [conformityVials, setConformityVials] = useState(0);
  const [rushProcessing, setRushProcessing] = useState(false);
  const [firstOrder, setFirstOrder] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTestPanels()
      .then((panels) => {
        const { packages, individual } = splitTestPanels(panels);
        setPackagePanels(packages);
        setAddOnPanels(individual);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function toggleAddOn(id: string) {
    setSelectedAddOns(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  }

  function setSampleCountSafe(n: number) {
    const v = Math.max(1, n);
    setSampleCount(v);
    setBlendSamples(prev => prev.filter(b => b.id < v));
  }

  function toggleBlend(idx: number) {
    setBlendSamples(prev => {
      const exists = prev.find(b => b.id === idx);
      if (exists) return prev.filter(b => b.id !== idx);
      return [...prev, { id: idx, compounds: 2 }];
    });
  }

  function setBlendCompounds(idx: number, compounds: number) {
    setBlendSamples(prev =>
      prev.map(b => b.id === idx ? { ...b, compounds: Math.max(2, compounds) } : b)
    );
  }

  const selectedPanelObjects = addOnPanels.filter(p => selectedAddOns.includes(p.id));
  const addOnCostPerSample = selectedPanelObjects.reduce((s, p) => s + p.price_per_sample, 0);
  const volumeDiscount = getVolumeDiscount(sampleCount);

  const baseCost = BASE_PRICE_PER_SAMPLE * sampleCount;
  const addOnCost = addOnCostPerSample * sampleCount;
  const discountableSubtotal = (baseCost + addOnCost) * (1 - volumeDiscount);

  const blendSurcharge = blendSamples.reduce((s, b) => s + b.compounds * BLEND_SURCHARGE_PER_COMPOUND, 0);
  const conformityCost = conformityVials * CONFORMITY_VIAL_PRICE;

  const subtotalBeforeFirstOrder = discountableSubtotal + blendSurcharge + conformityCost;
  const firstOrderSavings = firstOrder ? discountableSubtotal * FIRST_ORDER_DISCOUNT : 0;
  const afterFirstOrder = subtotalBeforeFirstOrder - firstOrderSavings;
  const rushFee = rushProcessing ? sampleCount * RUSH_FEE_PER_SAMPLE : 0;
  const total = afterFirstOrder + rushFee;

  const currentVolumeTier = VOLUME_DISCOUNTS.find(t => sampleCount >= t.min && sampleCount <= t.max);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-black py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl font-bold text-white mb-3">Pricing Calculator</h1>
          <p className="text-slate-400 text-lg">Volume discounts automatically applied. No hidden fees.</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {packagePanels.length > 0 && (
          <div className="mb-8">
            {packagePanels.map((pkg) => (
              <div key={pkg.id} className="card p-6 border-brand-200 bg-gradient-to-br from-brand-50/80 to-white">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-brand-700 uppercase tracking-wider mb-1">All-in-one testing</p>
                    <h2 className="text-2xl font-bold text-slate-900">{pkg.name}</h2>
                    <p className="text-sm text-slate-600 mt-2 max-w-2xl">{pkg.description}</p>
                    <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      {ATLAS_SAFETY_PRO_INCLUDES.map((item) => (
                        <div key={item} className="flex items-center gap-2 text-sm text-slate-700">
                          <CheckCircle size={14} className="text-brand-600 flex-shrink-0" />
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="lg:text-right flex-shrink-0">
                    <p className="text-3xl font-bold text-brand-700">
                      {formatCurrency(pkg.price_per_sample ?? ATLAS_SAFETY_PRO_PRICE)}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">per sample · {pkg.turnaround_days} business days</p>
                    <Link
                      to="/dashboard/submissions/new"
                      className="inline-flex items-center gap-2 mt-4 btn-primary text-sm"
                    >
                      Submit with this package <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">

            <div className="card p-6">
              <h2 className="font-semibold text-slate-900 mb-1 text-lg">Configure Your Bundle</h2>
              <p className="text-sm text-slate-500 mb-5">Volume discounts automatically applied.</p>

              <div className="mb-6">
                <label className="label text-sm font-semibold text-slate-700">Number of Samples</label>
                <div className="flex items-center gap-3 mt-2">
                  <button
                    onClick={() => setSampleCountSafe(sampleCount - 1)}
                    className="w-10 h-10 rounded-lg border border-slate-300 flex items-center justify-center hover:bg-slate-50 text-slate-600 font-bold transition-colors"
                  >
                    <Minus size={16} />
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={sampleCount}
                    onChange={e => setSampleCountSafe(parseInt(e.target.value) || 1)}
                    className="input-field w-20 text-center font-semibold text-lg"
                  />
                  <button
                    onClick={() => setSampleCountSafe(sampleCount + 1)}
                    className="w-10 h-10 rounded-lg border border-slate-300 flex items-center justify-center hover:bg-slate-50 text-slate-600 font-bold transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                  {volumeDiscount > 0 && (
                    <span className="text-sm font-semibold text-brand-600 bg-brand-50 px-3 py-1.5 rounded-full border border-brand-200">
                      {Math.round(volumeDiscount * 100)}% volume discount
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Each sample includes Purity, Net Content, and ID testing — {formatCurrency(BASE_PRICE_PER_SAMPLE)}/sample
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {VOLUME_DISCOUNTS.filter(t => t.discount > 0).map(tier => (
                    <div key={tier.min} className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      currentVolumeTier?.min === tier.min
                        ? 'border-brand-500 bg-brand-50 text-brand-700 font-semibold'
                        : 'border-slate-200 text-slate-500'
                    }`}>
                      {tier.min}–{tier.max === Infinity ? '∞' : tier.max}: {Math.round(tier.discount * 100)}% off
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-100 pt-5">
                <h3 className="font-semibold text-slate-900 mb-1">Blend Samples</h3>
                <p className="text-xs text-slate-500 mb-3">
                  Mark which compounds are blends. Blends add {formatCurrency(BLEND_SURCHARGE_PER_COMPOUND)} per blend compound and are not discounted.
                </p>
                <div className="space-y-2">
                  {Array.from({ length: sampleCount }, (_, i) => {
                    const blend = blendSamples.find(b => b.id === i);
                    return (
                      <div key={i} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${blend ? 'border-brand-300 bg-brand-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                        <button
                          onClick={() => toggleBlend(i)}
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${blend ? 'border-brand-500 bg-brand-500' : 'border-slate-300'}`}
                        >
                          {blend && <CheckCircle size={11} className="text-white" />}
                        </button>
                        <span className="text-sm font-medium text-slate-700 flex-1">Compound {i + 1}</span>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${blend ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                          {blend ? 'Blend' : 'Single Compound'}
                        </span>
                        {blend && (
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => setBlendCompounds(i, blend.compounds - 1)} className="w-6 h-6 rounded border border-slate-300 flex items-center justify-center text-slate-600 hover:bg-slate-100"><Minus size={11} /></button>
                            <span className="text-sm font-semibold text-slate-900 w-5 text-center">{blend.compounds}</span>
                            <button onClick={() => setBlendCompounds(i, blend.compounds + 1)} className="w-6 h-6 rounded border border-slate-300 flex items-center justify-center text-slate-600 hover:bg-slate-100"><Plus size={11} /></button>
                            <span className="text-xs text-slate-500">compounds</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-slate-100 pt-5 mt-5">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-slate-900">Conformity Vials</h3>
                  <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{formatCurrency(CONFORMITY_VIAL_PRICE)}/vial</span>
                </div>
                <p className="text-xs text-slate-500 mb-3">Extra vials for batch clarity/conformity testing</p>
                <div className="flex items-center gap-3">
                  <button onClick={() => setConformityVials(Math.max(0, conformityVials - 1))} className="w-9 h-9 rounded-lg border border-slate-300 flex items-center justify-center hover:bg-slate-50 text-slate-600 transition-colors"><Minus size={14} /></button>
                  <span className="w-8 text-center font-semibold text-slate-900 text-base">{conformityVials}</span>
                  <button onClick={() => setConformityVials(conformityVials + 1)} className="w-9 h-9 rounded-lg border border-slate-300 flex items-center justify-center hover:bg-slate-50 text-slate-600 transition-colors"><Plus size={14} /></button>
                </div>
              </div>
            </div>

            <div className="card p-6">
              <h2 className="font-semibold text-slate-900 mb-1 text-lg">Add-on Tests <span className="text-sm font-normal text-slate-500">(apply to all samples)</span></h2>
              <p className="text-xs text-slate-500 mb-4">Volume discounts apply to add-ons.</p>
              {loading ? (
                <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />)}</div>
              ) : (
                <div className="space-y-2">
                  {addOnPanels.map(panel => {
                    const selected = selectedAddOns.includes(panel.id);
                    return (
                      <button
                        key={panel.id}
                        onClick={() => toggleAddOn(panel.id)}
                        className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all text-left ${
                          selected ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${selected ? 'border-brand-500 bg-brand-500' : 'border-slate-300'}`}>
                            {selected && <CheckCircle size={12} className="text-white" />}
                          </div>
                          <div>
                            <p className="font-medium text-slate-900 text-sm">{panel.name}</p>
                            <p className="text-xs text-slate-500">{panel.description}</p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 ml-4">
                          <p className="font-bold text-slate-900">+{formatCurrency(panel.price_per_sample)}</p>
                          <p className="text-xs text-slate-500">per sample</p>
                        </div>
                      </button>
                    );
                  })}

                  <div className="pt-3 mt-1">
                    <button
                      onClick={() => setRushProcessing(!rushProcessing)}
                      className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all text-left ${rushProcessing ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${rushProcessing ? 'border-amber-500 bg-amber-500' : 'border-slate-300'}`}>
                          {rushProcessing && <CheckCircle size={12} className="text-white" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-slate-900 text-sm">Rush Processing</p>
                            <Zap size={14} className="text-amber-500" />
                          </div>
                          <p className="text-xs text-slate-500">Expedited 48-hour turnaround</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-4">
                        <p className="font-bold text-slate-900">+{formatCurrency(RUSH_FEE_PER_SAMPLE)}</p>
                        <p className="text-xs text-slate-500">per sample</p>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="card p-5 bg-emerald-50 border-emerald-200">
              <button
                onClick={() => setFirstOrder(!firstOrder)}
                className="w-full flex items-center gap-3 text-left"
              >
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${firstOrder ? 'border-emerald-500 bg-emerald-500' : 'border-emerald-400'}`}>
                  {firstOrder && <CheckCircle size={12} className="text-white" />}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-emerald-900 text-sm">First Order? Apply 50% Discount</p>
                  <p className="text-xs text-emerald-700">Automatically applied at checkout for new accounts. Check to preview pricing.</p>
                </div>
                {firstOrder && firstOrderSavings > 0 && (
                  <span className="font-bold text-emerald-700">−{formatCurrency(firstOrderSavings)}</span>
                )}
              </button>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="card p-6 sticky top-24">
              <h2 className="font-semibold text-slate-900 mb-4">Price Summary</h2>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-slate-700">
                  <span>Base bundle × {sampleCount}</span>
                  <span>{formatCurrency(BASE_PRICE_PER_SAMPLE * sampleCount)}</span>
                </div>
                {selectedPanelObjects.map(p => (
                  <div key={p.id} className="flex justify-between text-slate-600">
                    <span className="truncate pr-2 text-xs">{p.name} × {sampleCount}</span>
                    <span className="flex-shrink-0">{formatCurrency(p.price_per_sample * sampleCount)}</span>
                  </div>
                ))}
                {volumeDiscount > 0 && (
                  <div className="flex justify-between text-brand-600 font-medium">
                    <span>Volume ({Math.round(volumeDiscount * 100)}% off)</span>
                    <span>−{formatCurrency((baseCost + addOnCost) * volumeDiscount)}</span>
                  </div>
                )}
                {blendSurcharge > 0 && (
                  <div className="flex justify-between text-slate-700">
                    <span>Blend surcharge</span>
                    <span>+{formatCurrency(blendSurcharge)}</span>
                  </div>
                )}
                {conformityCost > 0 && (
                  <div className="flex justify-between text-slate-700">
                    <span>Conformity vials × {conformityVials}</span>
                    <span>+{formatCurrency(conformityCost)}</span>
                  </div>
                )}
                {firstOrder && firstOrderSavings > 0 && (
                  <div className="flex justify-between text-emerald-600 font-medium">
                    <span>First order (50% off)</span>
                    <span>−{formatCurrency(firstOrderSavings)}</span>
                  </div>
                )}
                {rushProcessing && (
                  <div className="flex justify-between text-amber-600 font-medium">
                    <span>Rush × {sampleCount}</span>
                    <span>+{formatCurrency(rushFee)}</span>
                  </div>
                )}

                <div className="pt-3 border-t border-slate-200">
                  <div className="flex justify-between text-lg font-bold text-slate-900">
                    <span>Estimated Total</span>
                    <span>{formatCurrency(total)}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">+ prepaid shipping (coming soon)</p>
                </div>

                <Link to="/order" className="btn-primary w-full mt-4 gap-2 justify-center">
                  Start Order <ArrowRight size={16} />
                </Link>

                {total === 0 && (
                  <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 p-3 rounded-lg">
                    <Info size={13} className="flex-shrink-0" />
                    Configure above to see pricing.
                  </div>
                )}
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100 space-y-1.5">
                {['No minimums or contracts', 'Flat pricing any peptide', 'No hidden fees', 'First order 50% off'].map(f => (
                  <div key={f} className="flex items-center gap-2 text-xs text-slate-500">
                    <CheckCircle size={11} className="text-brand-500" />
                    {f}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
