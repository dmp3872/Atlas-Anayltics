import { Printer } from 'lucide-react';
import { Order, OrderSample } from '../../lib/types';
import { ATLAS_SHIP_TO } from '../../lib/shippingLabel';
import { formatDateTime } from '../../lib/utils';
import { LAB_PRINT_PACK_ENABLED } from '../../lib/labFeatures';
import { orderedVialCount } from '../../lib/orderCatalog';

interface Props {
  order: Order;
  sample: OrderSample;
  accession?: string | null;
  receivedBy?: string;
  className?: string;
}

/**
 * One-click print pack: LIMS ID sticker, one label per vial (V1…Vn + QR), receiving receipt.
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

  const code = (accession || sample.accession_number || '').trim().toUpperCase();
  const name = sample.display_name || sample.sample_name;
  const vials = Math.max(
    1,
    Number(sample.vial_count) || 0,
    orderedVialCount(sample) || 0,
  );

  function printPack() {
    if (!code) {
      window.alert('Assign a LIMS ID before printing vial labels.');
      return;
    }

    const origin = window.location.origin;
    const vialLabels = Array.from({ length: vials }, (_, i) => {
      const vialNo = `V${i + 1}`;
      const vialId = `${code}-${vialNo}`;
      const scanUrl = `${origin}/verify?slug=${encodeURIComponent(code)}&vial=${encodeURIComponent(vialNo)}`;
      const qrSrc = qrImageUrl(scanUrl, 120);
      return `
      <section class="label-sheet">
        <div class="vial-label">
          <div class="vial-main">
            <div class="tiny">ATLAS · ${escapeHtml(vialNo)} OF ${vials}</div>
            <div class="code">${escapeHtml(code)}</div>
            <div class="vial-id">${escapeHtml(vialId)}</div>
            <div class="name">${escapeHtml(name)}</div>
            <div class="meta">${escapeHtml(order.order_number)} · ${escapeHtml(order.company_name || '')}</div>
          </div>
          <div class="vial-qr">
            <img src="${qrSrc}" width="88" height="88" alt="QR ${escapeHtml(vialId)}" />
            <div class="tiny qr-caption">Scan LIMS</div>
          </div>
        </div>
      </section>`;
    }).join('');

    const limsQrSrc = qrImageUrl(`${origin}/verify?slug=${encodeURIComponent(code)}`, 140);

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Print pack · ${escapeHtml(code)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: ui-sans-serif, system-ui, sans-serif; color: #111; margin: 16px; }
    h1 { font-size: 16px; margin: 0 0 4px; }
    h2 { font-size: 13px; margin: 18px 0 8px; text-transform: uppercase; letter-spacing: .08em; color: #444; }
    .muted { color: #666; font-size: 12px; }
    .tiny { font-size: 9px; letter-spacing: .14em; color: #555; font-weight: 700; }
    .sheet { page-break-after: always; border: 1px solid #ccc; padding: 16px; border-radius: 8px; margin-bottom: 16px; }
    .sticker {
      width: 320px; border: 2px solid #111; padding: 12px; border-radius: 6px;
      display: flex; gap: 12px; align-items: center;
    }
    .sticker .code { font-family: ui-monospace, monospace; font-size: 22px; font-weight: 800; letter-spacing: .08em; }
    .sticker .name { font-size: 13px; font-weight: 700; margin-top: 4px; }
    .label-sheet { page-break-after: always; margin: 0 0 12px; }
    .vial-label {
      width: 3.5in; min-height: 1.4in; border: 2px solid #111; border-radius: 4px;
      padding: 8px 10px; display: flex; gap: 10px; align-items: center; justify-content: space-between;
      background: #fff;
    }
    .vial-main { min-width: 0; flex: 1; }
    .vial-label .code { font-family: ui-monospace, monospace; font-size: 18px; font-weight: 800; letter-spacing: .06em; }
    .vial-label .vial-id { font-family: ui-monospace, monospace; font-size: 13px; font-weight: 700; margin-top: 2px; }
    .vial-label .name { font-size: 12px; font-weight: 600; margin-top: 4px; word-break: break-word; }
    .vial-label .meta { font-size: 10px; color: #555; margin-top: 2px; }
    .vial-qr { flex-shrink: 0; text-align: center; }
    .vial-qr img { display: block; width: 88px; height: 88px; background: #fff; }
    .qr-caption { margin-top: 2px; letter-spacing: .08em; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    td { padding: 4px 0; vertical-align: top; }
    td:first-child { width: 140px; color: #555; }
    @media print {
      body { margin: 0; }
      .sheet, .label-sheet { border: none; page-break-after: always; margin: 0; padding: 0.15in; }
      .vial-label { border-width: 1.5px; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <p class="muted no-print">Print pack for ${escapeHtml(code)} — ${vials} vial label${vials === 1 ? '' : 's'} (V1–V${vials}). Wait for QR codes, then use Print.</p>
  <p class="no-print" style="margin:8px 0 16px">
    <button type="button" onclick="window.print()" style="padding:8px 14px;font-weight:700;cursor:pointer">Print labels</button>
  </p>

  <section class="sheet">
    <h2 class="no-print">1 · LIMS ID sticker</h2>
    <div class="sticker">
      <div style="flex:1;min-width:0">
        <div class="tiny muted">ATLAS ANALYTICS · LIMS ID</div>
        <div class="code">${escapeHtml(code)}</div>
        <div class="name">${escapeHtml(name)}</div>
        <div class="muted">${escapeHtml(order.company_name || '—')} · ${escapeHtml(order.order_number)}</div>
        <div class="muted" style="margin-top:4px">${vials} vial${vials === 1 ? '' : 's'} · V1–V${vials}</div>
      </div>
      <img src="${limsQrSrc}" width="100" height="100" alt="QR ${escapeHtml(code)}" />
    </div>
  </section>

  ${vialLabels}

  <section class="sheet">
    <h2 class="no-print">Receiving receipt</h2>
    <h1>${escapeHtml(order.order_number)}</h1>
    <p class="muted">Received ${escapeHtml(formatDateTime(new Date().toISOString()))}${receivedBy ? ` · by ${escapeHtml(receivedBy)}` : ''}</p>
    <table>
      <tr><td>Company</td><td>${escapeHtml(order.company_name || '—')}</td></tr>
      <tr><td>Sample</td><td>${escapeHtml(name)}</td></tr>
      <tr><td>LIMS ID</td><td>${escapeHtml(code)}</td></tr>
      <tr><td>Vials</td><td>${vials} (labels V1–V${vials})</td></tr>
      <tr><td>Ship to</td><td>${escapeHtml(ATLAS_SHIP_TO.name)}<br/>${escapeHtml(ATLAS_SHIP_TO.line1)}<br/>${escapeHtml(`${ATLAS_SHIP_TO.city}, ${ATLAS_SHIP_TO.state} ${ATLAS_SHIP_TO.zip}`)}</td></tr>
      ${order.shipping_label_id ? `<tr><td>Prepaid label</td><td>${escapeHtml(order.shipping_label_id)}</td></tr>` : ''}
    </table>
  </section>

  <script>
    (function () {
      function ready() {
        var imgs = Array.prototype.slice.call(document.images || []);
        return Promise.all(imgs.map(function (img) {
          if (img.complete) return Promise.resolve();
          return new Promise(function (resolve) {
            img.onload = img.onerror = function () { resolve(); };
          });
        }));
      }
      ready().then(function () {
        setTimeout(function () { window.print(); }, 250);
      });
    })();
  </script>
</body>
</html>`;

    // Do not use noopener — modern browsers return null and the pack never opens.
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank', 'width=920,height=720');
    if (!win) {
      URL.revokeObjectURL(url);
      window.alert('Allow pop-ups for atlasanalyticlab.com to print the pack.');
      return;
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <button
      type="button"
      onClick={printPack}
      className={`btn-outline text-xs py-1.5 gap-1 ${className}`}
      title={`Print LIMS sticker + ${Math.max(1, orderedVialCount(sample) || sample.vial_count || 1)} vial labels (V1…) with QR`}
    >
      <Printer size={12} /> Print pack
    </button>
  );
}

function qrImageUrl(data: string, size: number): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}&bgcolor=ffffff&color=000000&margin=1`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
