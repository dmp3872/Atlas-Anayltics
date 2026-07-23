import { OrderSample, COA, Order, LabPriority, SampleStatus } from './types';
import {
  ATLAS_PRO_PANEL, FULL_QC_PANEL, FENTANYL_OPTION_LABEL,
  INDIVIDUAL_TESTS, TestMode,
} from './orderCatalog';
import { parseSampleMetadata, orderSampleIncludesFentanyl, matchCoaForSample, hasIssuedCoaForSample } from './coaPanels';
import { orderIsPayable } from './utils';

export type { LabPriority };

export const LAB_PRIORITIES: LabPriority[] = ['normal', 'high', 'urgent'];

export const LAB_PRIORITY_LABELS: Record<LabPriority, string> = {
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

export const LAB_PRIORITY_RANK: Record<LabPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
};

export const LAB_PRIORITY_STYLES: Record<LabPriority, {
  border: string;
  bg: string;
  badge: string;
  dot: string;
}> = {
  urgent: {
    border: 'border-red-400',
    bg: 'bg-red-50/80',
    badge: 'bg-red-100 text-red-800 border-red-200',
    dot: 'bg-red-500',
  },
  high: {
    border: 'border-amber-400',
    bg: 'bg-amber-50/70',
    badge: 'bg-amber-100 text-amber-900 border-amber-200',
    dot: 'bg-amber-500',
  },
  normal: {
    border: 'border-atlas-border',
    bg: 'bg-white',
    badge: 'bg-neutral-100 text-neutral-600 border-neutral-200',
    dot: 'bg-neutral-300',
  },
};

export function normalizeLabPriority(value: unknown): LabPriority {
  if (value === 'urgent' || value === 'high' || value === 'normal') return value;
  return 'normal';
}

export function orderLabPriority(order: Pick<Order, 'lab_priority' | 'rush_processing'>): LabPriority {
  return normalizeLabPriority(order.lab_priority);
}

export function prioritySortScore(order: Pick<Order, 'lab_priority' | 'rush_processing'>): number {
  const base = LAB_PRIORITY_RANK[orderLabPriority(order)];
  return order.rush_processing ? base - 0.25 : base;
}

/** Sample-level priority override wins over the parent order's priority. */
export function effectiveLabPriority(
  sample: Pick<OrderSample, 'lab_priority'>,
  order: Pick<Order, 'lab_priority' | 'rush_processing'>,
): LabPriority {
  if (sample.lab_priority === 'urgent' || sample.lab_priority === 'high' || sample.lab_priority === 'normal') {
    return sample.lab_priority;
  }
  return orderLabPriority(order);
}

export function effectivePrioritySortScore(
  sample: Pick<OrderSample, 'lab_priority'>,
  order: Pick<Order, 'lab_priority' | 'rush_processing'>,
): number {
  const base = LAB_PRIORITY_RANK[effectiveLabPriority(sample, order)];
  return order.rush_processing ? base - 0.25 : base;
}

/** Resolve ordered test names for a sample from wizard metadata. */
export function testsForSample(sample: OrderSample): string[] {
  const meta = sample.metadata as Record<string, unknown> | null;
  if (!meta) return ['Full QC Panel'];

  if (typeof meta.tests_label === 'string' && meta.tests_label.trim()) {
    const mode = meta.test_mode as TestMode | undefined;
    if (mode === 'atlas_pro' || mode === 'full_qc') {
      const names = testsFromMode(mode, meta);
      if (names.length) return names;
    }
  }

  const mode = meta.test_mode as TestMode | undefined;
  if (mode) return testsFromMode(mode, meta);

  return meta.tests_label ? [String(meta.tests_label)] : ['Tests not specified'];
}

function testsFromMode(mode: TestMode, meta: Record<string, unknown>): string[] {
  if (mode === 'atlas_pro') {
    const names = ATLAS_PRO_PANEL.bundledTestIds.map(id =>
      INDIVIDUAL_TESTS.find(t => t.id === id)?.name ?? id,
    );
    if (orderSampleIncludesFentanyl(meta)) names.push(FENTANYL_OPTION_LABEL);
    names.push('Conformity Testing');
    return names;
  }
  if (mode === 'full_qc') {
    return FULL_QC_PANEL.bundledTestIds.map(id =>
      INDIVIDUAL_TESTS.find(t => t.id === id)?.name ?? id,
    );
  }
  const ids = Array.isArray(meta.individual_tests) ? meta.individual_tests as string[] : [];
  return ids.map(id => INDIVIDUAL_TESTS.find(t => t.id === id)?.name ?? id);
}

export function testsLabelForSample(sample: OrderSample): string {
  const meta = parseSampleMetadata(sample.metadata);
  if (meta.tests_label?.trim()) return meta.tests_label.trim();
  return testsForSample(sample).join(', ');
}

