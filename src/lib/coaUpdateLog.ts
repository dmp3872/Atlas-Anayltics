import { COA } from './types';
import { resolvePanelPass } from './coaDisplayPanels';

/** Compact certificate-facing change entry stored on `result_summary.update_log`. */
export interface CoaUpdateLogEntry {
  at: string;
  note: string;
  by?: string;
}

/** Keep enough history for deferred assays + later corrections. */
const MAX_ENTRIES = 24;

export function readCoaUpdateLog(
  summary: Record<string, unknown> | null | undefined,
): CoaUpdateLogEntry[] {
  const raw = summary && typeof summary === 'object' ? summary.update_log : null;
  if (!Array.isArray(raw)) return [];
  const out: CoaUpdateLogEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const note = typeof row.note === 'string' ? row.note.trim() : '';
    const at = typeof row.at === 'string' ? row.at.trim() : '';
    if (!note || !at) continue;
    const by = typeof row.by === 'string' && row.by.trim() ? row.by.trim() : undefined;
    out.push(by ? { at, note, by } : { at, note });
  }
  return out;
}

export function appendCoaUpdateLog(
  summary: Record<string, unknown> | null | undefined,
  note: string,
  opts?: { at?: string; by?: string },
): Record<string, unknown> {
  const base = summary && typeof summary === 'object' ? { ...summary } : {};
  const trimmed = note.trim();
  if (!trimmed) return base;

  const prev = readCoaUpdateLog(base);
  const entry: CoaUpdateLogEntry = {
    at: opts?.at || new Date().toISOString(),
    note: trimmed,
  };
  if (opts?.by?.trim()) entry.by = opts.by.trim();

  const last = prev[prev.length - 1];
  // Skip exact duplicate notes within ~2 minutes (double-save / retry).
  if (last && last.note === entry.note) {
    const lastMs = Date.parse(last.at);
    const nextMs = Date.parse(entry.at);
    if (Number.isFinite(lastMs) && Number.isFinite(nextMs) && Math.abs(nextMs - lastMs) < 120_000) {
      return base;
    }
  }

  base.update_log = [...prev, entry].slice(-MAX_ENTRIES);
  return base;
}

function shortPanelLabel(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('sterility')) {
    const m = name.match(/\(([^)]+)\)/);
    return m ? `Sterility (${m[1]})` : 'Sterility';
  }
  if (n.includes('endotoxin') || n.includes('lal')) return 'Endotoxin (LAL)';
  if (/lead|arsenic|cadmium|mercury|chromium/i.test(name)) return name.trim() || 'Heavy metals';
  if (n.includes('fentanyl')) return 'Fentanyl';
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim() || name;
}

function panelKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function statusWord(pass: boolean | null | undefined): string {
  if (pass === true) return 'PASS';
  if (pass === false) return 'FAIL';
  return 'Pending';
}

function compactResult(raw: string): string {
  const t = raw.trim().replace(/\s+/g, ' ');
  if (t.length <= 42) return t;
  return `${t.slice(0, 40)}…`;
}

/** Build a short note describing panel/result changes between two COA snapshots. */
export function summarizeCoaContentChanges(
  before: Pick<COA, 'panel_results' | 'overall_result'>,
  after: Pick<COA, 'panel_results' | 'overall_result'>,
): string {
  const prevPanels = Array.isArray(before.panel_results) ? before.panel_results : [];
  const nextPanels = Array.isArray(after.panel_results) ? after.panel_results : [];
  const prevByKey = new Map(prevPanels.map(p => [panelKey(p.panel_name), p]));
  const nextByKey = new Map(nextPanels.map(p => [panelKey(p.panel_name), p]));

  const bits: string[] = [];

  for (const next of nextPanels) {
    const key = panelKey(next.panel_name);
    const prev = prevByKey.get(key);
    const label = shortPanelLabel(next.panel_name);
    const nextPass = resolvePanelPass(next);
    const nextResult = (next.result || '').trim();

    if (!prev) {
      bits.push(`${label} added (${statusWord(nextPass)})`);
      continue;
    }

    const prevPass = resolvePanelPass(prev);
    const prevResult = (prev.result || '').trim();
    if (prevPass === nextPass && prevResult === nextResult) continue;

    if (prevPass !== nextPass) {
      const detail = nextPass !== null && nextResult && !/^pending\b/i.test(nextResult)
        ? ` (${compactResult(nextResult)})`
        : '';
      bits.push(`${label}: ${statusWord(prevPass)} → ${statusWord(nextPass)}${detail}`);
      continue;
    }

    // Same pass/fail/pending, but measured text changed.
    bits.push(
      `${label}: ${compactResult(prevResult || '—')} → ${compactResult(nextResult || '—')}`,
    );
  }

  for (const prev of prevPanels) {
    const key = panelKey(prev.panel_name);
    if (nextByKey.has(key)) continue;
    bits.push(`${shortPanelLabel(prev.panel_name)} removed`);
  }

  if (before.overall_result !== after.overall_result) {
    bits.push(
      `Overall: ${statusWord(
        before.overall_result === 'pass' ? true : before.overall_result === 'fail' ? false : null,
      )} → ${statusWord(
        after.overall_result === 'pass' ? true : after.overall_result === 'fail' ? false : null,
      )}`,
    );
  }

  if (bits.length === 0) return '';
  const joined = bits.slice(0, 4).join(' · ');
  return bits.length > 4 ? `${joined} · +${bits.length - 4} more` : joined;
}

/** Prefix for edits on already-issued certificates (keeps the public log clear). */
export function formatPostIssueUpdateNote(
  coa: Pick<COA, 'coa_workflow_stage' | 'is_public'>,
  changeNote: string,
  fallback = 'Certificate details updated',
): string {
  const detail = changeNote.trim() || fallback;
  const stage = coa.coa_workflow_stage;
  if (stage === 'published' || coa.is_public) return `Published edit · ${detail}`;
  if (stage === 'verified') return `Verified edit · ${detail}`;
  if (stage === 'pending_review') return `Review edit · ${detail}`;
  if (stage === 'issued') return `Post-issue update · ${detail}`;
  return detail;
}

export function formatCoaUpdateLogDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

/** Preserve any prior update_log when rebuilding result_summary from scratch. */
export function carryForwardUpdateLog(
  existingSummary: Record<string, unknown> | null | undefined,
  nextSummary: Record<string, unknown>,
): Record<string, unknown> {
  const log = readCoaUpdateLog(existingSummary);
  if (log.length === 0) return nextSummary;
  return { ...nextSummary, update_log: log };
}
