import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb, RGB } from 'pdf-lib';
import { COA, PanelResult } from './types';
import { buildCoaPdfFieldValues } from './coaPdfFields';
import {
  fentanylDetectionLabel,
  hydrateCoaImages,
  readCoaPdfStats,
  resolveCoaWatermark,
  resolveImageAsDataUrl,
  trimImageWhitespace,
} from './coaImages';

const TEMPLATE_URL = '/coa/certificate-of-analysis-template.pdf';
const ATLAS_LOGO_URL = '/brand/atlas-logo-stacked.png';

/** Chromatogram image region on the A4 template (PDF user units). */
const CHROMATOGRAM_RECT = { x: 125.735, y: 487.755, width: 453.447, height: 152.124 };

/**
 * Condensed vial frame beside the chromatogram (Vanguard-style product shot).
 * Stock vial artwork is wiped, then the cropped vial photo is drawn tightly inside.
 */
const VIAL_FRAME = { x: 18, y: 498, width: 100, height: 132 };
const VIAL_PHOTO_INSET = 5;

/** Client logo watermark in the HPLC box (same feel as web AtlasWatermark). */
const LOGO_WATERMARK_OPACITY = 0.16;

/** Main results table geometry (matches Endotoxins / Sterility AcroForm fields). */
const RESULTS_TABLE = {
  left: 34,
  right: 581,
  /** Column dividers: Test | Specification | Result | Conformity */
  cols: [34, 138.7, 256.6, 435.0, 581] as const,
  rowH: 19.3,
  /** Bottom of Endotoxins (LAL) row. */
  endotoxinsBottom: 261.3,
  headerH: 20,
};

const HEAVY_METAL_TEMPLATE_ROWS = [
  { name: 'Arsenic (As)', limit: 'NMT 1.5 ppm', match: 'arsenic' },
  { name: 'Cadmium (Cd)', limit: 'NMT 0.5 ppm', match: 'cadmium' },
  { name: 'Chromium (Cr)', limit: 'NMT 10 ppm', match: 'chromium' },
  { name: 'Mercury (Hg)', limit: 'NMT 1.5 ppm', match: 'mercury' },
  { name: 'Lead (Pb)', limit: 'NMT 1 ppm', match: 'lead' },
] as const;

function parseDataUrl(dataUrl: string): { bytes: Uint8Array; kind: 'png' | 'jpg' } | null {
  const match = /^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const kind: 'png' | 'jpg' = mime.includes('png') ? 'png' : 'jpg';
  const binary = atob(match[2].replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, kind };
}

async function embedImageSource(pdf: PDFDocument, src: string): Promise<PDFImage | null> {
  const dataUrl = await resolveImageAsDataUrl(src);
  if (!dataUrl) return null;
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;
  try {
    return parsed.kind === 'png'
      ? await pdf.embedPng(parsed.bytes)
      : await pdf.embedJpg(parsed.bytes);
  } catch {
    return null;
  }
}

/** AcroForm Helvetica is WinAnsi — replace Unicode that pdf-lib cannot encode. */
function toWinAnsi(value: string): string {
  return (value ?? '')
    .replace(/\u2265/g, '>=') // ≥
    .replace(/\u2264/g, '<=') // ≤
    .replace(/\u00B1/g, '+/-') // ±
    .replace(/\u00B5|\u03BC/g, 'u') // µ μ
    .replace(/\u00B0/g, ' deg') // °
    .replace(/\u2013|\u2014|\u2212/g, '-') // – — −
    .replace(/\u2018|\u2019/g, "'") // ‘ ’
    .replace(/\u201C|\u201D/g, '"') // “ ”
    .replace(/\u2026/g, '...') // …
    .replace(/\u00A0/g, ' ') // nbsp
    .replace(/[^\x00-\xFF]/g, ''); // drop anything else outside Latin-1
}

function setTextField(form: ReturnType<PDFDocument['getForm']>, name: string, value: string) {
  try {
    form.getTextField(name).setText(toWinAnsi(value));
  } catch {
    // Field missing on template variant — ignore
  }
}

function coaFilename(coa: COA): string {
  const slug = (coa.slug || 'coa').replace(/[^\w.-]+/g, '_');
  return `${slug}-coa.pdf`;
}

function drawContainedImage(
  page: PDFPage,
  image: PDFImage,
  rect: { x: number; y: number; width: number; height: number },
  opacity = 1,
) {
  const { width: iw, height: ih } = image;
  const scale = Math.min(rect.width / iw, rect.height / ih);
  const drawW = iw * scale;
  const drawH = ih * scale;
  page.drawImage(image, {
    x: rect.x + (rect.width - drawW) / 2,
    y: rect.y + (rect.height - drawH) / 2,
    width: drawW,
    height: drawH,
    opacity,
  });
}

