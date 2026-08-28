import {
  AlertTriangle, ArrowRight, Beaker, CalendarClock, CheckCircle2, ClipboardList,
  FlaskConical, ListTodo, Shield, UserCircle2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { COA, Order, OrderSample } from '../../lib/types';
import { SAMPLE_STATUS_LABELS, formatDate } from '../../lib/utils';
import {
  coaWorkflowStage, COA_WORKFLOW_LABELS, canEditLiveCoa, canUpdatePendingPublishedCoa,
} from '../../lib/coaWorkflow';
import { pendingAssayLabels } from '../../lib/coaDisplayPanels';
import { QueueSampleItem, isAssignedToChemist } from '../../lib/labQueue';
import { etaHeat, resolveEtaAt } from '../../lib/etaHeat';
import { openActionCount, type OrderActionItem } from '../../lib/orderActions';
import { supabase } from '../../lib/supabase';
import { computeChemistNeedsYou } from '../../lib/needsYou';
import NeedsYouStrip from '../shared/NeedsYouStrip';

interface Props {
  userId: string;
  queueItems: QueueSampleItem[];
  coas: COA[];
  orders: Order[];
  samples: OrderSample[];
  onOpenQueue: () => void;
  onOpenWorkflow: () => void;
  onIssueCoa: (sample: OrderSample) => void;
  onUpdatePendingCoa?: (coa: COA) => void;
}

export default function MyBenchPanel({
  userId,
  queueItems,
  coas,
  orders,
  samples,
  onOpenQueue,
  onOpenWorkflow,
  onIssueCoa,
  onUpdatePendingCoa,
}: Props) {
  const needsYou = useMemo(
    () => computeChemistNeedsYou({ userId, samples, orders, coas }),
    [userId, samples, orders, coas],
  );

  const mineQueue = queueItems.filter(i => isAssignedToChemist(i.sample, userId));
  const overdueMine = mineQueue.filter(i => {
    const heat = etaHeat(resolveEtaAt(i.order) || i.dueAt);
    return heat.level === 'overdue' || heat.level === 'today';
  });
  const dueSoonMine = mineQueue.filter(i => etaHeat(resolveEtaAt(i.order) || i.dueAt).level === 'soon');

  const reviewInbox = coas.filter(c => {
    const stage = coaWorkflowStage(c);
    if (stage !== 'pending_review') return false;
    return !c.review_assigned_to || c.review_assigned_to === userId;
  });

  const pendingAssayFollowUps = useMemo(
    () => coas.filter(c => canUpdatePendingPublishedCoa(c)),
    [coas],
  );

  const liveEditableCoas = useMemo(() => {
    const pendingIds = new Set(pendingAssayFollowUps.map(c => c.id));
    return coas
      .filter(c => canEditLiveCoa(c) && !pendingIds.has(c.id))
      .slice(0, 12);
  }, [coas, pendingAssayFollowUps]);

  const analyzing = mineQueue.filter(i => i.sample.status === 'analyzing');
  const readyToIssue = mineQueue.filter(i =>
    !i.hasCoa && (i.sample.status === 'analyzing' || i.sample.status === 'in_review' || i.sample.status === 'received'),
  );

  const mineOrderIds = useMemo(
    () => [...new Set(
      queueItems.filter(i => isAssignedToChemist(i.sample, userId)).map(i => i.order.id),
    )],
    [queueItems, userId],
  );

  const [openActions, setOpenActions] = useState<OrderActionItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (mineOrderIds.length === 0) {
      setOpenActions([]);
      return;
    }
    void (async () => {
      const { data, error } = await supabase
        .from('order_action_items')
        .select('*')
        .in('order_id', mineOrderIds)
        .is('resolved_at', null)
        .order('created_at', { ascending: true });
      if (cancelled) return;
      if (error) {
        setOpenActions([]);
        return;
      }
      setOpenActions((data ?? []) as OrderActionItem[]);
    })();
    return () => { cancelled = true; };
  }, [mineOrderIds]);

  const openActionTotal = openActionCount(openActions);

  const orderById = new Map(orders.map(o => [o.id, o]));
  const sampleById = new Map(samples.map(s => [s.id, s]));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-black flex items-center gap-2">
          <Beaker size={20} className="text-brand-700" />
          My Bench
        </h2>
        <p className="text-sm text-neutral-500 mt-1">
          Samples and individual tests assigned to you, due dates, reviews waiting on your signature, and open actions.
        </p>
      </div>

      <NeedsYouStrip
        items={needsYou}
        emptyLabel="Your bench is clear — nothing urgent assigned to you."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {[
          { label: 'Assigned to you', value: mineQueue.length, icon: UserCircle2, tone: 'text-sky-800 bg-sky-50 border-sky-200' },
          { label: 'Due today / overdue', value: overdueMine.length, icon: AlertTriangle, tone: overdueMine.length ? 'text-red-800 bg-red-50 border-red-200' : 'text-neutral-600 bg-neutral-50 border-atlas-border' },
          { label: 'Due in 3 days', value: dueSoonMine.length, icon: CalendarClock, tone: dueSoonMine.length ? 'text-amber-900 bg-amber-50 border-amber-200' : 'text-neutral-600 bg-neutral-50 border-atlas-border' },
          { label: 'Reviews for you', value: reviewInbox.length, icon: Shield, tone: reviewInbox.length ? 'text-violet-900 bg-violet-50 border-violet-200' : 'text-neutral-600 bg-neutral-50 border-atlas-border' },
          { label: 'Pending assay updates', value: pendingAssayFollowUps.length, icon: FlaskConical, tone: pendingAssayFollowUps.length ? 'text-amber-900 bg-amber-50 border-amber-200' : 'text-neutral-600 bg-neutral-50 border-atlas-border' },
          { label: 'Live COAs to edit', value: liveEditableCoas.length + pendingAssayFollowUps.length, icon: ClipboardList, tone: (liveEditableCoas.length + pendingAssayFollowUps.length) ? 'text-sky-900 bg-sky-50 border-sky-200' : 'text-neutral-600 bg-neutral-50 border-atlas-border' },
          { label: 'Open actions', value: openActionTotal, icon: ListTodo, tone: openActionTotal ? 'text-brand-900 bg-brand-50 border-brand-200' : 'text-neutral-600 bg-neutral-50 border-atlas-border' },
        ].map(card => (
          <div key={card.label} className={`rounded-xl border px-4 py-3 ${card.tone}`}>
            <card.icon size={16} className="mb-2 opacity-80" />
            <p className="text-2xl font-bold tabular-nums">{card.value}</p>
            <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80 mt-0.5">{card.label}</p>
          </div>
        ))}
      </div>

      <section className="card p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-bold text-black flex items-center gap-2">
            <FlaskConical size={16} className="text-brand-700" />
            Your assigned samples
          </h3>
          <button type="button" onClick={onOpenQueue} className="text-xs font-semibold text-brand-700 hover:underline inline-flex items-center gap-1">
            Full queue <ArrowRight size={12} />
          </button>
        </div>

        {mineQueue.length === 0 ? (
          <p className="text-sm text-neutral-500 py-4 text-center">
            Nothing assigned to you. Claim work from the Testing Queue.
          </p>
        ) : (
          <ul className="divide-y divide-atlas-border">
            {mineQueue.slice(0, 12).map(item => {
              const heat = etaHeat(resolveEtaAt(item.order) || item.dueAt, { complete: item.hasCoa });
              return (
                <li key={item.sample.id} className={`py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${heat.bg}`}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-black truncate">
                        {item.sample.display_name || item.sample.sample_name}
                      </p>
                      {item.sample.accession_number && (
                        <span className="text-[10px] font-mono text-neutral-500 border border-atlas-border px-1.5 py-0.5 rounded">
                          {item.sample.accession_number}
                        </span>
                      )}
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${heat.chip}`}>
                        {heat.label}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {item.order.company_name || '—'} · {item.order.order_number} · {SAMPLE_STATUS_LABELS[item.sample.status]}
                      {(() => {
                        const mineTests = item.tests.filter(t => item.testAssignments[t] === userId);
                        if (mineTests.length === 0) return item.assigned_to === userId ? ' · Lead assignee' : '';
                        return ` · Your tests: ${mineTests.join(', ')}`;
                      })()}
                    </p>
                    <div className="mt-1.5 h-1.5 w-full max-w-xs rounded-full bg-neutral-200 overflow-hidden">
                      <div className={`h-full ${heat.bar}`} style={{ width: `${heat.level === 'none' ? 0 : heat.level === 'ok' ? 25 : heat.level === 'soon' ? 55 : heat.level === 'today' ? 85 : 100}%` }} />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onIssueCoa(item.sample)}
                    className="btn-primary text-xs py-1.5 gap-1 shrink-0"
                  >
                    Issue COA <ArrowRight size={12} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {(analyzing.length > 0 || readyToIssue.length > 0) && (
          <p className="text-xs text-neutral-500 border-t border-atlas-border pt-3">
            {analyzing.length} analyzing · {readyToIssue.length} ready to issue a COA
          </p>
        )}
      </section>

      <section className="card p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-bold text-black flex items-center gap-2">
            <Shield size={16} className="text-violet-700" />
            Review inbox (signature 2/2)
          </h3>
          <button type="button" onClick={onOpenWorkflow} className="text-xs font-semibold text-brand-700 hover:underline inline-flex items-center gap-1">
            Workflow board <ArrowRight size={12} />
          </button>
        </div>

        {reviewInbox.length === 0 ? (
          <p className="text-sm text-neutral-500 py-4 text-center flex flex-col items-center gap-1">
            <CheckCircle2 size={22} className="text-emerald-500" />
            No certificates waiting on your sign-off.
          </p>
        ) : (
          <ul className="divide-y divide-atlas-border">
            {reviewInbox.slice(0, 10).map(coa => {
              const sample = coa.sample_id ? sampleById.get(coa.sample_id) : undefined;
              const order = coa.order_id ? orderById.get(coa.order_id) : undefined;
              const stage = coaWorkflowStage(coa);
              return (
                <li key={coa.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-black">{coa.display_name || coa.sample_name}</p>
                    <p className="text-xs text-neutral-500">
                      {coa.company_name || order?.company_name || '—'}
                      {sample?.accession_number ? ` · ${sample.accession_number}` : ''}
                      {' · '}{COA_WORKFLOW_LABELS[stage]}
                      {order?.estimated_ready_at || order?.due_at
                        ? ` · ETA ${formatDate(order.estimated_ready_at || order.due_at || '')}`
                        : ''}
                    </p>
                  </div>
                  <button type="button" onClick={onOpenWorkflow} className="btn-secondary text-xs py-1.5 gap-1">
                    <ClipboardList size={12} /> Open workflow
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-bold text-black flex items-center gap-2">
            <FlaskConical size={16} className="text-amber-700" />
            Pending assay updates
          </h3>
          <button type="button" onClick={onOpenWorkflow} className="text-xs font-semibold text-brand-700 hover:underline inline-flex items-center gap-1">
            Workflow board <ArrowRight size={12} />
          </button>
        </div>
        <p className="text-xs text-neutral-500">
          Published or verified certificates that still have deferred assays (e.g. 14-day sterility). Update results without unpublishing.
        </p>

        {pendingAssayFollowUps.length === 0 ? (
          <p className="text-sm text-neutral-500 py-4 text-center flex flex-col items-center gap-1">
            <CheckCircle2 size={22} className="text-emerald-500" />
            No deferred assays waiting on a result update.
          </p>
        ) : (
          <ul className="divide-y divide-atlas-border">
            {pendingAssayFollowUps.slice(0, 12).map(coa => {
              const sample = coa.sample_id ? sampleById.get(coa.sample_id) : undefined;
              const order = coa.order_id ? orderById.get(coa.order_id) : undefined;
              const stage = coaWorkflowStage(coa);
              const labels = pendingAssayLabels(coa.panel_results);
              return (
                <li key={coa.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-black">{coa.display_name || coa.sample_name}</p>
                    <p className="text-xs text-neutral-500">
                      {coa.company_name || order?.company_name || '—'}
                      {sample?.accession_number ? ` · ${sample.accession_number}` : ''}
                      {' · '}{COA_WORKFLOW_LABELS[stage]}
                      {labels.length > 0 ? ` · ${labels.join(', ')}` : ''}
                    </p>
                  </div>
                  {onUpdatePendingCoa ? (
                    <button
                      type="button"
                      onClick={() => onUpdatePendingCoa(coa)}
                      className="btn-primary text-xs py-1.5 gap-1"
                    >
                      <FlaskConical size={12} /> Update pending
                    </button>
                  ) : (
                    <button type="button" onClick={onOpenWorkflow} className="btn-secondary text-xs py-1.5 gap-1">
                      <ClipboardList size={12} /> Open workflow
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {liveEditableCoas.length > 0 && (
        <section className="card p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-bold text-black flex items-center gap-2">
              <FlaskConical size={16} className="text-sky-700" />
              Published / verified — quick edit
            </h3>
            <button type="button" onClick={onOpenWorkflow} className="text-xs font-semibold text-brand-700 hover:underline inline-flex items-center gap-1">
              Workflow board <ArrowRight size={12} />
            </button>
          </div>
          <p className="text-xs text-neutral-500">
            Open any live certificate to change pass / fail / pending results. Stays published; every change is logged on the COA.
          </p>
          <ul className="divide-y divide-atlas-border">
            {liveEditableCoas.map(coa => {
              const sample = coa.sample_id ? sampleById.get(coa.sample_id) : undefined;
              const order = coa.order_id ? orderById.get(coa.order_id) : undefined;
              const stage = coaWorkflowStage(coa);
              return (
                <li key={coa.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-black">{coa.display_name || coa.sample_name}</p>
                    <p className="text-xs text-neutral-500">
                      {coa.company_name || order?.company_name || '—'}
                      {sample?.accession_number ? ` · ${sample.accession_number}` : ''}
                      {' · '}{COA_WORKFLOW_LABELS[stage]}
                    </p>
                  </div>
                  {onUpdatePendingCoa ? (
                    <button
                      type="button"
                      onClick={() => onUpdatePendingCoa(coa)}
                      className="btn-primary text-xs py-1.5 gap-1"
                    >
                      <FlaskConical size={12} /> Edit COA
                    </button>
                  ) : (
                    <button type="button" onClick={onOpenWorkflow} className="btn-secondary text-xs py-1.5 gap-1">
                      <ClipboardList size={12} /> Open workflow
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card p-5 space-y-3">
        <h3 className="font-bold text-black flex items-center gap-2">
          <ListTodo size={16} className="text-brand-700" />
          Open actions on your orders
        </h3>
        {openActions.length === 0 ? (
          <p className="text-sm text-neutral-500 py-3 text-center">No open checklist items on your assigned work.</p>
        ) : (
          <ul className="divide-y divide-atlas-border">
            {openActions.slice(0, 8).map(action => {
              const order = orderById.get(action.order_id);
              return (
                <li key={action.id} className="py-2.5">
                  <p className="text-sm font-medium text-black">{action.title}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {order?.order_number || 'Order'} · {order?.company_name || '—'}
                    {action.created_by_name ? ` · from ${action.created_by_name}` : ''}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
