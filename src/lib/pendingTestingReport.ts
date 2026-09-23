import type { COA, Order, OrderSample, UserProfile } from './types';
import { coaWorkflowStage, COA_WORKFLOW_LABELS } from './coaWorkflow';
import { parseSampleMetadata } from './coaPanels';
import { isBenzylPqPanel } from './labCoaForm';
import { coaHasPendingAssays } from './coaDisplayPanels';

export type AssayStatus = 'complete' | 'pending' | 'n/a';

export type PendingTestingFilter =
  | 'all'
  | 'ster_pending'
  | 'endo_pending'
  | 'both_pending'
  | 'both_complete'
  | 'published_pending'
  | 'unpublished'
  | 'completed';

export interface PendingTestingRow {
  sampleId: string;
  sample: string;
  lot: string;
  company: string;
  order: string;
  client: string;
  status: string;
  coa: string;
  stage: string;
  stageKey: string;
  tests: string;
  sterility: AssayStatus;
  sterilityDetail: string;
  endotoxin: AssayStatus;
  endotoxinDetail: string;
  published: boolean;
  otherPending: string[];
  otherComplete: string[];
  hasPending: boolean;
}

export interface PendingTestingReport {
  generatedAt: string;
  rows: PendingTestingRow[];
  counts: {
    samples: number;
    unpublishedCoas: number;
    publishedPending: number;
    completed: number;
    ster_pending: number;
    ster_complete: number;
    ster_na: number;
    endo_pending: number;
    endo_complete: number;
    endo_na: number;
    both_pending: number;
    both_complete: number;
    either_pending: number;
    byStage: Record<string, number>;
  };
}

const STERILE_RE = /steril/i;
const ENDO_RE = /endotox/i;

function isPendingish(v: unknown): boolean {
  if (v == null || typeof v === 'boolean') return false;
  const s = String(v).trim().toLowerCase();
  if (!s) return false;
  return s === 'pending' || s.startsWith('pending');
}

function isEmptyish(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === 'boolean') return false;
  const s = String(v).trim();
  if (!s) return true;
  const low = s.toLowerCase();
  return low === '—' || low === '-' || low === 'n/a' || low === 'na' || low === 'null' || low === 'none';
}

function isRealResult(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'boolean' || typeof v === 'number') return true;
  if (isEmptyish(v) || isPendingish(v)) return false;
  return true;
}

function assayFromPanels(
  panels: unknown,
  pattern: RegExp,
): { status: AssayStatus; detail: string } | null {
  if (!Array.isArray(panels)) return null;
  for (const raw of panels) {
    if (!raw || typeof raw !== 'object') continue;
    const p = raw as Record<string, unknown>;
    const name = String(p.panel_name || p.name || '');
    if (!pattern.test(name)) continue;
    const result = p.result;
    const status = p.status;
    const pass = p.pass;
    for (const v of [result, status, pass]) {
      if (isPendingish(v)) {
        return { status: 'pending', detail: String(result ?? v).trim() };
      }
    }
    if (typeof pass === 'boolean') {
      return { status: 'complete', detail: pass ? 'Pass' : 'Fail' };
    }
    if (isRealResult(pass)) return { status: 'complete', detail: String(pass) };
    if (status != null && ['pass', 'fail', 'complete', 'done'].includes(String(status).trim().toLowerCase())) {
      return { status: 'complete', detail: String(status) };
    }
    if (isRealResult(result)) return { status: 'complete', detail: String(result).trim() };
    for (const k of ['value', 'result_value', 'measured', 'result_text'] as const) {
      const v = p[k];
      if (isPendingish(v)) return { status: 'pending', detail: String(v).trim() };
      if (isRealResult(v)) return { status: 'complete', detail: String(v).trim() };
    }
    return { status: 'pending', detail: String(result || status || 'no result') };
  }
  return null;
}

function assayFromAnalysis(
  analysis: unknown,
  pattern: RegExp,
): { status: AssayStatus; detail: string } | null {
  if (!Array.isArray(analysis)) return null;
  for (const raw of analysis) {
    if (!raw || typeof raw !== 'object') continue;
    const a = raw as Record<string, unknown>;
    const label = String(a.label || a.test || '');
    if (!pattern.test(label)) continue;
    const st = a.status;
    const result = a.result ?? a.value;
    for (const v of [result, st]) {
      if (isPendingish(v)) return { status: 'pending', detail: String(result ?? st) };
    }
    if (st != null && ['pass', 'fail', 'complete', 'done'].includes(String(st).trim().toLowerCase())) {
      return { status: 'complete', detail: String(result ?? st) };
    }
    if (isRealResult(result)) return { status: 'complete', detail: String(result) };
    return { status: 'pending', detail: String(st || 'pending') };
  }
  return null;
}

