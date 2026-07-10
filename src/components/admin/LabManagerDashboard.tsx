import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Clock, Download, FlaskConical, TrendingUp, Users as UsersIcon,
} from 'lucide-react';
import { COA, Order, OrderSample, UserProfile } from '../../lib/types';
import { chemistWorkloadStats } from '../../lib/labAnalytics';
import { buildQueueItems, LAB_PRIORITY_LABELS, LAB_PRIORITY_STYLES } from '../../lib/labQueue';
import { downloadCsv } from '../../lib/exportCsv';
import { supabase } from '../../lib/supabase';

interface Props {
  samples: OrderSample[];
  orders: Order[];
  coas: COA[];
  chemists: UserProfile[];
  onRefresh?: () => void;
  onAssignSample?: (sampleId: string, userId: string | null) => void;
}

export default function LabManagerDashboard({ samples, orders, coas, chemists, onRefresh, onAssignSample }: Props) {
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const stats = useMemo(
    () => chemistWorkloadStats(samples, orders, coas, chemists)
      .sort((a, b) => b.assignedCount - a.assignedCount),
    [samples, orders, coas, chemists],
  );

  const unassignedCount = useMemo(() => {
    const pending = buildQueueItems(samples, orders, coas, true);
    return pending.filter(item => !item.assigned_to).length;
  }, [samples, orders, coas]);

  const teamAvgTurnaround = useMemo(() => {
    const withTurnaround = stats.filter(s => s.avgTurnaroundDays != null);
    if (!withTurnaround.length) return null;
    const sum = withTurnaround.reduce((acc, s) => acc + (s.avgTurnaroundDays ?? 0), 0);
    return Math.round((sum / withTurnaround.length) * 10) / 10;
  }, [stats]);

  const totalAssigned = useMemo(() => stats.reduce((acc, s) => acc + s.assignedCount, 0), [stats]);

  async function handleAssign(sampleId: string, userId: string) {
    const targetId = userId || null;
    setAssigningId(sampleId);
    if (onAssignSample) {
      onAssignSample(sampleId, targetId);
    } else {
      const assigned_at = targetId ? new Date().toISOString() : null;
      await supabase.from('order_samples').update({ assigned_to: targetId, assigned_at }).eq('id', sampleId);
    }
    onRefresh?.();
    setAssigningId(null);
  }

  function exportWorkloadCsv() {
    downloadCsv(
      'chemist-workload.csv',
      ['Chemist', 'Assigned', 'In Progress', 'Completed', 'Avg Turnaround (days)', 'Samples/Day'],
      stats.map(s => [s.name, s.assignedCount, s.inProgressCount, s.completedCount, s.avgTurnaroundDays ?? '', s.samplesPerDay]),
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-4">
          <UsersIcon size={16} className="text-brand-500 mb-2" />
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Active chemists</p>
          <p className="text-2xl font-bold text-black">{chemists.length}</p>
        </div>
        <div className="card p-4">
          <FlaskConical size={16} className="text-brand-500 mb-2" />
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Assigned samples</p>
          <p className="text-2xl font-bold text-black">{totalAssigned}</p>
        </div>
        <div className={`card p-4 ${unassignedCount > 0 ? 'border-amber-200 bg-amber-50/30' : ''}`}>
          <Clock size={16} className={unassignedCount > 0 ? 'text-amber-600' : 'text-brand-500'} />
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mt-2">Unassigned queue</p>
          <p className="text-2xl font-bold text-black">{unassignedCount}</p>
        </div>
        <div className="card p-4">
          <TrendingUp size={16} className="text-brand-500 mb-2" />
          <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Team avg turnaround</p>
          <p className="text-2xl font-bold text-black">
            {teamAvgTurnaround != null ? `${teamAvgTurnaround}d` : '—'}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-black">Chemist workload</h3>
          <p className="text-xs text-neutral-500">Everything each chemist is working on, plus throughput.</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={exportWorkloadCsv}
            disabled={stats.length === 0}
            className="btn-outline text-xs py-1.5 px-2.5 gap-1.5 disabled:opacity-40"
          >
            <Download size={12} /> Export CSV
          </button>
          <Link to="/lab" className="text-xs font-semibold text-brand-700 hover:underline flex items-center gap-1 whitespace-nowrap">
            Open chemist console <ArrowRight size={12} />
          </Link>
        </div>
      </div>

      {stats.length === 0 ? (
        <div className="card p-8 text-center text-sm text-neutral-500">No chemist accounts found yet.</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {stats.map(chemist => (
            <div key={chemist.chemistId} className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-atlas-border flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-black">{chemist.name}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {chemist.assignedCount} assigned · {chemist.inProgressCount} in progress · {chemist.completedCount} completed
                  </p>
                </div>
                <div className="flex gap-4 text-right flex-shrink-0">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Avg turnaround</p>
                    <p className="text-lg font-bold text-black tabular-nums">
                      {chemist.avgTurnaroundDays != null ? `${chemist.avgTurnaroundDays}d` : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Samples/day</p>
                    <p className="text-lg font-bold text-black tabular-nums">{chemist.samplesPerDay}</p>
                  </div>
                </div>
              </div>

              {chemist.currentSamples.length === 0 ? (
                <p className="px-5 py-6 text-sm text-neutral-500 text-center">No samples currently assigned.</p>
              ) : (
                <div className="divide-y divide-atlas-border max-h-72 overflow-y-auto">
                  {chemist.currentSamples.slice(0, 8).map(({ sample, order, ageHours, priority }) => {
                    const styles = LAB_PRIORITY_STYLES[priority as keyof typeof LAB_PRIORITY_STYLES];
                    return (
                      <div key={sample.id} className="flex items-start gap-3 px-5 py-2.5">
                        <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${styles.dot}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-black truncate">{sample.display_name || sample.sample_name}</p>
                          <p className="text-xs text-neutral-500 truncate">{order.company_name || '—'}</p>
                        </div>
                        <div className="text-right flex-shrink-0 space-y-1">
                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full border inline-block ${styles.badge}`}>
                            {LAB_PRIORITY_LABELS[priority as keyof typeof LAB_PRIORITY_LABELS]}
                          </span>
                          <p className="text-[10px] text-neutral-400">{Math.round(ageHours)}h waiting</p>
                          <select
                            value={sample.assigned_to ?? ''}
                            disabled={assigningId === sample.id}
                            onChange={e => handleAssign(sample.id, e.target.value)}
                            className="input-field py-1 text-[11px] w-full disabled:opacity-50"
                            title="Reassign chemist"
                          >
                            <option value="">Unassigned</option>
                            {chemists.map(c => (
                              <option key={c.id} value={c.id}>{c.full_name || 'Chemist'}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                  {chemist.currentSamples.length > 8 && (
                    <p className="px-5 py-2 text-xs text-neutral-500 text-center">
                      +{chemist.currentSamples.length - 8} more — open chemist console for the full list.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
