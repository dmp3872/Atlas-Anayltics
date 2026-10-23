import { marked } from 'marked';

/** Stored in `lab_rd_sheets.content_md` — HTML for WYSIWYG sheets; legacy markdown is converted on load. */
export function normalizeSheetContent(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return defaultSheetHtml();
  if (looksLikeHtml(trimmed)) return trimmed;
  return marked.parse(trimmed, { async: false }) as string;
}

function looksLikeHtml(value: string): boolean {
  return /^<[a-z][\s\S]*>/i.test(value);
}

export function defaultSheetHtml(): string {
  return `<h1>R&amp;D notes</h1>
<p>Use this sheet for protocols, observations, and study prep.</p>
<h2>Quick reference</h2>
<ul>
  <li>Bullet lists for steps or observations</li>
  <li><strong>Bold</strong> and <em>italic</em> for emphasis</li>
</ul>
<table>
  <tbody>
    <tr>
      <th>Assay</th>
      <th>Target</th>
      <th>Notes</th>
    </tr>
    <tr>
      <td>HPLC</td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td>LAL</td>
      <td></td>
      <td></td>
    </tr>
  </tbody>
</table>
<p><em>Tab between cells in a table — use the toolbar to add rows and columns.</em></p>`;
}

/** @deprecated use defaultSheetHtml */
export function defaultSheetMarkdown(): string {
  return defaultSheetHtml();
}
