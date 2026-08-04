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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Open a printable prepaid shipping label sheet for an order. */
export function printShippingLabel(order: {
  order_number: string;
  company_name?: string | null;
  shipping_label_id?: string | null;
}): void {
  const labelId = (order.shipping_label_id || generateShippingLabelId(order.order_number)).trim();
  const tracking = shippingLabelTracking(labelId);
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Shipping label · ${escapeHtml(order.order_number)}</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 24px; color: #111; }
    .label { width: 420px; border: 2px solid #111; padding: 20px; border-radius: 8px; }
    .tiny { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: #555; font-weight: 700; }
    .code { font-family: ui-monospace, monospace; font-size: 22px; font-weight: 800; margin: 8px 0; }
    .block { margin-top: 16px; font-size: 13px; line-height: 1.45; }
    .muted { color: #666; font-size: 12px; }
    @media print { body { margin: 0; } .no-print { display: none !important; } }
  </style>
</head>
<body>
  <p class="muted no-print">Print or Save as PDF — prepaid label for ${escapeHtml(order.order_number)}</p>
  <div class="label">
    <div class="tiny">Atlas Analytics · Prepaid ship-to lab</div>
    <div class="code">${escapeHtml(labelId)}</div>
    <div class="tiny">Tracking</div>
    <div class="code" style="font-size:18px">${escapeHtml(tracking)}</div>
    <div class="block">
      <strong>Ship to</strong><br/>
      ${escapeHtml(ATLAS_SHIP_TO.name)}<br/>
      ${escapeHtml(ATLAS_SHIP_TO.line1)}<br/>
      ${escapeHtml(`${ATLAS_SHIP_TO.city}, ${ATLAS_SHIP_TO.state} ${ATLAS_SHIP_TO.zip}`)}
    </div>
    <div class="block muted">
      From: ${escapeHtml(order.company_name || 'Client')}<br/>
      Order: ${escapeHtml(order.order_number)}
    </div>
  </div>
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`;

  const win = window.open('', '_blank', 'noopener,noreferrer,width=700,height=600');
  if (!win) {
    window.alert('Allow pop-ups to print the shipping label.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
