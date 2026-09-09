import type { Order, OrderStatus } from './types';
import { resolveEtaAt } from './etaHeat';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STEPS,
  RUSH_TAT_DAYS,
  STANDARD_TAT_DAYS,
  formatDate,
  getStatusStep,
} from './utils';

export type AutoreplyKind = 'eta' | 'stages' | 'faq' | 'handoff';

export interface ChatFaq {
  id: string;
  label: string;
  /** Patterns matched against the user message (case-insensitive). */
  patterns: RegExp[];
  answer: string;
}

export interface AutoreplyResult {
  kind: AutoreplyKind;
  body: string;
  /** When true, still deliver the client message to the lab thread. */
  notifyLab: boolean;
}

export const LIVE_CHAT_FAQS: ChatFaq[] = [
  {
    id: 'turnaround',
    label: 'How long does testing take?',
    patterns: [
      /how long/i,
      /turnaround/i,
      /\bTAT\b/,
      /how many days/i,
      /when (will|do).*(ready|done|complete|finish)/i,
      /estimated?\s*(ready|time|eta)/i,
      /\beta\b/i,
    ],
    answer: '', // filled dynamically when an order is selected
  },
  {
    id: 'stages',
    label: 'What stage is my order in?',
    patterns: [
      /what stage/i,
      /order status/i,
      /where is my (order|sample)/i,
      /status of/i,
      /pipeline/i,
      /progress/i,
    ],
    answer: '',
  },
  {
    id: 'shipping',
    label: 'How do I ship samples?',
    patterns: [
      /ship/i,
      /shipping/i,
      /label/i,
      /fedex|ups/i,
      /drop.?off/i,
      /rfid|preboard/i,
    ],
    answer:
      'After checkout, open Your Orders for the shipping checklist. Preboarded (RFID) accounts get UPS pickup; everyone else prints the prepaid label, writes the order number on the box, and drops off at FedEx/UPS. Keep tracking until we mark the order received.',
  },
  {
    id: 'add-panels',
    label: 'Can I add panels after submitting?',
    patterns: [
      /add (a )?panel/i,
      /extra test/i,
      /change (my )?order/i,
      /modify order/i,
    ],
    answer:
      'If your samples have not started analysis yet, we can often add panels. Reply here with the order number and panels you need — a chemist will confirm before testing begins.',
  },
  {
    id: 'share-coa',
    label: 'How do I share my COA?',
    patterns: [
      /share.*(coa|certificate)/i,
      /verify link/i,
      /permanent url/i,
      /qr code/i,
    ],
    answer:
      'Each public COA has a permanent page at /coa/… and a verify autofill link at /verify?id=… (recipients click Verify themselves). You can also download a PDF from Your COAs or the certificate page.',
  },
  {
    id: 'fail',
    label: 'What if a sample fails?',
    patterns: [
      /\bfail(s|ed|ure)?\b/i,
      /did not pass/i,
      /out of spec/i,
    ],
    answer:
      'Failing results are reported on the COA with panel-level detail. We do not revise or retract failing results. Message the lab here if you need help reading a specific panel.',
  },
  {
    id: 'hours',
    label: 'Lab hours / contact',
    patterns: [
      /hours/i,
      /open/i,
      /phone/i,
      /email/i,
      /contact/i,
    ],
    answer:
      'Reach us at labs@atlasanalytics.io or (512) 555-0199, Mon–Fri 9am–5pm CST. For order-specific questions, messaging here is fastest — include your order number.',
  },
  {
    id: 'rush',
    label: 'Rush processing',
    patterns: [
      /\brush\b/i,
      /expedite/i,
      /faster/i,
      /priority/i,
    ],
    answer:
      `Rush processing targets about ${RUSH_TAT_DAYS} business days from sample receipt (vs ~${STANDARD_TAT_DAYS} standard). Enable rush when placing the order, or ask here and we will confirm if your samples can still be prioritized.`,
  },
];

function stageLines(order: Order): string {
  const current = getStatusStep(order.status);
  return ORDER_STATUS_STEPS.map((step, i) => {
    const label = ORDER_STATUS_LABELS[step as OrderStatus];
    if (order.status === 'cancelled') return `○ ${label}`;
    if (i < current) return `✓ ${label}`;
    if (i === current || (order.status === 'received' && i === 0)) return `→ ${label} (current)`;
    return `○ ${label}`;
  }).join('\n');
}

