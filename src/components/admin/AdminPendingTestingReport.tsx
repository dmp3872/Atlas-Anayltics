import { useEffect, useMemo, useState } from 'react';
import { Download, Printer, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { COA, Order, OrderSample, UserProfile } from '../../lib/types';
import { supabase } from '../../lib/supabase';
import { downloadCsv } from '../../lib/exportCsv';
import {
  buildPendingTestingReport,
  filterPendingTestingRows,
  mergeCoaResultSummaries,
  pendingTestingCompanies,
  type AssayStatus,
  type PendingTestingFilter,
} from '../../lib/pendingTestingReport';

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

function VisibilityPill({ published, completed }: { published: boolean; completed: boolean }) {
  if (completed) {
    return (
      <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded border bg-emerald-50 text-emerald-800 border-emerald-200">
        {published ? 'Completed' : 'Complete (unpublished)'}
      </span>
    );
  }
  if (published) {
    return (
      <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded border bg-sky-50 text-sky-800 border-sky-200">
        Published · pending
      </span>
    );
  }
  return (
    <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded border bg-slate-100 text-slate-700 border-slate-300">
      Unpublished
    </span>
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
  const [company, setCompany] = useState('');
  const [summaryCoas, setSummaryCoas] = useState<COA[]>(coas);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    setSummaryCoas(coas);
  }, [coas]);

  useEffect(() => {
    let cancelled = false;
    async function loadSummaries() {
      // Load assay summaries for every COA so completed certificates show real status.
      const summaryIds = coas.map(c => c.id);
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

  const companies = useMemo(
    () => pendingTestingCompanies(report.rows),
    [report.rows],
  );

  const visible = useMemo(
    () => filterPendingTestingRows(report.rows, filter, company),
    [report.rows, filter, company],
  );

  const chips: { id: PendingTestingFilter; label: string; count?: number }[] = [
    { id: 'all', label: 'All', count: report.rows.length },
    { id: 'completed', label: 'Completed', count: report.counts.completed },
    { id: 'published_pending', label: 'Published pending', count: report.counts.publishedPending },
    { id: 'unpublished', label: 'Unpublished', count: report.counts.unpublishedCoas },
    { id: 'ster_pending', label: 'Sterility pending', count: report.counts.ster_pending },
    { id: 'endo_pending', label: 'Endotoxin pending', count: report.counts.endo_pending },
    { id: 'both_pending', label: 'Both pending', count: report.counts.both_pending },
  ];

  function exportCsv() {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(
      `atlas-pending-testing-${stamp}.csv`,
      [
        'COA', 'Visibility', 'Stage', 'Sample', 'Lot', 'Company', 'Client', 'Order', 'Sample status',
        'Sterility', 'Sterility detail', 'Endotoxin', 'Endotoxin detail',
        'Ordered tests', 'Other pending', 'Other complete',
      ],
      visible.map(r => [
        r.coa, r.published ? (r.hasPending ? 'published_pending' : 'completed') : 'unpublished', r.stage,
        r.sample, r.lot, r.company, r.client, r.order, r.status,
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
            One row per COA number — including completed certificates. Filter by status chips
            or company.
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

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'COAs in report', value: c.samples },
          { label: 'Completed', value: c.completed },
          { label: 'Published pending', value: c.publishedPending },
          { label: 'Unpublished', value: c.unpublishedCoas },
          { label: 'Either assay pending', value: c.either_pending },
        ].map(stat => (
          <div key={stat.label} className="card p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{stat.label}</p>
            <p className="text-2xl font-bold text-black tabular-nums">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="card p-4 text-sm text-neutral-700">
        Sterility pending <strong>{c.ster_pending}</strong>
        {' · '}Endotoxin pending <strong>{c.endo_pending}</strong>
        {' · '}Both pending <strong>{c.both_pending}</strong>
        <span className="block text-xs text-neutral-500 mt-1">
          Generated {new Date(report.generatedAt).toLocaleString()} · each COA ID is listed separately
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <label className="text-xs font-medium text-neutral-600" htmlFor="pending-company-filter">
          Company
        </label>
        <select
          id="pending-company-filter"
          value={company}
          onChange={e => setCompany(e.target.value)}
          className="input-field text-sm py-1.5 min-w-[200px] max-w-full"
        >
          <option value="">All companies · {companies.length}</option>
          {companies.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        {company && (
          <button
            type="button"
            className="text-xs text-neutral-500 hover:text-black underline"
            onClick={() => setCompany('')}
          >
            Clear
          </button>
        )}
      </div>

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
            {typeof chip.count === 'number' ? ` · ${chip.count}` : ''}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-atlas-border flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-black">
            Showing {visible.length} of {report.rows.length}
            {company ? ` · ${company}` : ''}
          </p>
        </div>
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-neutral-50 z-10">
              <tr className="text-left text-[10px] uppercase tracking-wider text-neutral-500 border-b border-atlas-border">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">COA #</th>
                <th className="px-3 py-2">Visibility</th>
                <th className="px-3 py-2">Sample / Lot</th>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Sterility</th>
                <th className="px-3 py-2">Endotoxin</th>
                <th className="px-3 py-2">Other panels</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-atlas-border">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-neutral-500">
                    No rows match this filter.
                  </td>
                </tr>
              ) : (
                visible.map((r, i) => (
                  <tr key={`${r.coa}-${r.sampleId}-${i}`} className="align-top">
                    <td className="px-3 py-2.5 text-neutral-400 tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      {r.coa !== '—' ? (
                        <Link
                          to={`/coa/${r.coa}`}
                          className="font-mono text-sm font-bold text-sky-800 hover:underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {r.coa}
                        </Link>
                      ) : (
                        <span className="font-mono text-sm text-neutral-400">—</span>
                      )}
                      <div className="text-[11px] text-neutral-500 mt-0.5">{r.stage}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <VisibilityPill published={r.published} completed={!r.hasPending && r.coa !== '—'} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-black">{r.sample}</div>
                      <div className="text-[11px] text-neutral-500">
                        Lot {r.lot} · Order {r.order} · {r.status}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">{r.company}</td>
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
