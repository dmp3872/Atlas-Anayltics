import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { DOMParser as PMDOMParser } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Turn clipboard TSV (Excel) into a TipTap-friendly table. */
export function tsvToTableHtml(text: string): string | null {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  if (lines.length === 0) return null;

  const rows = lines.map(line => line.split('\t'));
  const maxCols = Math.max(...rows.map(r => r.length));
  if (maxCols <= 1 && !lines.some(l => l.includes('\t'))) return null;
  if (rows.length === 1 && maxCols === 1) return null;

  const body = rows
    .map(row => {
      const padded = [...row];
      while (padded.length < maxCols) padded.push('');
      const cells = padded
        .map(cell => `<td>${escapeHtml(cell)}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  return `<table class="lab-rd-table"><tbody>${body}</tbody></table>`;
}

/** Extract clean table HTML from Excel / Sheets clipboard HTML. */
export function excelHtmlToTableHtml(rawHtml: string): string | null {
  const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
  const tables = doc.querySelectorAll('table');
  if (tables.length === 0) return null;

  const parts: string[] = [];
  tables.forEach(table => {
    const rows: string[][] = [];
    table.querySelectorAll('tr').forEach(tr => {
      const cells: string[] = [];
      tr.querySelectorAll('th, td').forEach(cell => {
        cells.push((cell.textContent ?? '').replace(/\u00a0/g, ' ').trim());
      });
      if (cells.length > 0) rows.push(cells);
    });
    if (rows.length === 0) return;

    const maxCols = Math.max(...rows.map(r => r.length));
    const body = rows
      .map(row => {
        const padded = [...row];
        while (padded.length < maxCols) padded.push('');
        const cells = padded.map(text => `<td>${escapeHtml(text)}</td>`).join('');
        return `<tr>${cells}</tr>`;
      })
      .join('');
    parts.push(`<table class="lab-rd-table"><tbody>${body}</tbody></table>`);
  });

  return parts.length > 0 ? parts.join('<p></p>') : null;
}

function insertHtmlSlice(view: EditorView, html: string): boolean {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  const parser = PMDOMParser.fromSchema(view.state.schema);
  const slice = parser.parseSlice(wrap, { preserveWhitespace: 'full' });
  if (!slice.content.size) return false;
  view.dispatch(view.state.tr.replaceSelection(slice));
  return true;
}

function handleExcelPaste(view: EditorView, event: ClipboardEvent): boolean {
  const data = event.clipboardData;
  if (!data) return false;

  const html = data.getData('text/html');
  const plain = data.getData('text/plain');

  if (html && /<table/i.test(html)) {
    const tableHtml = excelHtmlToTableHtml(html);
    if (tableHtml) {
      event.preventDefault();
      return insertHtmlSlice(view, tableHtml);
    }
  }

  if (plain && (plain.includes('\t') || plain.includes('\n'))) {
    const tableHtml = tsvToTableHtml(plain);
    if (tableHtml) {
      event.preventDefault();
      return insertHtmlSlice(view, tableHtml);
    }
  }

  return false;
}

export const LabRdExcelPaste = Extension.create({
  name: 'labRdExcelPaste',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handlePaste: (view, event) => handleExcelPaste(view, event),
        },
      }),
    ];
  },
});
