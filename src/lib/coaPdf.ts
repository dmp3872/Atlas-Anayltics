import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb, RGB } from 'pdf-lib';
import { COA, PanelResult } from './types';
import { buildCoaPdfFieldValues } from './coaPdfFields';
import {
  fentanylDetectionLabel,
  hydrateCoaImages,
  readCoaPdfStats,
  resolveCoaWatermark,
  resolveImageAsDataUrl,
  prepareVialImage,
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

export function coaPngFilename(coa: Pick<COA, 'slug'> | string): string {
  const slug = (typeof coa === 'string' ? coa : coa.slug || 'coa').replace(/[^\w.-]+/g, '_');
  return `${slug}-coa.png`;
}

export function coaDigitalPdfFilename(coa: Pick<COA, 'slug'> | string): string {
  const slug = (typeof coa === 'string' ? coa : coa.slug || 'coa').replace(/[^\w.-]+/g, '_');
  return `${slug}-coa.pdf`;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/i.exec(dataUrl);
  if (!match) return new Blob([dataUrl], { type: 'application/octet-stream' });
  const mime = match[1] || 'application/octet-stream';
  const isBase64 = Boolean(match[2]);
  const data = match[3] || '';
  if (!isBase64) {
    return new Blob([decodeURIComponent(data)], { type: mime });
  }
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Prefer blob: URLs — large data: PNG hrefs often fail silently in Chrome. */
function triggerBrowserDownload(href: string, filename: string) {
  const a = document.createElement('a');
  let objectUrl = '';
  if (href.startsWith('data:')) {
    objectUrl = URL.createObjectURL(dataUrlToBlob(href));
    a.href = objectUrl;
  } else {
    a.href = href;
  }
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (objectUrl) {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 4_000);
  }
}

/** Throws SecurityError (“The operation is insecure”) when the canvas is tainted. */
function assertCanvasReadable(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('PNG encode failed');
  ctx.getImageData(0, 0, 1, 1);
}

async function triggerCanvasDownload(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  assertCanvasReadable(canvas);
  const blob = await new Promise<Blob | null>(resolve => {
    canvas.toBlob(resolve, 'image/png');
  });
  if (!blob) {
    // Some browsers return null instead of throwing when the canvas is tainted.
    triggerBrowserDownload(canvas.toDataURL('image/png'), filename);
    return;
  }
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

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

function certificateTitleReady(text: string): boolean {
  return text.includes('CERTIFICATE') || text.includes('Certificate of Analysis');
}

async function waitForIframeLoad(iframe: HTMLIFrameElement, timeoutMs: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      fn();
    };
    const timer = window.setTimeout(
      () => finish(() => reject(new Error('Certificate load timed out'))),
      timeoutMs,
    );
    iframe.addEventListener('load', () => finish(resolve), { once: true });
    iframe.addEventListener('error', () => finish(() => reject(new Error('Failed to load certificate'))), {
      once: true,
    });
    // Cached navigations can finish before listeners attach.
    try {
      if (iframe.contentDocument?.readyState === 'complete') finish(resolve);
    } catch {
      /* ignore cross-document access races */
    }
  });
}

/** Wait until the live certificate layout is mounted and images have finished loading. */
async function waitForCertificateRoot(iframe: HTMLIFrameElement, timeoutMs = 45000): Promise<HTMLElement> {
  await waitForIframeLoad(iframe, timeoutMs);

  const started = Date.now();
  let stableHits = 0;
  let lastRoot: HTMLElement | null = null;

  while (Date.now() - started < timeoutMs) {
    const doc = iframe.contentDocument;
    if (!doc?.body) {
      await sleep(120);
      continue;
    }

    const text = doc.body.innerText || '';
    if (text.includes('COA Not Found')) throw new Error('COA not found');

    const root = doc.querySelector('.coa-print-root');
    if (root instanceof HTMLElement && certificateTitleReady(text)) {
      const imgs = Array.from(root.querySelectorAll('img'));
      const imgsReady = imgs.every(img => img.complete);
      if (imgsReady) {
        if (root === lastRoot) stableHits += 1;
        else {
          lastRoot = root;
          stableHits = 1;
        }
        // Auth / phase-2 image hydration can remount the tree once — require two stable polls.
        if (stableHits >= 2) {
          try {
            await doc.fonts.ready;
          } catch {
            /* ignore */
          }
          await sleep(150);
          const fresh = doc.querySelector('.coa-print-root');
          if (fresh instanceof HTMLElement && certificateTitleReady(doc.body.innerText || '')) {
            return fresh;
          }
          stableHits = 0;
          lastRoot = null;
        }
      } else {
        stableHits = 0;
      }
    } else {
      stableHits = 0;
      lastRoot = null;
    }
    await sleep(120);
  }
  throw new Error('Certificate load timed out');
}