function assayFromSummary(
  summary: Record<string, unknown> | null | undefined,
  kind: 'sterility' | 'endotoxin',
): { status: AssayStatus; detail: string } | null {
  if (!summary) return null;
  if (kind === 'sterility') {
    if (!summary.include_sterility) return null;
    const pas = summary.sterility_pass;
    if (isPendingish(pas)) return { status: 'pending', detail: String(pas) };
    if (pas == null || pas === '' || isEmptyish(pas)) {
      return { status: 'pending', detail: 'included, no pass recorded' };
    }
    return { status: 'complete', detail: `pass=${pas}` };
  }
  if (!summary.include_endotoxin) return null;
  const pas = summary.endotoxin_pass;
  const eu = summary.endotoxin_eu_ml;
  if (isPendingish(pas) || isPendingish(eu)) {
    return { status: 'pending', detail: String(isPendingish(eu) ? eu : pas) };
  }
  const hasPass = isRealResult(pas);
  const hasEu = isRealResult(eu);
  if (hasPass || hasEu) {
    const parts: string[] = [];
    if (hasPass) parts.push(`pass=${pas}`);
    if (hasEu) parts.push(`${eu} EU/mL`);
    return { status: 'complete', detail: parts.join(' · ') };
  }
  return { status: 'pending', detail: 'included, no value recorded' };
}

function orderedLabel(meta: ReturnType<typeof parseSampleMetadata>): string {
  const label = meta.tests_label;
  if (typeof label === 'string' && label.trim()) return label.trim();
  if (meta.test_mode === 'atlas_pro') return 'Atlas Safety Pro';
  if (meta.test_mode === 'full_qc') return 'Full QC';
  if (Array.isArray(meta.individual_tests) && meta.individual_tests.length) {
    return meta.individual_tests.join(', ');
  }
  return '—';
}

function orderedExpects(
  meta: ReturnType<typeof parseSampleMetadata>,
  testsLabel: string,
  kind: 'sterility' | 'endotoxin',
): boolean {
  const blob = [
    testsLabel,
    meta.test_mode || '',
    ...(Array.isArray(meta.individual_tests) ? meta.individual_tests : []),
  ].join(' ').toLowerCase();
  if (kind === 'sterility') {
    return STERILE_RE.test(blob) || blob.includes('atlas pro') || blob.includes('full qc') || blob.includes('full_qc');
  }
  return ENDO_RE.test(blob) || blob.includes('atlas pro') || blob.includes('full qc') || blob.includes('full_qc');
}

function resolveAssay(
  kind: 'sterility' | 'endotoxin',
  coaList: COA[],
  sample: OrderSample | undefined,
  meta: ReturnType<typeof parseSampleMetadata>,
  testsLabel: string,
): { status: AssayStatus; detail: string } {
  const pattern = kind === 'sterility' ? STERILE_RE : ENDO_RE;
  const signals: { status: AssayStatus; detail: string }[] = [];

  for (const c of coaList) {
    const summary = (c.result_summary && typeof c.result_summary === 'object')
      ? (c.result_summary as Record<string, unknown>)
      : null;
    const fromPanel = assayFromPanels(c.panel_results, pattern);
    if (fromPanel) signals.push(fromPanel);
    const fromSummary = assayFromSummary(summary, kind);
    if (fromSummary) signals.push(fromSummary);
  }

  const fromAnalysis = assayFromAnalysis(sample?.analysis_results, pattern);
  if (fromAnalysis) signals.push(fromAnalysis);

  const pending = signals.find(s => s.status === 'pending');
  if (pending) return pending;
  const complete = signals.find(s => s.status === 'complete');
  if (complete) return complete;
  if (orderedExpects(meta, testsLabel, kind)) {
    return { status: 'pending', detail: 'ordered / package includes' };
  }
  return { status: 'n/a', detail: 'not ordered' };
}

