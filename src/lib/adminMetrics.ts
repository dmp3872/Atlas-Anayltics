import { COA, Order, OrderSample, UserProfile } from './types';
import { coaWorkflowStage } from './coaWorkflow';
import {
  buildQueueItems, isFullyUnassigned, orderLabPriority, QueueSampleItem,
} from './labQueue';
import { averageDailyIntake, chemistWorkloadStats } from './labAnalytics';
import { resolveEtaAt } from './etaHeat';
import { normalizePaymentStatus } from './utils';

export interface AdminAlert {
  id: string;
  level: 'urgent' | 'warning' | 'info';
  message: string;
  actionLabel?: string;
  actionSection?: string;
}

const BEHIND_HOURS = 48;

function isActiveOrder(o: Order): boolean {
  return o.status !== 'complete' && o.status !== 'cancelled';
}

function isOverdueOrder(o: Order): boolean {
  if (!isActiveOrder(o)) return false;
  const eta = resolveEtaAt(o);
  if (!eta) return false;
  return new Date(eta).getTime() < Date.now();
}

/** Admin ops health — customer workflow + behindness, not chemist bench KPIs. */
export function adminOpsSnapshot(
  samples: OrderSample[],
  orders: Order[],
  coas: COA[],
  users: UserProfile[],
) {
  const active = orders.filter(isActiveOrder);
  const unpaid = active.filter(o => normalizePaymentStatus(o.payment_status) === 'unpaid');
  const awaitingSample = active.filter(o => o.status === 'awaiting_sample' || o.status === 'received');
  const inLab = active.filter(o =>
    o.status === 'processing' || o.status === 'analyzing' || o.status === 'in_review',
  );
  const overdue = active.filter(isOverdueOrder);
  const urgent = active.filter(o => orderLabPriority(o) === 'urgent');
  const refunded = orders.filter(o => normalizePaymentStatus(o.payment_status) === 'refunded');
  const cancelledRecent = orders
    .filter(o => o.status === 'cancelled')
    .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
    .slice(0, 8);

  const queue = buildQueueItems(samples, orders, coas, true);
  const unassigned = queue.filter(item => isFullyUnassigned(item.sample, item.tests));
  const behindAssigned = queue.filter(item =>
    !!item.assigned_to && (item.overdue || item.ageHours >= BEHIND_HOURS),
  );

  const chemists = users.filter(u => u.role === 'chemist' || u.role === 'admin');
  const workload = chemistWorkloadStats(samples, orders, coas, chemists);
  const chemistsBehind = workload
    .map(w => {
      const lagging = w.currentSamples.filter(s => {
        const overdue = isOverdueOrder(s.order);
        return overdue || s.ageHours >= BEHIND_HOURS;
      });
      const oldestHours = Math.max(0, ...w.currentSamples.map(s => s.ageHours), 0);
      return {
        ...w,
        laggingCount: lagging.length,
        oldestHours,
        isBehind: lagging.length > 0 || (w.assignedCount >= 3 && oldestHours >= BEHIND_HOURS),
      };
    })
    .filter(w => w.isBehind)
    .sort((a, b) => b.laggingCount - a.laggingCount || b.oldestHours - a.oldestHours);

  const clientInfoNeeded = coas.filter(c => coaWorkflowStage(c) === 'awaiting_info').length;
  const needsPublish = coas.filter(c => {
    const stage = coaWorkflowStage(c);
    return stage === 'verified' || stage === 'pending_review';
  }).length;

  const behindLevel: 'clear' | 'watch' | 'behind' =
    overdue.length >= 3 || chemistsBehind.length >= 2 || behindAssigned.length >= 4
      ? 'behind'
      : overdue.length > 0 || chemistsBehind.length > 0 || unassigned.length > 3 || unpaid.length > 5
        ? 'watch'
        : 'clear';

  return {
    activeCount: active.length,
    unpaid,
    awaitingSample,
    inLab,
    overdue,
    urgent,
    refunded,
    cancelledRecent,
    unassigned,
    behindAssigned,
    chemistsBehind,
    clientInfoNeeded,
    needsPublish,
    behindLevel,
    queueDepth: queue.length,
    avgDailyIntake: averageDailyIntake(samples, 30),
  };
}

export type AdminOpsSnapshot = ReturnType<typeof adminOpsSnapshot>;

