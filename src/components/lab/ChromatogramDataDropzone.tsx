import { useRef, useState } from 'react';
import { FileSpreadsheet, Loader, Trash2, Upload } from 'lucide-react';
import {
  parseChromatogramFile,
  parseChromatogramText,
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
  const [dragOver, setDragOver] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');

  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const next = await parseChromatogramFile(file);
      onParsed(next);
      setPasteOpen(false);
      setPasteText('');
    } catch (err) {
      onParsed(null);
      onError?.(err instanceof Error ? err.message : 'Could not read chromatogram data.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function handlePasteParse() {
    setBusy(true);
    try {
      const next = parseChromatogramText(pasteText, 'pasted-chromatogram.csv');
      onParsed(next);
      setPasteOpen(false);
    } catch (err) {
      onParsed(null);
      onError?.(err instanceof Error ? err.message : 'Could not parse pasted chromatogram data.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`rounded-lg border border-dashed bg-neutral-50/80 p-3 transition-colors ${
        dragOver ? 'border-brand-500 bg-brand-50/40' : 'border-atlas-border'
      }`}
      onDragEnter={e => { e.preventDefault(); setDragOver(true); }}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={e => { e.preventDefault(); setDragOver(false); }}
      onDrop={e => {
        e.preventDefault();
        setDragOver(false);
        void handleFile(e.dataTransfer.files?.[0]);
      }}
    >
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
        <div className="space-y-2">
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
              Drop CSV/TSV here, or click to browse — columns: retention time + intensity
            </span>
          </button>
          <div className="flex justify-center">
            <button
              type="button"
              className="text-xs font-semibold text-brand-700 hover:text-brand-800"
              onClick={() => setPasteOpen(v => !v)}
            >
              {pasteOpen ? 'Hide paste box' : 'Or paste CSV / TSV text'}
            </button>
          </div>
          {pasteOpen && (
            <div className="space-y-2">
              <textarea
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                rows={5}
                className="input-field font-mono text-xs"
                placeholder={'Time,Intensity\n0.0,0.1\n1.2,45.0\n…'}
              />
              <button
                type="button"
                disabled={busy || !pasteText.trim()}
                onClick={handlePasteParse}
                className="btn-outline text-xs py-1.5 w-full"
              >
                Parse pasted data
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
