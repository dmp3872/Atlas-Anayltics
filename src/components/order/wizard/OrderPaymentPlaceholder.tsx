import { useState } from 'react';
import { Check, CreditCard, Lock, Wallet } from 'lucide-react';
import { formatCurrency } from '../../../lib/utils';

export type SimulatedPaymentMethod = 'card' | 'crypto';

interface Props {
  amount: number;
  paid: boolean;
  method: SimulatedPaymentMethod;
  onMethodChange: (method: SimulatedPaymentMethod) => void;
  onPaidChange: (paid: boolean) => void;
  /** Card only: after a successful simulated charge, also submit the order. */
  onCardPayAndSubmit?: () => Promise<void>;
}

const CRYPTO_ASSETS = ['USDC', 'USDT', 'BTC', 'ETH'] as const;

/** Simulated card / crypto payment until live processors are connected. */
export default function OrderPaymentPlaceholder({
  amount,
  paid,
  method,
  onMethodChange,
  onPaidChange,
  onCardPayAndSubmit,
}: Props) {
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [asset, setAsset] = useState<(typeof CRYPTO_ASSETS)[number]>('USDC');
  const [txRef, setTxRef] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  function selectMethod(next: SimulatedPaymentMethod) {
    if (paid) return;
    setError('');
    onMethodChange(next);
  }

  async function simulateCardPay() {
    setError('');
    if (!name.trim()) {
      setError('Enter the name on the card.');
      return;
    }
    if (number.replace(/\s/g, '').length < 12) {
      setError('Enter a card number (any test digits work for simulation).');
      return;
    }
    if (!/^\d{2}\s*\/\s*\d{2}$/.test(expiry.trim())) {
      setError('Enter expiry as MM/YY.');
      return;
    }
    if (cvc.trim().length < 3) {
      setError('Enter a CVC.');
      return;
    }

    setProcessing(true);
    try {
      await new Promise(r => setTimeout(r, 700));
      if (onCardPayAndSubmit) {
        await onCardPayAndSubmit();
      } else {
        onPaidChange(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not pay and submit.');
    } finally {
      setProcessing(false);
    }
  }

  async function simulateCryptoPay() {
    setError('');
    if (!txRef.trim() || txRef.trim().length < 6) {
      setError('Enter a wallet / transaction reference (any text works for simulation).');
      return;
    }

    setProcessing(true);
    await new Promise(r => setTimeout(r, 700));
    setProcessing(false);
    onPaidChange(true);
  }

  if (paid) {
    return (
      <div className="card border-emerald-300 bg-emerald-50/60 p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white">
            <Check size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-black">Payment authorized</p>
            <p className="text-sm text-neutral-600 mt-0.5">
              Simulated {method === 'crypto' ? `${asset} crypto` : 'card'} payment of{' '}
              {formatCurrency(amount)} succeeded. You can submit this order.
            </p>
            <p className="text-[11px] text-neutral-500 mt-2 flex items-center gap-1">
              <Lock size={11} />
              {method === 'crypto' ? 'Crypto placeholder' : 'Stripe placeholder'} — not a live transfer
            </p>
            <button
              type="button"
              className="btn-ghost text-xs mt-2 px-0"
              onClick={() => onPaidChange(false)}
            >
              Reset simulated payment
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card border-brand-300 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-black flex items-center gap-2">
            {method === 'crypto' ? (
              <Wallet size={18} className="text-brand-700" />
            ) : (
              <CreditCard size={18} className="text-brand-700" />
            )}
            Payment
          </h3>
          <p className="text-sm text-neutral-500 mt-1">
            Pay {formatCurrency(amount)} to unlock order submission. Live Stripe / crypto checkout comes later.
          </p>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-1 rounded">
          Simulation
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Payment method">
        <button
          type="button"
          role="tab"
          aria-selected={method === 'card'}
          onClick={() => selectMethod('card')}
          className={`rounded-xl border-2 px-3 py-3 text-left transition-colors ${
            method === 'card'
              ? 'border-brand-500 bg-brand-50'
              : 'border-atlas-border bg-white hover:border-brand-300'
          }`}
        >
          <p className="text-sm font-bold text-black flex items-center gap-1.5">
            <CreditCard size={15} /> Card
          </p>
          <p className="text-xs text-neutral-500 mt-0.5">Stripe placeholder</p>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={method === 'crypto'}
          onClick={() => selectMethod('crypto')}
          className={`rounded-xl border-2 px-3 py-3 text-left transition-colors ${
            method === 'crypto'
              ? 'border-brand-500 bg-brand-50'
              : 'border-atlas-border bg-white hover:border-brand-300'
          }`}
        >
          <p className="text-sm font-bold text-black flex items-center gap-1.5">
            <Wallet size={15} /> Crypto
          </p>
          <p className="text-xs text-neutral-500 mt-0.5">USDC, USDT, BTC, ETH</p>
        </button>
      </div>

      {method === 'card' ? (
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="sim-card-name">Name on card</label>
            <input
              id="sim-card-name"
              className="input-field"
              autoComplete="cc-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Jordan Atlas"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="sim-card-number">Card number</label>
            <input
              id="sim-card-number"
              className="input-field font-mono"
              autoComplete="cc-number"
              inputMode="numeric"
              value={number}
              onChange={e => setNumber(e.target.value.replace(/[^\d\s]/g, '').slice(0, 19))}
              placeholder="4242 4242 4242 4242"
            />
          </div>
          <div>
            <label className="label" htmlFor="sim-card-exp">Expiry</label>
            <input
              id="sim-card-exp"
              className="input-field font-mono"
              autoComplete="cc-exp"
              value={expiry}
              onChange={e => setExpiry(e.target.value.slice(0, 7))}
              placeholder="12/30"
            />
          </div>
          <div>
            <label className="label" htmlFor="sim-card-cvc">CVC</label>
            <input
              id="sim-card-cvc"
              className="input-field font-mono"
              autoComplete="cc-csc"
              inputMode="numeric"
              value={cvc}
              onChange={e => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="123"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="sim-crypto-asset">Asset</label>
            <select
              id="sim-crypto-asset"
              className="input-field"
              value={asset}
              onChange={e => setAsset(e.target.value as (typeof CRYPTO_ASSETS)[number])}
            >
              {CRYPTO_ASSETS.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div className="rounded-lg border border-dashed border-atlas-border bg-neutral-50 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Simulated deposit address
            </p>
            <p className="font-mono text-sm text-black mt-1 break-all">
              atlas-sim-{asset.toLowerCase()}-0xORDERDEMO
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              Send exactly {formatCurrency(amount)} equivalent in {asset}. No on-chain transfer in this demo.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="sim-crypto-tx">Wallet or transaction reference</label>
            <input
              id="sim-crypto-tx"
              className="input-field font-mono"
              value={txRef}
              onChange={e => setTxRef(e.target.value)}
              placeholder="0x… or wallet label"
            />
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        type="button"
        className="btn-primary w-full sm:w-auto gap-2"
        disabled={processing || amount <= 0}
        onClick={() => void (method === 'crypto' ? simulateCryptoPay() : simulateCardPay())}
      >
        {processing
          ? method === 'card'
            ? 'Paying & submitting…'
            : 'Authorizing…'
          : method === 'crypto'
            ? `Simulate ${asset} payment · ${formatCurrency(amount)}`
            : `Pay & submit order · ${formatCurrency(amount)}`}
      </button>
      <p className="text-[11px] text-neutral-500 flex items-center gap-1">
        <Lock size={11} />
        {method === 'card'
          ? 'Simulated card charge — submits the laboratory order automatically.'
          : 'No real transfer — simulate crypto payment, then submit below.'}
      </p>
    </div>
  );
}
