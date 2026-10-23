import { PDFDocument } from 'pdf-lib';

const PAGE_WIDTH_PT = 595.28;
const PAGE_HEIGHT_PT = 841.89;
const MARGIN_PT = 48;
const CONTENT_WIDTH_PT = PAGE_WIDTH_PT - MARGIN_PT * 2;
const SCALE = 2;

function slugifyFilename(title: string): string {
  const base = (title || 'lab-rd-sheet')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${base || 'lab-rd-sheet'}-rd.pdf`;
}

async function triggerDownload(bytes: Uint8Array, filename: string): Promise<void> {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4_000);
}

/**
 * Render sheet title + HTML body to a multi-page A4 PDF (Excel-style tables preserved).
 */
export async function downloadLabRdSheetPdf(title: string, contentHtml: string): Promise<void> {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-12000px;top:0;pointer-events:none;opacity:0;';

  const pxWidth = Math.round((CONTENT_WIDTH_PT / 72) * 96);
  host.innerHTML = `
    <div class="lab-rd-pdf-export lab-rd-editor" style="width:${pxWidth}px;background:#fff;padding:0;">
      <header class="lab-rd-pdf-header">
        <p class="lab-rd-pdf-brand">Atlas Labs · Lab R&amp;D</p>
        <h1 class="lab-rd-pdf-title"></h1>
        <p class="lab-rd-pdf-meta"></p>
      </header>
      <div class="lab-rd-editor-body lab-rd-pdf-body prose prose-sm max-w-none"></div>
    </div>
  `;

  const root = host.querySelector('.lab-rd-pdf-export') as HTMLElement;
  const titleEl = host.querySelector('.lab-rd-pdf-title') as HTMLElement;
  const metaEl = host.querySelector('.lab-rd-pdf-meta') as HTMLElement;
  const bodyEl = host.querySelector('.lab-rd-pdf-body') as HTMLElement;

  titleEl.textContent = title.trim() || 'Untitled sheet';
  metaEl.textContent = `Exported ${new Date().toLocaleString()}`;
  bodyEl.innerHTML = contentHtml || '<p></p>';

  document.body.appendChild(host);

  try {
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(root, {
      scale: SCALE,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    });

    const pdf = await PDFDocument.create();
    const cssWidth = canvas.width / SCALE;
    const cssHeight = canvas.height / SCALE;
    const drawWidth = CONTENT_WIDTH_PT;
    const drawHeight = (cssHeight / cssWidth) * drawWidth;

    const pageContentHeight = PAGE_HEIGHT_PT - MARGIN_PT * 2;
    let offsetY = 0;

    while (offsetY < drawHeight - 0.5) {
      const sliceHeight = Math.min(pageContentHeight, drawHeight - offsetY);
      const page = pdf.addPage([PAGE_WIDTH_PT, PAGE_HEIGHT_PT]);

      const sliceCanvas = document.createElement('canvas');
      const srcY = (offsetY / drawHeight) * canvas.height;
      const srcH = (sliceHeight / drawHeight) * canvas.height;
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = Math.ceil(srcH);
      const ctx = sliceCanvas.getContext('2d');
      if (!ctx) throw new Error('Could not render PDF slice');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(
        canvas,
        0,
        srcY,
        canvas.width,
        srcH,
        0,
        0,
        canvas.width,
        sliceCanvas.height,
      );

      const pngBytes = await new Promise<Uint8Array>((resolve, reject) => {
        sliceCanvas.toBlob(blob => {
          if (!blob) {
            reject(new Error('Could not encode PDF page'));
            return;
          }
          blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)));
        }, 'image/png');
      });

      const image = await pdf.embedPng(pngBytes);
      const sliceDrawHeight = (sliceCanvas.height / SCALE / cssWidth) * drawWidth;
      page.drawImage(image, {
        x: MARGIN_PT,
        y: PAGE_HEIGHT_PT - MARGIN_PT - sliceDrawHeight,
        width: drawWidth,
        height: sliceDrawHeight,
      });

      offsetY += sliceHeight;
    }

    const bytes = await pdf.save();
    await triggerDownload(bytes, slugifyFilename(title));
  } finally {
    host.remove();
  }
}
