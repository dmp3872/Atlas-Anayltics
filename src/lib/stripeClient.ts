import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { supabase } from './supabase';
import type { WizardSample } from './orderCatalog';

const publishableKey = (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined)?.trim() || '';

export const stripeEnabled = publishableKey.length > 0;

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripePromise(): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = stripeEnabled ? loadStripe(publishableKey) : Promise.resolve(null);
  }
  return stripePromise;
}

export type CreatePaymentIntentBody =
  | { purpose: 'order'; samples: WizardSample[]; companyId: string; promoCode?: string }
  | { purpose: 'branded_coa'; sourceCoaId: string; companyId: string };

export interface PaymentIntentResult {
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
}

async function postPaymentApi<T>(path: string, body: unknown): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Sign in to continue to payment.');

  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Could not reach the payment server. Check your connection and try again.');
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Card checkout is unavailable right now. Please try again later.');
  }
  const payload = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    const apiError = typeof payload.error === 'string' ? payload.error.trim() : '';
    throw new Error(apiError || `Payment request failed (${res.status}).`);
  }
  return payload as T;
}

export async function createPaymentIntent(body: CreatePaymentIntentBody): Promise<PaymentIntentResult> {
  const payload = await postPaymentApi<Partial<PaymentIntentResult>>('/api/create-payment-intent', body);
  if (!payload.clientSecret || !payload.paymentIntentId || typeof payload.amount !== 'number') {
    throw new Error('Payment server returned an incomplete response.');
  }
  return {
    clientSecret: payload.clientSecret,
    paymentIntentId: payload.paymentIntentId,
    amount: payload.amount,
    currency: payload.currency || 'usd',
  };
}

export async function confirmOrderPayment(
  orderId: string,
  paymentIntentId: string,
): Promise<{ ok: true; payment_status: 'paid' }> {
  return postPaymentApi('/api/confirm-order-payment', { orderId, paymentIntentId });
}
