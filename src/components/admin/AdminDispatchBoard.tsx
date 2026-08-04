import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, Users } from 'lucide-react';
import { COA, Order, OrderSample, UserProfile } from '../../lib/types';
import {
  buildQueueItems, isFullyUnassigned, LAB_PRIORITY_LABELS,
} from '../../lib/labQueue';
import PriorityBanner from '../lab/PriorityBanner';
import { chemistWorkloadStats } from '../../lib/labAnalytics';

interface Props {
  samples: OrderSample[];
  orders: Order[];
  coas: COA[];
  chemists: UserProfile[];
  onAssignSample: (sampleId: string, userId: string | null) => void;
}

/** Unassigned dispatch board — assign backlog by chemist load. */
export default function AdminDispatchBoard({
  samples, orders, coas, chemists, onAssignSample,
}: Props) {
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const workload = useMemo(
    () => chemistWorkloadStats(samples, orders, coas, chemists),
    [samples, orders, coas, chemists],
  );

  const loadByChemist = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of workload) map.set(row.chemistId, row.assignedCount);
    return map;
  }, [workload]);

  const unassigned = useMemo(() => {
    return buildQueueItems(samples, orders, coas, true)
      .filter(item => isFullyUnassigned(item.sample, item.tests));
  }, [samples, orders, coas]);

  async function handleAssign(sampleId: string, userId: string) {
    setAssigningId(sampleId);
    onAssignSample(sampleId, userId || null);
    setAssigningId(null);
  }

  const lightestChemistId = useMemo(() => {
    if (chemists.length === 0) return '';
    return [...chemists].sort((a, b) =>
      (loadByChemist.get(a.id) ?? 0) - (loadByChemist.get(b.id) ?? 0),
    )[0]?.id ?? '';
  }, [chemists, loadByChemist]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-black flex items-center gap-2">
            <UserPlus size={16} className="text-brand-600" />
            Unassigned dispatch
          </h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            Assign backlog by chemist load. Higher priority samples are listed first.
          </p>
        </div>
        <span className={`text-xs font-bold uppercase px-2.5 py-1 rounded-full border ${
          unassigned.length
            ? 'bg-amber-50 text-amber-900 border-amber-200'
            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
        }`}>
          {unassigned.length} unassigned
        </span>
      </div>

      {chemists.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chemists.map(c => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-atlas-border bg-white text-neutral-700"
            >
              <Users size={11} className="text-neutral-400" />
              {c.full_name || 'Chemist'}
              <span className="font-bold tabular-nums text-black">{loadByChemist.get(c.id) ?? 0}</span>
            </span>
          ))}
        </div>
      )}

      {unassigned.length === 0 ? (
        <div className="card p-8 text-center text-sm text-neutral-500">
          Dispatch queue is clear — every testing-ready sample has an assignee.
        </div>
      ) : (
        <div className="space-y-2">
          {unassigned.map(item => {
            const { sample, order, priority, testsLabel, ageHours } = item;
            return (
              <div key={sample.id} className="card overflow-hidden">
                <PriorityBanner priority={priority} rush={order.rush_processing} compact />
                <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-black truncate">
                      {sample.display_name || sample.sample_name}
                    </p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      <Link to={`/admin/orders/${order.id}`} className="font-mono font-semibold text-brand-700 hover:underline">
                        {order.order_number}
                      </Link>
                      {' · '}{order.company_name || '—'}
                      {' · '}{LAB_PRIORITY_LABELS[priority]}
                      {' · '}{Math.round(ageHours)}h waiting
                    </p>
                    <p className="text-xs text-neutral-400 mt-1 truncate">{testsLabel}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                    {lightestChemistId && (
                      <button
                        type="button"
                        disabled={assigningId === sample.id}
                        onClick={() => handleAssign(sample.id, lightestChemistId)}
                        className="btn-outline text-xs py-1.5 px-2.5"
                      >
                        Assign lightest load
                      </button>
                    )}
                    <select
                      value=""
                      disabled={assigningId === sample.id || chemists.length === 0}
                      onChange={e => {
                        if (e.target.value) handleAssign(sample.id, e.target.value);
                      }}
                      className="input-field py-1.5 text-xs w-auto min-w-[160px]"
                    >
                      <option value="">Assign chemist…</option>
                      {[...chemists]
                        .sort((a, b) => (loadByChemist.get(a.id) ?? 0) - (loadByChemist.get(b.id) ?? 0))
                        .map(c => (
                          <option key={c.id} value={c.id}>
                            {c.full_name || 'Chemist'} ({loadByChemist.get(c.id) ?? 0})
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
