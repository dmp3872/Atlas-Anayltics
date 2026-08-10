import type { ChromatogramData } from './types';

export type ChromatogramPoint = { x: number; y: number };

export interface ParsedChromatogram {
  points: ChromatogramPoint[];
  /** Retention time of the tallest peak (minutes). */
  retention_time: number;
  source_filename?: string;
  original_count: number;
}

const MAX_STORED_POINTS = 2500;

function parseNumber(raw: string): number | null {
  let s = raw.trim().replace(/^\uFEFF/, '').replace(/["']/g, '');
  if (!s || s === '-' || s === '--' || /^n\/?a$/i.test(s)) return null;
  // Scientific notation stays as-is; European decimals: 1,23 or 1.234,56
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s) || (/^\d+,\d+$/.test(s) && !s.includes('.'))) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    s = s.replace(/,/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Split a line on commas / tabs / semicolons / multi-spaces while keeping quoted cells. */
function splitRow(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map(c => c.trim());
  // European HPLC exports often use ';' as delimiter and ',' as decimal.
  if (line.includes(';')) return line.split(';').map(c => c.trim());
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      cells.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());
  if (cells.length >= 2) return cells;
  return line.trim().split(/\s+/).filter(Boolean);
}

function isTimeHeader(cell: string): boolean {
  const t = cell.toLowerCase();
  if (/\b(wavelength|pressure|temp|flow|volume|inj)\b/.test(t)) return false;
  return /retention|\btime\b|\brt\b|\bmin(ute)?s?\b|\bx\b/i.test(cell);
}

function isIntensityHeader(cell: string): boolean {
  const t = cell.toLowerCase();
  if (/\b(wavelength|pressure|temp|flow|volume|inj|time|retention)\b/.test(t)) return false;
  return /intens|absorb|\bmau\b|\bau\b|signal|response|height|detector|\buv\b|\bric\b|\bcounts?\b|\by\b/i.test(cell);
}

function looksLikeHeader(cells: string[]): boolean {
  return cells.some(isTimeHeader) || cells.some(isIntensityHeader);
}

function pickColumns(header: string[]): { x: number; y: number } | null {
  let x = -1;
  let y = -1;
  header.forEach((cell, i) => {
    if (x < 0 && isTimeHeader(cell)) x = i;
    if (y < 0 && isIntensityHeader(cell)) y = i;
  });
  if (x >= 0 && y >= 0 && x !== y) return { x, y };
  if (header.length >= 2) return { x: 0, y: 1 };
  return null;
}

function rowAsPoint(cells: string[], col: { x: number; y: number }): ChromatogramPoint | null {
  if (cells.length <= Math.max(col.x, col.y)) return null;
  const x = parseNumber(cells[col.x] || '');
  const y = parseNumber(cells[col.y] || '');
  if (x == null || y == null) return null;
  return { x, y };
}

/** Score a candidate point series — prefer long monotonic time runs. */
function scoreSeries(points: ChromatogramPoint[]): number {
  if (points.length < 2) return 0;
  let mono = 0;
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].x >= points[i - 1].x) mono += 1;
  }
  const monoRatio = mono / (points.length - 1);
  const span = points[points.length - 1].x - points[0].x;
  return points.length * monoRatio * (span > 0 ? 1 : 0.1);
}

function extractSeries(
  lines: string[],
  col: { x: number; y: number },
  startAt = 0,
): ChromatogramPoint[] {
  const series: ChromatogramPoint[] = [];
  let gap = 0;
  for (let i = startAt; i < lines.length; i += 1) {
    const point = rowAsPoint(splitRow(lines[i]), col);
    if (!point) {
      // Allow a few blank/metadata gaps inside a run; break on long gaps once we have data.
      if (series.length > 0) {
        gap += 1;
        if (gap > 5) break;
      }
      continue;
    }
    gap = 0;
    // Keep the first contiguous mostly-monotonic run.
    if (series.length > 0 && point.x + 1e-9 < series[series.length - 1].x) {
      if (series.length >= 20) break;
      // Early noise — restart.
      series.length = 0;
    }
    series.push(point);
  }
  return series;
}

/** Evenly downsample dense HPLC traces for SVG rendering / JSON size. */
export function downsampleChromatogramPoints(
  points: ChromatogramPoint[],
  maxPoints = MAX_STORED_POINTS,
): ChromatogramPoint[] {
  if (points.length <= maxPoints) return points;
  const out: ChromatogramPoint[] = [];
  const last = points.length - 1;
  for (let i = 0; i < maxPoints; i += 1) {
    const idx = Math.round((i / (maxPoints - 1)) * last);
    out.push(points[idx]);
  }
  let maxIdx = 0;
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].y > points[maxIdx].y) maxIdx = i;
  }
  const peak = points[maxIdx];
  const nearest = out.reduce((best, p, i) => (
    Math.abs(p.x - peak.x) < Math.abs(out[best].x - peak.x) ? i : best
  ), 0);
  out[nearest] = peak;
  return out;
}

