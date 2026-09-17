import { useEffect, useMemo, useState } from 'react';
import { Download, Printer, RefreshCw } from 'lucide-react';
import type { COA, Order, OrderSample, UserProfile } from '../../lib/types';
import { supabase } from '../../lib/supabase';
import { downloadCsv } from '../../lib/exportCsv';
import {
  buildPendingTestingReport,
  filterPendingTestingRows,
  mergeCoaResultSummaries,
  type AssayStatus,
  type PendingTestingFilter,
} from '../../lib/pendingTestingReport';
import { coaWorkflowStage } from '../../lib/coaWorkflow';
import { coaHasPendingAssays } from '../../lib/coaDisplayPanels';

interface Props {
  samples: OrderSample[];
  orders: Order[];
  coas: COA[];
  users: UserProfile[];
  onRefresh?: () => void;
  refreshing?: boolean;
}

function StatusPill({ status, detail }: { status: AssayStatus; detail: string }) {
  const label = status === 'complete' ? 'Complete' : status === 'pending' ? 'Pending' : 'N/A';
  const cls =
    status === 'complete'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : status === 'pending'
        ? 'bg-amber-50 text-amber-900 border-amber-300'
        : 'bg-neutral-100 text-neutral-600 border-neutral-200';
  return (
    <div title={detail}>
      <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded border ${cls}`}>
        {label}
      </span>
      <p className="text-[10px] text-neutral-500 mt-1 max-w-[160px] break-words">{detail}</p>
    </div>
  );
}

export default function AdminPendingTestingReport({
  samples,
  orders,
  coas,
  users,
  onRefresh,
  refreshing,
}: Props) {
  const [filter, setFilter] = useState<PendingTestingFilter>('all');
  const [summaryCoas, setSummaryCoas] = useState<COA[]>(coas);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    setSummaryCoas(coas);
  }, [coas]);

  useEffect(() => {
    let cancelled = false;
    async function loadSummaries() {
      // Unpublished always; published when panels already show deferred assays.
      const summaryIds = coas
        .filter(c =>
          (coaWorkflowStage(c) !== 'published' && !c.is_public && !c.published_at)
          || coaHasPendingAssays(c),
        )
        .map(c => c.id);
      if (summaryIds.length === 0) {
        setSummaryCoas(coas);
        return;
      }
      setLoadingSummary(true);
      setSummaryError(null);
      try {
        const pageSize = 100;
        const rows: { id: string; result_summary: unknown }[] = [];
        for (let i = 0; i < summaryIds.length; i += pageSize) {
          const chunk = summaryIds.slice(i, i + pageSize);
          const { data, error } = await supabase
            .from('coas')
            .select('id, result_summary')
            .in('id', chunk);
          if (error) throw new Error(error.message);
          rows.push(...((data || []) as { id: string; result_summary: unknown }[]));
        }
        if (!cancelled) setSummaryCoas(mergeCoaResultSummaries(coas, rows));
      } catch (err) {
        if (!cancelled) {
          setSummaryError(err instanceof Error ? err.message : 'Could not load COA summaries.');
          setSummaryCoas(coas);
        }
      } finally {
        if (!cancelled) setLoadingSummary(false);
      }
    }
    void loadSummaries();
    return () => {
      cancelled = true;
    };
  }, [coas]);

  const report = useMemo(
    () => buildPendingTestingReport({
      samples,
      coas: summaryCoas,
      orders,
      profiles: users,
    }),
    [samples, summaryCoas, orders, users],
  );

  const visible = useMemo(
    () => filterPendingTestingRows(report.rows, filter),
    [report.rows, filter],
  );

  const chips: { id: PendingTestingFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'published_pending', label: 'Published pending' },
    { id: 'unpublished', label: 'Unpublished' },
    { id: 'ster_pending', label: 'Sterility pending' },
    { id: 'endo_pending', label: 'Endotoxin pending' },
    { id: 'both_pending', label: 'Both pending' },
    { id: 'both_complete', label: 'Both complete' },
  ];

  function exportCsv() {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(
      `atlas-pending-testing-${stamp}.csv`,
      [
        'Sample', 'Lot', 'Company', 'Client', 'Order', 'Sample status',
        'COA', 'Stage', 'Published', 'Sterility', 'Sterility detail', 'Endotoxin', 'Endotoxin detail',
        'Ordered tests', 'Other pending', 'Other complete',
      ],
      visible.map(r => [
        r.sample, r.lot, r.company, r.client, r.order, r.status,
        r.coa, r.stage, r.published ? 'yes' : 'no',
        r.sterility, r.sterilityDetail, r.endotoxin, r.endotoxinDetail,
        r.tests, r.otherPending.join('; '), r.otherComplete.join('; '),
      ]),
    );
  }

  const c = report.counts;

  return (
    <div className="space-y-5 print:space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-lg font-bold text-black">Pending testing report</h2>
          <p className="text-sm text-neutral-500 mt-0.5">
            Every sample with deferred assays — including published COAs that still have pending items.
            {loadingSummary ? ' Loading assay summaries…' : ''}
          </p>
          {summaryError && (
            <p className="text-xs text-amber-800 mt-1">Summary load warning: {summaryError}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary text-xs inline-flex items-center gap-1.5"
            disabled={refreshing || loadingSummary}
            onClick={() => onRefresh?.()}
          >
            <RefreshCw size={13} className={refreshing || loadingSummary ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            type="button"
            className="btn-secondary text-xs inline-flex items-center gap-1.5"
            onClick={exportCsv}
          >
            <Download size={13} />
            Export CSV
          </button>
          <button
            type="button"
            className="btn-primary text-xs inline-flex items-center gap-1.5"
            onClick={() => window.print()}
          >
            <Printer size={13} />
            Print / PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Samples in report', value: c.samples },
          { label: 'Published pending', value: c.publishedPending },
          { label: 'Sterility pending', value: c.ster_pending },
          { label: 'Endotoxin pending', value: c.endo_pending },
        ].map(stat => (
          <div key={stat.label} className="card p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{stat.label}</p>
            <p className="text-2xl font-bold text-black tabular-nums">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="card p-4 text-sm text-neutral-700">
        Sterility complete <strong>{c.ster_complete}</strong>
        {' · '}Endotoxin complete <strong>{c.endo_complete}</strong>
        {' · '}Both pending <strong>{c.both_pending}</strong>
        {' · '}Both complete <strong>{c.both_complete}</strong>
        {' · '}Either pending <strong>{c.either_pending}</strong>
        {' · '}Unpublished COAs <strong>{c.unpublishedCoas}</strong>
        <span className="block text-xs text-neutral-500 mt-1">
          Generated {new Date(report.generatedAt).toLocaleString()} · “Pending” includes literal Pending panel/summary values
        </span>
      </div>

      {Object.keys(c.byStage).length > 0 && (
        <div className="card p-4">
          <h3 className="text-sm font-bold text-black mb-2">COA stages in report</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(c.byStage)
              .sort((a, b) => b[1] - a[1])
              .map(([stage, n]) => (
                <span
                  key={stage}
                  className="text-xs font-medium px-2.5 py-1 rounded-full border border-atlas-border bg-white"
                >
                  {stage} · {n}
                </span>
              ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 print:hidden">
        {chips.map(chip => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setFilter(chip.id)}
            className={`px-2.5 py-1 text-xs font-medium rounded-full border ${
              filter === chip.id
                ? 'bg-black text-white border-black'
                : 'border-atlas-border text-neutral-600 hover:border-neutral-400'
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-atlas-border flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-black">
            Showing {visible.length} of {report.rows.length}
          </p>
        </div>
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-neutral-50 z-10">
              <tr className="text-left text-[10px] uppercase tracking-wider text-neutral-500 border-b border-atlas-border">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Sample / Lot</th>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">COA / Stage</th>
                <th className="px-3 py-2">Sterility</th>
                <th className="px-3 py-2">Endotoxin</th>
                <th className="px-3 py-2">Other panels</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-atlas-border">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-neutral-500">
                    No rows match this filter.
                  </td>
                </tr>
              ) : (
                visible.map((r, i) => (
                  <tr key={`${r.sampleId}-${r.coa}-${i}`} className="align-top">
                    <td className="px-3 py-2.5 text-neutral-400 tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-black">{r.sample}</div>
                      <div className="text-[11px] text-neutral-500">
                        Lot {r.lot} · Order {r.order} · {r.status}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">{r.company}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-mono text-xs">{r.coa}</div>
                      <div className="text-[11px] text-neutral-500 flex flex-wrap items-center gap-1.5 mt-0.5">
                        <span>{r.stage}</span>
                        {r.published && (
                          <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-800 border-emerald-200">
                            Published
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusPill status={r.sterility} detail={r.sterilityDetail} />
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusPill status={r.endotoxin} detail={r.endotoxinDetail} />
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-neutral-500 max-w-[220px]">
                      {r.otherComplete.length > 0 && (
                        <div>Done: {r.otherComplete.slice(0, 4).join(', ')}{r.otherComplete.length > 4 ? '…' : ''}</div>
                      )}
                      {r.otherPending.length > 0 && (
                        <div>Pending: {r.otherPending.slice(0, 4).join(', ')}{r.otherPending.length > 4 ? '…' : ''}</div>
                      )}
                      {r.otherComplete.length === 0 && r.otherPending.length === 0 && '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
