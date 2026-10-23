import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen, FileDown, Loader2, Plus, Save, Trash2, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { downloadLabRdSheetPdf } from '../../lib/labRdSheetPdf';
import { LabRdSheet } from '../../lib/types';
import {
  createLabRdSheet,
  deleteLabRdSheet,
  fetchLabRdSheets,
  updateLabRdSheet,
} from '../../lib/labRdSheets';
import { normalizeSheetContent } from '../../lib/labRdSheetContent';
import { formatDateTime } from '../../lib/utils';
import LabRdRichEditor from './LabRdRichEditor';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface Props {
  userId: string;
}

export default function LabRdNotesPanel({ userId }: Props) {
  const [sheets, setSheets] = useState<LabRdSheet[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = sheets.find(s => s.id === selectedId) ?? null;

  const loadSheets = useCallback(async (preferId?: string) => {
    setLoadError('');
    try {
      const rows = await fetchLabRdSheets();
      setSheets(rows);
      const nextId = preferId && rows.some(r => r.id === preferId)
        ? preferId
        : rows[0]?.id ?? null;
      setSelectedId(nextId);
      const row = rows.find(r => r.id === nextId);
      if (row) {
        setTitle(row.title);
        setContent(normalizeSheetContent(row.content_md));
        setIsDirty(false);
      } else {
        setTitle('');
        setContent('');
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load R&D sheets.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSheets();
  }, [loadSheets]);

  useEffect(() => {
    if (!selected) return;
    setTitle(selected.title);
    setContent(normalizeSheetContent(selected.content_md));
    setIsDirty(false);
    setSaveState('idle');
    setSaveError('');
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback(async (id: string, nextTitle: string, nextContent: string) => {
    setSaveState('saving');
    setSaveError('');
    try {
      const updated = await updateLabRdSheet(id, userId, {
        title: nextTitle,
        content_md: nextContent,
      });
      setSheets(prev => {
        const rest = prev.filter(s => s.id !== id);
        return [updated, ...rest].sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        );
      });
      setIsDirty(false);
      setSaveState('saved');
    } catch (err) {
      setSaveState('error');
      setSaveError(err instanceof Error ? err.message : 'Save failed.');
    }
  }, [userId]);

  function scheduleSave(nextTitle: string, nextContent: string) {
    if (!selectedId) return;
    setIsDirty(true);
    setSaveState('idle');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void persist(selectedId, nextTitle, nextContent);
    }, 900);
  }

  function handleTitleChange(value: string) {
    setTitle(value);
    scheduleSave(value, content);
  }

  function handleContentChange(html: string) {
    setContent(html);
    scheduleSave(title, html);
  }

  async function handleManualSave() {
    if (!selectedId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await persist(selectedId, title, content);
  }

  async function handleNewSheet() {
    setLoading(true);
    try {
      const created = await createLabRdSheet({ userId });
      await loadSheets(created.id);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not create sheet.');
      setLoading(false);
    }
  }

  async function handleExportPdf() {
    if (!selected) return;
    setExportingPdf(true);
    setSaveError('');
    try {
      if (isDirty && selectedId) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        await persist(selectedId, title, content);
      }
      await downloadLabRdSheetPdf(title, content);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'PDF export failed.');
      setSaveState('error');
    } finally {
      setExportingPdf(false);
    }
  }

  async function handleDelete() {
    if (!selectedId || !selected) return;
    if (!confirm(`Delete “${selected.title}”? This cannot be undone.`)) return;
    try {
      await deleteLabRdSheet(selectedId);
      await loadSheets();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Delete failed.');
      setSaveState('error');
    }
  }

  function selectSheet(id: string) {
    if (id === selectedId) return;
    if (isDirty && selectedId) {
      void persist(selectedId, title, content);
    }
    setSelectedId(id);
  }

  if (loading && sheets.length === 0) {
    return (
      <div className="card p-12 flex items-center justify-center gap-2 text-neutral-500">
        <Loader2 size={18} className="animate-spin" />
        Loading R&D notes…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-black flex items-center gap-2">
            <BookOpen size={20} className="text-brand-600" />
            Lab R&D
          </h2>
          <p className="text-sm text-neutral-500 mt-1 max-w-2xl">
            Visual notebooks for protocols and study notes — edit directly on the page like a document or spreadsheet.
            Paste from Excel to import tables; export any sheet as PDF. Sheets auto-save to the lab database.
          </p>
        </div>
        <button type="button" onClick={() => void handleNewSheet()} className="btn-primary gap-2 text-sm">
          <Plus size={16} />
          New sheet
        </button>
      </div>

      {(loadError || saveError) && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          {loadError || saveError}
        </div>
      )}

      {sheets.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-neutral-600 mb-4">No R&D sheets yet. Create your first notebook.</p>
          <button type="button" onClick={() => void handleNewSheet()} className="btn-primary gap-2">
            <Plus size={16} />
            New sheet
          </button>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[240px_minmax(0,1fr)] gap-4 min-h-[560px]">
          <aside className="card p-2 flex flex-col max-h-[720px]">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 px-2 py-2">Sheets</p>
            <ul className="flex-1 overflow-y-auto space-y-0.5">
              {sheets.map(s => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => selectSheet(s.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      s.id === selectedId
                        ? 'bg-brand-50 border border-brand-200 font-semibold text-black'
                        : 'hover:bg-neutral-50 text-neutral-700 border border-transparent'
                    }`}
                  >
                    <span className="line-clamp-2">{s.title || 'Untitled sheet'}</span>
                    <span className="text-[10px] text-neutral-400 mt-0.5 block">
                      {formatDateTime(s.updated_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {selected && (
            <div className="card flex flex-col overflow-hidden min-h-[560px]">
              <div className="flex flex-wrap items-center gap-2 p-3 border-b border-atlas-border bg-neutral-50/80">
                <input
                  value={title}
                  onChange={e => handleTitleChange(e.target.value)}
                  className="input-field flex-1 min-w-[200px] font-semibold bg-white"
                  placeholder="Sheet title"
                  aria-label="Sheet title"
                />
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-xs text-neutral-500 flex items-center gap-1">
                    {saveState === 'saving' && (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        Saving…
                      </>
                    )}
                    {saveState === 'saved' && (
                      <>
                        <CheckCircle2 size={12} className="text-emerald-600" />
                        Saved
                      </>
                    )}
                    {saveState === 'error' && 'Save failed'}
                    {saveState === 'idle' && isDirty && 'Unsaved changes…'}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleExportPdf()}
                    disabled={exportingPdf}
                    className="btn-outline text-sm gap-1 py-1.5"
                    title="Download sheet as PDF"
                  >
                    {exportingPdf ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                    PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleManualSave()}
                    className="btn-outline text-sm gap-1 py-1.5"
                    title="Save now"
                  >
                    <Save size={14} />
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                    title="Delete sheet"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <LabRdRichEditor
                key={selectedId}
                contentHtml={content}
                onChange={handleContentChange}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
