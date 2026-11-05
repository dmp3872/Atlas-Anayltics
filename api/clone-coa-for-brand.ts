import { BRANDED_COA_IS_FREE, cloneCoaForBrandServer, verifyBrandedCoaPayment } from './lib/cloneCoaForBrandServer.js';
import {
  HttpError,
  STRIPE_NOT_CONFIGURED,
  getStripe,
  handlePreflight,
  header,
  isKnownApiError,
  json,
  readBody,
  requireUser,
  sendError,
  supabaseEnv,
  type ApiReq,
  type ApiRes,
} from './lib/stripeServer.js';

const NOT_CONFIGURED = 'Branded COA checkout is not configured on the server (missing Supabase keys).';

type Body = {
  sourceCoaId?: unknown;
  companyId?: unknown;
  paymentMethod?: unknown;
  paymentIntentId?: unknown;
};

export default async function handler(req: ApiReq, res: ApiRes) {
  if (handlePreflight(req, res)) return;

  try {
    const body = readBody<Body>(req);
    const sourceCoaId = String(body.sourceCoaId || '').trim();
    const companyId = String(body.companyId || '').trim();
    const requestedMethod = String(body.paymentMethod || 'card').trim().toLowerCase();
    const paymentIntentId = String(body.paymentIntentId || '').trim();
    if (!sourceCoaId || !companyId) {
      throw new HttpError(400, 'sourceCoaId and companyId are required.');
    }
    if (requestedMethod === 'crypto') {
      throw new HttpError(400, 'Crypto checkout is not available for additional COAs yet.');
    }
    const paymentMethod = BRANDED_COA_IS_FREE ? 'free' : requestedMethod;
    if (paymentMethod !== 'card' && paymentMethod !== 'prepaid' && paymentMethod !== 'free') {
      throw new HttpError(400, 'Invalid payment method.');
    }

    const { url, anon, service } = supabaseEnv();
    if (!url || !anon || !service) {
      throw new HttpError(503, NOT_CONFIGURED);
    }

    const auth = header(req, 'authorization');
    if (!auth.startsWith('Bearer ')) {
      throw new HttpError(401, 'Sign in to purchase an additional COA.');
    }

    const stripe = paymentMethod === 'card' ? getStripe() : null;
    if (paymentMethod === 'card') {
      if (!stripe) throw new HttpError(503, STRIPE_NOT_CONFIGURED);
      if (!paymentIntentId) throw new HttpError(400, 'paymentIntentId is required for card payments.');
    }

    const { user, userClient, admin } = await requireUser(auth);
    if (!admin) throw new HttpError(503, NOT_CONFIGURED);

    if (stripe) {
      await verifyBrandedCoaPayment({
        stripe,
        admin,
        userId: user.id,
        sourceCoaId,
        companyId,
        paymentIntentId,
      });
    }

    const result = await cloneCoaForBrandServer({
      userClient,
      admin,
      userId: user.id,
      sourceCoaId,
      companyId,
      paymentMethod,
      paymentIntentId: paymentMethod === 'card' ? paymentIntentId : undefined,
    });
    return json(res, 200, result);
  } catch (err) {
    if (isKnownApiError(err)) return sendError(res, err, 'Could not create the branded COA.');
    const message = err instanceof Error ? err.message : 'Could not create the branded COA.';
    const status = /sign in|session/i.test(message)
      ? 401
      : /own certificates|forbidden/i.test(message)
        ? 403
        : /not found/i.test(message)
          ? 404
          : /invalid|select|already|maximum|prepaid|ready/i.test(message)
            ? 400
            : 500;
    return json(res, status, { error: message });
  }
}
