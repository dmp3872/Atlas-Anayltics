import { useMemo, useState } from 'react';
import {
  ArrowRight, ChevronDown, ChevronRight, Clock, FlaskConical, Zap,
  FileText, UserPlus, UserMinus, UserCircle2, AlertTriangle,
} from 'lucide-react';
import { LabPriority, Order, OrderSample, SampleStatus } from '../../lib/types';
import { SAMPLE_STATUS_LABELS } from '../../lib/utils';
import { parseSampleMetadata } from '../../lib/coaPanels';
import {
  LAB_PRIORITIES, LAB_PRIORITY_LABELS, LAB_PRIORITY_STYLES,
  QueueSampleItem, normalizeLabPriority, isFullyUnassigned,
} from '../../lib/labQueue';
import { etaHeat, etaHeatPercent, resolveEtaAt } from '../../lib/etaHeat';
import {
  OrderContextBadges, QueueSampleNotesActions, useOrderContextMeta,
} from './QueueOrderContext';

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
  /** Assign a specific ordered test to a chemist (or null to clear). */
  onAssignTest?: (sampleId: string, testName: string, userId: string | null) => void;
  /** Admin-only: set sample-level priority override (null = inherit from order). */
  onSetSamplePriority?: (sampleId: string, priority: LabPriority | null) => void;
  /** Open chemist-safe order brief drawer. */
  onOpenOrderBrief?: (orderId: string) => void;
}

type OrderGroup = {
  order: Order;
  items: QueueSampleItem[];
  topPriority: LabPriority;
  overdueCount: number;
  unassignedCount: number;
};