function isPublishedCoa(coa: COA): boolean {
  return coaWorkflowStage(coa) === 'published' || !!coa.is_public || !!coa.published_at;
}

function otherPanels(coaList: COA[]): { pending: string[]; complete: string[] } {
  const pending: string[] = [];
  const complete: string[] = [];
  const seen = new Set<string>();
  for (const c of coaList) {
    for (const raw of c.panel_results || []) {
      if (!raw || typeof raw !== 'object') continue;
      const p = raw as Record<string, unknown>;
      const name = String(p.panel_name || p.name || 'Unnamed');
      if (STERILE_RE.test(name) || ENDO_RE.test(name) || isBenzylPqPanel(name)) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const result = p.result;
      if (isPendingish(result) || isPendingish(p.pass)) {
        pending.push(name);
        continue;
      }
      const filled = typeof p.pass === 'boolean' || isRealResult(p.pass) || isRealResult(result);
      (filled ? complete : pending).push(name);
    }
  }
  return { pending, complete };
}

/**
 * Build the admin pending-testing report from loaded lab data.
 * One row per certificate (COA number) — including finished/published COAs —
 * plus incomplete samples that do not have a COA yet.
 */
export function buildPendingTestingReport(input: {
  samples: OrderSample[];
  coas: COA[];
  orders: Order[];
  profiles: UserProfile[];
}): PendingTestingReport {
  const orderBy = new Map(input.orders.map(o => [o.id, o]));
  const profileBy = new Map(input.profiles.map(p => [p.id, p]));
  const sampleBy = new Map(input.samples.map(s => [s.id, s]));

  const rows: PendingTestingRow[] = [];
  const byStage: Record<string, number> = {};
  const samplesCoveredByCoa = new Set<string>();

  function pushCoaRow(c: COA) {
    const published = isPublishedCoa(c);
    const s = c.sample_id ? sampleBy.get(c.sample_id) : undefined;
    const meta = parseSampleMetadata(s?.metadata);
    const testsLabel = orderedLabel(meta);
    const ster = resolveAssay('sterility', [c], s, meta, testsLabel);
    const endo = resolveAssay('endotoxin', [c], s, meta, testsLabel);
    const others = otherPanels([c]);
    const hasPending =
      ster.status === 'pending'
      || endo.status === 'pending'
      || others.pending.length > 0
      || coaHasPendingAssays(c);

    const order = orderBy.get(s?.order_id || c.order_id || '') || null;
    const profile = profileBy.get(s?.user_id || c.user_id || '') || null;
    const stageKey = coaWorkflowStage(c);
    const stage = COA_WORKFLOW_LABELS[stageKey] || stageKey;
    byStage[stage] = (byStage[stage] || 0) + 1;
    if (c.sample_id) samplesCoveredByCoa.add(c.sample_id);

    rows.push({
      sampleId: c.sample_id || c.id,
      sample: s?.display_name || s?.sample_name || c.display_name || c.sample_name || '—',
      lot: String(meta.batch_number || c.batch_number || '—'),
      company: order?.company_name || c.company_name || profile?.company_name || '—',
      order: order?.order_number || '—',
      client: profile?.full_name || '—',
      status: s?.status || 'coa_only',
      coa: c.slug || c.accession_number || '—',
      stage,
      stageKey,
      tests: testsLabel,
      sterility: ster.status,
      sterilityDetail: ster.detail,
      endotoxin: endo.status,
      endotoxinDetail: endo.detail,
      published,
      otherPending: others.pending,
      otherComplete: others.complete,
      hasPending,
    });
  }

  for (const c of input.coas) {
    pushCoaRow(c);
  }

  // Incomplete samples that have not been issued a COA yet.
  for (const s of input.samples) {
    if (s.status === 'complete' || s.status === 'cancelled') continue;
    if (samplesCoveredByCoa.has(s.id)) continue;
    const meta = parseSampleMetadata(s.metadata);
    const testsLabel = orderedLabel(meta);
    const order = orderBy.get(s.order_id) || null;
    const profile = profileBy.get(s.user_id) || null;
    const ster = resolveAssay('sterility', [], s, meta, testsLabel);
    const endo = resolveAssay('endotoxin', [], s, meta, testsLabel);
    const hasPending = ster.status === 'pending' || endo.status === 'pending';
    rows.push({
      sampleId: s.id,
      sample: s.display_name || s.sample_name || '—',
      lot: String(meta.batch_number || '—'),
      company: order?.company_name || profile?.company_name || '—',
      order: order?.order_number || '—',
      client: profile?.full_name || '—',
      status: s.status,
      coa: '—',
      stage: 'No COA yet',
      stageKey: '',
      tests: testsLabel,
      sterility: ster.status,
      sterilityDetail: ster.detail,
      endotoxin: endo.status,
      endotoxinDetail: endo.detail,
      published: false,
      otherPending: [],
      otherComplete: [],
      hasPending,
    });
    byStage['No COA yet'] = (byStage['No COA yet'] || 0) + 1;
  }

  rows.sort((a, b) => {
    const ap = a.hasPending ? 0 : 1;
    const bp = b.hasPending ? 0 : 1;
    if (ap !== bp) return ap - bp;
    if (a.published !== b.published) return a.published ? -1 : 1;
    if (a.sterility === 'pending' && b.sterility !== 'pending') return -1;
    if (b.sterility === 'pending' && a.sterility !== 'pending') return 1;
    return a.coa.localeCompare(b.coa) || a.company.localeCompare(b.company) || a.sample.localeCompare(b.sample);
  });

  const counts = {
    samples: rows.length,
    unpublishedCoas: rows.filter(r => !r.published).length,
    publishedPending: rows.filter(r => r.published && r.hasPending).length,
    completed: rows.filter(r => r.coa !== '—' && !r.hasPending).length,
    ster_pending: 0,
    ster_complete: 0,
    ster_na: 0,
    endo_pending: 0,
    endo_complete: 0,
    endo_na: 0,
    both_pending: 0,
    both_complete: 0,
    either_pending: 0,
    byStage,
  };
  for (const r of rows) {
    if (r.sterility === 'pending') counts.ster_pending += 1;
    else if (r.sterility === 'complete') counts.ster_complete += 1;
    else counts.ster_na += 1;
    if (r.endotoxin === 'pending') counts.endo_pending += 1;
    else if (r.endotoxin === 'complete') counts.endo_complete += 1;
    else counts.endo_na += 1;
    if (r.sterility === 'pending' && r.endotoxin === 'pending') counts.both_pending += 1;
    if (r.sterility === 'complete' && r.endotoxin === 'complete') counts.both_complete += 1;
    if (r.hasPending) counts.either_pending += 1;
  }

  return {
    generatedAt: new Date().toISOString(),
    rows,
    counts,
  };
}

