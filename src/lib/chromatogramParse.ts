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
  } else {
    // Strip thousands separators: 1,234.56
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Split a line on commas / tabs / semicolons / multi-spaces while keeping quoted cells. */
function splitRow(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map(c => c.trim());
  if (line.includes(';') && (line.match(/;/g) || []).length >= (line.match(/,/g) || []).length) {
    return line.split(';').map(c => c.trim());
  }
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if ((ch === ',' || ch === ';') && !inQuotes) {
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
  return /retention|\btime\b|\brt\b|\bmin\b|\bx\b/i.test(cell);
}

function isIntensityHeader(cell: string): boolean {
  return /intens|absorb|\bmau\b|\bau\b|signal|response|height|detector|\buv\b|\bric\b|\by\b/i.test(cell);
}

function looksLikeHeader(cells: string[]): boolean {
  const joined = cells.join(' ');
  return isTimeHeader(joined) || isIntensityHeader(joined);
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
  // Always keep the global max peak so the main RT marker stays accurate.
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

/**
 * Parse HPLC export text (CSV / TSV / whitespace) into chromatogram points.
 * Accepts common OpenLab / Chromeleon / Empower-style time vs intensity dumps,
 * including preamble metadata lines and headers like "Time [min]".
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

  let col = { x: 0, y: 1 };
  let start = 0;

  // Find the first plausible header or numeric data block (skip instrument preamble).
  for (let i = 0; i < Math.min(lines.length, 80); i += 1) {
    const cells = splitRow(lines[i]);
    if (cells.length < 2) continue;
    if (looksLikeHeader(cells) && Number.isNaN(Number(cells[0].replace(/,/g, '')))) {
      const picked = pickColumns(cells);
      if (picked) {
        col = picked;
        start = i + 1;
        break;
      }
    }
    const probe = rowAsPoint(cells, col);
    if (probe) {
      // Confirm a short run of numeric pairs so we didn't catch a lone metadata number.
      let ok = 0;
      for (let j = i; j < Math.min(lines.length, i + 8); j += 1) {
        if (rowAsPoint(splitRow(lines[j]), col)) ok += 1;
      }
      if (ok >= 3) {
        start = i;
        break;
      }
    }
  }

  const raw: ChromatogramPoint[] = [];
  for (let i = start; i < lines.length; i += 1) {
    const point = rowAsPoint(splitRow(lines[i]), col);
    if (!point) continue;
    raw.push(point);
  }

  if (raw.length < 2) {
    throw new Error(
      'Could not read enough numeric time/intensity pairs. Export CSV/TSV with retention time and intensity columns.',
    );
  }

  raw.sort((a, b) => a.x - b.x);
  const deduped: ChromatogramPoint[] = [];
  for (const p of raw) {
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
  const text = await file.text();
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

export function hasMeasuredChromatogram(data: ChromatogramData | null | undefined): boolean {
  if (!data || !Array.isArray(data.points) || data.points.length < 2) return false;
  if (data.source === 'measured') return true;
  // Legacy rows that stored points without a source flag.
  return data.points.length >= 2;
}