function sleepMs(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Decode / wait for every <img>, with a short timeout so export never hangs. */
async function waitForImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.all(
    imgs.map(async img => {
      const src = (img.currentSrc || img.src || '').trim();
      if (!src) return;
      // Absolute same-origin paths are more reliable for canvas paints than relative ones.
      if (src.startsWith('/') && typeof window !== 'undefined') {
        img.src = `${window.location.origin}${src}`;
      }
      const ready = (async () => {
        try {
          if (typeof img.decode === 'function') {
            await img.decode();
            return;
          }
        } catch {
          /* fall through */
        }
        if (img.complete && img.naturalWidth > 0) return;
        await new Promise<void>(resolve => {
          const done = () => resolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
          if (!img.complete) {
            const again = img.src;
            img.src = again;
          } else {
            resolve();
          }
        });
      })();
      await Promise.race([ready, sleepMs(2500)]);
    }),
  );
}

/** Give SVG chromatograms explicit pixel size (flex-only SVGs often capture empty). */
function sizeSvgsForCapture(root: HTMLElement): Array<() => void> {
  const undo: Array<() => void> = [];
  root.querySelectorAll('svg').forEach(svg => {
    const rect = svg.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width || svg.clientWidth || 720));
    const h = Math.max(1, Math.round(rect.height || svg.clientHeight || 200));
    const prevW = svg.getAttribute('width');
    const prevH = svg.getAttribute('height');
    const prevStyle = svg.getAttribute('style') || '';
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.style.width = `${w}px`;
    svg.style.height = `${h}px`;
    undo.push(() => {
      if (prevW == null) svg.removeAttribute('width');
      else svg.setAttribute('width', prevW);
      if (prevH == null) svg.removeAttribute('height');
      else svg.setAttribute('height', prevH);
      if (prevStyle) svg.setAttribute('style', prevStyle);
      else svg.removeAttribute('style');
    });
  });
  return undo;
}

function parseObjectPosition(value: string): { x: number; y: number } {
  const parts = (value || 'center').trim().split(/\s+/);
  const map = (token: string, fallback: number) => {
    if (token === 'left' || token === 'top') return 0;
    if (token === 'right' || token === 'bottom') return 1;
    if (token === 'center') return 0.5;
    if (token.endsWith('%')) {
      const n = Number.parseFloat(token);
      return Number.isFinite(n) ? n / 100 : fallback;
    }
    return fallback;
  };
  return {
    x: map(parts[0] || 'center', 0.5),
    y: map(parts[1] || parts[0] || 'center', 0.5),
  };
}

/** Draw a live <img> into the export canvas using CSS object-fit / object-position. */
function drawImageObjectFit(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  objectFit: string,
  objectPosition: string,
) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (iw < 1 || ih < 1 || dw < 1 || dh < 1) return;

  const fit = (objectFit || 'fill').toLowerCase();
  if (fit === 'fill' || fit === 'none' || fit === 'scale-down') {
    ctx.drawImage(img, dx, dy, dw, dh);
    return;
  }

  const pos = parseObjectPosition(objectPosition);
  if (fit === 'contain') {
    const scale = Math.min(dw / iw, dh / ih);
    const tw = iw * scale;
    const th = ih * scale;
    const ox = dx + (dw - tw) * pos.x;
    const oy = dy + (dh - th) * pos.y;
    ctx.drawImage(img, ox, oy, tw, th);
    return;
  }

  // cover
  const scale = Math.max(dw / iw, dh / ih);
  const sw = Math.min(iw, dw / scale);
  const sh = Math.min(ih, dh / scale);
  const sx = Math.max(0, Math.min(iw - sw, (iw - sw) * pos.x));
  const sy = Math.max(0, Math.min(ih - sh, (ih - sh) * pos.y));
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

/**
 * Re-encode every <img> through a local canvas so later draws cannot taint
 * the export (Safari: “The operation is insecure”).
 */
