import { useMemo, useState } from 'react';
import { AlertCircle, FlaskConical, Minus, Plus, UserPlus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { LabPriority, UserProfile } from '../../lib/types';
import { clientSubmittedLabel } from '../../lib/coaPanels';
import {
  ATLAS_PRO_PANEL, FULL_QC_PANEL, INDIVIDUAL_TESTS, TestMode,
  createEmptySample, sampleMetadataPayload, sampleVialCount,
  isPackageMode, panelVialsRequired, CONFORMITY_PRICE,
} from '../../lib/orderCatalog';
import { LAB_PRIORITIES, LAB_PRIORITY_LABELS, sampleHasTestsSpecified } from '../../lib/labQueue';
import { computeDueAt, generateLabOrderNumber } from '../../lib/utils';

export interface ChemistOption {
  id: string;
  name: string;
}

interface Props {
  clients: UserProfile[];
  chemists: ChemistOption[];
  onCreated: (successText: string) => void;
}

const BLANK = {
  clientId: '',
  companyName: '',
  sampleName: '',
  batchNumber: '',
  labeledContent: '',
  testMode: 'atlas_pro' as TestMode,
  individualTests: [] as string[],
  conformityExtra: 0,
  rush: false,
  assignedTo: '',
  priority: 'normal' as LabPriority,
  paymentStatus: 'paid' as 'paid' | 'waived' | 'unpaid',
  accessionNumber: '',
  alreadyOnBench: true,
};

export default function LabSampleIntake({ clients, chemists, onCreated }: Props) {
  const [form, setForm] = useState({ ...BLANK });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function update(patch: Partial<typeof BLANK>) {
    setForm(prev => ({ ...prev, ...patch }));
    setError('');
  }

  function toggleIndividualTest(testId: string) {
    setForm(prev => ({
      ...prev,
      individualTests: prev.individualTests.includes(testId)
        ? prev.individualTests.filter(t => t !== testId)
        : [...prev.individualTests, testId],
    }));
    setError('');
  }

  function selectClient(clientId: string) {
    const client = clients.find(c => c.id === clientId);
    update({ clientId, companyName: client?.company_name || form.companyName });
  }

  const previewSample = useMemo(() => createEmptySample({
    sample_name: form.sampleName,
    batch_number: form.batchNumber,
    labeled_content: form.labeledContent,
    test_mode: form.testMode,
    individual_tests: form.individualTests,
    conformity_extra: form.conformityExtra,
    rush: form.rush,
    is_peptide: false,
  }), [form.sampleName, form.batchNumber, form.labeledContent, form.testMode, form.individualTests, form.conformityExtra, form.rush]);

  const previewMetadata = useMemo(
    () => sampleMetadataPayload(previewSample, form.companyName),
    [previewSample, form.companyName],
  );
  const hasTests = sampleHasTestsSpecified({ metadata: previewMetadata });

  function resetForm() {
    setForm({ ...BLANK });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.clientId) { setError('Select the client this sample belongs to.'); return; }
    if (!form.sampleName.trim()) { setError('Enter a sample name.'); return; }
    if (!form.batchNumber.trim()) { setError('Enter a batch / lot number.'); return; }
    if (form.testMode === 'individual' && form.individualTests.length === 0) {
      setError('Select at least one individual test.');
      return;
    }
    if (!hasTests) {
      setError('This sample has no tests specified. Choose a test package or at least one individual test before saving.');
      return;
    }

    setSaving(true);
    try {
      const client = clients.find(c => c.id === form.clientId);
      const companyName = form.companyName.trim() || client?.company_name || '';

      const onBench = form.alreadyOnBench;
      const paid = form.paymentStatus === 'paid' || form.paymentStatus === 'waived';
      const now = new Date().toISOString();
      const orderPayload: Record<string, unknown> = {
        user_id: form.clientId,
        order_number: generateLabOrderNumber(),
        status: onBench && paid ? 'processing' : paid ? 'awaiting_sample' : 'awaiting_sample',
        payment_status: form.paymentStatus,
        paid_at: paid ? now : null,
        payment_note: 'Lab walk-in intake',
        rush_processing: form.rush,
        lab_priority: form.priority,
        notes: 'Lab intake — sample added directly by staff.',
        subtotal: 0,
        discount_amount: 0,
        rush_fee: 0,
        total: 0,
        first_order_discount: false,
        prepaid_shipping: false,
        company_name: companyName,
      };
      if (onBench && paid) {
        orderPayload.due_at = computeDueAt(new Date(), form.rush);
      }

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert(orderPayload)
        .select()
        .single();
      if (orderError) throw orderError;

      const metadata = sampleMetadataPayload(previewSample, companyName);
      if (!sampleHasTestsSpecified({ metadata })) {
        throw new Error('Refusing to create a sample without tests specified.');
      }

      const sampleRow = {
        order_id: order.id,
        user_id: form.clientId,
        sample_name: previewSample.sample_name.trim(),
        display_name: previewSample.sample_name.trim(),
        sample_type: 'single' as const,
        vial_count: sampleVialCount(previewSample),
        panel_ids: [],
        status: onBench && paid ? 'received' : 'awaiting_sample',
        accession_number: onBench && form.accessionNumber.trim() ? form.accessionNumber.trim() : null,
        received_at: onBench && paid ? now : null,
        metadata: onBench && paid ? { ...metadata, received_at: now } : metadata,
        assigned_to: form.assignedTo || null,
        assigned_at: form.assignedTo ? new Date().toISOString() : null,
      };

      let { error: sampleError } = await supabase.from('order_samples').insert(sampleRow);
      if (sampleError && /received_at/i.test(sampleError.message || '')) {
        const { received_at: _drop, ...withoutCol } = sampleRow;
        ({ error: sampleError } = await supabase.from('order_samples').insert(withoutCol));
      }
      if (sampleError) throw sampleError;

      const clientLabel = clientSubmittedLabel(client, companyName);
      resetForm();
      onCreated(`Sample "${sampleRow.sample_name}" added to the queue for ${clientLabel}.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create sample.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <form onSubmit={handleSubmit} className="lg:col-span-2 card p-6 space-y-5">
        <p className="text-xs text-neutral-500 bg-neutral-50 border border-atlas-border rounded-md px-3 py-2 flex items-start gap-2">
          <FlaskConical size={14} className="flex-shrink-0 mt-0.5 text-brand-500" />
          Use this when a client drops off or mails in a sample that was never submitted through the portal.
          Tests are required — a sample can&apos;t be saved without them.
        </p>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Client <span className="text-red-500">*</span></label>
            <select value={form.clientId} onChange={e => selectClient(e.target.value)} className="input-field">
              <option value="">Select client…</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{clientSubmittedLabel(c, c.company_name)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Company Name (on COA)</label>
            <input
              value={form.companyName}
              onChange={e => update({ companyName: e.target.value })}
              className="input-field"
              placeholder="Client company"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label">Sample Name <span className="text-red-500">*</span></label>
            <input
              value={form.sampleName}
              onChange={e => update({ sampleName: e.target.value })}
              className="input-field"
              placeholder="e.g. BPC-157"
            />
          </div>
          <div>
            <label className="label">Batch / Lot <span className="text-red-500">*</span></label>
            <input
              value={form.batchNumber}
              onChange={e => update({ batchNumber: e.target.value })}
              className="input-field"
              placeholder="e.g. LOT-2026-001"
            />
          </div>
          <div>
            <label className="label">Labeled Content</label>
            <input
              value={form.labeledContent}
              onChange={e => update({ labeledContent: e.target.value })}
              className="input-field"
              placeholder="e.g. 5mg"
            />
          </div>
        </div>

        <div>
          <label className="label mb-2 block">
            Tests <span className="text-red-500">*</span>
            <span className="ml-2 text-[10px] font-normal uppercase tracking-wide text-neutral-400">Required — never leave unspecified</span>
          </label>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => update({ testMode: 'atlas_pro' })}
              className={`w-full p-3 rounded-lg border-2 text-left transition-colors ${form.testMode === 'atlas_pro' ? 'border-brand-500 bg-brand-50' : 'border-neutral-200 hover:border-brand-300'}`}
            >
              <p className="font-semibold text-sm">{ATLAS_PRO_PANEL.name}</p>
              <p className="text-xs text-neutral-500 mt-0.5">{ATLAS_PRO_PANEL.description} · {ATLAS_PRO_PANEL.vialsRequired} vials incl. conformity</p>
            </button>
            <button
              type="button"
              onClick={() => update({ testMode: 'full_qc' })}
              className={`w-full p-3 rounded-lg border-2 text-left transition-colors ${form.testMode === 'full_qc' ? 'border-brand-500 bg-brand-50' : 'border-neutral-200 hover:border-brand-300'}`}
            >
              <p className="font-semibold text-sm">{FULL_QC_PANEL.name}</p>
              <p className="text-xs text-neutral-500 mt-0.5">{FULL_QC_PANEL.description} · {FULL_QC_PANEL.vialsRequired} vials</p>
            </button>
            <button
              type="button"
              onClick={() => update({ testMode: 'individual' })}
              className={`w-full p-3 rounded-lg border-2 text-left transition-colors ${form.testMode === 'individual' ? 'border-brand-500 bg-brand-50' : 'border-neutral-200 hover:border-brand-300'}`}
            >
              <p className="font-semibold text-sm">Individual tests</p>
              <p className="text-xs text-neutral-500 mt-0.5">Pick specific tests below — at least one is required.</p>
            </button>
          </div>

          {form.testMode === 'individual' && (
            <div className="mt-3 space-y-1.5">
              {INDIVIDUAL_TESTS.map(test => {
                const sel = form.individualTests.includes(test.id);
                return (
                  <button
                    key={test.id}
                    type="button"
                    onClick={() => toggleIndividualTest(test.id)}
                    className={`w-full p-2.5 rounded-lg border-2 text-left flex justify-between items-center gap-3 ${
                      sel ? 'border-brand-500 bg-brand-50' : 'border-neutral-200 hover:border-brand-300'
                    }`}
                  >
                    <span className="text-sm font-medium">{test.name}</span>
                    {sel && <span className="text-[10px] uppercase tracking-wide text-brand-700 font-semibold">Selected</span>}
                  </button>
                );
              })}
              {form.individualTests.length === 0 && (
                <p className="text-xs text-red-600">Select at least one test.</p>
              )}
            </div>
          )}

          {isPackageMode(form.testMode) && (
            <div className="mt-3 p-3 border border-atlas-border rounded-lg bg-neutral-50/50 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-black">Additional conformity vials</p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Beyond the {panelVialsRequired(form.testMode)} included · +${CONFORMITY_PRICE} per extra vial
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => update({ conformityExtra: Math.max(0, form.conformityExtra - 1) })}
                  disabled={form.conformityExtra <= 0}
                  className="w-8 h-8 border rounded-lg flex items-center justify-center hover:bg-neutral-50 disabled:opacity-40"
                >
                  <Minus size={13} />
                </button>
                <span className="font-bold w-6 text-center">{form.conformityExtra}</span>
                <button
                  type="button"
                  onClick={() => update({ conformityExtra: form.conformityExtra + 1 })}
                  className="w-8 h-8 border rounded-lg flex items-center justify-center hover:bg-brand-50 text-brand-800"
                >
                  <Plus size={13} />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label">Payment</label>
            <select
              value={form.paymentStatus}
              onChange={e => update({ paymentStatus: e.target.value as 'paid' | 'waived' | 'unpaid' })}
              className="input-field"
            >
              <option value="paid">Paid</option>
              <option value="waived">Waived</option>
              <option value="unpaid">Unpaid (receive later)</option>
            </select>
          </div>
          <div>
            <label className="label">Priority</label>
            <select
              value={form.priority}
              onChange={e => update({ priority: e.target.value as LabPriority })}
              className="input-field"
            >
              {LAB_PRIORITIES.map(p => (
                <option key={p} value={p}>{LAB_PRIORITY_LABELS[p]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label flex items-center gap-1.5">
              <UserPlus size={13} /> Assign to chemist
            </label>
            <select
              value={form.assignedTo}
              onChange={e => update({ assignedTo: e.target.value })}
              className="input-field"
            >
              <option value="">Unassigned</option>
              {chemists.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.alreadyOnBench}
              onChange={e => update({ alreadyOnBench: e.target.checked })}
              className="rounded border-neutral-300 text-brand-600"
            />
            Sample already on the bench (receive now)
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.rush}
              onChange={e => update({ rush: e.target.checked })}
              className="rounded border-neutral-300 text-brand-600"
            />
            Rush processing
          </label>
        </div>

        {form.alreadyOnBench && (
          <div>
            <label className="label">Accession #</label>
            <input
              value={form.accessionNumber}
              onChange={e => update({ accessionNumber: e.target.value })}
              className="input-field font-mono"
              placeholder="Optional bench accession"
            />
          </div>
        )}

        <button type="submit" disabled={saving || !hasTests} className="btn-primary w-full gap-2 disabled:opacity-50">
          {saving ? 'Adding sample…' : form.alreadyOnBench && form.paymentStatus !== 'unpaid' ? 'Add to testing queue' : 'Create inbound sample'}
        </button>
        {!hasTests && (
          <p className="text-xs text-red-600 text-center">
            Choose a test package or at least one individual test to enable saving.
          </p>
        )}
      </form>

      <div className="card p-5 h-fit space-y-3">
        <h3 className="font-bold text-sm">Preview</h3>
        <p className="text-sm text-neutral-600">
          {form.sampleName || 'New sample'} {form.batchNumber && <span className="text-neutral-400">· {form.batchNumber}</span>}
        </p>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5">Tests to run</p>
          <p className="text-sm text-black font-medium">{String(previewMetadata.tests_label ?? 'Tests not specified')}</p>
        </div>
        <p className="text-xs text-neutral-500">
          {sampleVialCount(previewSample)} vial{sampleVialCount(previewSample) === 1 ? '' : 's'} required
        </p>
        {!hasTests && (
          <p className="text-xs text-red-600 flex items-center gap-1.5">
            <AlertCircle size={12} /> No tests specified yet
          </p>
        )}
      </div>
    </div>
  );
}
