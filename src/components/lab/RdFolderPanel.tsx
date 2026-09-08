import { useMemo, useState } from 'react';
import { Beaker, CheckCircle, FlaskConical } from 'lucide-react';
import { Order, OrderSample, UserProfile } from '../../lib/types';
import { parseSampleMetadata } from '../../lib/coaPanels';
import {
  buildRdAnalysisResults,
  orderIsRd,
  readRdResultsFromSample,
  sampleIsRd,
} from '../../lib/rdPathway';
import { setSampleStatus } from '../../lib/services/orderWorkflow';
import { formatDate } from '../../lib/utils';
import { supabase } from '../../lib/supabase';

interface Props {
  samples: OrderSample[];
  orders: Order[];
  clients?: UserProfile[];
  currentUserId?: string | null;
  onChanged?: () => void;
}

type Draft = {
  purity: string;
  quantity: string;
  purityPass: boolean | null;
  quantityPass: boolean | null;
  note: string;
};

function emptyDraft(): Draft {
  return { purity: '', quantity: '', purityPass: null, quantityPass: null, note: '' };
}

export default function RdFolderPanel({
  samples, orders, clients = [], currentUserId = null, onChanged,
}: Props) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [showComplete, setShowComplete] = useState(false);

  const orderMap = useMemo(() => new Map(orders.map(o => [o.id, o])), [orders]);
  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);

  const rdSamples = useMemo(() => {
    return samples
      .filter(s => {
        if (sampleIsRd(s)) return true;
        const order = orderMap.get(s.order_id);
        return order ? orderIsRd(order) : false;
      })
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  }, [samples, orderMap]);

  const active = rdSamples.filter(s => s.status !== 'complete');
  const completed = rdSamples.filter(s => s.status === 'complete');
  const visible = showComplete ? [...active, ...completed] : active;

  function draftFor(sample: OrderSample): Draft {
    if (drafts[sample.id]) return drafts[sample.id];
    const existing = readRdResultsFromSample(sample);
    return {
      purity: existing.purity,
      quantity: existing.quantity,
      purityPass: existing.purityPass,
      quantityPass: existing.quantityPass,
      note: existing.note,
    };
  }

  function patchDraft(sampleId: string, patch: Partial<Draft>) {
    setDrafts(prev => ({
      ...prev,
      [sampleId]: { ...draftFor(samples.find(s => s.id === sampleId)!), ...prev[sampleId], ...patch },
    }));
  }

  async function completeSample(sample: OrderSample) {
    const draft = draftFor(sample);
    if (!draft.purity.trim() || !draft.quantity.trim()) {
      setError('Enter both purity and quantity results before completing.');
      return;
    }
    if (draft.purityPass === null || draft.quantityPass === null) {
      setError('Set pass/fail for purity and quantity.');
      return;
    }
    setSavingId(sample.id);
    setError('');
    const analysis_results = buildRdAnalysisResults({
      purity: draft.purity,
      quantity: draft.quantity,
      purityPass: draft.purityPass,
      quantityPass: draft.quantityPass,
    });
    const prevMeta = parseSampleMetadata(sample.metadata) as Record<string, unknown>;
    const metadata = {
      ...prevMeta,
      pathway: 'rd',
      rd_completion_note: draft.note.trim(),
      rd_completed_at: new Date().toISOString(),
      rd_completed_by: currentUserId || null,
    };
    const { error: updateError } = await supabase
      .from('order_samples')
      .update({ analysis_results, metadata })
      .eq('id', sample.id);
    if (updateError) {
      setError(updateError.message);
      setSavingId(null);
      return;
    }
    const { error: statusError } = await setSampleStatus(
      { ...sample, analysis_results, metadata },
      'complete',
    );
    if (statusError) {
      setError(statusError.message);
      setSavingId(null);
      return;
    }

    // Complete the order when every sample on it is done (R&D orders are R&D-only).
    const siblings = samples.filter(s => s.order_id === sample.order_id);
    const allDone = siblings.every(s => s.id === sample.id || s.status === 'complete');
    if (allDone) {
      await supabase
        .from('orders')
        .update({ status: 'complete', updated_at: new Date().toISOString() })
        .eq('id', sample.order_id);
    }

    setSavingId(null);
    onChanged?.();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-black flex items-center gap-2">
            <Beaker size={22} className="text-brand-600" /> R&amp;D folder
          </h2>
          <p className="text-sm text-neutral-500 mt-1">
            Quick purity &amp; quantity verification — no certificate. Mark complete when results are entered.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={showComplete}
            onChange={e => setShowComplete(e.target.checked)}
            className="accent-brand-500"
          />
          Show completed
        </label>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">
          {error}
        </p>
      )}

      {visible.length === 0 ? (
        <div className="card p-8 text-center text-sm text-neutral-500">
          No R&amp;D samples{showComplete ? '' : ' in progress'}.
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(sample => {
            const order = orderMap.get(sample.order_id);
            const client = order ? clientMap.get(order.user_id) : undefined;
            const meta = parseSampleMetadata(sample.metadata);
            const draft = draftFor(sample);
            const done = sample.status === 'complete';
            const claim = [meta.labeled_content, meta.label_claim_unit].filter(Boolean).join(' ');
            return (
              <article key={sample.id} className="card p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-black truncate">
                      {sample.display_name || sample.sample_name}
                    </p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {order?.order_number || '—'}
                      {client?.company_name || order?.company_name
                        ? ` · ${client?.company_name || order?.company_name}`
                        : ''}
                      {meta.batch_number ? ` · Lot ${meta.batch_number}` : ''}
                      {claim ? ` · Claim ${claim}` : ''}
                    </p>
                    <p className="text-[11px] text-neutral-400 mt-0.5">
                      Submitted {formatDate(sample.created_at)} · {SAMPLE_STATUS(sample.status)}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border border-violet-300 bg-violet-50 text-violet-800">
                    R&amp;D · no COA
                  </span>
                </div>

                {done ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm space-y-1">
                    <p className="font-medium text-emerald-900 flex items-center gap-1.5">
                      <CheckCircle size={14} /> Complete
                    </p>
                    <p className="text-emerald-900/80">Purity: {draft.purity || '—'} ({draft.purityPass ? 'PASS' : draft.purityPass === false ? 'FAIL' : '—'})</p>
                    <p className="text-emerald-900/80">Quantity: {draft.quantity || '—'} ({draft.quantityPass ? 'PASS' : draft.quantityPass === false ? 'FAIL' : '—'})</p>
                    {draft.note ? <p className="text-emerald-900/70 text-xs">{draft.note}</p> : null}
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label">Purity result</label>
                      <input
                        className="input-field"
                        value={draft.purity}
                        onChange={e => patchDraft(sample.id, { purity: e.target.value })}
                        placeholder="e.g. 99.2%"
                      />
                      <select
                        className="input-field mt-1.5"
                        value={draft.purityPass === null ? '' : draft.purityPass ? 'pass' : 'fail'}
                        onChange={e => patchDraft(sample.id, {
                          purityPass: e.target.value === '' ? null : e.target.value === 'pass',
                        })}
                      >
                        <option value="">Conformity…</option>
                        <option value="pass">PASS</option>
                        <option value="fail">FAIL</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Quantity / net content</label>
                      <input
                        className="input-field"
                        value={draft.quantity}
                        onChange={e => patchDraft(sample.id, { quantity: e.target.value })}
                        placeholder="e.g. 10.1 mg"
                      />
                      <select
                        className="input-field mt-1.5"
                        value={draft.quantityPass === null ? '' : draft.quantityPass ? 'pass' : 'fail'}
                        onChange={e => patchDraft(sample.id, {
                          quantityPass: e.target.value === '' ? null : e.target.value === 'pass',
                        })}
                      >
                        <option value="">Conformity…</option>
                        <option value="pass">PASS</option>
                        <option value="fail">FAIL</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label">Notes (optional)</label>
                      <textarea
                        className="input-field min-h-[72px]"
                        value={draft.note}
                        onChange={e => patchDraft(sample.id, { note: e.target.value })}
                        placeholder="Internal / client-visible verification notes"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <button
                        type="button"
                        className="btn-primary gap-1.5"
                        disabled={savingId === sample.id}
                        onClick={() => void completeSample(sample)}
                      >
                        <FlaskConical size={14} />
                        {savingId === sample.id ? 'Saving…' : 'Mark complete (no COA)'}
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SAMPLE_STATUS(status: OrderSample['status']): string {
  if (status === 'complete') return 'Complete';
  if (status === 'analyzing') return 'Testing';
  if (status === 'in_review') return 'In review';
  if (status === 'received') return 'Received';
  return 'Awaiting sample';
}