function etaAnswer(order: Order): string {
  const eta = resolveEtaAt(order);
  const statusLabel = ORDER_STATUS_LABELS[order.status];
  const rush = order.rush_processing ? 'Rush' : 'Standard';
  const tat = order.rush_processing ? RUSH_TAT_DAYS : STANDARD_TAT_DAYS;

  if (order.status === 'complete') {
    return `Order ${order.order_number} is complete. Your certificates should be available under Your COAs.`;
  }
  if (order.status === 'cancelled') {
    return `Order ${order.order_number} is cancelled. Message us if you need to reopen or place a new order.`;
  }

  const etaLine = eta
    ? `Estimated ready: ${formatDate(eta)}.`
    : `No firm ready date yet. Typical ${rush.toLowerCase()} turnaround is ~${tat} business days after we receive the sample.`;

  return [
    `Order ${order.order_number} — ${statusLabel}.`,
    etaLine,
    '',
    'Pipeline:',
    stageLines(order),
  ].join('\n');
}

function stagesAnswer(order: Order): string {
  const statusLabel = ORDER_STATUS_LABELS[order.status];
  return [
    `Order ${order.order_number} is currently: ${statusLabel}.`,
    '',
    'Stages:',
    stageLines(order),
  ].join('\n');
}

/** Match a user message to an autoresponse. */
export function matchAutoreply(
  text: string,
  order: Order | null,
): AutoreplyResult | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const etaFaq = LIVE_CHAT_FAQS.find(f => f.id === 'turnaround')!;
  const stagesFaq = LIVE_CHAT_FAQS.find(f => f.id === 'stages')!;

  if (order && etaFaq.patterns.some(p => p.test(trimmed))) {
    return { kind: 'eta', body: etaAnswer(order), notifyLab: false };
  }
  if (order && stagesFaq.patterns.some(p => p.test(trimmed))) {
    return { kind: 'stages', body: stagesAnswer(order), notifyLab: false };
  }

  // ETA/stages without an order selected
  if (!order && etaFaq.patterns.some(p => p.test(trimmed))) {
    return {
      kind: 'faq',
      body: `Standard turnaround is ~${STANDARD_TAT_DAYS} business days from sample receipt (${RUSH_TAT_DAYS} with rush). Select an order above and ask again for that order’s ETA and live stage pipeline.`,
      notifyLab: false,
    };
  }
  if (!order && stagesFaq.patterns.some(p => p.test(trimmed))) {
    return {
      kind: 'stages',
      body: [
        'Orders move through these stages:',
        ...ORDER_STATUS_STEPS.map((step, i) => `${i + 1}. ${ORDER_STATUS_LABELS[step as OrderStatus]}`),
        '',
        'Select an order to see where yours is right now.',
      ].join('\n'),
      notifyLab: false,
    };
  }

  for (const faq of LIVE_CHAT_FAQS) {
    if (faq.id === 'turnaround' || faq.id === 'stages') continue;
    if (faq.patterns.some(p => p.test(trimmed))) {
      return { kind: 'faq', body: faq.answer, notifyLab: false };
    }
  }

  return null;
}

export function handoffReply(order: Order | null): AutoreplyResult {
  return {
    kind: 'handoff',
    body: order
      ? `Got it — your message is on order ${order.order_number}. The lab team will reply in this thread.`
      : 'Got it — select an order so we can route this to the right lab thread, or ask an FAQ below.',
    notifyLab: !!order,
  };
}

/** FAQ chips shown in the widget (static labels; dynamic ones need an order). */
export function faqChipsForOrder(order: Order | null): { id: string; label: string; prompt: string }[] {
  return [
    {
      id: 'turnaround',
      label: order ? 'ETA for this order' : 'Typical turnaround',
      prompt: order
        ? `What is the estimated turnaround for order ${order.order_number}?`
        : 'How long does testing take?',
    },
    {
      id: 'stages',
      label: order ? 'Show order stages' : 'Order stages',
      prompt: order
        ? `What stage is order ${order.order_number} in?`
        : 'What are the order stages?',
    },
    ...LIVE_CHAT_FAQS.filter(f => f.id !== 'turnaround' && f.id !== 'stages').map(f => ({
      id: f.id,
      label: f.label,
      prompt: f.label,
    })),
  ];
}
