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
  line1: '207 Pickens St, Suite 215',
  city: 'Columbia',
  state: 'SC',
  zip: '29209',
};
