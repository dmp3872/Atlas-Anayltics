import { Printer } from 'lucide-react';
import { Order, OrderSample } from '../../lib/types';
import { ATLAS_SHIP_TO } from '../../lib/shippingLabel';
import { formatDateTime } from '../../lib/utils';
import { LAB_PRINT_PACK_ENABLED } from '../../lib/labFeatures';

interface Props {
  order: Order;
  sample: OrderSample;
  accession?: string | null;
  receivedBy?: string;
  className?: string;
}

/**
 * One-click print pack: accession sticker, vial labels, receiving receipt.
 * Gated by LAB_PRINT_PACK_ENABLED — flip that flag to hide without deleting.
 */
export default function PrintPackButton({
  order,
  sample,
  accession,
  receivedBy,
  className = '',
}: Props) {
  if (!LAB_PRINT_PACK_ENABLED) return null;

  const code = (accession || sample.accession_number || '').trim();
  const name = sample.display_name || sample.sample_name;
  const vials = Math.max(1, sample.vial_count || 1);

  function printPack() {
    const vialLabels = Array.from({ length: vials }, (_, i) => `
      <div class="vial">
        <div class="tiny">ATLAS · VIAL ${i + 1}/${vials}</div>
        <div class="code">${escapeHtml(code || 'PENDING')}</div>
        <div class="name">${escapeHtml(name)}</div>
        <div class="meta">${escapeHtml(order.order_number)} · ${escapeHtml(order.company_name || '')}</div>
      </div>
    `).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Print pack · ${escapeHtml(order.order_number)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: ui-sans-serif, system-ui, sans-serif; color: #111; margin: 16px; }
    h1 { font-size: 16px; margin: 0 0 4px; }
    h2 { font-size: 13px; margin: 18px 0 8px; text-transform: uppercase; letter-spacing: .08em; color: #444; }
    .muted { color: #666; font-size: 12px; }
    .sheet { page-break-after: always; border: 1px solid #ccc; padding: 16px; border-radius: 8px; margin-bottom: 16px; }
    .sticker { width: 280px; border: 2px solid #111; padding: 12px; border-radius: 6px; }
    .sticker .code { font-family: ui-monospace, monospace; font-size: 28px; font-weight: 800; letter-spacing: .12em; }
    .sticker .name { font-size: 14px; font-weight: 700; margin-top: 6px; }
    .vials { display: flex; flex-wrap: wrap; gap: 10px; }
    .vial { width: 180px; border: 1.5px dashed #333; padding: 8px; border-radius: 4px; }
    .vial .code { font-family: ui-monospace, monospace; font-size: 16px; font-weight: 800; }
    .vial .tiny { font-size: 9px; letter-spacing: .14em; color: #555; font-weight: 700; }
    .vial .name { font-size: 12px; font-weight: 600; margin-top: 4px; }
    .vial .meta { font-size: 10px; color: #555; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    td { padding: 4px 0; vertical-align: top; }
    td:first-child { width: 140px; color: #555; }
    @media print {
      body { margin: 0; }
      .sheet { border: none; page-break-after: always; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <p class="muted no-print">Print pack for ${escapeHtml(order.order_number)} — use Print → Save as PDF or a label printer.</p>

  <section class="sheet">
    <h2>1 · Accession sticker</h2>
    <div class="sticker">
      <div class="tiny muted">ATLAS ANALYTICS · ACCESSION</div>
      <div class="code">${escapeHtml(code || 'PENDING')}</div>
      <div class="name">${escapeHtml(name)}</div>
      <div class="muted">${escapeHtml(order.company_name || '—')} · ${escapeHtml(order.order_number)}</div>
    </div>
  </section>

  <section class="sheet">
    <h2>2 · Vial labels (${vials})</h2>
    <div class="vials">${vialLabels}</div>
  </section>

  <section class="sheet">
    <h2>3 · Receiving receipt</h2>
    <h1>${escapeHtml(order.order_number)}</h1>
    <p class="muted">Received ${escapeHtml(formatDateTime(new Date().toISOString()))}${receivedBy ? ` · by ${escapeHtml(receivedBy)}` : ''}</p>
    <table>
      <tr><td>Company</td><td>${escapeHtml(order.company_name || '—')}</td></tr>
      <tr><td>Sample</td><td>${escapeHtml(name)}</td></tr>
      <tr><td>Accession</td><td>${escapeHtml(code || '—')}</td></tr>
      <tr><td>Vials</td><td>${vials}</td></tr>
      <tr><td>Ship to</td><td>${escapeHtml(ATLAS_SHIP_TO.name)}<br/>${escapeHtml(ATLAS_SHIP_TO.line1)}<br/>${escapeHtml(`${ATLAS_SHIP_TO.city}, ${ATLAS_SHIP_TO.state} ${ATLAS_SHIP_TO.zip}`)}</td></tr>
      ${order.shipping_label_id ? `<tr><td>Prepaid label</td><td>${escapeHtml(order.shipping_label_id)}</td></tr>` : ''}
    </table>
  </section>

  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`;

    const win = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700');
    if (!win) {
      window.alert('Allow pop-ups to print the pack.');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  return (
    <button
      type="button"
      onClick={printPack}
      className={`btn-outline text-xs py-1.5 gap-1 ${className}`}
      title="Print accession sticker, vial labels, and receiving receipt"
    >
      <Printer size={12} /> Print pack
    </button>
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
