import { COA, OrderSample, PanelResult, SampleStatus, TestPanel } from './types';

export interface OrderSampleMetadata {
  batch_number?: string;
  labeled_content?: string;
  peptide_identification?: string;
  vial_size?: string;
  sample_matrix?: string;
  tests_label?: string;
}

export function parseSampleMetadata(metadata: OrderSample['metadata']): OrderSampleMetadata {
  if (!metadata || typeof metadata !== 'object') return {};
  return metadata as OrderSampleMetadata;
}

/** Default chemist COA test rows — matches the lab issue form. */
export const DEFAULT_COA_TEST_PANELS: PanelResult[] = [
  { panel_name: 'Purity & Quantitation (HPLC)', specification: '≥95.0%', result: '', pass: true },
  { panel_name: 'Identity Confirmation (MS)', specification: '± 2 Da', result: '', pass: true },
  { panel_name: 'Net Content (Weight)', specification: '', result: '', pass: true },
  { panel_name: 'Endotoxin (USP <85>)', specification: '<1.0 EU/mg', result: '', pass: true },
];

/** Prefill test rows from client intake metadata (labeled content → net content result). */
export function buildCoaPanelsFromSample(metadata: OrderSample['metadata']): PanelResult[] {
  const meta = parseSampleMetadata(metadata);
  const labeledContent = meta.labeled_content?.trim() ?? '';

  return DEFAULT_COA_TEST_PANELS.map(panel => {
    if (!panel.panel_name.toLowerCase().includes('net content') || !labeledContent) {
      return { ...panel };
    }
    return {
      ...panel,
      specification: panel.specification?.trim() ? panel.specification : `Label claim: ${labeledContent}`,
      result: labeledContent,
    };
  });
}

export function clientSubmittedLabel(
  profile: { full_name?: string; company_name?: string } | undefined,
  orderCompany?: string,
): string {
  const name = profile?.full_name?.trim();
  const company = orderCompany?.trim() || profile?.company_name?.trim();
  if (name && company) return `${name} · ${company}`;
  return name || company || 'Unknown client';
}

// Canonical QC sections shown on a certificate when a sample doesn't have an
// explicit panel list (matches the 8-section full QC panel used in seed COAs).
export const QC_PANELS = [
  'Purity & Quantitation (HPLC)',
  'Identity Confirmation (MS)',
  'Net Content (Weight)',
  'Endotoxin (USP <85>)',
  'Heavy Metals (ICP-MS)',
  'Sterility (PCR)',
  'Microbial Screen',
  'Visual Inspection',
  'Conformity (Sample-to-Sample)',
];

// Resolve the list of test section names ordered for a sample. Prefers explicit
// panel_ids (mapped through test_panels), falling back to the canonical QC set.
export function expectedPanelNames(sample: OrderSample, panels: TestPanel[]): string[] {
  const ids = sample.panel_ids ?? [];
  if (ids.length) {
    const names = ids
      .map(id => panels.find(p => p.id === id)?.name)
      .filter((n): n is string => !!n);
    if (names.length) return names;
  }
  return QC_PANELS;
}

// Find the certificate for a sample. Prefers the direct sample_id link, then
// falls back to batch number, then sample/display name — because some COAs are
// created without a sample_id link.
export function matchCoaForSample(sample: OrderSample, coas: COA[]): COA | undefined {
  const direct = coas.find(c => c.sample_id === sample.id);
  if (direct) return direct;

  const meta = sample.metadata as { batch_number?: string } | null;
  const batch = meta?.batch_number?.trim();
  if (batch) {
    const byBatch = coas.find(c => (c.batch_number || '').trim() === batch);
    if (byBatch) return byBatch;
  }

  const names = [sample.display_name, sample.sample_name]
    .filter(Boolean)
    .map(n => n.toLowerCase().trim());
  return coas.find(c =>
    names.includes((c.display_name || '').toLowerCase().trim()) ||
    names.includes((c.sample_name || '').toLowerCase().trim())
  );
}

// Fraction of testing complete, inferred from sample status. Used to render a
// partial COA (which sections are done vs still pending).
export function sampleProgress(status: SampleStatus): number {
  switch (status) {
    case 'received': return 0;
    case 'analyzing': return 0.4;
    case 'in_review': return 0.8;
    case 'complete': return 1;
    default: return 0;
  }
}
