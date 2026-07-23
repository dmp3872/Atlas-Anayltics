import {
  ArrowRight, Clock, FlaskConical, Zap, UserPlus, UserMinus, UserCircle2, AlertTriangle,
} from 'lucide-react';
import { LabPriority, OrderSample, SampleStatus } from '../../lib/types';
import { SAMPLE_STATUS_LABELS } from '../../lib/utils';
import { parseSampleMetadata } from '../../lib/coaPanels';
import {
  LAB_PRIORITIES, LAB_PRIORITY_LABELS, LAB_PRIORITY_STYLES,
  QueueSampleItem, normalizeLabPriority,
} from '../../lib/labQueue';
import { etaHeat, etaHeatPercent, resolveEtaAt } from '../../lib/etaHeat';

export interface ChemistOption {
  id: string;
  name: string;
}

interface Props {
  items: QueueSampleItem[];
  loading?: boolean;
  onIssueCoa: (sample: OrderSample) => void;
  onUpdateStatus: (sampleId: string, status: SampleStatus) => void;
  chemists?: ChemistOption[];
  currentUserId?: string;
  onClaim?: (sampleId: string) => void;
  onAssign?: (sampleId: string, userId: string | null) => void;
  onRelease?: (sampleId: string) => void;
  /** Admin-only: set sample-level priority override (null = inherit from order). */
  onSetSamplePriority?: (sampleId: string, priority: LabPriority | null) => void;
}

