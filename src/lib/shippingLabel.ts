/** Simulated prepaid shipping label (production: FedEx/UPS API). */
export function generateShippingLabelId(orderNumber: string): string {
  const suffix = orderNumber.replace(/\D/g, '').slice(-6).padStart(6, '0');
  return `AA-SL-${suffix}`;
}

export function shippingLabelTracking(labelId: string): string {
  return labelId.replace('AA-SL-', '1Z999AA1');
}

export const ATLAS_SHIP_TO = {
  name: 'Atlas Analytics',
  line1: '1234 Research Blvd',
  city: 'Austin',
  state: 'TX',
  zip: '78701',
};
