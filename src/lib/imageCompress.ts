/** Keep COA image data URLs small — multi‑MB base64 freezes browser tabs. */
export const MAX_COA_IMAGE_DATA_URL_CHARS = 220_000;
export const MAX_COA_IMAGE_EDGE_PX = 900;

function isBrowser(): boolean {
  return typeof document !== 'undefined' && typeof createImageBitmap === 'function';
}

async function bitmapFromDataUrl(dataUrl: string): Promise<ImageBitmap> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return createImageBitmap(blob);
}

/**
 * Re-encode a data URL (or leave non-data URLs alone) under size/edge caps.
 * Returns empty string if the payload is too large and cannot be compressed here.
 */
export async function compressImageDataUrl(
  src: string,
  opts?: { maxChars?: number; maxEdge?: number },
): Promise<string> {
  const input = (src || '').trim();
  if (!input.startsWith('data:image/')) return input;
  const maxChars = opts?.maxChars ?? MAX_COA_IMAGE_DATA_URL_CHARS;
  const maxEdge = opts?.maxEdge ?? MAX_COA_IMAGE_EDGE_PX;
  if (input.length <= maxChars) return input;
  if (!isBrowser()) return '';

  try {
    const bitmap = await bitmapFromDataUrl(input);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return '';
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    let quality = 0.82;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    while (dataUrl.length > maxChars && quality > 0.4) {
      quality -= 0.1;
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }
    return dataUrl.length > maxChars ? '' : dataUrl;
  } catch {
    return '';
  }
}

export async function compressImageFile(
  file: File,
  opts?: { maxChars?: number; maxEdge?: number },
): Promise<string> {
  if (!isBrowser()) throw new Error('Image compression requires a browser');
  const maxChars = opts?.maxChars ?? MAX_COA_IMAGE_DATA_URL_CHARS;
  const maxEdge = opts?.maxEdge ?? MAX_COA_IMAGE_EDGE_PX;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Could not process image');
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let quality = 0.85;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (dataUrl.length > maxChars && quality > 0.4) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  if (dataUrl.length > maxChars) {
    throw new Error('Image is still too large after compression. Try a smaller photo.');
  }
  return dataUrl;
}
