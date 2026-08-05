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

const TIME_HEADER = /^(rt|retention[_\s-]?time|time|t|min|minutes|x)$/i;
const INTENSITY_HEADER = /^(y|intensity|intensit(y|ies)|absorbance|abs|mau|au|signal|response|height|detector|uv|ric)$/i;

function parseNumber(raw: string): number | null {
  const cleaned = raw.trim().replace(/^\uFEFF/, '').replace(/,/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '--') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Split a line on commas / tabs / semicolons / multi-spaces while keeping quoted cells. */
function splitRow(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map(c => c.trim());
  if (line.includes(';') && !line.includes(',')) return line.split(';').map(c => c.trim());
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

function looksLikeHeader(cells: string[]): boolean {
  const joined = cells.join(' ').toLowerCase();
  return TIME_HEADER.test(cells[0] || '')
    || INTENSITY_HEADER.test(cells[1] || '')
    || /retention|time|intensity|absorb|mau|signal/.test(joined);
}

function pickColumns(header: string[]): { x: number; y: number } | null {
  let x = -1;
  let y = -1;
  header.forEach((cell, i) => {
    const t = cell.trim();
    if (x < 0 && TIME_HEADER.test(t)) x = i;
    if (y < 0 && INTENSITY_HEADER.test(t)) y = i;
  });
  if (x >= 0 && y >= 0 && x !== y) return { x, y };
  if (header.length >= 2) return { x: 0, y: 1 };
  return null;
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
 * Accepts common OpenLab / Chromeleon-style two-column time vs intensity dumps.
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
  const firstCells = splitRow(lines[0]);
  if (looksLikeHeader(firstCells)) {
    const picked = pickColumns(firstCells);
    if (!picked) throw new Error('Could not find time and intensity columns in the header.');
    col = picked;
    start = 1;
  }

  const raw: ChromatogramPoint[] = [];
  for (let i = start; i < lines.length; i += 1) {
    const cells = splitRow(lines[i]);
    if (cells.length <= Math.max(col.x, col.y)) continue;
    const x = parseNumber(cells[col.x] || '');
    const y = parseNumber(cells[col.y] || '');
    if (x == null || y == null) continue;
    raw.push({ x, y });
  }

  if (raw.length < 2) {
    throw new Error('Could not read enough numeric time/intensity pairs from this file.');
  }

  // Sort by time and drop non-monotonic duplicates that confuse the SVG path.
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
