import { OrderStatus, PaymentStatus, SampleStatus } from './types';

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(dateString));
}

export function formatDateTime(dateString: string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(dateString));
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  received: 'Order confirmed',
  awaiting_sample: 'Awaiting sample',
  processing: 'Sample received',
  analyzing: 'In testing',
  in_review: 'In review',
  complete: 'Complete',
  cancelled: 'Cancelled',
};

export const SAMPLE_STATUS_LABELS: Record<SampleStatus, string> = {
  awaiting_sample: 'Awaiting sample',
  received: 'Received',
  analyzing: 'Analyzing',
  in_review: 'In Review',
  complete: 'Complete',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid',
  paid: 'Paid',
  waived: 'Waived',
  refunded: 'Refunded',
};

/** Client-visible pipeline (excludes cancelled). */
export const ORDER_STATUS_STEPS: OrderStatus[] = [
  'awaiting_sample',
  'processing',
  'analyzing',
  'in_review',
  'complete',
];

/** Standard TAT days from physical receipt → due_at. */
export const STANDARD_TAT_DAYS = 7;
export const RUSH_TAT_DAYS = 3;

export function getStatusStep(status: OrderStatus): number {
  if (status === 'received') return 0;
  const idx = ORDER_STATUS_STEPS.indexOf(status);
  return idx >= 0 ? idx : 0;
}

export function computeDueAt(from: Date, rush: boolean): string {
  const days = rush ? RUSH_TAT_DAYS : STANDARD_TAT_DAYS;
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function normalizePaymentStatus(value: unknown): PaymentStatus {
  if (value === 'paid' || value === 'waived' || value === 'refunded' || value === 'unpaid') return value;
  return 'unpaid';
}

export function orderIsPayable(status: PaymentStatus | undefined | null): boolean {
  const p = normalizePaymentStatus(status);
  return p === 'paid' || p === 'waived';
}

export function generateOrderNumber(): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `ATL-${dateStr}-${rand}`;
}

/** Order number for lab-initiated intake (staff adding a sample directly). */
export function generateLabOrderNumber(): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `LAB-${dateStr}-${rand}`;
}

export function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0').toUpperCase();
}

export const BASE_PRICE_PER_SAMPLE = 149;
export const BLEND_SURCHARGE_PER_COMPOUND = 50;
export const CONFORMITY_VIAL_PRICE = 50;
export const RUSH_FEE_PER_SAMPLE = 200;
export const FIRST_ORDER_DISCOUNT = 0.5;

export const VOLUME_DISCOUNTS = [
  { min: 1, max: 4, discount: 0 },
  { min: 5, max: 9, discount: 0.05 },
  { min: 10, max: 19, discount: 0.10 },
  { min: 20, max: 49, discount: 0.15 },
  { min: 50, max: Infinity, discount: 0.20 },
];

export function getVolumeDiscount(sampleCount: number): number {
  const tier = VOLUME_DISCOUNTS.find(
    (t) => sampleCount >= t.min && sampleCount <= t.max
  );
  return tier?.discount ?? 0;
}
