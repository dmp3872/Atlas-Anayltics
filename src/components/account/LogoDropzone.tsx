import { useRef, useState } from 'react';
import { UploadCloud, Trash2 } from 'lucide-react';

export const MAX_LOGO_BYTES = 1024 * 1024; // 1 MB
export const ACCEPTED_LOGO_TYPES = ['image/jpeg', 'image/png'];

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
    const reader = new FileReader();
    reader.onload = () => onChange(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => onError?.('Could not read that image. Try another file.');
    reader.readAsDataURL(file);
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
