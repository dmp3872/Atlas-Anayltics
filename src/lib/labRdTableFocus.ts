import type { Editor } from '@tiptap/core';
import type { Node as PmNode } from '@tiptap/pm/model';
import { TableMap, selectedRect } from '@tiptap/pm/tables';

export type TableFocusContext = {
  row: number;
  col: number;
  rowCount: number;
  colCount: number;
  multiRow: boolean;
  multiCol: boolean;
};

export type TableGridSnapshot = {
  rowCount: number;
  colCount: number;
  cells: string[][];
};

export function columnLabel(index0: number): string {
  let n = index0 + 1;
  let label = '';
  while (n > 0) {
    n -= 1;
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26);
  }
  return label;
}

export function getActiveTablePosition(editor: Editor): number | null {
  const { $from } = editor.state.selection;
  for (let d = $from.depth; d > 0; d -= 1) {
    if ($from.node(d).type.name === 'table') {
      return $from.before(d);
    }
  }
  return null;
}

/** Resolve table node at cached doc position (still works after focus leaves the table). */
export function resolveTableAt(
  editor: Editor,
  tablePos: number,
): { tablePos: number; table: PmNode } | null {
  const doc = editor.state.doc;
  const tryPos = (pos: number) => {
    if (pos < 0 || pos > doc.content.size) return null;
    const node = doc.nodeAt(pos);
    if (node?.type.name === 'table') return { tablePos: pos, table: node };
    return null;
  };

  const direct = tryPos(tablePos);
  if (direct) return direct;

  for (let delta = 1; delta <= 8; delta += 1) {
    const left = tryPos(tablePos - delta);
    if (left) return left;
    const right = tryPos(tablePos + delta);
    if (right) return right;
  }

  let found: { tablePos: number; table: PmNode } | null = null;
  doc.descendants((node, pos) => {
    if (node.type.name === 'table') {
      found = { tablePos: pos, table: node };
      return false;
    }
    return true;
  });
  return found;
}

function rowPosition(tablePos: number, table: PmNode, row0: number): number {
  let pos = tablePos + 1;
  for (let i = 0; i < row0; i += 1) pos += table.child(i).nodeSize;
  return pos;
}

function cellPosition(tablePos: number, table: PmNode, row0: number, col0: number): number {
  const row = table.child(row0);
  let pos = rowPosition(tablePos, table, row0) + 1;
  for (let c = 0; c < col0; c += 1) pos += row.child(c).nodeSize;
  return pos;
}

function deleteTableRowAt(editor: Editor, tablePos: number, row0: number): boolean {
  const resolved = resolveTableAt(editor, tablePos);
  if (!resolved) return false;
  const { tablePos: pos, table } = resolved;
  if (table.childCount <= 1) return false;
  if (row0 < 0 || row0 >= table.childCount) return false;

  const from = rowPosition(pos, table, row0);
  const row = table.child(row0);
  const to = from + row.nodeSize;
  const { state, view } = editor;
  view.dispatch(state.tr.delete(from, to));
  return true;
}

function deleteTableColumnAt(editor: Editor, tablePos: number, col0: number): boolean {
  const resolved = resolveTableAt(editor, tablePos);
  if (!resolved) return false;
  const { tablePos: pos, table } = resolved;
  if (table.childCount === 0) return false;

  const width = Math.max(...Array.from({ length: table.childCount }, (_, r) => table.child(r).childCount));
  if (width <= 1 || col0 < 0 || col0 >= width) return false;

  const { state, view } = editor;
  let tr = state.tr;
  const mapFrom = tr.mapping.maps.length;

  for (let r = table.childCount - 1; r >= 0; r -= 1) {
    const row = table.child(r);
    if (col0 >= row.childCount) continue;
    const from = tr.mapping.slice(mapFrom).map(cellPosition(pos, table, r, col0));
    const cell = row.child(col0);
    tr = tr.delete(from, from + cell.nodeSize);
  }

  if (tr.doc.eq(state.doc)) return false;
  view.dispatch(tr);
  return true;
}

