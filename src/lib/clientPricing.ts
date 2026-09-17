import type { LabTestService } from './orderCatalog';
import { ATLAS_SAFETY_PRO_PRICE } from './submissionUtils';

/** Negotiated Atlas Safety Pro (Atlas Pro) package prices by login email. */
const ATLAS_PRO_PRICE_BY_EMAIL: Record<string, number> = {
  'client@atlaslabs.test': 500,
  'zackaryjonsmith@gmail.com': 500,
};

/** Fallback match when email is unavailable but company is known. */
const ATLAS_PRO_PRICE_BY_COMPANY: Record<string, number> = {
  'ums rx llc': 500,
};

export function atlasProPriceForClient(opts?: {
  email?: string | null;
  companyName?: string | null;
}): number {
  const email = (opts?.email || '').trim().toLowerCase();
  if (email && ATLAS_PRO_PRICE_BY_EMAIL[email] != null) {
    return ATLAS_PRO_PRICE_BY_EMAIL[email]!;
  }
  const company = (opts?.companyName || '').trim().toLowerCase();
  if (company && ATLAS_PRO_PRICE_BY_COMPANY[company] != null) {
    return ATLAS_PRO_PRICE_BY_COMPANY[company]!;
  }
  return ATLAS_SAFETY_PRO_PRICE;
}

/** Apply negotiated package prices onto the live order catalog. */
export function applyClientCatalogPricing(
  catalog: LabTestService[],
  opts?: { email?: string | null; companyName?: string | null },
): LabTestService[] {
  const atlasProPrice = atlasProPriceForClient(opts);
  if (atlasProPrice === ATLAS_SAFETY_PRO_PRICE) return catalog;
  return catalog.map(service =>
    service.id === 'atlas_pro' ? { ...service, price: atlasProPrice } : service,
  );
}
