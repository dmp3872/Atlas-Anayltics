import { COA, Order, OrderSample, UserProfile } from './types';
import { coaWorkflowStage } from './coaWorkflow';
import { buildQueueItems, normalizeLabPriority } from './labQueue';
import { averageDailyIntake } from './labAnalytics';

export interface AdminAlert {
  id: string;
  level: 'urgent' | 'warning' | 'info';
  message: string;
  actionLabel?: string;
  actionSection?: string;
}

export function computeAdminAlerts(
  orders: Order[],
  samples: OrderSample[],
  coas: COA[],
): AdminAlert[] {
  const alerts: AdminAlert[] = [];
  const normalized = orders.map(o => ({ ...o, lab_priority: normalizeLabPriority(o.lab_priority) }));
  const urgent = normalized.filter(o => o.lab_priority === 'urgent' && o.status !== 'complete' && o.status !== 'cancelled');
  const queue = buildQueueItems(samples, normalized, coas, true);
  const issued = coas.filter(c => coaWorkflowStage(c) === 'issued');
  const awaiting = coas.filter(c => coaWorkflowStage(c) === 'awaiting_info');
  const rush = normalized.filter(o => o.rush_processing && o.status !== 'complete');

  if (urgent.length) {
    alerts.push({
      id: 'urgent-orders',
      level: 'urgent',
      message: `${urgent.length} urgent order${urgent.length === 1 ? '' : 's'} require immediate chemist attention.`,
      actionLabel: 'Manage orders',
      actionSection: 'orders',
    });
  }
  if (queue.length > 5) {
    alerts.push({
      id: 'queue-backlog',
      level: 'warning',
      message: `${queue.length} samples in the testing queue — consider assigning priority or staffing.`,
      actionLabel: 'Open lab queue',
      actionSection: 'orders',
    });
  }
  if (issued.length + awaiting.length > 0) {
    alerts.push({
      id: 'coa-pipeline',
      level: 'info',
      message: `${issued.length} COA${issued.length === 1 ? '' : 's'} issued, ${awaiting.length} awaiting client info — review workflow.`,
      actionLabel: 'COA registry',
      actionSection: 'coas',
    });
  }
  if (rush.length) {
    alerts.push({
      id: 'rush-orders',
      level: 'warning',
      message: `${rush.length} rush order${rush.length === 1 ? '' : 's'} in the system.`,
      actionLabel: 'View orders',
      actionSection: 'orders',
    });
  }
  return alerts;
}

export function workflowPipelineCounts(coas: COA[]) {
  return {
    issued: coas.filter(c => coaWorkflowStage(c) === 'issued').length,
    awaiting_info: coas.filter(c => coaWorkflowStage(c) === 'awaiting_info').length,
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

export function adminKpis(samples: OrderSample[], orders: Order[], coas: COA[]) {
  const normalized = orders.map(o => ({ ...o, lab_priority: normalizeLabPriority(o.lab_priority) }));
  const activeOrders = orders.filter(o => o.status !== 'complete' && o.status !== 'cancelled');
  const queue = buildQueueItems(samples, normalized, coas, true);
  const pipeline = workflowPipelineCounts(coas);

  return {
    avgDailyIntake: averageDailyIntake(samples, 30),
    activeOrders: activeOrders.length,
    queueDepth: queue.length,
    coasPublished: pipeline.published,
    coasInPipeline: pipeline.issued + pipeline.awaiting_info + pipeline.verified,
    urgentOrders: normalized.filter(o => o.lab_priority === 'urgent' && o.status !== 'complete').length,
  };
}
