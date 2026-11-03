import {
  HttpError,
  handlePreflight,
  header,
  json,
  readBody,
  requireStripe,
  requireUser,
  sendError,
  type ApiReq,
  type ApiRes,
} from './lib/stripeServer.js';

type Body = {
  orderId?: unknown;
  paymentIntentId?: unknown;
};

export default async function handler(req: ApiReq, res: ApiRes) {
  if (handlePreflight(req, res)) return;

  try {
    const stripe = requireStripe();
    const { user, userClient, admin } = await requireUser(header(req, 'authorization'));
    const db = admin ?? userClient;
    const body = readBody<Body>(req);
    const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';
    const paymentIntentId = typeof body.paymentIntentId === 'string' ? body.paymentIntentId.trim() : '';
    if (!orderId || !paymentIntentId) {
      throw new HttpError(400, 'orderId and paymentIntentId are required.');
    }

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.status !== 'succeeded') throw new HttpError(400, 'Card payment has not completed.');
    if (pi.metadata?.purpose !== 'order' || pi.metadata?.user_id !== user.id) {
      throw new HttpError(400, 'This payment does not belong to your order.');
    }

    const { data: order, error: orderErr } = await db
      .from('orders')
      .select('id, user_id, total, payment_status')
      .eq('id', orderId)
      .maybeSingle();
    if (orderErr) throw new Error(orderErr.message);
    if (!order || order.user_id !== user.id) throw new HttpError(404, 'Order not found.');
    if (pi.amount_received !== Math.round(Number(order.total) * 100)) {
      throw new HttpError(400, 'Payment amount does not match this order.');
    }

    const { data: reused, error: reuseErr } = await db
      .from('orders')
      .select('id')
      .neq('id', orderId)
      .ilike('payment_note', `%${pi.id}%`)
      .limit(1);
    if (reuseErr) throw new Error(reuseErr.message);
    if (reused && reused.length > 0) {
      throw new HttpError(409, 'This payment was already applied to another order.');
    }

    const update: Record<string, unknown> = {
      payment_status: 'paid',
      paid_at: new Date().toISOString(),
      payment_method: 'card',
      payment_note: `Stripe card payment · ${pi.id}`,
    };
    const applyUpdate = () => db.from('orders').update(update).eq('id', orderId).select('id');
    let { data: updated, error: updateErr } = await applyUpdate();
    if (updateErr && /payment_method/i.test(updateErr.message)) {
      delete update.payment_method;
      ({ data: updated, error: updateErr } = await applyUpdate());
    }
    if (updateErr) throw new Error(updateErr.message);
    // Without a service-role key, RLS can silently skip the row.
    if (!updated || updated.length === 0) {
      throw new HttpError(500, 'Payment succeeded but the order could not be marked paid. Contact support.');
    }

    return json(res, 200, { ok: true, payment_status: 'paid' });
  } catch (err) {
    return sendError(res, err, 'Could not confirm card payment.');
  }
}