async function bakeImagesToSafeDataUrls(root: HTMLElement): Promise<() => void> {
  const restores: Array<() => void> = [];
  const imgs = Array.from(root.querySelectorAll('img'));

  for (const img of imgs) {
    if (!(img instanceof HTMLImageElement)) continue;
    const prevAttr = img.getAttribute('src');
    const prevSrc = img.src;
    if (!img.complete || img.naturalWidth < 1) continue;

    try {
      const maxEdge = 1200;
      const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) continue;

      const keepAlpha = Boolean(
        img.closest('.coa-header-bar')
        || img.getAttribute('aria-hidden') === 'true'
        || /png/i.test(img.currentSrc || img.src || ''),
      );
      if (!keepAlpha) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(img, 0, 0, w, h);
      ctx.getImageData(0, 0, 1, 1); // throws if this source is tainted
      const dataUrl = keepAlpha
        ? c.toDataURL('image/png')
        : c.toDataURL('image/jpeg', 0.9);

      restores.push(() => {
        if (prevAttr == null) img.removeAttribute('src');
        else img.setAttribute('src', prevAttr);
        if (prevSrc && img.src !== prevSrc && !prevAttr) img.src = prevSrc;
      });
      img.removeAttribute('crossorigin');
      img.src = dataUrl;
      await Promise.race([
        typeof img.decode === 'function' ? img.decode().catch(() => undefined) : Promise.resolve(),
        sleepMs(1500),
      ]);
    } catch {
      // Leave original — paint step will skip if still unsafe.
    }
  }

  return () => restores.forEach(fn => fn());
}

/**
 * Re-paint live decoded images on top of the capture.
 * Skips any image that would taint the export canvas.
 */
function paintLiveImagesOntoCanvas(canvas: HTMLCanvasElement, root: HTMLElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const rootRect = root.getBoundingClientRect();
  if (rootRect.width < 1 || rootRect.height < 1) return;
  const scaleX = canvas.width / rootRect.width;
  const scaleY = canvas.height / rootRect.height;

  root.querySelectorAll('img').forEach(img => {
    if (!(img instanceof HTMLImageElement)) return;
    if (img.closest('.no-print')) return;
    if (!img.complete || img.naturalWidth < 1) return;
    const style = window.getComputedStyle(img);
    if (style.visibility === 'hidden' || style.display === 'none') return;
    const opacity = Number.parseFloat(style.opacity || '1');
    if (!(opacity > 0.01)) return;

    // Paint into the visible photo frame (not a CSS-scaled img bbox) so a
    // scale-[1.06] vial does not cover the 3 mL label or info rows above.
    const frame = img.parentElement;
    const frameStyle = frame ? window.getComputedStyle(frame) : null;
    const useFrame = Boolean(
      frame
      && (frameStyle?.overflow === 'hidden' || frameStyle?.overflow === 'clip'),
    );
    const r = (useFrame ? frame!.getBoundingClientRect() : img.getBoundingClientRect());
    if (r.width < 2 || r.height < 2) return;

    // Probe: never draw a tainted bitmap onto the export canvas.
    try {
      const probe = document.createElement('canvas');
      probe.width = 1;
      probe.height = 1;
      const pctx = probe.getContext('2d');
      if (!pctx) return;
      pctx.drawImage(img, 0, 0, 1, 1);
      pctx.getImageData(0, 0, 1, 1);
    } catch {
      return;
    }

    const dx = (r.left - rootRect.left) * scaleX;
    const dy = (r.top - rootRect.top) * scaleY;
    const dw = r.width * scaleX;
    const dh = r.height * scaleY;

    ctx.save();
    ctx.globalAlpha = opacity;

    let node: HTMLElement | null = img.parentElement;
    while (node && node !== root) {
      const overflow = window.getComputedStyle(node).overflow;
      if (overflow === 'hidden' || overflow === 'clip') {
        const cr = node.getBoundingClientRect();
        ctx.beginPath();
        ctx.rect(
          (cr.left - rootRect.left) * scaleX,
          (cr.top - rootRect.top) * scaleY,
          cr.width * scaleX,
          cr.height * scaleY,
        );
        ctx.clip();
      }
      node = node.parentElement;
    }

    try {
      drawImageObjectFit(ctx, img, dx, dy, dw, dh, style.objectFit, style.objectPosition);
    } catch {
      /* skip */
    }
    ctx.restore();
  });
}

