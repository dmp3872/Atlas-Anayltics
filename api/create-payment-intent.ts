import {
  LAB_TEST_SERVICES,
  POST_ISSUE_BRAND_FEE,
  createEmptySample,
  mergeCatalogWithDbPanels,
  normalizeWizardSample,
  orderTotals,
  type WizardSample,
} from '../src/lib/orderCatalog.js';
import { applyClientCatalogPricing } from '../src/lib/clientPricing.js';
import { loadBrandCloneContext } from './lib/cloneCoaForBrandServer.js';
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

const MAX_SAMPLES = 100;

type Body = {
  purpose?: unknown;
  samples?: unknown;
  companyId?: unknown;
  promoCode?: unknown;
  sourceCoaId?: unknown;
};

/** Keep only fields whose runtime shape matches the wizard defaults, then normalize like the client draft loader. */
function sanitizeSample(raw: unknown): WizardSample {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new HttpError(400, 'Invalid sample in order.');
  }
  const input = raw as Record<string, unknown>;
  const template = createEmptySample() as unknown as Record<string, unknown>;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!(key in template) || value == null) continue;
    const expected = template[key];
    if (Array.isArray(expected)) {
      if (Array.isArray(value)) clean[key] = value;
    } else if (typeof expected === 'number') {
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) clean[key] = Math.floor(value);
    } else if (typeof value === typeof expected) {
      clean[key] = value;
    }
  }
  if (Array.isArray(clean.brand_names)) {
    clean.brand_names = (clean.brand_names as unknown[]).filter((n): n is string => typeof n === 'string');
  }
  if (Array.isArray(clean.individual_tests)) {
    clean.individual_tests = (clean.individual_tests as unknown[]).filter((n): n is string => typeof n === 'string');
  }
  const id = typeof input.id === 'string' && input.id ? input.id : String(template.id);
  return normalizeWizardSample({ ...(clean as Partial<WizardSample>), id });
}

export default async function handler(req: ApiReq, res: ApiRes) {
  if (handlePreflight(req, res)) return;

  try {
    const stripe = requireStripe();
    const { user, userClient, admin } = await requireUser(header(req, 'authorization'));
    const db = admin ?? userClient;
    const body = readBody<Body>(req);
    const purpose = String(body.purpose || '');
    const companyId = typeof body.companyId === 'string' ? body.companyId.trim() : '';

    if (purpose === 'order') {
      if (!companyId) throw new HttpError(400, 'Select one of your COA profiles.');
      if (!Array.isArray(body.samples) || body.samples.length === 0) {
        throw new HttpError(400, 'Add at least one sample before paying.');
      }
      if (body.samples.length > MAX_SAMPLES) throw new HttpError(400, 'Too many samples in one order.');

      const { data: company } = await db
        .from('companies')
        .select('id, name, user_id')
        .eq('id', companyId)
        .maybeSingle();
      if (!company || company.user_id !== user.id) {
        throw new HttpError(400, 'Select one of your COA profiles.');
      }
      const companyName = String(company.name || '');

      const [{ data: panels, error: panelErr }, { data: profile }] = await Promise.all([
        db.from('test_panels')
          .select('id, name, description, price_per_sample, is_active')
          .eq('is_active', true),
        db.from('user_profiles').select('company_name').eq('id', user.id).maybeSingle(),
      ]);
      // Matches the wizard: negotiated pricing keys off the profile company first.
      const pricingOpts = {
        email: user.email ?? null,
        companyName: (profile?.company_name as string | null | undefined) ?? companyName ?? null,
      };
      const catalog = applyClientCatalogPricing(
        panelErr ? LAB_TEST_SERVICES : mergeCatalogWithDbPanels(LAB_TEST_SERVICES, panels ?? []),
        pricingOpts,
      );

      const samples = body.samples.map(sanitizeSample);
      const { subtotal } = orderTotals(samples, companyName, catalog);
      const promoCode = typeof body.promoCode === 'string' ? body.promoCode : '';
      const promoDiscount = promoCode.trim().toUpperCase() === 'ATLAS10' ? subtotal * 0.1 : 0;
      const total = Math.max(0, subtotal - promoDiscount);
      if (!(total > 0)) throw new HttpError(400, 'Order total must be greater than $0.');

      const amount = Math.round(total * 100);
      const pi = await stripe.paymentIntents.create({
        amount,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        metadata: {
          purpose: 'order',
          user_id: user.id,
          company_id: companyId,
          total: total.toFixed(2),
        },
        receipt_email: user.email || undefined,
        description: 'Atlas Analytics lab testing order',
      });
      if (!pi.client_secret) throw new HttpError(502, 'Stripe did not return a client secret.');
      return json(res, 200, {
        clientSecret: pi.client_secret,
        paymentIntentId: pi.id,
        amount: amount / 100,
        currency: 'usd',
      });
    }

    if (purpose === 'branded_coa') {
      const sourceCoaId = typeof body.sourceCoaId === 'string' ? body.sourceCoaId.trim() : '';
      if (!sourceCoaId || !companyId) {
        throw new HttpError(400, 'sourceCoaId and companyId are required.');
      }
      if (POST_ISSUE_BRAND_FEE <= 0) {
        throw new HttpError(400, 'Additional COAs are free right now — no payment needed.');
      }
      // Issuing the copy needs the service role; refuse before charging so a card is never billed for nothing.
      if (!admin) {
        throw new HttpError(503, 'Additional COA card checkout is not configured on the server yet.');
      }
      await loadBrandCloneContext(db, user.id, sourceCoaId, companyId);

      const amount = Math.round(POST_ISSUE_BRAND_FEE * 100);
      const pi = await stripe.paymentIntents.create({
        amount,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        metadata: {
          purpose: 'branded_coa',
          user_id: user.id,
          source_coa_id: sourceCoaId,
          company_id: companyId,
        },
        receipt_email: user.email || undefined,
        description: 'Atlas Analytics additional branded COA',
      });
      if (!pi.client_secret) throw new HttpError(502, 'Stripe did not return a client secret.');
      return json(res, 200, {
        clientSecret: pi.client_secret,
        paymentIntentId: pi.id,
        amount: amount / 100,
        currency: 'usd',
      });
    }

    throw new HttpError(400, 'Unknown payment purpose.');
  } catch (err) {
    return sendError(res, err, 'Could not start card payment.');
  }
}