function deleteTableColumnAtMapped(editor: Editor, tablePos: number, col0: number): boolean {
  const resolved = resolveTableAt(editor, tablePos);
  if (!resolved) return false;
  const { tablePos: pos, table } = resolved;
  try {
    const map = TableMap.get(table);
    if (map.width <= 1 || col0 < 0 || col0 >= map.width) return false;

    const { state, view } = editor;
    let tr = state.tr;
    const tableStart = pos + 1;
    const seen = new Set<number>();

    for (let r = map.height - 1; r >= 0; r -= 1) {
      const index = r * map.width + col0;
      const rel = map.map[index];
      if (seen.has(rel)) continue;
      seen.add(rel);
      const from = tableStart + rel;
      const cell = tr.doc.nodeAt(from);
      if (!cell) continue;
      tr = tr.delete(from, from + cell.nodeSize);
    }

    if (tr.doc.eq(state.doc)) return false;
    view.dispatch(tr);
    return true;
  } catch {
    return false;
  }
}

function deleteColumnWithFallback(editor: Editor, tablePos: number, col0: number): boolean {
  if (deleteTableColumnAt(editor, tablePos, col0)) return true;
  return deleteTableColumnAtMapped(editor, tablePos, col0);
}

export function getTableFocusContext(editor: Editor): TableFocusContext | null {
  if (!editor.isActive('table')) return null;
  try {
    const rect = selectedRect(editor.state);
    if (!rect?.table) return null;
    const { map, top, left, bottom, right } = rect;
    return {
      row: top + 1,
      col: left + 1,
      rowCount: map.height,
      colCount: map.width,
      multiRow: bottom - top > 1,
      multiCol: right - left > 1,
    };
  } catch {
    return null;
  }
}

export function getTableGridSnapshot(editor: Editor, tablePos?: number | null): TableGridSnapshot | null {
  const pos = tablePos ?? getActiveTablePosition(editor);
  if (pos == null) return null;
  const resolved = resolveTableAt(editor, pos);
  if (!resolved) return null;
  const { table } = resolved;

  try {
    let colCount = 0;
    for (let r = 0; r < table.childCount; r += 1) {
      colCount = Math.max(colCount, table.child(r).childCount);
    }
    const map = TableMap.get(table);
    colCount = Math.max(colCount, map.width);
    const rowCount = Math.max(table.childCount, map.height);

    const cells: string[][] = [];
    for (let r = 0; r < rowCount; r += 1) {
      const rowCells: string[] = [];
      if (r < table.childCount) {
        const row = table.child(r);
        for (let c = 0; c < colCount; c += 1) {
          if (c < row.childCount) {
            const text = row.child(c).textContent.replace(/\s+/g, ' ').trim();
            rowCells.push(text.length > 48 ? `${text.slice(0, 45)}…` : text);
          } else {
            rowCells.push('');
          }
        }
      } else {
        for (let c = 0; c < colCount; c += 1) rowCells.push('');
      }
      cells.push(rowCells);
    }

    return { rowCount, colCount, cells };
  } catch {
    return null;
  }
}

export function deleteTableRowsAt(
  editor: Editor,
  rows0: number[],
  tablePos?: number | null,
): boolean {
  if (tablePos == null) return false;

  const unique = [...new Set(rows0)].filter(r => r >= 0).sort((a, b) => b - a);
  if (unique.length === 0) return false;

  let ok = false;
  for (const row0 of unique) {
    if (deleteTableRowAt(editor, tablePos, row0)) ok = true;
  }
  return ok;
}

export function deleteTableColumnsAt(
  editor: Editor,
  cols0: number[],
  tablePos?: number | null,
): boolean {
  if (tablePos == null) return false;

  const unique = [...new Set(cols0)].filter(c => c >= 0).sort((a, b) => b - a);
  if (unique.length === 0) return false;

  let ok = false;
  for (const col0 of unique) {
    if (deleteColumnWithFallback(editor, tablePos, col0)) ok = true;
  }
  return ok;
}

export function deleteTableRowsAndColumnsAt(
  editor: Editor,
  rows0: number[],
  cols0: number[],
  tablePos?: number | null,
): boolean {
  if (tablePos == null) return false;

  const rowOk = rows0.length > 0 ? deleteTableRowsAt(editor, rows0, tablePos) : false;
  const colOk = cols0.length > 0 ? deleteTableColumnsAt(editor, cols0, tablePos) : false;

  if (rowOk || colOk) {
    editor.commands.focus();
  }
  return rowOk || colOk;
}