function drawTableGrid(
  page: PDFPage,
  bottom: number,
  height: number,
  border: RGB,
) {
  const { left, right, cols } = RESULTS_TABLE;
  const top = bottom + height;
  const t = 0.55;
  page.drawLine({ start: { x: left, y: top }, end: { x: right, y: top }, thickness: t, color: border });
  page.drawLine({ start: { x: left, y: bottom }, end: { x: right, y: bottom }, thickness: t, color: border });
  for (const x of cols) {
    page.drawLine({ start: { x, y: bottom }, end: { x, y: top }, thickness: t, color: border });
  }
}

function drawDataRow(
  page: PDFPage,
  bottom: number,
  cells: [string, string, string, string],
  fonts: { regular: PDFFont; bold: PDFFont },
  opts?: { boldFirst?: boolean; confColor?: RGB },
) {
  const { rowH, cols } = RESULTS_TABLE;
  const border = rgb(0.78, 0.78, 0.78);
  const ink = rgb(0.08, 0.08, 0.08);
  const muted = rgb(0.28, 0.28, 0.28);
  page.drawRectangle({
    x: RESULTS_TABLE.left,
    y: bottom,
    width: RESULTS_TABLE.right - RESULTS_TABLE.left,
    height: rowH,
    color: rgb(1, 1, 1),
    borderWidth: 0,
  });
  drawTableGrid(page, bottom, rowH, border);
  const textY = bottom + 5.5;
  const pads = [cols[0] + 6, cols[1] + 8, cols[2] + 8, cols[3] + 14] as const;
  cells.forEach((text, i) => {
    if (!text) return;
    const useBold = i === 0 ? opts?.boldFirst !== false : i === 3;
    page.drawText(toWinAnsi(text), {
      x: pads[i],
      y: textY,
      size: 9,
      font: useBold ? fonts.bold : fonts.regular,
      color: i === 3 && opts?.confColor ? opts.confColor : i === 1 ? muted : ink,
    });
  });
}

function heavyMetalResult(panels: PanelResult[], match: string): { result: string; pass: boolean } {
  const panel = panels.find(p => p.panel_name.toLowerCase().includes(match));
  if (!panel) return { result: '', pass: true };
  return { result: (panel.value ?? panel.result ?? '').trim(), pass: panel.pass };
}

/** Insert Fentanyl under Endotoxins and shift Heavy Metals down so the row is visible. */
function drawFentanylAndShiftedHeavyMetals(
  page: PDFPage,
  coa: COA,
  fonts: { regular: PDFFont; bold: PDFFont },
) {
  const fenMark = readCoaPdfStats(coa).fentanyl_detection;
  const fenLabel = fentanylDetectionLabel(fenMark);
  if (!fenLabel) return;

  const { rowH, endotoxinsBottom, headerH, left, right } = RESULTS_TABLE;
  const fenBottom = endotoxinsBottom - rowH;
  const wipeBottom = 118;
  const wipeTop = endotoxinsBottom;

  page.drawRectangle({
    x: left - 1,
    y: wipeBottom,
    width: right - left + 2,
    height: wipeTop - wipeBottom,
    color: rgb(1, 1, 1),
    borderWidth: 0,
  });

  const conf = fenMark === 'none_detected' ? 'PASS' : 'FAIL';
  const confColor = fenMark === 'none_detected' ? rgb(0.05, 0.45, 0.2) : rgb(0.75, 0.08, 0.08);
  drawDataRow(
    page,
    fenBottom,
    ['Fentanyl Detection', 'None Detected', fenLabel, conf],
    fonts,
    { boldFirst: false, confColor },
  );

  const hmHeaderBottom = fenBottom - headerH;
  page.drawRectangle({
    x: left,
    y: hmHeaderBottom,
    width: right - left,
    height: headerH,
    color: rgb(0, 0, 0),
    borderWidth: 0,
  });
  const gold = rgb(0.83, 0.69, 0.22);
  const headerY = hmHeaderBottom + 6;
  page.drawText('Heavy Metals', { x: left + 8, y: headerY, size: 9, font: fonts.bold, color: gold });
  page.drawText('USP <232> Limits', { x: RESULTS_TABLE.cols[1] + 8, y: headerY, size: 9, font: fonts.bold, color: gold });
  page.drawText('Result', { x: RESULTS_TABLE.cols[2] + 8, y: headerY, size: 9, font: fonts.bold, color: gold });
  page.drawText('Conformity', { x: RESULTS_TABLE.cols[3] + 14, y: headerY, size: 9, font: fonts.bold, color: gold });

  const panels = Array.isArray(coa.panel_results) ? coa.panel_results : [];
  HEAVY_METAL_TEMPLATE_ROWS.forEach((metal, i) => {
    const bottom = hmHeaderBottom - rowH * (i + 1);
    const { result, pass } = heavyMetalResult(panels, metal.match);
    const conformity = result ? (pass ? 'PASS' : 'FAIL') : '';
    drawDataRow(
      page,
      bottom,
      [metal.name, metal.limit, result, conformity],
      fonts,
      {
        boldFirst: false,
        confColor: conformity === 'PASS' ? rgb(0.05, 0.45, 0.2) : conformity === 'FAIL' ? rgb(0.75, 0.08, 0.08) : undefined,
      },
    );
  });
}

