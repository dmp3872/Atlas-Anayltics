import type { COA, Order, OrderSample, UserProfile } from './types';
import { coaWorkflowStage, COA_WORKFLOW_LABELS } from './coaWorkflow';
import { parseSampleMetadata } from './coaPanels';
import { isBenzylPqPanel } from './labCoaForm';

export type AssayStatus = 'complete' | 'pending' | 'n/a';

export type PendingTestingFilter =
  | 'all'
  | 'ster_pending'
  | 'endo_pending'
  | 'both_pending'
  | 'both_complete'
  | 'unpublished';

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
}

export interface PendingTestingReport {
  generatedAt: string;
  rows: PendingTestingRow[];
  counts: {
    samples: number;
    unpublishedCoas: number;
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
 * Includes incomplete samples and any sample linked to an unpublished COA.
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

  const coasBySample = new Map<string, COA[]>();
  const orphanCoas: COA[] = [];
  for (const c of input.coas) {
    if (c.sample_id) {
      const list = coasBySample.get(c.sample_id) || [];
      list.push(c);
      coasBySample.set(c.sample_id, list);
    } else if (!isPublishedCoa(c)) {
      orphanCoas.push(c);
    }
  }

  const ids = new Set<string>();
  for (const s of input.samples) {
    if (s.status !== 'complete' && s.status !== 'cancelled') ids.add(s.id);
  }
  for (const [sid, list] of coasBySample) {
    if (list.some(c => !isPublishedCoa(c))) ids.add(sid);
  }

  const rows: PendingTestingRow[] = [];
  const byStage: Record<string, number> = {};
  let unpublishedCoas = 0;

  for (const sid of ids) {
    const s = sampleBy.get(sid);
    const linkedAll = coasBySample.get(sid) || [];
    const linked = linkedAll.filter(c => !isPublishedCoa(c));
    if (linkedAll.some(c => isPublishedCoa(c)) && linked.length === 0 && s?.status === 'complete') {
      continue;
    }
    const useCoas = linked.length > 0 ? linked : linkedAll.filter(c => !isPublishedCoa(c));
    unpublishedCoas += useCoas.length;

    const meta = parseSampleMetadata(s?.metadata);
    const order = orderBy.get(s?.order_id || useCoas[0]?.order_id || '') || null;
    const profile = profileBy.get(s?.user_id || useCoas[0]?.user_id || '') || null;
    const company = order?.company_name
      || profile?.company_name
      || useCoas[0]?.company_name
      || '—';
    const sampleName = s?.display_name
      || s?.sample_name
      || useCoas[0]?.display_name
      || useCoas[0]?.sample_name
      || '—';
    const lot = meta.batch_number || useCoas[0]?.batch_number || '—';
    const testsLabel = orderedLabel(meta);
    const ster = resolveAssay('sterility', useCoas.length ? useCoas : linkedAll, s, meta, testsLabel);
    const endo = resolveAssay('endotoxin', useCoas.length ? useCoas : linkedAll, s, meta, testsLabel);
    const others = otherPanels(useCoas.length ? useCoas : linkedAll);

    let stage = '—';
    let stageKey = '';
    let slug = '—';
    if (useCoas.length) {
      const orderStage: Record<string, number> = {
        testing_in_progress: 0,
        awaiting_info: 1,
        verified: 2,
        pending_review: 3,
        issued: 4,
      };
      const primary = [...useCoas].sort(
        (a, b) => (orderStage[coaWorkflowStage(a)] ?? 9) - (orderStage[coaWorkflowStage(b)] ?? 9),
      )[0]!;
      stageKey = coaWorkflowStage(primary);
      stage = COA_WORKFLOW_LABELS[stageKey as keyof typeof COA_WORKFLOW_LABELS] || stageKey;
      slug = primary.slug || primary.accession_number || '—';
      byStage[stage] = (byStage[stage] || 0) + 1;
    }

    rows.push({
      sampleId: sid,
      sample: sampleName,
      lot: String(lot),
      company,
      order: order?.order_number || '—',
      client: profile?.full_name || '—',
      status: s?.status || (useCoas.length ? 'coa_only' : '—'),
      coa: slug,
      stage,
      stageKey,
      tests: testsLabel,
      sterility: ster.status,
      sterilityDetail: ster.detail,
      endotoxin: endo.status,
      endotoxinDetail: endo.detail,
      published: false,
      otherPending: others.pending,
      otherComplete: others.complete,
    });
  }

  for (const c of orphanCoas) {
    unpublishedCoas += 1;
    const order = orderBy.get(c.order_id || '') || null;
    const profile = profileBy.get(c.user_id || '') || null;
    const stageKey = coaWorkflowStage(c);
    const stage = COA_WORKFLOW_LABELS[stageKey] || stageKey;
    byStage[stage] = (byStage[stage] || 0) + 1;
    const ster = resolveAssay('sterility', [c], undefined, {}, '—');
    const endo = resolveAssay('endotoxin', [c], undefined, {}, '—');
    rows.push({
      sampleId: c.id,
      sample: c.display_name || c.sample_name || '—',
      lot: c.batch_number || '—',
      company: c.company_name || order?.company_name || profile?.company_name || '—',
      order: order?.order_number || '—',
      client: profile?.full_name || '—',
      status: 'coa_only',
      coa: c.slug || c.accession_number || '—',
      stage,
      stageKey,
      tests: '—',
      sterility: ster.status,
      sterilityDetail: ster.detail,
      endotoxin: endo.status,
      endotoxinDetail: endo.detail,
      published: false,
      otherPending: [],
      otherComplete: [],
    });
  }

  rows.sort((a, b) => {
    const ap = a.sterility === 'pending' || a.endotoxin === 'pending' ? 0 : 1;
    const bp = b.sterility === 'pending' || b.endotoxin === 'pending' ? 0 : 1;
    if (ap !== bp) return ap - bp;
    if (a.sterility === 'pending' && b.sterility !== 'pending') return -1;
    if (b.sterility === 'pending' && a.sterility !== 'pending') return 1;
    return a.company.localeCompare(b.company) || a.lot.localeCompare(b.lot) || a.sample.localeCompare(b.sample);
  });

  const counts = {
    samples: rows.length,
    unpublishedCoas,
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
    if (r.sterility === 'pending' || r.endotoxin === 'pending') counts.either_pending += 1;
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
): PendingTestingRow[] {
  if (filter === 'all' || filter === 'unpublished') return rows;
  if (filter === 'ster_pending') return rows.filter(r => r.sterility === 'pending');
  if (filter === 'endo_pending') return rows.filter(r => r.endotoxin === 'pending');
  if (filter === 'both_pending') {
    return rows.filter(r => r.sterility === 'pending' && r.endotoxin === 'pending');
  }
  if (filter === 'both_complete') {
    return rows.filter(r => r.sterility === 'complete' && r.endotoxin === 'complete');
  }
  return rows;
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