function formatAge(hours: number): string {
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${Math.round(hours % 24)}h`;
}

function priorityRank(p: LabPriority): number {
  if (p === 'urgent') return 0;
  if (p === 'high') return 1;
  if (p === 'normal') return 2;
  return 3;
}

export default function TestingQueuePanel({
  items, loading, onIssueCoa, onUpdateStatus,
  chemists, currentUserId, onClaim, onAssign, onRelease, onAssignTest, onSetSamplePriority,
  onOpenOrderBrief,
}: Props) {
  /** Explicit expand/collapse overrides. Missing key = auto (open if 1 sample). */
  const [expandedByOrder, setExpandedByOrder] = useState<Record<string, boolean>>({});

  const groups = useMemo((): OrderGroup[] => {
    const byOrder = new Map<string, OrderGroup>();
    for (const item of items) {
      let group = byOrder.get(item.order.id);
      if (!group) {
        group = {
          order: item.order,
          items: [],
          topPriority: item.priority,
          overdueCount: 0,
          unassignedCount: 0,
        };
        byOrder.set(item.order.id, group);
      }
      group.items.push(item);
      if (priorityRank(item.priority) < priorityRank(group.topPriority)) {
        group.topPriority = item.priority;
      }
      if (item.overdue) group.overdueCount += 1;
      if (isFullyUnassigned(item.sample, item.tests)) group.unassignedCount += 1;
    }
    return Array.from(byOrder.values());
  }, [items]);

  const orderIds = useMemo(() => groups.map(g => g.order.id), [groups]);
  const orderMeta = useOrderContextMeta(orderIds);

  const queueIndexBySample = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((item, idx) => map.set(item.sample.id, idx + 1));
    return map;
  }, [items]);

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
  const unassignedCount = items.filter(i => isFullyUnassigned(i.sample, i.tests)).length;
  const canAssign = !!(onAssign && chemists && chemists.length > 0);
  const canAssignTests = !!(onAssignTest && chemists && chemists.length > 0);

  function chemistName(id: string): string {
    return chemists?.find(c => c.id === id)?.name ?? 'Chemist';
  }

  function isExpanded(orderId: string, sampleCount: number) {
    if (orderId in expandedByOrder) return expandedByOrder[orderId];
    return sampleCount <= 1;
  }

  function toggleOrder(orderId: string, sampleCount: number) {
    setExpandedByOrder(prev => {
      const currentlyOpen = orderId in prev ? prev[orderId] : sampleCount <= 1;
      return { ...prev, [orderId]: !currentlyOpen };
    });
  }

  function renderSampleCard(item: QueueSampleItem) {
    const {
      sample, order, tests, testsLabel, priority, ageHours,
      assigned_to: assignedTo, testAssignments, overdue, dueAt, hasCoa,
    } = item;
    const ctx = orderMeta[order.id];
    const meta = parseSampleMetadata(sample.metadata);
    const styles = LAB_PRIORITY_STYLES[priority];
    const isMine = !!currentUserId && assignedTo === currentUserId;
    const myTests = currentUserId
      ? tests.filter(t => testAssignments[t] === currentUserId)
      : [];
    const assignmentLabel = !assignedTo && myTests.length === 0
      ? 'Unassigned'
      : isMine
        ? (myTests.length ? 'You · lead' : 'You')
        : assignedTo
          ? chemistName(assignedTo)
          : myTests.length
            ? `You · ${myTests.length} test${myTests.length === 1 ? '' : 's'}`
            : 'Split across chemists';
    const testsMissing = testsLabel.trim() === 'Tests not specified' || testsLabel.trim() === '';
    const heat = etaHeat(resolveEtaAt(order) || dueAt, { complete: hasCoa || sample.status === 'complete' });
    const heatPct = etaHeatPercent(heat.level);
    const queuePos = queueIndexBySample.get(sample.id) ?? 0;

    return (
      <article
        key={sample.id}
        className={`rounded-lg border overflow-hidden border-l-4 ${heat.level !== 'none' && heat.level !== 'ok' ? heat.border : overdue ? 'border-red-500' : styles.border} ${heat.level === 'overdue' || heat.level === 'today' ? heat.bg : overdue ? 'bg-red-50/40' : 'bg-white'}`}
      >
        <div className="h-1.5 w-full bg-neutral-100">
          <div
            className={`h-full transition-[width] ${heat.bar}`}
            style={{ width: `${heatPct}%` }}
            title={heat.label}
          />
        </div>
        <div className="p-3 sm:p-4">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <span
                className="flex-shrink-0 flex items-center justify-center h-7 w-7 rounded-full bg-black text-white text-xs font-bold mt-0.5"
                title="Queue position"
              >
                #{queuePos}
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
                    !assignedTo && myTests.length === 0
                      ? 'bg-neutral-50 text-neutral-500 border-atlas-border'
                      : isMine || myTests.length > 0
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
                  {(ctx?.openActionCount ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-900">
                      <AlertTriangle size={10} /> {ctx!.openActionCount} open action{ctx!.openActionCount === 1 ? '' : 's'}
                    </span>
                  )}
                  {sample.accession_number && (
                    <span className="text-[10px] font-mono text-neutral-500 border border-atlas-border px-2 py-0.5 rounded-full">
                      Acc {sample.accession_number}
                    </span>
                  )}
                </div>

                <div>
                  <p className="font-bold text-base text-black">{sample.display_name || sample.sample_name}</p>
                  <p className="text-xs text-neutral-600 mt-1">
                    <span className="font-semibold text-neutral-800">Lot</span>
                    {': '}
                    {(meta.batch_number || '').trim() ? (
                      <span className="font-mono font-medium text-black">{(meta.batch_number || '').trim()}</span>
                    ) : (
                      <span className="text-amber-700">Not provided</span>
                    )}
                    {(meta.labeled_content || '').trim() ? (
                      <>
                        {' · '}
                        <span className="text-neutral-500">
                          Claim {(meta.labeled_content || '').trim()}
                          {(meta.label_claim_unit || '').trim() ? ` ${(meta.label_claim_unit || '').trim()}` : ' mg'}
                        </span>
                      </>
                    ) : null}
                  </p>
                  {meta.sample_type === 'blend' && meta.blend_label && (
                    <p className="text-sm text-amber-900 mt-1 font-medium">
                      {meta.blend_label}
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5">
                    Tests to run{canAssignTests ? ' · assign per test' : ''}
                  </p>
                  {canAssignTests ? (
                    <ul className="space-y-1.5">
                      {tests.map(test => {
                        const testAssignee = testAssignments[test] || '';
                        const mine = !!currentUserId && testAssignee === currentUserId;
                        return (
                          <li
                            key={test}
                            className={`flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 rounded-md border px-2.5 py-1.5 bg-white ${
                              mine ? 'border-brand-300' : 'border-atlas-border'
                            }`}
                          >
                            <span className="text-xs font-medium text-neutral-800 min-w-0 flex-1">
                              {test}
                            </span>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <select
                                value={testAssignee}
                                onChange={e => onAssignTest?.(sample.id, test, e.target.value || null)}
                                className="input-field py-1 text-xs min-w-[140px]"
                                title={`Assign ${test}`}
                              >
                                <option value="">Unassigned</option>
                                {chemists!.map(c => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                              {currentUserId && !testAssignee && (
                                <button
                                  type="button"
                                  onClick={() => onAssignTest?.(sample.id, test, currentUserId)}
                                  className="btn-outline text-[11px] py-1 px-2 gap-1"
                                  title="Claim this test"
                                >
                                  <UserPlus size={11} /> Claim
                                </button>
                              )}
                              {mine && (
                                <button
                                  type="button"
                                  onClick={() => onAssignTest?.(sample.id, test, null)}
                                  className="btn-outline text-[11px] py-1 px-2 gap-1"
                                  title="Release this test"
                                >
                                  <UserMinus size={11} /> Release
                                </button>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {tests.map(test => (
                        <span
                          key={test}
                          className="text-xs px-2 py-1 rounded-md bg-white border border-atlas-border text-neutral-800 font-medium"
                        >
                          {test}
                          {testAssignments[test] ? (
                            <span className="text-neutral-500 font-normal">
                              {' · '}{chemistName(testAssignments[test])}
                            </span>
                          ) : null}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-neutral-500 mt-2">{testsLabel}</p>
                </div>

                <p className="text-xs text-neutral-500">
                  {sample.vial_count} vial{sample.vial_count === 1 ? '' : 's'} · {sample.sample_type}
                  {' · '}{SAMPLE_STATUS_LABELS[sample.status]}
                </p>

                <QueueSampleNotesActions
                  orderId={order.id}
                  sampleId={sample.id}
                  noteCount={ctx?.noteCount}
                  openActions={ctx?.openActionCount}
                />
              </div>
            </div>

            <div className="flex flex-wrap lg:flex-col gap-2 lg:items-stretch lg:min-w-[170px]">
              {!assignedTo && onClaim && (
                <button
                  type="button"
                  onClick={() => onClaim(sample.id)}
                  className="btn-outline text-xs py-1.5 gap-1 justify-center"
                >
                  <UserPlus size={12} /> Claim sample
                </button>
              )}
              {isMine && onRelease && (
                <button
                  type="button"
                  onClick={() => onRelease(sample.id)}
                  className="btn-outline text-xs py-1.5 gap-1 justify-center"
                >
                  <UserMinus size={12} /> Release sample
                </button>
              )}
              {canAssign && (
                <select
                  value={assignedTo ?? ''}
                  onChange={e => onAssign?.(sample.id, e.target.value || null)}
                  className="input-field py-1.5 text-xs"
                  title="Assign lead chemist for this sample"
                >
                  <option value="">Lead: Unassigned</option>
                  {chemists!.map(c => (
                    <option key={c.id} value={c.id}>Lead: {c.name}</option>
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
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-xs">
        <span className="px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-700 font-medium">
          {items.length} in queue · {groups.length} order{groups.length === 1 ? '' : 's'}
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
        {groups.map(group => {
          const { order, items: orderItems, topPriority, overdueCount, unassignedCount: groupUnassigned } = group;
          const sampleCount = orderItems.length;
          const open = isExpanded(order.id, sampleCount);
          const styles = LAB_PRIORITY_STYLES[topPriority];
          const company = (order.company_name || '').trim() || '—';
          const eta = resolveEtaAt(order);
          const heat = etaHeat(eta, { complete: false });

          const ctx = orderMeta[order.id];

          return (
            <section key={order.id} className="card overflow-hidden">
              <div className="px-4 py-3 sm:px-5 sm:py-3.5 flex items-start gap-3 hover:bg-neutral-50/80 transition-colors">
                <button
                  type="button"
                  onClick={() => toggleOrder(order.id, sampleCount)}
                  className="mt-0.5 text-neutral-400 flex-shrink-0"
                  aria-expanded={open}
                  aria-label={open ? 'Collapse order' : 'Expand order'}
                >
                  {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </button>
                <button
                  type="button"
                  onClick={() => toggleOrder(order.id, sampleCount)}
                  className="min-w-0 flex-1 text-left"
                  aria-expanded={open}
                >
                  <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 sm:gap-3">
                    <p className="font-bold text-black truncate text-[15px]">{company}</p>
                    <p className="font-mono text-sm font-semibold text-neutral-800 flex-shrink-0">
                      {order.order_number}
                    </p>
                  </div>
                  <p className="text-xs text-neutral-500 mt-1">
                    {sampleCount} sample{sampleCount === 1 ? '' : 's'}
                    {order.rush_processing ? ' · Rush' : ''}
                    {overdueCount > 0 ? ` · ${overdueCount} overdue` : ''}
                    {groupUnassigned > 0 ? ` · ${groupUnassigned} unassigned` : ''}
                    {heat.level !== 'none' ? ` · ${heat.label}` : ''}
                  </p>
                </button>
                <div className="flex flex-wrap gap-1.5 justify-end flex-shrink-0 pt-0.5 items-center">
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${styles.badge}`}>
                    {LAB_PRIORITY_LABELS[topPriority]}
                  </span>
                  {order.rush_processing && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                      <Zap size={10} /> Rush
                    </span>
                  )}
                  <OrderContextBadges
                    noteCount={ctx?.noteCount}
                    openActions={ctx?.openActionCount}
                  />
                  {onOpenOrderBrief && (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        onOpenOrderBrief(order.id);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md border border-brand-200 bg-brand-50 text-brand-800 hover:bg-brand-100"
                    >
                      <FileText size={11} /> Order brief
                    </button>
                  )}
                </div>
              </div>

              {open && (
                <div className="border-t border-atlas-border px-3 py-3 sm:px-4 sm:py-4 space-y-3 bg-neutral-50/40">
                  {orderItems.map(item => renderSampleCard(item))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
