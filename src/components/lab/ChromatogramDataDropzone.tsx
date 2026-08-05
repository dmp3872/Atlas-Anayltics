import { useRef, useState } from 'react';
import { FileSpreadsheet, Loader, Trash2, Upload } from 'lucide-react';
import {
  parseChromatogramFile,
  type ParsedChromatogram,
} from '../../lib/chromatogramParse';

interface Props {
  parsed: ParsedChromatogram | null;
  onParsed: (next: ParsedChromatogram | null) => void;
  onError?: (message: string) => void;
}

export default function ChromatogramDataDropzone({ parsed, onParsed, onError }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const next = await parseChromatogramFile(file);
      onParsed(next);
    } catch (err) {
      onParsed(null);
      onError?.(err instanceof Error ? err.message : 'Could not read chromatogram data.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-atlas-border bg-neutral-50/80 p-3">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.tsv,.txt,.chrom,text/csv,text/plain,text/tab-separated-values"
        className="hidden"
        onChange={e => void handleFile(e.target.files?.[0])}
      />
      {parsed ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex items-start gap-2">
            <FileSpreadsheet size={18} className="text-brand-700 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-black truncate">
                {parsed.source_filename || 'Chromatogram data'}
              </p>
              <p className="text-xs text-neutral-500 mt-0.5">
                {parsed.original_count.toLocaleString()} points
                {parsed.points.length < parsed.original_count
                  ? ` · stored ${parsed.points.length.toLocaleString()} for display`
                  : ''}
                {' · '}main RT {parsed.retention_time} min
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              className="btn-outline text-xs py-1 px-2"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              Replace
            </button>
            <button
              type="button"
              className="p-1.5 text-neutral-400 hover:text-red-600"
              aria-label="Remove chromatogram data"
              disabled={busy}
              onClick={() => onParsed(null)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="w-full flex flex-col items-center justify-center gap-1.5 py-4 text-center hover:bg-white/70 rounded-md transition-colors disabled:opacity-60"
        >
          {busy ? (
            <Loader size={18} className="text-brand-600 animate-spin" />
          ) : (
            <Upload size={18} className="text-brand-700" />
          )}
          <span className="text-sm font-semibold text-black">
            {busy ? 'Reading file…' : 'Attach raw chromatogram data'}
          </span>
          <span className="text-xs text-neutral-500 px-2">
            CSV / TSV with retention time and intensity columns
          </span>
        </button>
      )}
    </div>
  );
}
