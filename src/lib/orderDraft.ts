import { WizardSample } from './orderCatalog';

const DRAFT_PREFIX = 'atlas_order_draft_';

export interface OrderDraft {
  step: number;
  samples: WizardSample[];
  notes: string;
  promoCode: string;
  shippingCarrier: string;
  shippingTracking: string;
  companyName: string;
  cardholderName: string;
  paymentAuthorized: boolean;
  updatedAt: string;
}

export function loadOrderDraft(userId: string): OrderDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + userId);
    if (!raw) return null;
    return JSON.parse(raw) as OrderDraft;
  } catch {
    return null;
  }
}

export function saveOrderDraft(userId: string, draft: Omit<OrderDraft, 'updatedAt'>) {
  const payload: OrderDraft = { ...draft, updatedAt: new Date().toISOString() };
  localStorage.setItem(DRAFT_PREFIX + userId, JSON.stringify(payload));
}

export function clearOrderDraft(userId: string) {
  localStorage.removeItem(DRAFT_PREFIX + userId);
}

export function draftSummary(draft: OrderDraft): string {
  const names = draft.samples.map(s => s.sample_name || 'Untitled').filter(Boolean);
  const label = names.length ? names.slice(0, 2).join(', ') : 'Draft order';
  return `${label} · Step ${draft.step}/3`;
}
