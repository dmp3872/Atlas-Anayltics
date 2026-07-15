import { useRef, useState } from 'react';
import { UploadCloud, Trash2 } from 'lucide-react';

export const MAX_LOGO_BYTES = 1024 * 1024; // 1 MB file before compress
export const ACCEPTED_LOGO_TYPES = ['image/jpeg', 'image/png'];

/** Keep stored data URLs small so COA pages don't freeze. */
const MAX_DATA_URL_CHARS = 400_000;
const MAX_EDGE_PX = 1200;

async function compressToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
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
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let quality = 0.85;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (dataUrl.length > MAX_DATA_URL_CHARS && quality > 0.45) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  if (dataUrl.length > MAX_DATA_URL_CHARS) {
    throw new Error('Image is still too large after compression. Try a smaller photo.');
  }
  return dataUrl;
}

interface LogoDropzoneProps {
  value: string;
  onChange: (dataUrl: string) => void;
  onError?: (message: string) => void;
  compact?: boolean;
  hint?: string;
  maxBytes?: number;
  prompt?: string;
}

export default function LogoDropzone({
  value, onChange, onError, compact = false, hint, maxBytes = MAX_LOGO_BYTES, prompt = 'a logo',
}: LogoDropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const maxMb = Math.round(maxBytes / (1024 * 1024) * 10) / 10;
  const hintText = hint ?? `JPG or PNG, up to ${maxMb} MB`;

  function readFile(file: File) {
    if (!ACCEPTED_LOGO_TYPES.includes(file.type)) {
      onError?.('Image must be a JPG or PNG.');
      return;
    }
    if (file.size > maxBytes) {
      onError?.(`Image must be ${maxMb} MB or smaller.`);
      return;
    }
    void compressToDataUrl(file)
      .then(onChange)
      .catch(() => onError?.('Could not read that image. Try another file.'));
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) readFile(file);
          e.target.value = '';
        }}
      />
      {value ? (
        <div className="flex items-center gap-4 rounded-lg border border-neutral-200 p-3">
          <img
            src={value}
            alt="Upload preview"
            className="h-16 w-16 flex-shrink-0 rounded object-contain bg-neutral-50"
          />
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="btn-outline text-xs py-1.5 px-3"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={() => onChange('')}
              className="inline-flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700"
            >
              <Trash2 size={13} /> Remove
            </button>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-center cursor-pointer transition-colors ${
            compact ? 'px-3 py-4' : 'px-4 py-6'
          } ${
            dragging ? 'border-brand-500 bg-brand-50' : 'border-neutral-300 hover:border-brand-400 hover:bg-neutral-50'
          }`}
        >
          <UploadCloud size={compact ? 18 : 22} className="text-neutral-400" />
          <p className="text-sm text-neutral-600">
            <span className="font-semibold text-brand-600">Drop</span> {prompt} here or click to upload
          </p>
          <p className="text-xs text-neutral-400">{hintText}</p>
        </div>
      )}
    </>
  );
}
