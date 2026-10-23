import { useMemo, useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { columnLabel } from '../../lib/labRdTableFocus';
import type { TableGridSnapshot } from '../../lib/labRdTableFocus';

type PickerMode = 'cells' | 'rows' | 'columns';

interface Props {
  grid: TableGridSnapshot;
  initialRow?: number;
  initialCol?: number;
  onConfirm: (rows0: number[], cols0: number[]) => boolean;
  onClose: () => void;
}

function cellKey(r: number, c: number) {
  return `${r},${c}`;
}

export default function LabRdTableDeletePicker({
  grid,
  initialRow = 1,
  initialCol = 1,
  onConfirm,
  onClose,
}: Props) {
  const [mode, setMode] = useState<PickerMode>('cells');
  const [selectedRows, setSelectedRows] = useState<Set<number>>(() => new Set());
  const [selectedCols, setSelectedCols] = useState<Set<number>>(() => new Set());
  const [selectedCells, setSelectedCells] = useState<Set<string>>(() => new Set());
  const [confirmError, setConfirmError] = useState('');

  const derivedFromCells = useMemo(() => {
    const rows = new Set<number>();
    const cols = new Set<number>();
    selectedCells.forEach(key => {
      const [r, c] = key.split(',').map(Number);
      rows.add(r);
      cols.add(c);
    });
    return { rows: [...rows].sort((a, b) => a - b), cols: [...cols].sort((a, b) => a - b) };
  }, [selectedCells]);

  const rowsToDelete = useMemo(() => {
    if (mode === 'columns') return [];
    if (mode === 'rows') return [...selectedRows].sort((a, b) => a - b);
    return [...new Set([...derivedFromCells.rows, ...selectedRows])].sort((a, b) => a - b);
  }, [mode, derivedFromCells.rows, selectedRows]);

  const colsToDelete = useMemo(() => {
    if (mode === 'rows') return [];
    if (mode === 'columns') return [...selectedCols].sort((a, b) => a - b);
    return [...new Set([...derivedFromCells.cols, ...selectedCols])].sort((a, b) => a - b);
  }, [mode, derivedFromCells.cols, selectedCols]);

  const canDelete = rowsToDelete.length > 0 || colsToDelete.length > 0;
  const wouldRemoveAllRows =
    rowsToDelete.length > 0 && rowsToDelete.length >= grid.rowCount;
  const wouldRemoveAllCols =
    colsToDelete.length > 0 && colsToDelete.length >= grid.colCount;
  const wouldRemoveEntireTable = wouldRemoveAllRows || wouldRemoveAllCols;

  function toggleRow(r: number) {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  }

  function toggleCol(c: number) {
    setSelectedCols(prev => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  function toggleCell(r: number, c: number, extend: boolean) {
    const key = cellKey(r, c);
    setSelectedCells(prev => {
      if (extend && prev.size > 0) {
        const keys = [...prev];
        const last = keys[keys.length - 1];
        const [r0, c0] = last.split(',').map(Number);
        const next = new Set(prev);
        const rMin = Math.min(r0, r);
        const rMax = Math.max(r0, r);
        const cMin = Math.min(c0, c);
        const cMax = Math.max(c0, c);
        for (let ri = rMin; ri <= rMax; ri += 1) {
          for (let ci = cMin; ci <= cMax; ci += 1) {
            next.add(cellKey(ri, ci));
          }
        }
        return next;
      }
      const next = new Set(prev);
      if (next.has(key) && next.size > 1) next.delete(key);
      else if (!extend) return new Set([key]);
      else next.add(key);
      return next;
    });
  }

  function isCellMarked(r: number, c: number): boolean {
    if (mode === 'rows') return selectedRows.has(r);
    if (mode === 'columns') return selectedCols.has(c);
    return selectedCells.has(cellKey(r, c))
      || selectedRows.has(r)
      || selectedCols.has(c);
  }

  function handleConfirm() {
    if (!canDelete || wouldRemoveEntireTable) return;
    setConfirmError('');
    const ok = onConfirm(rowsToDelete, colsToDelete);
    if (!ok) {
      setConfirmError('Could not remove those rows/columns. Click in the table and try again.');
      return;
    }
    onClose();
  }

  const summaryParts: string[] = [];
  if (rowsToDelete.length > 0) summaryParts.push(`${rowsToDelete.length} row${rowsToDelete.length === 1 ? '' : 's'}`);
  if (colsToDelete.length > 0) summaryParts.push(`${colsToDelete.length} column${colsToDelete.length === 1 ? '' : 's'}`);

  return (
    <div className="lab-rd-delete-picker-backdrop" role="presentation" onClick={onClose}>
      <div
        className="lab-rd-delete-picker"
        role="dialog"
        aria-labelledby="lab-rd-delete-picker-title"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
      >
        <div className="lab-rd-delete-picker-header">
          <div>
            <h3 id="lab-rd-delete-picker-title" className="text-sm font-bold text-black">
              Delete rows &amp; columns
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Highlight what to remove in the grid, then confirm. Row/column headers toggle full lines.
            </p>
          </div>
          <button type="button" className="lab-rd-delete-picker-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="lab-rd-delete-picker-modes">
          {(['cells', 'rows', 'columns'] as const).map(m => (
            <button
              key={m}
              type="button"
              className={`lab-rd-delete-picker-mode ${mode === m ? 'lab-rd-delete-picker-mode-active' : ''}`}
              onClick={() => setMode(m)}
            >
              {m === 'cells' ? 'Cells' : m === 'rows' ? 'Rows' : 'Columns'}
            </button>
          ))}
        </div>

        <div className="lab-rd-delete-picker-grid-wrap">
          <table className="lab-rd-delete-picker-grid">
            <thead>
              <tr>
                <th className="lab-rd-delete-picker-corner" />
                {Array.from({ length: grid.colCount }, (_, c) => (
                  <th key={c} className="lab-rd-delete-picker-col-head">
                    <button
                      type="button"
                      className={`lab-rd-delete-picker-head-btn ${selectedCols.has(c) ? 'is-selected' : ''}`}
                      onClick={() => {
                        setMode('columns');
                        toggleCol(c);
                      }}
                      title={`Toggle column ${columnLabel(c)}`}
                    >
                      {columnLabel(c)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: grid.rowCount }, (_, r) => (
                <tr key={r}>
                  <th className="lab-rd-delete-picker-row-head">
                    <button
                      type="button"
                      className={`lab-rd-delete-picker-head-btn ${selectedRows.has(r) ? 'is-selected' : ''}`}
                      onClick={() => {
                        setMode('rows');
                        toggleRow(r);
                      }}
                      title={`Toggle row ${r + 1}`}
                    >
                      {r + 1}
                    </button>
                  </th>
                  {Array.from({ length: grid.colCount }, (_, c) => {
                    const marked = isCellMarked(r, c);
                    return (
                      <td key={c} className={marked ? 'is-marked' : ''}>
                        <button
                          type="button"
                          className="lab-rd-delete-picker-cell-btn"
                          title={grid.cells[r]?.[c] || 'Empty'}
                          onClick={e => toggleCell(r, c, e.shiftKey)}
                        >
                          {grid.cells[r]?.[c] || '—'}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="lab-rd-delete-picker-footer">
          <p className="text-xs text-neutral-600">
            {canDelete ? (
              <>Will delete {summaryParts.join(' and ')}.</>
            ) : (
              'Select at least one row, column, or cell.'
            )}
            {wouldRemoveEntireTable && canDelete && (
              <span className="text-red-600 block mt-1">
                Cannot delete every row or column — use Delete table instead.
              </span>
            )}
            {confirmError && (
              <span className="text-red-600 block mt-1">{confirmError}</span>
            )}
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn-outline text-sm" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary text-sm gap-1.5 bg-red-700 hover:bg-red-800 border-red-700"
              disabled={!canDelete || wouldRemoveEntireTable}
              onClick={handleConfirm}
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