/** Fixed desktop certificate width — never inherit a half-open browser window. */
const COA_EXPORT_WIDTH_PX = 896;
const COA_EXPORT_WINDOW_WIDTH = 1280;

/** Rasterize the live digital certificate (Safari-safe). Shared by PNG/PDF export. */
async function captureCoaCertificateCanvas(root: HTMLElement): Promise<HTMLCanvasElement> {
  const html2canvas = (await import('html2canvas')).default;

  const hadExportClass = root.classList.contains('coa-png-export');
  root.classList.add('coa-png-export');

  const hidden: HTMLElement[] = [];
  root.querySelectorAll('.no-print').forEach(el => {
    const node = el as HTMLElement;
    hidden.push(node);
    node.dataset._pngHide = '1';
    node.style.display = 'none';
  });

  const prevInline = {
    background: root.style.background,
    transform: root.style.transform,
    width: root.style.width,
    maxWidth: root.style.maxWidth,
    margin: root.style.margin,
  };
  root.style.background = '#ffffff';
  root.style.transform = 'none';
  // Lock live layout to desktop certificate width before measuring/capturing.
  root.style.width = `${COA_EXPORT_WIDTH_PX}px`;
  root.style.maxWidth = `${COA_EXPORT_WIDTH_PX}px`;
  root.style.margin = '0 auto';

  let undoSvgs: Array<() => void> = [];
  let undoBake: (() => void) | null = null;
  const prevScrollX = window.scrollX;
  const prevScrollY = window.scrollY;
  try {
    // Scroll to top first — a mid-page scrollY makes html2canvas shift content
    // down so info rows / vial “3 mL” badge get clipped.
    window.scrollTo(0, 0);
    root.scrollIntoView({ block: 'start' });
    await waitForImages(root);
    undoBake = await bakeImagesToSafeDataUrls(root);
    undoSvgs = sizeSvgsForCapture(root);
    // Let desktop export CSS reflow (grids, table padding) before capture.
    await sleepMs(120);
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    const rect = root.getBoundingClientRect();
    const captureHeight = Math.ceil(Math.max(root.scrollHeight, rect.height, 1100));

    const runCapture = (ignoreImages: boolean) =>
      html2canvas(root, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        // Safari: foreignObject path throws “The operation is insecure”.
        foreignObjectRendering: false,
        backgroundColor: '#ffffff',
        width: COA_EXPORT_WIDTH_PX,
        height: captureHeight,
        // Always desktop viewport so Tailwind `sm:` never collapses the COA.
        windowWidth: COA_EXPORT_WINDOW_WIDTH,
        windowHeight: captureHeight + 120,
        x: 0,
        y: 0,
        scrollX: 0,
        scrollY: 0,
        logging: false,
        imageTimeout: 8_000,
        onclone: (_doc, cloned) => {
          cloned.classList.add('coa-png-export');
          cloned.style.background = '#ffffff';
          cloned.style.transform = 'none';
          cloned.style.minHeight = '0';
          cloned.style.height = 'auto';
          cloned.style.width = `${COA_EXPORT_WIDTH_PX}px`;
          cloned.style.maxWidth = `${COA_EXPORT_WIDTH_PX}px`;
          cloned.style.margin = '0 auto';
          cloned.style.overflow = 'visible';
          cloned.querySelectorAll('.no-print').forEach(el => {
            (el as HTMLElement).style.display = 'none';
          });
          cloned.querySelectorAll('.coa-print-vial img').forEach(img => {
            (img as HTMLElement).style.transform = 'none';
          });
          cloned.querySelectorAll('.coa-table-wrap').forEach(el => {
            (el as HTMLElement).style.overflow = 'visible';
          });
          cloned.querySelectorAll('.coa-print-table td, .coa-print-table th').forEach(el => {
            const node = el as HTMLElement;
            node.style.overflow = 'visible';
            node.style.lineHeight = '1.45';
            node.style.paddingTop = '0.45rem';
            node.style.paddingBottom = '0.45rem';
            node.style.whiteSpace = 'normal';
          });
          cloned.querySelectorAll('.coa-info-value, .coa-vial-size-badge p, .coa-info-label, .coa-stat-card .text-xl').forEach(el => {
            const node = el as HTMLElement;
            node.style.overflow = 'visible';
            node.style.lineHeight = '1.4';
            node.style.textOverflow = 'clip';
          });
          cloned.querySelectorAll('.truncate').forEach(el => {
            const node = el as HTMLElement;
            node.style.overflow = 'visible';
            node.style.textOverflow = 'clip';
            node.style.whiteSpace = 'normal';
          });
          if (ignoreImages) {
            cloned.querySelectorAll('img').forEach(img => {
              (img as HTMLElement).style.visibility = 'hidden';
            });
          }
        },
        ignoreElements: el => {
          if (!(el instanceof HTMLElement)) return false;
          if (el.classList.contains('no-print') || el.dataset._pngHide === '1') return true;
          return ignoreImages && el.tagName === 'IMG';
        },
      });

    let canvas = await Promise.race([
      runCapture(false),
      sleepMs(20_000).then(() => {
        throw new Error('Certificate capture timed out');
      }),
    ]);

    try {
      assertCanvasReadable(canvas);
    } catch {
      // Retry without embedding <img>, then stamp safe live bitmaps (Safari).
      canvas = await runCapture(true);
      paintLiveImagesOntoCanvas(canvas, root);
      assertCanvasReadable(canvas);
    }

    return canvas;
  } finally {
    window.scrollTo(prevScrollX, prevScrollY);
    undoBake?.();
    undoSvgs.forEach(fn => fn());
    hidden.forEach(node => {
      if (node.dataset._pngHide === '1') {
        node.style.display = '';
        delete node.dataset._pngHide;
      }
    });
    root.style.background = prevInline.background;
    root.style.transform = prevInline.transform;
    root.style.width = prevInline.width;
    root.style.maxWidth = prevInline.maxWidth;
    root.style.margin = prevInline.margin;
    if (!hadExportClass) root.classList.remove('coa-png-export');
  }
}

