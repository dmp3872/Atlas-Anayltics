import { FormEvent, useState } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { AlertCircle, CreditCard, Loader, Lock } from 'lucide-react';
import { getStripePromise } from '../../lib/stripeClient';
import { formatCurrency } from '../../lib/utils';

export interface StripeIntent {
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
}

interface Props {
  createIntent: () => Promise<StripeIntent>;
  onSucceeded: (paymentIntentId: string) => Promise<void>;
  startLabel?: string;
  payLabel?: (amount: number) => string;
  disabled?: boolean;
  note?: string;
}

const defaultPayLabel = (amount: number) => `Pay ${formatCurrency(amount)}`;

export default function StripeCardCheckout({
  createIntent,
  onSucceeded,
  startLabel = 'Continue to secure payment',
  payLabel = defaultPayLabel,
  disabled,
  note,
}: Props) {
  const [intent, setIntent] = useState<StripeIntent | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  async function start() {
    if (starting || disabled) return;
    setStarting(true);
    setError('');
    try {
      setIntent(await createIntent());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start card checkout.');
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="space-y-3">
      {intent ? (
        <Elements
          stripe={getStripePromise()}
          options={{ clientSecret: intent.clientSecret, appearance: { theme: 'stripe' } }}
        >
          <PayForm intent={intent} onSucceeded={onSucceeded} payLabel={payLabel} disabled={disabled} />
        </Elements>
      ) : (
        <>
          {error && <ErrorBox message={error} />}
          <button
            type="button"
            className="btn-primary w-full sm:w-auto gap-2"
            disabled={starting || disabled}
            onClick={() => void start()}
          >
            {starting ? <Loader size={16} className="animate-spin" /> : <CreditCard size={16} />}
            {starting ? 'Preparing secure checkout…' : startLabel}
          </button>
        </>
      )}
      {note && <p className="text-xs text-neutral-500">{note}</p>}
      <p className="text-[11px] text-neutral-500 flex items-center gap-1">
        <Lock size={11} /> Secured by Stripe — card details never touch Atlas servers.
      </p>
    </div>
  );
}

function PayForm({
  intent,
  onSucceeded,
  payLabel,
  disabled,
}: {
  intent: StripeIntent;
  onSucceeded: (paymentIntentId: string) => Promise<void>;
  payLabel: (amount: number) => string;
  disabled?: boolean;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [ready, setReady] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const [chargedRef, setChargedRef] = useState<string | null>(null);
  const [chargedError, setChargedError] = useState('');

  async function pay(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || paying || chargedRef || disabled) return;
    setPaying(true);
    setError('');
    let succeededId: string | null = null;
    try {
      const result = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
        confirmParams: { return_url: window.location.href },
      });
      if (result.error) {
        setError(result.error.message || 'Your card could not be charged.');
        return;
      }
      const pi = result.paymentIntent;
      if (pi?.status === 'succeeded') {
        succeededId = pi.id;
      } else if (pi?.status === 'processing') {
        setChargedRef(pi.id);
        setChargedError('Your payment is still processing. Do not pay again — contact the lab with the payment reference below.');
        return;
      } else {
        setError('Payment was not completed. Please try again.');
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your card could not be charged.');
      return;
    } finally {
      if (!succeededId) setPaying(false);
    }
    if (!succeededId) return;

    try {
      await onSucceeded(succeededId);
    } catch (err) {
      setChargedRef(succeededId);
      setChargedError(
        `Your card WAS charged, but we could not finish processing${
          err instanceof Error && err.message ? ` (${err.message})` : ''
        }. Do not pay again — contact the lab with the payment reference below.`,
      );
    } finally {
      setPaying(false);
    }
  }

  if (chargedRef) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900 space-y-1">
        <p className="font-semibold flex items-start gap-2">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          {chargedError}
        </p>
        <p className="font-mono text-xs break-all">Payment reference: {chargedRef}</p>
      </div>
    );
  }

  return (
    <form onSubmit={e => void pay(e)} className="space-y-3">
      <PaymentElement onReady={() => setReady(true)} />
      {error && <ErrorBox message={error} />}
      <button
        type="submit"
        className="btn-primary w-full sm:w-auto gap-2"
        disabled={!stripe || !elements || !ready || paying || disabled}
      >
        {paying ? <Loader size={16} className="animate-spin" /> : <Lock size={16} />}
        {paying ? 'Processing payment…' : payLabel(intent.amount)}
      </button>
    </form>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{message}</p>
  );
}
