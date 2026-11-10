/**
 * Zebra (ZPL) print pack: LIMS ID sticker + one label per vial.
 *
 * Template values — replace once the lab confirms the printer model and label stock.
 * dpi: 203 (most desktop Zebras, e.g. ZD421d) or 300 (ZD421t-300, ZT411-300).
 */
export const ZEBRA_CONFIG = {
  dpi: 203,
  limsLabel: { widthIn: 2, heightIn: 1 },
  vialLabel: { widthIn: 1.25, heightIn: 0.5 },
  /** Copies of the LIMS ID sticker per sample (e.g. bag + intake sheet). */
  limsCopies: 1,
};

export type ZebraPackInput = {
  code: string;
  sampleName: string;
  companyName: string;
  orderNumber: string;
  vialCount: number;
};

function dots(inches: number): number {
  return Math.round(inches * ZEBRA_CONFIG.dpi);
}

/** ZPL treats ^ and ~ as commands; strip them and keep ASCII so every printer font renders it. */
function zplText(value: string, maxChars: number): string {
  const clean = (value || '')
    .replace(/[\^~]/g, ' ')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > maxChars ? `${clean.slice(0, maxChars - 1)}.` : clean;
}

function limsLabelZpl(input: ZebraPackInput): string {
  const w = dots(ZEBRA_CONFIG.limsLabel.widthIn);
  const h = dots(ZEBRA_CONFIG.limsLabel.heightIn);
  const m = Math.round(h * 0.08);
  const small = Math.round(h * 0.1);
  const big = Math.round(h * 0.17);
  const barH = Math.round(h * 0.3);
  const code = zplText(input.code || 'PENDING', 24);
  return [
    '^XA',
    '^CI28',
    `^PW${w}`,
    `^LL${h}`,
    `^PQ${Math.max(1, ZEBRA_CONFIG.limsCopies)}`,
    `^FO${m},${m}^A0N,${small},${small}^FDATLAS ANALYTICS - LIMS ID^FS`,
    `^FO${m},${m + small + 4}^BY2^BCN,${barH},N,N,N^FD${code}^FS`,
    `^FO${m},${m + small + barH + 8}^A0N,${big},${big}^FD${code}^FS`,
    `^FO${m},${m + small + barH + big + 10}^A0N,${small},${small}^FD${zplText(input.sampleName, 32)}^FS`,
    `^FO${m},${m + small * 2 + barH + big + 12}^A0N,${small},${small}^FD${zplText(`${input.companyName} | ${input.orderNumber}`, 36)}^FS`,
    '^XZ',
  ].join('\n');
}

function vialLabelZpl(input: ZebraPackInput, index: number, total: number): string {
  const w = dots(ZEBRA_CONFIG.vialLabel.widthIn);
  const h = dots(ZEBRA_CONFIG.vialLabel.heightIn);
  const m = Math.round(h * 0.08);
  const small = Math.round(h * 0.16);
  const big = Math.round(h * 0.24);
  const code = zplText(input.code || 'PENDING', 24);
  return [
    '^XA',
    '^CI28',
    `^PW${w}`,
    `^LL${h}`,
    `^FO${m},${m}^A0N,${small},${small}^FDVIAL ${index}/${total}^FS`,
    `^FO${m},${m + small + 2}^A0N,${big},${big}^FD${code}^FS`,
    `^FO${m},${m + small + big + 4}^A0N,${small},${small}^FD${zplText(input.sampleName, 18)}^FS`,
    '^XZ',
  ].join('\n');
}

export function buildZebraPrintPack(input: ZebraPackInput): string {
  const total = Math.max(1, input.vialCount || 1);
  const vials = Array.from({ length: total }, (_, i) => vialLabelZpl(input, i + 1, total));
  return [limsLabelZpl(input), ...vials].join('\n');
}

export function downloadZebraPrintPack(input: ZebraPackInput, fileStem: string): void {
  const zpl = buildZebraPrintPack(input);
  const blob = new Blob([zpl], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileStem.replace(/[^A-Za-z0-9_-]+/g, '_') || 'print-pack'}.zpl`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