async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  assertCanvasReadable(canvas);
  const blob = await new Promise<Blob | null>(resolve => {
    canvas.toBlob(resolve, 'image/png');
  });
  if (!blob) throw new Error('Could not encode certificate image');
  return new Uint8Array(await blob.arrayBuffer());
}

async function triggerPdfBytesDownload(bytes: Uint8Array, filename: string): Promise<void> {
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
 * Capture the live digital certificate and wrap it in a single-page PDF download.
 */
export async function downloadCoaPdfFromElement(root: HTMLElement, filename: string): Promise<void> {
  const canvas = await captureCoaCertificateCanvas(root);
  const pngBytes = await canvasToPngBytes(canvas);
  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(pngBytes);
  // Capture uses scale:2 — page size in CSS pixels (points ≈ px for screen export).
  const pageWidth = canvas.width / 2;
  const pageHeight = canvas.height / 2;
  const page = pdf.addPage([pageWidth, pageHeight]);
  page.drawImage(image, {
    x: 0,
    y: 0,
    width: pageWidth,
    height: pageHeight,
  });
  const bytes = await pdf.save();
  await triggerPdfBytesDownload(bytes, filename);
}

/** @deprecated Prefer {@link downloadCoaPdfFromElement}. */
export async function downloadCoaPngFromElement(root: HTMLElement, filename: string): Promise<void> {
  const canvas = await captureCoaCertificateCanvas(root);
  await triggerCanvasDownload(canvas, filename);
}

/**
 * Load the live portal COA in a hidden iframe and download it as a PDF.
 */
export async function downloadCoaPdfFromSlug(slug: string, filename?: string): Promise<void> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.title = 'COA export';
  iframe.style.cssText =
    `position:fixed;left:0;top:0;width:${COA_EXPORT_WINDOW_WIDTH}px;height:1800px;border:0;opacity:0;pointer-events:none;z-index:-1;`;
  iframe.src = `/coa/${encodeURIComponent(slug)}?export=1`;
  document.body.appendChild(iframe);

  try {
    const root = await waitForCertificateRoot(iframe);
    await downloadCoaPdfFromElement(root, filename || coaDigitalPdfFilename(slug));
  } finally {
    iframe.remove();
  }
}

/** @deprecated Prefer {@link downloadCoaPdfFromSlug}. */
export async function downloadCoaPng(slug: string, filename?: string): Promise<void> {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.title = 'COA export';
  iframe.style.cssText =
    'position:fixed;left:0;top:0;width:900px;height:1400px;border:0;opacity:0;pointer-events:none;z-index:-1;';
  iframe.src = `/coa/${encodeURIComponent(slug)}?export=1`;
  document.body.appendChild(iframe);

  try {
    const root = await waitForCertificateRoot(iframe);
    await downloadCoaPngFromElement(root, filename || coaPngFilename(slug));
  } finally {
    iframe.remove();
  }
}

