import type { Order, OrderSample, UserProfile } from './types';
import { parseSampleMetadata } from './coaPanels';
import { parseOrderNotes } from './orderMeta';

/** Flat price for R&D Purity & Quantity verification (no COA). */
export const RD_PURITY_QUANTITY_PRICE = 150;

/** Catalog / primary test id for R&D pathway samples. */
export const RD_PRIMARY_TEST_ID = 'rd_purity_quantity';

export const RD_TESTS_LABEL = 'R&D Purity & Quantity';

export type SamplePathway = 'commercial' | 'rd';

export function profileAllowsRdSubmissions(
  profile: Pick<UserProfile, 'rd_submissions_enabled'> | null | undefined,
): boolean {
  return !!profile?.rd_submissions_enabled;
}

export function samplePathway(
  metadata: OrderSample['metadata'] | null | undefined,
): SamplePathway {
  const meta = parseSampleMetadata(metadata);
  if (meta.pathway === 'rd' || meta.primary_test_id === RD_PRIMARY_TEST_ID || meta.test_mode === 'rd') {
    return 'rd';
  }
  return 'commercial';
}

export function sampleIsRd(sample: Pick<OrderSample, 'metadata'> | null | undefined): boolean {
  if (!sample) return false;
  return samplePathway(sample.metadata) === 'rd';
}

export function orderIsRd(order: Pick<Order, 'notes'> | null | undefined): boolean {
  if (!order) return false;
  const { meta } = parseOrderNotes(order.notes);
  if (meta.pathway === 'rd') return true;
  const detail = Array.isArray(meta.samples_detail) ? meta.samples_detail : [];
  return detail.some(row => {
    if (!row || typeof row !== 'object') return false;
    const r = row as Record<string, unknown>;
    return r.pathway === 'rd' || r.primary_test_id === RD_PRIMARY_TEST_ID || r.test_mode === 'rd';
  });
}

export type RdAnalysisResult = {
  test: string;
  label: string;
  ordered: true;
  status: 'pass' | 'fail' | 'pending';
  value: string;
};

/** Build analysis_results rows for R&D Purity + Quantity completion. */
export function buildRdAnalysisResults(opts: {
  purity: string;
  quantity: string;
  purityPass: boolean | null;
  quantityPass: boolean | null;
}): RdAnalysisResult[] {
  const purityStatus: RdAnalysisResult['status'] =
    opts.purityPass === true ? 'pass' : opts.purityPass === false ? 'fail' : 'pending';
  const quantityStatus: RdAnalysisResult['status'] =
    opts.quantityPass === true ? 'pass' : opts.quantityPass === false ? 'fail' : 'pending';
  return [
    {
      test: 'purity',
      label: 'Purity',
      ordered: true,
      status: purityStatus,
      value: (opts.purity || '').trim(),
    },
    {
      test: 'quantity',
      label: 'Quantity / Net Content',
      ordered: true,
      status: quantityStatus,
      value: (opts.quantity || '').trim(),
    },
  ];
}

export function readRdResultsFromSample(sample: OrderSample): {
  purity: string;
  quantity: string;
  purityPass: boolean | null;
  quantityPass: boolean | null;
  note: string;
} {
  const meta = parseSampleMetadata(sample.metadata) as Record<string, unknown>;
  const note = typeof meta.rd_completion_note === 'string' ? meta.rd_completion_note : '';
  const raw = Array.isArray(sample.analysis_results) ? sample.analysis_results : [];
  let purity = '';
  let quantity = '';
  let purityPass: boolean | null = null;
  let quantityPass: boolean | null = null;
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const test = String(row.test || row.label || '').toLowerCase();
    const value = row.value != null ? String(row.value).trim() : '';
    const status = String(row.status || '').toLowerCase();
    const pass = status === 'pass' ? true : status === 'fail' ? false : null;
    if (test.includes('purity')) {
      purity = value;
      purityPass = pass;
    } else if (test.includes('quantity') || test.includes('content') || test.includes('net')) {
      quantity = value;
      quantityPass = pass;
    }
  }
  return { purity, quantity, purityPass, quantityPass, note };
}
