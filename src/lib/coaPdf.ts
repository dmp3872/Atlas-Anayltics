import { PDFDocument, PDFImage } from 'pdf-lib';
import { COA } from './types';
import { buildCoaPdfFieldValues } from './coaPdfFields';

const TEMPLATE_URL = '/coa/certificate-of-analysis-template.pdf';
const CHROMATOGRAM_FIELD = 'Image3_af_image';

/** Left stock-vial graphic region on the A4 template (PDF user units). */
const VIAL_IMAGE_RECT = { x: 28, y: 400, width: 90, height: 95 };

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

function setTextField(form: ReturnType<PDFDocument['getForm']>, name: string, value: string) {
  try {
    form.getTextField(name).setText(value ?? '');
  } catch {
    // Field missing on template variant — ignore
  }
}

function triggerDownload(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Fill the Atlas COA template and download a flattened PDF for the given record. */
export async function downloadCoaPdf(coa: COA): Promise<void> {
  const templateRes = await fetch(TEMPLATE_URL);
  if (!templateRes.ok) {
    throw new Error('Could not load the Certificate of Analysis template.');
  }

  const templateBytes = await templateRes.arrayBuffer();
  const pdf = await PDFDocument.load(templateBytes);
  const form = pdf.getForm();
  const values = buildCoaPdfFieldValues(coa);

  for (const [name, value] of Object.entries(values)) {
    setTextField(form, name, value);
  }

  if (coa.chromatogram_image) {
    const chromImage = await embedDataUrl(pdf, coa.chromatogram_image);
    if (chromImage) {
      try {
        form.getButton(CHROMATOGRAM_FIELD).setImage(chromImage);
      } catch {
        const page = pdf.getPages()[0];
        page.drawImage(chromImage, {
          x: 125.735,
          y: 487.755,
          width: 453.447,
          height: 152.124,
        });
      }
    }
  }

  if (coa.vial_image) {
    const vialImage = await embedDataUrl(pdf, coa.vial_image);
    if (vialImage) {
      const page = pdf.getPages()[0];
      const { width: iw, height: ih } = vialImage;
      const { x, y, width, height } = VIAL_IMAGE_RECT;
      const scale = Math.min(width / iw, height / ih);
      const drawW = iw * scale;
      const drawH = ih * scale;
      page.drawImage(vialImage, {
        x: x + (width - drawW) / 2,
        y: y + (height - drawH) / 2,
        width: drawW,
        height: drawH,
      });
    }
  }

  try {
    form.flatten();
  } catch {
    // Some PDF readers still open unflattened filled forms
  }

  const saved = await pdf.save();
  const slug = (coa.slug || 'coa').replace(/[^\w.-]+/g, '_');
  triggerDownload(saved, `${slug}-coa.pdf`);
}
