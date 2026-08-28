import { COA, Order, OrderSample, UserProfile } from './types';
import {
  canUpdatePendingPublishedCoa,
  coaWorkflowStage,
} from './coaWorkflow';
import {
  AdminAlert, adminOpsSnapshot, computeAdminAlerts,
} from './adminMetrics';
import { buildQueueItems, isAssignedToChemist } from './labQueue';
import { etaHeat, resolveEtaAt } from './etaHeat';
import { normalizePaymentStatus } from './utils';

export type NeedsYouLevel = 'urgent' | 'warning' | 'info';

export interface NeedsYouItem {
  id: string;
  level: NeedsYouLevel;
  title: string;
  detail?: string;
  href?: string;
  /** Admin section id when href is not used. */
  actionSection?: string;
  actionLabel?: string;
}

function unpaidOrders(orders: Order[]): Order[] {
  return orders.filter(o =>
    o.status !== 'cancelled'
    && normalizePaymentStatus(o.payment_status) === 'unpaid',
  );
}

/** Client dashboard — payments, shipping, branding gaps, new certificates. */
export function computeClientNeedsYou(opts: {
  orders: Order[];
  samples: OrderSample[];
  coas: COA[];
}): NeedsYouItem[] {
  const { orders, coas } = opts;
  const items: NeedsYouItem[] = [];

  const unpaid = unpaidOrders(orders);
  if (unpaid.length > 0) {
    items.push({
      id: 'pay',
      level: 'urgent',
      title: unpaid.length === 1
        ? `Pay invoice for ${unpaid[0].order_number}`
        : `Pay ${unpaid.length} unpaid invoices`,
      detail: 'Unpaid orders can delay intake and testing.',
      href: '/dashboard?tab=invoices',
      actionLabel: 'View invoices',
    });
  }

  const ship = orders.filter(o =>
    o.status === 'awaiting_sample' || o.status === 'received',
  );
  if (ship.length > 0) {
    items.push({
      id: 'ship',
      level: 'warning',
      title: ship.length === 1
        ? `Ship sample for ${ship[0].order_number}`
        : `${ship.length} orders awaiting your sample`,
      detail: 'Use the prepaid label from your order confirmation.',
      href: '/dashboard/orders',
      actionLabel: 'Open orders',
    });
  }

  const needsInfo = coas.filter(c => coaWorkflowStage(c) === 'awaiting_info');
  if (needsInfo.length > 0) {
    items.push({
      id: 'brand-info',
      level: 'warning',
      title: needsInfo.length === 1
        ? 'Add branding info for a certificate in progress'
        : `${needsInfo.length} certificates need your brand info`,
      detail: 'Logo and company details appear on the issued COA.',
      href: '/dashboard?tab=account',
      actionLabel: 'COA profiles',
    });
  }

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const freshPublished = coas.filter(c => {
    if (coaWorkflowStage(c) !== 'published') return false;
    const when = c.published_at || c.issued_at || c.created_at;
    return when ? new Date(when).getTime() >= weekAgo : false;
  });
  if (freshPublished.length > 0) {
    items.push({
      id: 'new-coa',
      level: 'info',
      title: freshPublished.length === 1
        ? `New certificate ready · ${freshPublished[0].display_name || freshPublished[0].sample_name}`
        : `${freshPublished.length} new certificates ready`,
      detail: 'Download PDF or order an Additional COA under another brand.',
      href: '/dashboard/coas',
      actionLabel: 'View COAs',
    });
  }

  return items.slice(0, 5);
}

/** Chemist My Bench — overdue work, ready to issue, review, pending assays. */
export function computeChemistNeedsYou(opts: {
  userId: string;
  samples: OrderSample[];
  orders: Order[];
  coas: COA[];
}): NeedsYouItem[] {
  const { userId, samples, orders, coas } = opts;
  const items: NeedsYouItem[] = [];
  const queue = buildQueueItems(samples, orders, coas, true)
    .filter(i => isAssignedToChemist(i.sample, userId));

  const overdue = queue.filter(i => {
    const heat = etaHeat(resolveEtaAt(i.order) || i.dueAt);
    return heat.level === 'overdue';
  });
  if (overdue.length > 0) {
    items.push({
      id: 'overdue',
      level: 'urgent',
      title: overdue.length === 1
        ? `Overdue · ${overdue[0].sample.sample_name || overdue[0].order.order_number}`
        : `${overdue.length} assigned samples overdue`,
      href: '/lab?tab=queue',
      actionLabel: 'Open queue',
    });
  }

  const readyToIssue = queue.filter(i =>
    !i.hasCoa
    && (i.sample.status === 'analyzing' || i.sample.status === 'in_review' || i.sample.status === 'received'),
  );
  if (readyToIssue.length > 0) {
    items.push({
      id: 'issue',
      level: 'warning',
      title: readyToIssue.length === 1
        ? `Ready to issue · ${readyToIssue[0].sample.sample_name || 'sample'}`
        : `${readyToIssue.length} samples ready to issue`,
      href: '/lab?tab=issue',
      actionLabel: 'Issue COA',
    });
  }

  const review = coas.filter(c => {
    const stage = coaWorkflowStage(c);
    if (stage !== 'pending_review') return false;
    return !c.review_assigned_to || c.review_assigned_to === userId;
  });
  if (review.length > 0) {
    items.push({
      id: 'review',
      level: 'warning',
      title: review.length === 1
        ? '1 COA waiting on review'
        : `${review.length} COAs waiting on review`,
      href: '/lab?tab=workflow',
      actionLabel: 'Workflow board',
    });
  }

  const pendingAssay = coas.filter(c => canUpdatePendingPublishedCoa(c));
  if (pendingAssay.length > 0) {
    items.push({
      id: 'pending-assay',
      level: 'info',
      title: pendingAssay.length === 1
        ? 'Update pending assay on a published COA'
        : `Update pending assays on ${pendingAssay.length} COAs`,
      href: '/lab?tab=bench',
      actionLabel: 'My bench',
    });
  }

  return items.slice(0, 5);
}

/** Admin — wrap existing ops alerts into the shared Needs you shape. */
export function computeAdminNeedsYou(
  orders: Order[],
  samples: OrderSample[],
  coas: COA[],
  users: UserProfile[] = [],
): NeedsYouItem[] {
  const alerts: AdminAlert[] = computeAdminAlerts(orders, samples, coas, users);
  const ops = adminOpsSnapshot(samples, orders, coas, users);
  const fromAlerts: NeedsYouItem[] = alerts.map(a => ({
    id: a.id,
    level: a.level,
    title: a.message,
    actionSection: a.actionSection,
    actionLabel: a.actionLabel,
  }));

  if (ops.needsPublish > 0 && !fromAlerts.some(i => i.id === 'needs-publish')) {
    fromAlerts.push({
      id: 'needs-publish',
      level: 'info',
      title: `${ops.needsPublish} COA${ops.needsPublish === 1 ? '' : 's'} ready to advance toward publish`,
      actionSection: 'coas',
      actionLabel: 'COA registry',
    });
  }

  return fromAlerts.slice(0, 6);
}