export function computeAdminAlerts(
  orders: Order[],
  samples: OrderSample[],
  coas: COA[],
  users: UserProfile[] = [],
): AdminAlert[] {
  const alerts: AdminAlert[] = [];
  const ops = adminOpsSnapshot(samples, orders, coas, users);

  if (ops.behindLevel === 'behind') {
    alerts.push({
      id: 'lab-behind',
      level: 'urgent',
      message: `Lab is behind — ${ops.overdue.length} overdue order${ops.overdue.length === 1 ? '' : 's'}, ${ops.chemistsBehind.length} chemist${ops.chemistsBehind.length === 1 ? '' : 's'} lagging on assigned work.`,
      actionLabel: 'Review staff load',
      actionSection: 'lab',
    });
  } else if (ops.behindLevel === 'watch') {
    alerts.push({
      id: 'lab-watch',
      level: 'warning',
      message: `Watch list — ${ops.overdue.length} overdue, ${ops.unassigned.length} unassigned, ${ops.unpaid.length} unpaid.`,
      actionLabel: 'Open ops board',
      actionSection: 'command',
    });
  }

  if (ops.unpaid.length) {
    alerts.push({
      id: 'unpaid-orders',
      level: 'warning',
      message: `${ops.unpaid.length} unpaid order${ops.unpaid.length === 1 ? '' : 's'} blocking intake / receive.`,
      actionLabel: 'Orders',
      actionSection: 'orders',
    });
  }

  if (ops.urgent.length) {
    alerts.push({
      id: 'urgent-orders',
      level: 'urgent',
      message: `${ops.urgent.length} urgent order${ops.urgent.length === 1 ? '' : 's'} need customer + lab attention.`,
      actionLabel: 'Manage priority',
      actionSection: 'orders',
    });
  }

  if (ops.unassigned.length > 0) {
    alerts.push({
      id: 'unassigned-dispatch',
      level: 'warning',
      message: `${ops.unassigned.length} sample${ops.unassigned.length === 1 ? '' : 's'} still unassigned — dispatch before they age.`,
      actionLabel: 'Open dispatch',
      actionSection: 'dispatch',
    });
  }

  if (ops.clientInfoNeeded > 0) {
    alerts.push({
      id: 'client-info',
      level: 'info',
      message: `${ops.clientInfoNeeded} COA${ops.clientInfoNeeded === 1 ? '' : 's'} waiting on client info.`,
      actionLabel: 'COA registry',
      actionSection: 'coas',
    });
  }

  return alerts;
}

export function workflowPipelineCounts(coas: COA[]) {
  return {
    awaiting_info: coas.filter(c => coaWorkflowStage(c) === 'awaiting_info').length,
    testing_in_progress: coas.filter(c => coaWorkflowStage(c) === 'testing_in_progress').length,
    issued: coas.filter(c => coaWorkflowStage(c) === 'issued').length,
    pending_review: coas.filter(c => coaWorkflowStage(c) === 'pending_review').length,
    verified: coas.filter(c => coaWorkflowStage(c) === 'verified').length,
    published: coas.filter(c => coaWorkflowStage(c) === 'published').length,
  };
}

export function staffRoleCounts(users: UserProfile[]) {
  const counts: Record<string, number> = {};
  for (const u of users) {
    const role = u.role ?? 'client';
    counts[role] = (counts[role] ?? 0) + 1;
  }
  return counts;
}

/** @deprecated Prefer adminOpsSnapshot for the admin bench. Kept for analytics cards. */
export function adminKpis(samples: OrderSample[], orders: Order[], coas: COA[]) {
  const activeOrders = orders.filter(isActiveOrder);
  const queue = buildQueueItems(samples, orders, coas, true);
  const pipeline = workflowPipelineCounts(coas);

  return {
    avgDailyIntake: averageDailyIntake(samples, 30),
    activeOrders: activeOrders.length,
    queueDepth: queue.length,
    coasPublished: pipeline.published,
    coasInPipeline: pipeline.issued + pipeline.awaiting_info + pipeline.testing_in_progress + pipeline.pending_review + pipeline.verified,
    urgentOrders: orders.filter(o => orderLabPriority(o) === 'urgent' && isActiveOrder(o)).length,
  };
}

export function formatAgeHours(hours: number): string {
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${Math.round(hours % 24)}h`;
}

export type { QueueSampleItem };