function formatAge(hours: number): string {
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${Math.round(hours % 24)}h`;
}

export default function TestingQueuePanel({
  items, loading, onIssueCoa, onUpdateStatus,
  chemists, currentUserId, onClaim, onAssign, onRelease, onSetSamplePriority,
}: Props) {
  if (loading) {
    return <div className="card p-8 text-center text-neutral-500">Loading testing queue…</div>;
  }

  if (items.length === 0) {
    return (
      <div className="card p-10 text-center">
        <FlaskConical size={32} className="mx-auto text-neutral-300 mb-3" />
        <p className="font-medium text-black">Queue is clear</p>
        <p className="text-sm text-neutral-500 mt-1">No samples match the current filters.</p>
      </div>
    );
  }

  const urgentCount = items.filter(i => i.priority === 'urgent').length;
  const highCount = items.filter(i => i.priority === 'high').length;
  const unassignedCount = items.filter(i => !i.assigned_to).length;
  const canAssign = !!(onAssign && chemists && chemists.length > 0);

  function chemistName(id: string): string {
    return chemists?.find(c => c.id === id)?.name ?? 'Chemist';
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-xs">
        <span className="px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-700 font-medium">
          {items.length} in queue
        </span>
        {urgentCount > 0 && (
          <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-800 font-semibold border border-red-200">
            {urgentCount} urgent
          </span>
        )}
        {highCount > 0 && (
          <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 font-semibold border border-amber-200">
            {highCount} high priority
          </span>
        )}
        {unassignedCount > 0 && (
          <span className="px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-600 font-medium border border-atlas-border">
            {unassignedCount} unassigned
          </span>
        )}
        {items.filter(i => i.overdue).length > 0 && (
          <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-800 font-semibold border border-red-200">
            {items.filter(i => i.overdue).length} overdue
          </span>
        )}
      </div>

      <div className="space-y-3">
        {items.map((item, idx) => {
          const { sample, order, tests, testsLabel, priority, ageHours, assigned_to: assignedTo, overdue, dueAt, hasCoa } = item;
          const meta = parseSampleMetadata(sample.metadata);
          const styles = LAB_PRIORITY_STYLES[priority];
          const isMine = !!currentUserId && assignedTo === currentUserId;
          const assignmentLabel = !assignedTo ? 'Unassigned' : isMine ? 'You' : chemistName(assignedTo);
          const testsMissing = testsLabel.trim() === 'Tests not specified' || testsLabel.trim() === '';
          const heat = etaHeat(resolveEtaAt(order) || dueAt, { complete: hasCoa || sample.status === 'complete' });
          const heatPct = etaHeatPercent(heat.level);

          return (
            <article
              key={sample.id}
              className={`card overflow-hidden border-l-4 ${heat.level !== 'none' && heat.level !== 'ok' ? heat.border : overdue ? 'border-red-500' : styles.border} ${heat.level === 'overdue' || heat.level === 'today' ? heat.bg : overdue ? 'bg-red-50/40' : styles.bg}`}
            >
              <div className="h-1.5 w-full bg-neutral-100">
                <div
                  className={`h-full transition-[width] ${heat.bar}`}
                  style={{ width: `${heatPct}%` }}
                  title={heat.label}
                />
              </div>
              <div className="p-4 sm:p-5">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <span
                      className="flex-shrink-0 flex items-center justify-center h-7 w-7 rounded-full bg-black text-white text-xs font-bold mt-0.5"
                      title="Queue position"
                    >
                      #{idx + 1}
                    </span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${styles.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} />
                          {LAB_PRIORITY_LABELS[priority]}
                        </span>
                        {order.rush_processing && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                            <Zap size={10} /> Rush
                          </span>
                        )}
                        <span className="text-xs text-neutral-500 flex items-center gap-1">
                          <Clock size={11} /> Waiting {formatAge(ageHours)}
                        </span>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                          !assignedTo
                            ? 'bg-neutral-50 text-neutral-500 border-atlas-border'
                            : isMine
                              ? 'bg-brand-100 text-brand-800 border-brand-200'
                              : 'bg-neutral-100 text-neutral-700 border-neutral-200'
                        }`}>
                          <UserCircle2 size={11} /> {assignmentLabel}
                        </span>
                        {testsMissing && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200">
                            <AlertTriangle size={10} /> Tests not specified
                          </span>
                        )}
                        {heat.level !== 'none' && (
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${heat.chip}`}>
                            {(heat.level === 'overdue' || heat.level === 'today') && <AlertTriangle size={10} />}
                            {heat.label}
                          </span>
                        )}
                        {sample.accession_number && (
                          <span className="text-[10px] font-mono text-neutral-500 border border-atlas-border px-2 py-0.5 rounded-full">
                            Acc {sample.accession_number}
                          </span>
                        )}
                      </div>

                      <div>
                        <p className="font-bold text-lg text-black">{sample.display_name || sample.sample_name}</p>
                        <p className="text-sm text-neutral-600 mt-0.5">
                          {order.company_name || '—'} · {order.order_number}
                        </p>
                        {meta.sample_type === 'blend' && meta.blend_label && (
                          <p className="text-sm text-amber-900 mt-1 font-medium">
                            {meta.blend_label}
                          </p>
                        )}
                      </div>

                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5">Tests to run</p>
                        <div className="flex flex-wrap gap-1.5">
                          {tests.map(test => (
                            <span
                              key={test}
                              className="text-xs px-2 py-1 rounded-md bg-white border border-atlas-border text-neutral-800 font-medium"
                            >
                              {test}
                            </span>
                          ))}
                        </div>
                        <p className="text-xs text-neutral-500 mt-2">{testsLabel}</p>
                      </div>

                      <p className="text-xs text-neutral-500">
                        {sample.vial_count} vial{sample.vial_count === 1 ? '' : 's'} · {sample.sample_type}
                        {' · '}{SAMPLE_STATUS_LABELS[sample.status]}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap lg:flex-col gap-2 lg:items-stretch lg:min-w-[170px]">
                    {!assignedTo && onClaim && (
                      <button
                        type="button"
                        onClick={() => onClaim(sample.id)}
                        className="btn-outline text-xs py-1.5 gap-1 justify-center"
                      >
                        <UserPlus size={12} /> Claim
                      </button>
                    )}
                    {isMine && onRelease && (
                      <button
                        type="button"
                        onClick={() => onRelease(sample.id)}
                        className="btn-outline text-xs py-1.5 gap-1 justify-center"
                      >
                        <UserMinus size={12} /> Release
                      </button>
                    )}
                    {canAssign && (
                      <select
                        value={assignedTo ?? ''}
                        onChange={e => onAssign?.(sample.id, e.target.value || null)}
                        className="input-field py-1.5 text-xs"
                        title="Assign chemist"
                      >
                        <option value="">Unassigned</option>
                        {chemists!.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    )}
                    {onSetSamplePriority && (
                      <select
                        value={sample.lab_priority ?? ''}
                        onChange={e => {
                          const v = e.target.value;
                          onSetSamplePriority(sample.id, v ? (v as LabPriority) : null);
                        }}
                        className={`input-field py-1.5 text-xs font-semibold ${styles.badge}`}
                        title="Sample priority override (blank = inherit order)"
                      >
                        <option value="">
                          Order: {LAB_PRIORITY_LABELS[normalizeLabPriority(order.lab_priority)]}
                        </option>
                        {LAB_PRIORITIES.map(p => (
                          <option key={p} value={p}>{LAB_PRIORITY_LABELS[p]} (override)</option>
                        ))}
                      </select>
                    )}
                    <select
                      value={sample.status}
                      onChange={e => onUpdateStatus(sample.id, e.target.value as SampleStatus)}
                      className="input-field py-1.5 text-xs"
                    >
                      {(['received', 'analyzing', 'in_review', 'complete'] as SampleStatus[]).map(st => (
                        <option key={st} value={st}>{SAMPLE_STATUS_LABELS[st]}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => onIssueCoa(sample)}
                      disabled={testsMissing}
                      title={testsMissing ? 'Fix this sample\'s tests before issuing a COA' : undefined}
                      className="btn-primary text-xs py-2 gap-1 justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Issue COA <ArrowRight size={12} />
                    </button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
