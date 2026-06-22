import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Plus, Trash2, CheckCircle, Zap, ArrowRight, Package, AlertCircle, Info, Minus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { TestPanel, SampleType } from '../lib/types';
import {
  formatCurrency,
  getVolumeDiscount,
  BASE_PRICE_PER_SAMPLE,
  BLEND_SURCHARGE_PER_COMPOUND,
  CONFORMITY_VIAL_PRICE,
  RUSH_FEE_PER_SAMPLE,
  FIRST_ORDER_DISCOUNT,
  generateOrderNumber,
} from '../lib/utils';

interface CartSample {
  id: string;
  sample_name: string;
  display_name: string;
  sample_type: SampleType;
  blend_compounds: number;
}

function uid() { return Math.random().toString(36).slice(2); }

export default function Order() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [addOnPanels, setAddOnPanels] = useState<TestPanel[]>([]);
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);
  const [samples, setSamples] = useState<CartSample[]>([{
    id: uid(), sample_name: '', display_name: '', sample_type: 'single', blend_compounds: 2,
  }]);
  const [conformityVials, setConformityVials] = useState(0);
  const [rushProcessing, setRushProcessing] = useState(false);
  const [notes, setNotes] = useState('');
  const [companyName, setCompanyName] = useState(profile?.company_name ?? '');
  const [loading, setLoading] = useState(false);
  const [panelsLoading, setPanelsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.from('test_panels').select('*').eq('is_active', true).neq('category', 'base').order('sort_order').then(({ data }) => {
      if (data) setAddOnPanels(data);
      setPanelsLoading(false);
    });
  }, []);

  useEffect(() => {
    if (profile?.company_name) setCompanyName(profile.company_name);
  }, [profile]);

  function addSample() {
    setSamples(prev => [...prev, { id: uid(), sample_name: '', display_name: '', sample_type: 'single', blend_compounds: 2 }]);
  }

  function removeSample(id: string) {
    if (samples.length > 1) setSamples(prev => prev.filter(s => s.id !== id));
  }

  function updateSample(id: string, updates: Partial<CartSample>) {
    setSamples(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }

  function toggleAddOn(panelId: string) {
    setSelectedAddOns(prev => prev.includes(panelId) ? prev.filter(p => p !== panelId) : [...prev, panelId]);
  }

  const sampleCount = samples.length;
  const volumeDiscount = getVolumeDiscount(sampleCount);
  const selectedPanelObjects = addOnPanels.filter(p => selectedAddOns.includes(p.id));
  const addOnCostPerSample = selectedPanelObjects.reduce((s, p) => s + p.price_per_sample, 0);

  const baseCost = BASE_PRICE_PER_SAMPLE * sampleCount;
  const addOnCost = addOnCostPerSample * sampleCount;
  const discountableSubtotal = (baseCost + addOnCost) * (1 - volumeDiscount);

  const blendSurcharge = samples
    .filter(s => s.sample_type === 'blend')
    .reduce((sum, s) => sum + s.blend_compounds * BLEND_SURCHARGE_PER_COMPOUND, 0);
  const conformityCost = conformityVials * CONFORMITY_VIAL_PRICE;

  const subtotal = discountableSubtotal + blendSurcharge + conformityCost;
  const isFirstOrder = profile?.is_first_order ?? true;
  const firstOrderDiscount = isFirstOrder ? discountableSubtotal * FIRST_ORDER_DISCOUNT : 0;
  const afterDiscount = subtotal - firstOrderDiscount;
  const rushFee = rushProcessing ? sampleCount * RUSH_FEE_PER_SAMPLE : 0;
  const total = afterDiscount + rushFee;

  function validate() {
    for (const s of samples) {
      if (!s.sample_name.trim()) return 'All samples must have a name.';
    }
    return null;
  }

  async function handleSubmit() {
    if (!user) { navigate('/auth'); return; }
    const err = validate();
    if (err) { setError(err); return; }
    setError('');
    setLoading(true);

    try {
      const orderNumber = generateOrderNumber();
      const { data: order, error: orderError } = await supabase.from('orders').insert({
        user_id: user.id,
        order_number: orderNumber,
        rush_processing: rushProcessing,
        notes,
        subtotal,
        discount_amount: firstOrderDiscount,
        rush_fee: rushFee,
        total,
        first_order_discount: isFirstOrder,
        company_name: companyName,
      }).select().single();
      if (orderError) throw orderError;

      const sampleRows = samples.map(s => ({
        order_id: order.id,
        user_id: user.id,
        sample_name: s.sample_name,
        display_name: s.display_name || s.sample_name,
        sample_type: s.sample_type,
        vial_count: 1,
        panel_ids: selectedAddOns,
      }));
      const { error: samplesError } = await supabase.from('order_samples').insert(sampleRows);
      if (samplesError) throw samplesError;

      if (isFirstOrder) {
        await supabase.from('user_profiles').update({ is_first_order: false }).eq('id', user.id);
      }

      navigate(`/dashboard/orders?new=${order.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit order.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-slate-950 py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <Package size={20} className="text-brand-400" />
            <span className="text-brand-400 text-sm font-medium">Sample Submission</span>
          </div>
          <h1 className="text-3xl font-bold text-white">Submit Your Samples</h1>
          <p className="text-slate-400 mt-2">No minimums. No contracts. First order 50% off.</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {!user && (
          <div className="card p-4 mb-6 flex items-start gap-3 border-amber-200 bg-amber-50">
            <Info size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              <Link to="/auth" className="font-semibold underline">Sign in or create a free account</Link> to submit. Your configuration won't be lost.
            </p>
          </div>
        )}
        {error && (
          <div className="card p-4 mb-6 flex items-start gap-3 border-red-200 bg-red-50">
            <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-5">

            <div className="card p-5">
              <h2 className="font-semibold text-slate-900 mb-4">Company / Account Info</h2>
              <div>
                <label className="label">Company Name <span className="text-slate-400 font-normal text-xs">(appears on COA)</span></label>
                <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} className="input-field" placeholder="Your company or lab name" />
              </div>
            </div>

            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-slate-900">Samples</h2>
                <span className="text-xs text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">{sampleCount} sample{sampleCount !== 1 ? 's' : ''}</span>
              </div>
              <p className="text-xs text-slate-500 mb-4">Each sample includes Purity, Net Content, and ID testing — {formatCurrency(BASE_PRICE_PER_SAMPLE)}/sample</p>

              <div className="space-y-3">
                {samples.map((sample, idx) => (
                  <div key={sample.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sample {idx + 1}</span>
                      {samples.length > 1 && (
                        <button onClick={() => removeSample(sample.id)} className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="label">Sample Name <span className="text-red-500">*</span></label>
                        <input type="text" value={sample.sample_name} onChange={e => updateSample(sample.id, { sample_name: e.target.value })} className="input-field" placeholder="e.g., BPC-157 Batch A" />
                      </div>
                      <div>
                        <label className="label">Custom Display Name on COA <span className="text-slate-400 font-normal text-xs">(optional)</span></label>
                        <input type="text" value={sample.display_name} onChange={e => updateSample(sample.id, { display_name: e.target.value })} className="input-field" placeholder="e.g., Product XR-7" />
                      </div>
                    </div>
                    <div>
                      <label className="label">Compound Type</label>
                      <div className="flex gap-2">
                        {(['single', 'blend'] as SampleType[]).map(type => (
                          <button key={type} onClick={() => updateSample(sample.id, { sample_type: type })} className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-colors capitalize ${sample.sample_type === type ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>
                    {sample.sample_type === 'blend' && (
                      <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-semibold text-amber-800">Blend compounds</p>
                            <p className="text-xs text-amber-700">+{formatCurrency(BLEND_SURCHARGE_PER_COMPOUND)}/compound — not discounted</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => updateSample(sample.id, { blend_compounds: Math.max(2, sample.blend_compounds - 1) })} className="w-7 h-7 rounded border border-amber-300 flex items-center justify-center bg-white text-amber-700 hover:bg-amber-100"><Minus size={12} /></button>
                            <span className="font-bold text-amber-900 w-5 text-center">{sample.blend_compounds}</span>
                            <button onClick={() => updateSample(sample.id, { blend_compounds: sample.blend_compounds + 1 })} className="w-7 h-7 rounded border border-amber-300 flex items-center justify-center bg-white text-amber-700 hover:bg-amber-100"><Plus size={12} /></button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <button onClick={addSample} className="w-full mt-3 py-2.5 border-2 border-dashed border-slate-300 rounded-xl text-sm font-medium text-slate-600 hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50 transition-colors flex items-center justify-center gap-2">
                <Plus size={15} /> Add Sample
              </button>
            </div>

            <div className="card p-5">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-semibold text-slate-900">Conformity Vials</h2>
                <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{formatCurrency(CONFORMITY_VIAL_PRICE)}/vial</span>
              </div>
              <p className="text-xs text-slate-500 mb-3">Extra vials for batch clarity/conformity testing</p>
              <div className="flex items-center gap-3">
                <button onClick={() => setConformityVials(Math.max(0, conformityVials - 1))} className="w-9 h-9 rounded-lg border border-slate-300 flex items-center justify-center hover:bg-slate-50 text-slate-600 transition-colors"><Minus size={14} /></button>
                <span className="w-8 text-center font-semibold text-slate-900">{conformityVials}</span>
                <button onClick={() => setConformityVials(conformityVials + 1)} className="w-9 h-9 rounded-lg border border-slate-300 flex items-center justify-center hover:bg-slate-50 text-slate-600 transition-colors"><Plus size={14} /></button>
              </div>
            </div>

            <div className="card p-5">
              <h2 className="font-semibold text-slate-900 mb-1">Add-on Tests <span className="text-sm font-normal text-slate-400">(apply to all samples)</span></h2>
              <p className="text-xs text-slate-500 mb-4">Volume discounts apply.</p>
              {panelsLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{[...Array(6)].map((_, i) => <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />)}</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {addOnPanels.map(panel => {
                    const selected = selectedAddOns.includes(panel.id);
                    return (
                      <button key={panel.id} onClick={() => toggleAddOn(panel.id)} className={`flex items-center gap-2.5 p-3 rounded-lg border-2 text-left transition-colors ${selected ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'}`}>
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${selected ? 'border-brand-500 bg-brand-500' : 'border-slate-300'}`}>
                          {selected && <CheckCircle size={10} className="text-white" />}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-900">{panel.name}</p>
                          <p className="text-xs text-slate-400">+{formatCurrency(panel.price_per_sample)}/sample</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="card p-5">
              <h2 className="font-semibold text-slate-900 mb-4">Additional Options</h2>
              <div className="space-y-3">
                <button onClick={() => setRushProcessing(!rushProcessing)} className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-colors ${rushProcessing ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${rushProcessing ? 'border-amber-500 bg-amber-500' : 'border-slate-300'}`}>
                    {rushProcessing && <CheckCircle size={12} className="text-white" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-900 text-sm">Rush Processing</p>
                      <Zap size={14} className="text-amber-500" />
                    </div>
                    <p className="text-xs text-slate-500">Expedited 48-hour turnaround · +{formatCurrency(RUSH_FEE_PER_SAMPLE)}/sample</p>
                  </div>
                  {rushProcessing && <span className="font-bold text-amber-600 text-sm">+{formatCurrency(rushFee)}</span>}
                </button>

                <div>
                  <label className="label">Notes for Lab <span className="text-slate-400 font-normal text-xs">(optional)</span></label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} className="input-field resize-none" rows={3} placeholder="Special handling or context..." />
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="card p-5 sticky top-24">
              <h2 className="font-semibold text-slate-900 mb-4">Order Summary</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-slate-700">
                  <span>Base bundle × {sampleCount}</span>
                  <span>{formatCurrency(BASE_PRICE_PER_SAMPLE * sampleCount)}</span>
                </div>
                {selectedPanelObjects.map(p => (
                  <div key={p.id} className="flex justify-between text-slate-600 text-xs">
                    <span className="truncate pr-1">{p.name} × {sampleCount}</span>
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
                {isFirstOrder && (
                  <div className="flex justify-between text-emerald-600 font-medium">
                    <span>First order (50% off)</span>
                    <span>−{formatCurrency(firstOrderDiscount)}</span>
                  </div>
                )}
                {rushProcessing && (
                  <div className="flex justify-between text-amber-600 font-medium">
                    <span>Rush × {sampleCount}</span>
                    <span>+{formatCurrency(rushFee)}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-slate-900 text-base">
                  <span>Total</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>

              <button onClick={user ? handleSubmit : () => navigate('/auth')} disabled={loading} className="btn-primary w-full mt-5 py-3 gap-2">
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Submitting...
                  </span>
                ) : user ? <><ArrowRight size={16} /> Submit Order</> : 'Sign In to Submit'}
              </button>

              <div className="mt-4 space-y-1.5">
                {['No minimums', 'No hidden fees', 'Prepaid shipping (coming soon)'].map(f => (
                  <div key={f} className="flex items-center gap-2 text-xs text-slate-500">
                    <CheckCircle size={11} className="text-brand-500" /> {f}
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