export function filterPendingTestingRows(
  rows: PendingTestingRow[],
  filter: PendingTestingFilter,
  company?: string | null,
): PendingTestingRow[] {
  let next = rows;
  if (filter === 'unpublished') next = next.filter(r => !r.published);
  else if (filter === 'published_pending') {
    next = next.filter(r => r.published && r.hasPending);
  } else if (filter === 'completed') {
    next = next.filter(r => r.coa !== '—' && !r.hasPending);
  } else if (filter === 'ster_pending') next = next.filter(r => r.sterility === 'pending');
  else if (filter === 'endo_pending') next = next.filter(r => r.endotoxin === 'pending');
  else if (filter === 'both_pending') {
    next = next.filter(r => r.sterility === 'pending' && r.endotoxin === 'pending');
  } else if (filter === 'both_complete') {
    next = next.filter(r => r.sterility === 'complete' && r.endotoxin === 'complete');
  }

  const companyKey = (company || '').trim().toLowerCase();
  if (companyKey) {
    next = next.filter(r => r.company.trim().toLowerCase() === companyKey);
  }
  return next;
}

/** Unique company names from report rows, sorted A–Z (skip blank placeholders). */
export function pendingTestingCompanies(rows: PendingTestingRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const name = r.company.trim();
    if (name && name !== '—') set.add(name);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Merge lean result_summary onto COA list rows (avoids loading image blobs into Admin). */
export function mergeCoaResultSummaries(
  coas: COA[],
  summaries: { id: string; result_summary: unknown }[],
): COA[] {
  const map = new Map(summaries.map(s => [s.id, s.result_summary]));
  return coas.map(c => {
    if (!map.has(c.id)) return c;
    return { ...c, result_summary: map.get(c.id) as COA['result_summary'] };
  });
}