export function looksLikeBinaryChromatogramFile(bytes: Uint8Array, filename?: string): boolean {
  const name = (filename || '').toLowerCase();
  if (/\.(xlsx|xls|cdf|dx|fs|amdis|raw|pdf|png|jpe?g|gif|webp)$/i.test(name)) return true;
  if (bytes.length >= 4) {
    // ZIP/XLSX, PDF, PNG, JPEG
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) return true;
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return true;
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true;
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return true;
  }
  // High ratio of null / non-text bytes → binary
  let weird = 0;
  const n = Math.min(bytes.length, 512);
  for (let i = 0; i < n; i += 1) {
    const b = bytes[i];
    if (b === 0 || (b < 9 && b !== 9 && b !== 10 && b !== 13) || (b > 126 && b < 160)) weird += 1;
  }
  return weird / n > 0.3;
}

/**
 * Parse HPLC export text (CSV / TSV / whitespace) into chromatogram points.
 * Accepts OpenLab / Chromeleon / Empower-style dumps with preamble metadata.
 */
export function parseChromatogramText(text: string, filename?: string): ParsedChromatogram {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#') && !l.startsWith('//'));

  if (lines.length < 2) {
    throw new Error('File needs at least two rows of retention time and intensity.');
  }

  type Candidate = { points: ChromatogramPoint[]; score: number };
  // Object wrapper so assignments inside `consider` stay visible to the type checker.
  const state: { best: Candidate | null } = { best: null };

  const consider = (points: ChromatogramPoint[]) => {
    const score = scoreSeries(points);
    if (score < 2) return;
    if (!state.best || score > state.best.score) state.best = { points, score };
  };

  // 1) Prefer an explicit time/intensity header anywhere in the file.
  for (let i = 0; i < lines.length; i += 1) {
    const cells = splitRow(lines[i]);
    if (cells.length < 2 || !looksLikeHeader(cells)) continue;
    if (parseNumber(cells[0] || '') != null && parseNumber(cells[1] || '') != null) continue;
    const picked = pickColumns(cells);
    if (!picked) continue;
    consider(extractSeries(lines, picked, i + 1));
  }

  // 2) Fallback: first two numeric columns, starting at each plausible offset.
  const defaultCol = { x: 0, y: 1 };
  for (let i = 0; i < lines.length; i += 1) {
    const probe = rowAsPoint(splitRow(lines[i]), defaultCol);
    if (!probe) continue;
    let ok = 0;
    for (let j = i; j < Math.min(lines.length, i + 12); j += 1) {
      if (rowAsPoint(splitRow(lines[j]), defaultCol)) ok += 1;
    }
    if (ok < 5) continue;
    consider(extractSeries(lines, defaultCol, i));
    // Jump ahead a bit once we found a strong start.
    if (state.best && state.best.score > 100) break;
    i += Math.max(0, ok - 1);
  }

  const best = state.best;
  if (!best || best.points.length < 2) {
    throw new Error(
      'Could not read time/intensity pairs. Export a CSV or TSV (not Excel/PDF/image) with retention time and intensity columns.',
    );
  }

  const deduped: ChromatogramPoint[] = [];
  for (const p of best.points) {
    const prev = deduped[deduped.length - 1];
    if (prev && Math.abs(prev.x - p.x) < 1e-9) {
      if (p.y > prev.y) deduped[deduped.length - 1] = p;
      continue;
    }
    deduped.push(p);
  }

  const points = downsampleChromatogramPoints(deduped);
  let peak = points[0];
  for (const p of points) {
    if (p.y > peak.y) peak = p;
  }

  return {
    points,
    retention_time: Math.round(peak.x * 1000) / 1000,
    source_filename: filename,
    original_count: deduped.length,
  };
}

export async function parseChromatogramFile(file: File): Promise<ParsedChromatogram> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (looksLikeBinaryChromatogramFile(bytes, file.name)) {
    throw new Error(
      'That file looks like Excel, PDF, image, or instrument binary. Export the chromatogram as CSV or TSV (time + intensity) and try again.',
    );
  }
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  return parseChromatogramText(text, file.name);
}

export function chromatogramDataFromParsed(
  parsed: ParsedChromatogram,
  existing?: ChromatogramData | null,
): ChromatogramData {
  return {
    ...(existing && typeof existing === 'object' ? existing : {}),
    points: parsed.points,
    retention_time: parsed.retention_time,
    source: 'measured',
    source_filename: parsed.source_filename || existing?.source_filename,
    point_count: parsed.original_count,
  };
}

/** Keep vial/matrix metadata while replacing or clearing measured points. */
export function mergeChromatogramData(
  existing: ChromatogramData | null | undefined,
  patch: Partial<ChromatogramData> | null | undefined,
): ChromatogramData {
  const base = existing && typeof existing === 'object' ? { ...existing } : {};
  if (!patch) return base;
  return { ...base, ...patch };
}

export function hasMeasuredChromatogram(data: ChromatogramData | null | undefined): boolean {
  if (!data || !Array.isArray(data.points) || data.points.length < 2) return false;
  if (data.source === 'measured') return true;
  return data.points.length >= 2;
}
