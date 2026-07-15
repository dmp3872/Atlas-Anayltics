import { PDFDocument, PDFImage, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { COA } from './types';
import { buildCoaPdfFieldValues } from './coaPdfFields';
import {
  fentanylDetectionLabel,
  hydrateCoaImages,
  readCoaPdfStats,
  resolveCoaLogoWatermark,
} from './coaImages';

const TEMPLATE_URL = '/coa/certificate-of-analysis-template.pdf';

/** Chromatogram image region on the A4 template (PDF user units). */
const CHROMATOGRAM_RECT = { x: 125.735, y: 487.755, width: 453.447, height: 152.124 };

/**
 * Left vial panel beside the chromatogram (same vertical band as HPLC box).
 * Stock vial artwork is baked into the template — white-out this entire rect, then draw the attached photo.
 */
const VIAL_PANEL_RECT = { x: 12, y: 485, width: 112, height: 158 };

/** Photo fills the panel with a small inset so edges stay clean. */
const VIAL_PHOTO_RECT = { x: 18, y: 491, width: 100, height: 146 };

const LOGO_WATERMARK_OPACITY = 0.18;

function parseDataUrl(dataUrl: string): { bytes: Uint8Array; kind: 'png' | 'jpg' } | null {
  const match = /^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const kind: 'png' | 'jpg' = mime.includes('png') ? 'png' : 'jpg';
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, kind };
}

async function embedDataUrl(pdf: PDFDocument, dataUrl: string): Promise<PDFImage | null> {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;
  return parsed.kind === 'png'
    ? pdf.embedPng(parsed.bytes)
    : pdf.embedJpg(parsed.bytes);
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

/** Fill the Atlas COA template and return PDF bytes (flattened). */
export async function buildCoaPdfBytes(coa: COA): Promise<Uint8Array> {
  const record = hydrateCoaImages(coa);
  const logoUrl = await resolveCoaLogoWatermark(record);

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

  // Fentanyl Detection row — drawn below Endotoxins (no dedicated template field).
  const fenMark = readCoaPdfStats(record).fentanyl_detection;
  const fenLabel = fentanylDetectionLabel(fenMark);
  if (fenLabel) {
    const fenY = 236;
    const conformity = fenMark === 'none_detected' ? 'PASS' : 'FAIL';
    const conformityColor =
      fenMark === 'none_detected' ? rgb(0.05, 0.45, 0.2) : rgb(0.7, 0.1, 0.1);
    page.drawText('Fentanyl Detection', {
      x: 36,
      y: fenY,
      size: 9,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    page.drawText('None / Detected', {
      x: 138.7,
      y: fenY,
      size: 9,
      font,
      color: rgb(0.25, 0.25, 0.25),
    });
    page.drawText(toWinAnsi(fenLabel), {
      x: 256.6,
      y: fenY,
      size: 9,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    page.drawText(conformity, {
      x: 435,
      y: fenY,
      size: 9,
      font,
      color: conformityColor,
    });
  }

  if (record.chromatogram_image) {
    const chromImage = await embedDataUrl(pdf, record.chromatogram_image);
    if (chromImage) {
      // Cover the template chromatogram slot completely
      page.drawImage(chromImage, {
        x: CHROMATOGRAM_RECT.x,
        y: CHROMATOGRAM_RECT.y,
        width: CHROMATOGRAM_RECT.width,
        height: CHROMATOGRAM_RECT.height,
      });
    }
  }

  if (logoUrl) {
    const logoImage = await embedDataUrl(pdf, logoUrl);
    if (logoImage) {
      drawContainedImage(page, logoImage, {
        x: CHROMATOGRAM_RECT.x + CHROMATOGRAM_RECT.width * 0.28,
        y: CHROMATOGRAM_RECT.y + CHROMATOGRAM_RECT.height * 0.15,
        width: CHROMATOGRAM_RECT.width * 0.44,
        height: CHROMATOGRAM_RECT.height * 0.7,
      }, LOGO_WATERMARK_OPACITY);
    }
  }

  if (record.vial_image) {
    const vialImage = await embedDataUrl(pdf, record.vial_image);
    if (vialImage) {
      // Cover the template's stock vial completely so it cannot show through.
      page.drawRectangle({
        x: VIAL_PANEL_RECT.x,
        y: VIAL_PANEL_RECT.y,
        width: VIAL_PANEL_RECT.width,
        height: VIAL_PANEL_RECT.height,
        color: rgb(1, 1, 1),
        borderWidth: 0,
      });
      drawContainedImage(page, vialImage, VIAL_PHOTO_RECT);
    }
  }

  return pdf.save();
}

/** Open the filled COA PDF in a new browser tab (staff preview). */
export async function openCoaPdf(coa: COA): Promise<void> {
  const bytes = await buildCoaPdfBytes(coa);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    URL.revokeObjectURL(url);
    throw new Error('Pop-up blocked. Allow pop-ups to preview the PDF.');
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Download the filled COA PDF (client portal). */
export async function downloadCoaPdf(coa: COA): Promise<void> {
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