/** @deprecated Prefer {@link downloadCoaPdf}. */
export async function downloadCoaPngForCoa(coa: COA): Promise<void> {
  await downloadCoaPdfFromSlug(coa.slug, coaDigitalPdfFilename(coa));
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

/** Fill the rect (cover), zoomed slightly, centered — for vial product shots. */
function drawCoveredImage(
  page: PDFPage,
  image: PDFImage,
  rect: { x: number; y: number; width: number; height: number },
  zoom = 1.12,
) {
  const { width: iw, height: ih } = image;
  const scale = Math.max(rect.width / iw, rect.height / ih) * zoom;
  const drawW = iw * scale;
  const drawH = ih * scale;
  page.drawImage(image, {
    x: rect.x + (rect.width - drawW) / 2,
    y: rect.y + (rect.height - drawH) / 2,
    width: drawW,
    height: drawH,
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
  if (!panel) return { result: 'Not Detected', pass: true };
  const result = (panel.result || '').trim() || 'Not Detected';
  return { result, pass: panel.pass };
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
    ['Fentanyl Detection', 'Not Detected', fenLabel, conf],
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
    const conformity = pass ? 'PASS' : 'FAIL';
    drawDataRow(
      page,
      bottom,
      [metal.name, metal.limit, result, conformity],
      fonts,
      {
        boldFirst: false,
        confColor: conformity === 'PASS' ? rgb(0.05, 0.45, 0.2) : rgb(0.75, 0.08, 0.08),
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

  // HPLC box: unique chromatograph photo (if uploaded), then client watermark logo on top.
  page.drawRectangle({
    x: CHROMATOGRAM_RECT.x,
    y: CHROMATOGRAM_RECT.y,
    width: CHROMATOGRAM_RECT.width,
    height: CHROMATOGRAM_RECT.height,
    color: rgb(1, 1, 1),
    borderWidth: 0,
  });
  const hplcSrc = (record.hplc_image || '').trim();
  if (hplcSrc) {
    const hplcImage = await embedImageSource(pdf, hplcSrc);
    if (hplcImage) {
      // Contain (not cover) so the full chromatogram graph stays visible.
      drawContainedImage(page, hplcImage, {
        x: CHROMATOGRAM_RECT.x + 2,
        y: CHROMATOGRAM_RECT.y + 2,
        width: CHROMATOGRAM_RECT.width - 4,
        height: CHROMATOGRAM_RECT.height - 4,
      });
    }
  }
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
    const prepared = await prepareVialImage(record.vial_image);
    const vialImage = await embedImageSource(pdf, prepared || record.vial_image);
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
      drawCoveredImage(page, vialImage, {
        x: frame.x + VIAL_PHOTO_INSET,
        y: frame.y + VIAL_PHOTO_INSET,
        width: frame.width - VIAL_PHOTO_INSET * 2,
        height: frame.height - VIAL_PHOTO_INSET * 2,
      }, 1.1);
    }
  }

  return pdf.save();
}

/**
 * Open the live portal COA page (web view, no auto-print).
 * Prefer {@link downloadCoaPdf} for chemist file export.
 */
export function openCoaPrintView(slug: string): void {
  const path = `/coa/${encodeURIComponent(slug)}`;
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

/** Open the portal COA web view. */
export async function openCoaPdf(coa: COA, previewWindow?: Window | null): Promise<void> {
  const path = `/coa/${encodeURIComponent(coa.slug)}`;
  if (previewWindow && !previewWindow.closed) {
    previewWindow.location.href = path;
    return;
  }
  openCoaPrintView(coa.slug);
}

/** Download the on-screen digital certificate as a PDF. */
export async function downloadCoaPdf(coa: COA): Promise<void> {
  await downloadCoaPdfFromSlug(coa.slug, coaDigitalPdfFilename(coa));
}

/** Template-based PDF (legacy prep path). Prefer {@link downloadCoaPdf}. */
export async function downloadCoaPdfBlob(coa: COA): Promise<void> {
  const bytes = await buildCoaPdfBytes(coa);
  await triggerPdfBytesDownload(bytes, coaFilename(coa));
}
