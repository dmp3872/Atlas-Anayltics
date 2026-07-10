# Stripe integration seam (deferred)

Day-one payment is **manual**: staff mark orders `paid` / `waived` in Lab Receive or Admin Orders.

## Fields ready for Stripe webhooks

| Column | Use |
|--------|-----|
| `orders.payment_status` | `unpaid` → `paid` (or `refunded`) |
| `orders.paid_at` | Checkout / charge timestamp |
| `orders.paid_by` | Nullable for automated payments; set staff user for manual |
| `orders.payment_note` | Store Stripe `payment_intent` / `checkout.session` id |
| `orders.payment_method` | Already `card` \| `crypto` on insert |

## Suggested future flow

1. OrderWizard creates order with `payment_status: unpaid`, `status: awaiting_sample`.
2. Redirect to Stripe Checkout Session; metadata includes `order_id`.
3. Webhook `checkout.session.completed` → set `payment_status: paid`, `paid_at`, `payment_note: session.id`.
4. Existing queue gate (`orderIsPayable`) then allows receiving desk to accession samples.

No Stripe SDK or secrets are wired in this repo yet.
