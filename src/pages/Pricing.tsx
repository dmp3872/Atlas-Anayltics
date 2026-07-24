import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Zap, ArrowRight, Minus, Plus } from 'lucide-react';
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
    <div className="min-h-screen bg-neutral-100 pb-28 lg:pb-10">
      {/* Hero — compact on mobile */}
      <div className="bg-black border-b border-neutral-800">
        <div className="max-w-3xl mx-auto text-center px-4 pt-8 pb-10 sm:pt-10 sm:pb-12 md:py-14">
          <p className="text-brand-400 text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] mb-3">
            Transparent pricing
          </p>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
            Pricing Calculator
          </h1>
          <p className="text-neutral-400 text-sm sm:text-base mt-2 max-w-md mx-auto">
            Volume discounts applied automatically. No hidden fees.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-5 sm:-mt-6 relative z-10 pb-4">
        {packagePanels.length > 0 && (
          <div className="mb-5 lg:mb-8">
            {packagePanels.map((pkg) => (
              <div key={pkg.id} className="card p-5 sm:p-6 border-brand-200 bg-gradient-to-br from-brand-50/80 to-white shadow-sm">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                  <div className="flex-1">
                    <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-1">All-in-one testing</p>
                    <h2 className="text-2xl font-bold text-black">{pkg.name}</h2>
                    <p className="text-sm text-neutral-600 mt-2 max-w-2xl">{pkg.description}</p>
                    <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      {ATLAS_SAFETY_PRO_INCLUDES.map((item) => (
                        <div key={item} className="flex items-center gap-2 text-sm text-neutral-700">
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
                    <p className="text-sm text-neutral-500 mt-1">per sample · 3–5 business days</p>
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-8">
          <div className="lg:col-span-2 space-y-5">

            <div className="card p-4 sm:p-6 shadow-sm">
              <h2 className="font-bold text-black text-lg">Configure Your Bundle</h2>
              <p className="text-sm text-neutral-500 mt-0.5 mb-5">Volume discounts automatically applied.</p>

              <div className="mb-6">
                <label className="label">Number of Samples</label>
                <div className="flex items-center gap-2 sm:gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => setSampleCountSafe(sampleCount - 1)}
                    className="qty-stepper-btn"
                    aria-label="Decrease samples"
                  >
                    <Minus size={16} />
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={sampleCount}
                    onChange={e => setSampleCountSafe(parseInt(e.target.value) || 1)}
                    className="input-field flex-1 sm:flex-none sm:w-20 text-center font-bold text-lg py-2.5"
                  />
                  <button
                    type="button"
                    onClick={() => setSampleCountSafe(sampleCount + 1)}
                    className="qty-stepper-btn"
                    aria-label="Increase samples"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                {volumeDiscount > 0 && (
                  <p className="mt-3 text-sm font-semibold text-brand-800 bg-brand-50 border border-brand-200 rounded-md px-3 py-2 inline-block">
                    {Math.round(volumeDiscount * 100)}% volume discount applied
                  </p>
                )}
                <p className="text-xs text-neutral-500 mt-3 leading-relaxed">
                  Each sample includes Purity, Net Content, and ID testing — {formatCurrency(BASE_PRICE_PER_SAMPLE)}/sample
                </p>
                <div className="mt-4 grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                  {VOLUME_DISCOUNTS.filter(t => t.discount > 0).map(tier => (
                    <div
                      key={tier.min}
                      className={`pricing-tier-pill ${
                        currentVolumeTier?.min === tier.min ? 'pricing-tier-pill-active' : 'pricing-tier-pill-inactive'
                      }`}
                    >
                      {tier.min}–{tier.max === Infinity ? '∞' : tier.max}: {Math.round(tier.discount * 100)}% off
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-atlas-border pt-5">
                <h3 className="font-bold text-black mb-1">Blend Samples</h3>
                <p className="text-xs text-neutral-500 mb-3 leading-relaxed">
                  Mark blends for +{formatCurrency(BLEND_SURCHARGE_PER_COMPOUND)} per compound (not volume-discounted).
                </p>
                <div className="space-y-2">
                  {Array.from({ length: sampleCount }, (_, i) => {
                    const blend = blendSamples.find(b => b.id === i);
                    return (
                      <div
                        key={i}
                        className={`p-3 sm:p-3.5 rounded-lg border transition-colors ${
                          blend ? 'border-brand-400 bg-brand-50' : 'border-atlas-border bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => toggleBlend(i)}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                              blend ? 'border-brand-500 bg-brand-500' : 'border-neutral-300'
                            }`}
                            aria-label={`Toggle blend for compound ${i + 1}`}
                          >
                            {blend && <CheckCircle size={11} className="text-white" />}
                          </button>
                          <span className="text-sm font-medium text-black flex-1 min-w-0">Compound {i + 1}</span>
                          <span className={`text-[11px] px-2 py-0.5 rounded font-semibold uppercase tracking-wide shrink-0 ${
                            blend ? 'bg-amber-100 text-amber-800' : 'bg-neutral-100 text-neutral-500'
                          }`}>
                            {blend ? 'Blend' : 'Single'}
                          </span>
                        </div>
                        {blend && (
                          <div className="flex items-center gap-2 mt-3 ml-8 pt-3 border-t border-brand-200/60">
                            <span className="text-xs text-neutral-600 mr-1">Compounds</span>
                            <button type="button" onClick={() => setBlendCompounds(i, blend.compounds - 1)} className="qty-stepper-btn w-8 h-8"><Minus size={11} /></button>
                            <span className="text-sm font-bold text-black w-6 text-center">{blend.compounds}</span>
                            <button type="button" onClick={() => setBlendCompounds(i, blend.compounds + 1)} className="qty-stepper-btn w-8 h-8"><Plus size={11} /></button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-atlas-border pt-5 mt-5">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h3 className="font-bold text-black">Conformity Vials</h3>
                  <span className="text-[11px] font-semibold text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded">{formatCurrency(CONFORMITY_VIAL_PRICE)}/vial</span>
                </div>
                <p className="text-xs text-neutral-500 mb-3">Extra vials for batch clarity testing</p>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setConformityVials(Math.max(0, conformityVials - 1))} className="qty-stepper-btn w-10 h-10"><Minus size={14} /></button>
                  <span className="min-w-[2rem] text-center font-bold text-black text-lg">{conformityVials}</span>
                  <button type="button" onClick={() => setConformityVials(conformityVials + 1)} className="qty-stepper-btn w-10 h-10"><Plus size={14} /></button>
                </div>
              </div>
            </div>

            <div className="card p-4 sm:p-6 shadow-sm">
              <h2 className="font-bold text-black text-lg">Add-on Tests</h2>
              <p className="text-xs text-neutral-500 mt-0.5 mb-4">Apply to all samples · volume discounts included</p>
              {loading ? (
                <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-neutral-100 rounded-lg animate-pulse" />)}</div>
              ) : (
                <div className="space-y-2">
                  {addOnPanels.map(panel => {
                    const selected = selectedAddOns.includes(panel.id);
                    return (
                      <button
                        key={panel.id}
                        type="button"
                        onClick={() => toggleAddOn(panel.id)}
                        className={`w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-4 rounded-lg border-2 transition-all text-left ${
                          selected ? 'border-brand-500 bg-brand-50' : 'border-atlas-border hover:border-neutral-400 bg-white'
                        }`}
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={`w-5 h-5 mt-0.5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${selected ? 'border-brand-500 bg-brand-500' : 'border-neutral-300'}`}>
                            {selected && <CheckCircle size={12} className="text-white" />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-black text-sm">{panel.name}</p>
                            <p className="text-xs text-neutral-500 mt-0.5 leading-relaxed">{panel.description}</p>
                          </div>
                        </div>
                        <div className="sm:text-right flex-shrink-0 pl-8 sm:pl-0">
                          <p className="font-bold text-black">+{formatCurrency(panel.price_per_sample)}</p>
                          <p className="text-xs text-neutral-500">per sample</p>
                        </div>
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => setRushProcessing(!rushProcessing)}
                    className={`w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-4 rounded-lg border-2 transition-all text-left mt-3 ${
                      rushProcessing ? 'border-amber-400 bg-amber-50' : 'border-atlas-border hover:border-neutral-400 bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-5 h-5 mt-0.5 rounded border-2 flex items-center justify-center flex-shrink-0 ${rushProcessing ? 'border-amber-500 bg-amber-500' : 'border-neutral-300'}`}>
                        {rushProcessing && <CheckCircle size={12} className="text-white" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-black text-sm">Rush Processing</p>
                          <Zap size={14} className="text-amber-500" />
                        </div>
                        <p className="text-xs text-neutral-500 mt-0.5">Expedited 48-hour turnaround</p>
                      </div>
                    </div>
                    <div className="sm:text-right flex-shrink-0 pl-8 sm:pl-0">
                      <p className="font-bold text-black">+{formatCurrency(RUSH_FEE_PER_SAMPLE)}</p>
                      <p className="text-xs text-neutral-500">per sample</p>
                    </div>
                  </button>
                </div>
              )}
            </div>

            <div className="card p-4 sm:p-5 bg-emerald-50 border-emerald-200">
              <button
                type="button"
                onClick={() => setFirstOrder(!firstOrder)}
                className="w-full flex items-start sm:items-center gap-3 text-left"
              >
                <div className={`w-5 h-5 mt-0.5 sm:mt-0 rounded border-2 flex items-center justify-center flex-shrink-0 ${firstOrder ? 'border-emerald-500 bg-emerald-500' : 'border-emerald-400'}`}>
                  {firstOrder && <CheckCircle size={12} className="text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-emerald-900 text-sm">First order? Preview 50% discount</p>
                  <p className="text-xs text-emerald-700 mt-0.5 leading-relaxed">Applied automatically at checkout for new accounts.</p>
                </div>
                {firstOrder && firstOrderSavings > 0 && (
                  <span className="font-bold text-emerald-700 shrink-0">−{formatCurrency(firstOrderSavings)}</span>
                )}
              </button>
            </div>
          </div>

          {/* Desktop summary sidebar */}
          <div className="hidden lg:block lg:col-span-1">
            <div className="card p-6 sticky top-20 shadow-sm">
              <PriceSummary
                sampleCount={sampleCount}
                baseCost={baseCost}
                selectedPanelObjects={selectedPanelObjects}
                volumeDiscount={volumeDiscount}
                addOnCost={addOnCost}
                blendSurcharge={blendSurcharge}
                conformityCost={conformityCost}
                conformityVials={conformityVials}
                firstOrder={firstOrder}
                firstOrderSavings={firstOrderSavings}
                rushProcessing={rushProcessing}
                rushFee={rushFee}
                total={total}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile sticky total bar */}
      <div className="pricing-mobile-bar">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Estimated total</p>
            <p className="text-xl font-bold text-black truncate">{formatCurrency(total)}</p>
          </div>
          <Link to="/order-new" className="btn-primary shrink-0 px-5 py-2.5 text-sm gap-1.5">
            Start Order <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </div>
  );
}

function PriceSummary({
  sampleCount, baseCost, selectedPanelObjects, volumeDiscount, addOnCost,
  blendSurcharge, conformityCost, conformityVials, firstOrder, firstOrderSavings,
  rushProcessing, rushFee, total,
}: {
  sampleCount: number;
  baseCost: number;
  selectedPanelObjects: TestPanel[];
  volumeDiscount: number;
  addOnCost: number;
  blendSurcharge: number;
  conformityCost: number;
  conformityVials: number;
  firstOrder: boolean;
  firstOrderSavings: number;
  rushProcessing: boolean;
  rushFee: number;
  total: number;
}) {
  return (
    <>
      <h2 className="font-bold text-black mb-4">Price Summary</h2>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between text-neutral-700 gap-4">
          <span>Base bundle × {sampleCount}</span>
          <span className="shrink-0">{formatCurrency(BASE_PRICE_PER_SAMPLE * sampleCount)}</span>
        </div>
        {selectedPanelObjects.map(p => (
          <div key={p.id} className="flex justify-between text-neutral-600 gap-4">
            <span className="truncate text-xs">{p.name} × {sampleCount}</span>
            <span className="shrink-0">{formatCurrency(p.price_per_sample * sampleCount)}</span>
          </div>
        ))}
        {volumeDiscount > 0 && (
          <div className="flex justify-between text-brand-700 font-medium gap-4">
            <span>Volume ({Math.round(volumeDiscount * 100)}% off)</span>
            <span className="shrink-0">−{formatCurrency((baseCost + addOnCost) * volumeDiscount)}</span>
          </div>
        )}
        {blendSurcharge > 0 && (
          <div className="flex justify-between text-neutral-700 gap-4">
            <span>Blend surcharge</span>
            <span className="shrink-0">+{formatCurrency(blendSurcharge)}</span>
          </div>
        )}
        {conformityCost > 0 && (
          <div className="flex justify-between text-neutral-700 gap-4">
            <span>Conformity vials × {conformityVials}</span>
            <span className="shrink-0">+{formatCurrency(conformityCost)}</span>
          </div>
        )}
        {firstOrder && firstOrderSavings > 0 && (
          <div className="flex justify-between text-emerald-600 font-medium gap-4">
            <span>First order (50% off)</span>
            <span className="shrink-0">−{formatCurrency(firstOrderSavings)}</span>
          </div>
        )}
        {rushProcessing && (
          <div className="flex justify-between text-amber-600 font-medium gap-4">
            <span>Rush × {sampleCount}</span>
            <span className="shrink-0">+{formatCurrency(rushFee)}</span>
          </div>
        )}
        <div className="pt-3 border-t border-atlas-border">
          <div className="flex justify-between text-lg font-bold text-black gap-4">
            <span>Estimated Total</span>
            <span className="shrink-0">{formatCurrency(total)}</span>
          </div>
          <p className="text-xs text-neutral-500 mt-1">Prepaid shipping label included at checkout</p>
        </div>
        <Link to="/order-new" className="btn-primary w-full mt-4 gap-2 justify-center">
          Start Order <ArrowRight size={16} />
        </Link>
      </div>
      <div className="mt-5 pt-4 border-t border-atlas-border space-y-1.5">
        {['No minimums or contracts', 'Flat pricing any peptide', 'No hidden fees', 'First order 50% off'].map(f => (
          <div key={f} className="flex items-center gap-2 text-xs text-neutral-500">
            <CheckCircle size={11} className="text-brand-600 shrink-0" />
            {f}
          </div>
        ))}
      </div>
    </>
  );
}