/** Fill the Atlas COA template and return PDF bytes (flattened). */
export async function buildCoaPdfBytes(coa: COA): Promise<Uint8Array> {
  const record = hydrateCoaImages(coa);
  const watermarkSrc = (await resolveCoaWatermark(record)) || ATLAS_LOGO_URL;

  const templateRes = await fetch(TEMPLATE_URL);
  if (!templateRes.ok) {
    throw new Error('Could not load the Certificate of Analysis template.');
  }

  const templateBytes = await templateRes.arrayBuffer();
  const pdf = await PDFDocument.load(templateBytes);
  const form = pdf.getForm();
  const values = buildCoaPdfFieldValues(record);

  for (const [name, value] of Object.entries(values)) {
    setTextField(form, name, value);
  }

  try {
    form.flatten();
  } catch {
    // Some PDF readers still open unflattened filled forms
  }

  const page = pdf.getPages()[0];
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Template says "Mean of _ quantity" — cover "quantity" and label "vials tested".
  page.drawRectangle({
    x: 245,
    y: 405,
    width: 60,
    height: 12,
    color: rgb(1, 1, 1),
    borderWidth: 0,
  });
  page.drawText('vials tested', {
    x: 246,
    y: 407.5,
    size: 8.5,
    font,
    color: rgb(0.22, 0.22, 0.22),
  });

  drawFentanylAndShiftedHeavyMetals(page, record, { regular: font, bold });

  // HPLC box: client chromatogram watermark from COA profile (Atlas only if none applied).
  page.drawRectangle({
    x: CHROMATOGRAM_RECT.x,
    y: CHROMATOGRAM_RECT.y,
    width: CHROMATOGRAM_RECT.width,
    height: CHROMATOGRAM_RECT.height,
    color: rgb(1, 1, 1),
    borderWidth: 0,
  });
  const watermark = await embedImageSource(pdf, watermarkSrc);
  if (watermark) {
    drawContainedImage(page, watermark, {
      x: CHROMATOGRAM_RECT.x + CHROMATOGRAM_RECT.width * 0.28,
      y: CHROMATOGRAM_RECT.y + CHROMATOGRAM_RECT.height * 0.15,
      width: CHROMATOGRAM_RECT.width * 0.44,
      height: CHROMATOGRAM_RECT.height * 0.70,
    }, LOGO_WATERMARK_OPACITY);
  }

  // Condensed vial product shot (trim empty studio background, tight double frame).
  page.drawRectangle({
    x: 12,
    y: 485,
    width: 112,
    height: 158,
    color: rgb(1, 1, 1),
    borderWidth: 0,
  });
  if (record.vial_image) {
    const trimmed = await trimImageWhitespace(record.vial_image);
    const vialImage = await embedImageSource(pdf, trimmed || record.vial_image);
    if (vialImage) {
      const frame = VIAL_FRAME;
      const ink = rgb(0.12, 0.12, 0.12);
      // Outer + inner frame like Vanguard product shot.
      page.drawRectangle({
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: frame.height,
        borderColor: ink,
        borderWidth: 1.4,
        color: rgb(1, 1, 1),
      });
      page.drawRectangle({
        x: frame.x + 2.5,
        y: frame.y + 2.5,
        width: frame.width - 5,
        height: frame.height - 5,
        borderColor: ink,
        borderWidth: 0.6,
      });
      drawContainedImage(page, vialImage, {
        x: frame.x + VIAL_PHOTO_INSET,
        y: frame.y + VIAL_PHOTO_INSET,
        width: frame.width - VIAL_PHOTO_INSET * 2,
        height: frame.height - VIAL_PHOTO_INSET * 2,
      });
    }
  }

  return pdf.save();
}

/**
 * Open the live portal COA page and trigger the browser print / Save as PDF dialog.
 * This is the canonical download path so certificates match what clients see on the web.
 */
export function openCoaPrintView(slug: string): void {
  const path = `/coa/${encodeURIComponent(slug)}?print=1`;
  window.open(path, '_blank', 'noopener,noreferrer');
}

/**
 * @deprecated Prefer `openCoaPrintView`. Kept for click-handler sync open patterns.
 */
export function openCoaPdfPreviewWindow(): Window | null {
  const preview = window.open('about:blank', '_blank');
  if (preview) preview.opener = null;
  return preview;
}

/** Open the portal COA print view (matches on-screen certificate). */
export async function openCoaPdf(coa: COA, previewWindow?: Window | null): Promise<void> {
  const path = `/coa/${encodeURIComponent(coa.slug)}?print=1`;
  if (previewWindow && !previewWindow.closed) {
    previewWindow.location.href = path;
    return;
  }
  openCoaPrintView(coa.slug);
}

/** Download / print via the portal COA view (Save as PDF in the print dialog). */
export async function downloadCoaPdf(coa: COA): Promise<void> {
  openCoaPrintView(coa.slug);
}

/** @deprecated Template blob generation is no longer used for downloads. */
export async function downloadCoaPdfBlob(coa: COA): Promise<void> {
  const bytes = await buildCoaPdfBytes(coa);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = coaFilename(coa);
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