/**
 * True when a sample's metadata actually specifies what to test — a package
 * mode (atlas_pro/full_qc), an individual mode with at least one test picked,
 * or a non-empty tests_label that isn't the "Tests not specified" placeholder.
 * Used to block sample creation and COA issuance without tests on record.
 */
export function sampleHasTestsSpecified(sample: Pick<OrderSample, 'metadata'>): boolean {
  const meta = sample.metadata as Record<string, unknown> | null;
  if (!meta) return false;

  const mode = meta.test_mode as TestMode | undefined;
  if (mode === 'atlas_pro' || mode === 'full_qc') return true;
  if (mode === 'individual') {
    const ids = Array.isArray(meta.individual_tests) ? meta.individual_tests : [];
    if (ids.length > 0) return true;
  }

  const testsLabel = typeof meta.tests_label === 'string' ? meta.tests_label.trim() : '';
  if (testsLabel && testsLabel !== 'Tests not specified') return true;

  return false;
}

export interface QueueSampleItem {
  sample: OrderSample;
  order: Order;
  tests: string[];
  testsLabel: string;
  priority: LabPriority;
  priorityScore: number;
  hasCoa: boolean;
  ageHours: number;
  assigned_to?: string | null;
  assigned_at?: string | null;
  overdue: boolean;
  dueAt?: string | null;
}

/** Samples eligible for the chemist testing queue: paid + physically received. */
export function sampleReadyForTesting(sample: OrderSample, order: Order): boolean {
  if (!orderIsPayable(order.payment_status)) return false;
  if (sample.status === 'awaiting_sample') return false;
  return true;
}

export function buildQueueItems(
  samples: OrderSample[],
  orders: Order[],
  coas: COA[],
  pendingOnly = true,
): QueueSampleItem[] {
  const orderMap = new Map(orders.map(o => [o.id, o]));

  const items: QueueSampleItem[] = [];

  for (const sample of samples) {
    const order = orderMap.get(sample.order_id);
    if (!order) continue;

    // Gate: unpaid / in-transit samples never appear in the testing queue.
    if (!sampleReadyForTesting(sample, order)) continue;

    // Queue visibility uses the strict sample_id-only check so fuzzy
    // batch/name matches never hide a sample that's still awaiting its COA.
    const issued = hasIssuedCoaForSample(sample, coas);
    if (pendingOnly && (issued || sample.status === 'complete')) continue;

    const hasCoa = issued || !!matchCoaForSample(sample, coas);

    const ageMs = Date.now() - new Date(sample.created_at).getTime();
    const dueAt = order.due_at ?? null;
    const overdue = !!dueAt && new Date(dueAt).getTime() < Date.now() && !issued && sample.status !== 'complete';

    items.push({
      sample,
      order,
      tests: testsForSample(sample),
      testsLabel: testsLabelForSample(sample),
      priority: effectiveLabPriority(sample, order),
      priorityScore: effectivePrioritySortScore(sample, order),
      hasCoa,
      ageHours: Math.max(0, ageMs / (1000 * 60 * 60)),
      assigned_to: sample.assigned_to,
      assigned_at: sample.assigned_at,
      overdue,
      dueAt,
    });
  }

  return items.sort((a, b) => {
    if (a.priorityScore !== b.priorityScore) return a.priorityScore - b.priorityScore;
    return new Date(a.sample.created_at).getTime() - new Date(b.sample.created_at).getTime();
  });
}

export interface QueueFilters {
  priority?: LabPriority | 'all';
  company?: string;
  assignedTo?: string | 'unassigned' | 'all';
  status?: SampleStatus | 'all';
  search?: string;
}

/** Apply admin/chemist queue filters (priority, company, assignment, status, free-text search). */
export function filterQueueItems(items: QueueSampleItem[], filters: QueueFilters): QueueSampleItem[] {
  const company = filters.company?.trim().toLowerCase();
  const search = filters.search?.trim().toLowerCase();

  return items.filter(item => {
    if (filters.priority && filters.priority !== 'all' && item.priority !== filters.priority) return false;

    if (company && !item.order.company_name?.toLowerCase().includes(company)) return false;

    if (filters.assignedTo && filters.assignedTo !== 'all') {
      if (filters.assignedTo === 'unassigned') {
        if (item.assigned_to) return false;
      } else if (item.assigned_to !== filters.assignedTo) {
        return false;
      }
    }

    if (filters.status && filters.status !== 'all' && item.sample.status !== filters.status) return false;

    if (search) {
      const haystack = [
        item.sample.sample_name,
        item.sample.display_name,
        item.order.order_number,
        item.order.company_name,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    return true;
  });
}
