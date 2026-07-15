import {
  ChromatogramData,
  COAResult,
  PanelResult,
  Submission,
  SubmissionResult,
  SubmissionSample,
  TestPanel,
} from './types';
import { hashContent } from './utils';

export interface ResultFormData {
  purity_percent?: number | null;
  notes?: string;
  overall_pass?: boolean | null;
}

export function parseResultFormData(data: Record<string, unknown> | undefined): ResultFormData {
  if (!data) return {};
  return {
    purity_percent:
      typeof data.purity_percent === 'number'
        ? data.purity_percent
        : data.purity_percent != null
          ? parseFloat(String(data.purity_percent))
          : null,
    notes: typeof data.notes === 'string' ? data.notes : '',
    overall_pass: typeof data.overall_pass === 'boolean' ? data.overall_pass : null,
  };
}

function buildChromatogram(purity: number): ChromatogramData {
  const rt = 8 + (100 - purity) * 0.05;
  const peak = Math.min(0.98, purity / 100);
  return {
    retention_time: Math.round(rt * 100) / 100,
    peak_area: Math.round(peak * 3_000_000),
    points: [
      { x: 0, y: 0.01 },
      { x: 4, y: 0.04 },
      { x: 6, y: 0.06 },
      { x: rt - 0.5, y: 0.08 },
      { x: rt, y: peak },
      { x: rt + 0.4, y: peak * 0.72 },
      { x: rt + 1, y: 0.12 },
      { x: 14, y: 0.01 },
      { x: 20, y: 0.01 },
    ],
  };
}

function buildPanelResults(
  panel: TestPanel | undefined,
  form: ResultFormData,
  overallPass: boolean,
): PanelResult[] {
  const purity = form.purity_percent ?? (overallPass ? 98.5 : 94.0);
  const panelName = panel?.name ?? 'HPLC Purity';
  const spec = overallPass ? '≥98%' : '≥98%';

  const rows: PanelResult[] = [
    {
      panel_name: panelName.includes('Package') ? 'HPLC Purity' : panelName,
      result: `${purity.toFixed(1)}%`,
      specification: spec,
      pass: purity >= 95,
      value: `${purity.toFixed(1)}%`,
      unit: '%',
    },
  ];

  if (panel?.category === 'package' || panelName.includes('Safety Pro')) {
    rows.push(
      {
        panel_name: 'Identity Confirmation (MS)',
        result: 'Confirmed',
        specification: 'Match expected',
        pass: overallPass,
      },
      {
        panel_name: 'Net Content (Weight)',
        result: 'Within specification',
        specification: 'Label claim ±10%',
        pass: overallPass,
      },
      {
        panel_name: 'Endotoxin Safety Screen',
        result: overallPass ? '0.22 EU/mg' : 'Pending review',
        specification: '<1.0 EU/mg',
        pass: overallPass,
      },
    );
  }

  if (form.notes?.trim()) {
    rows.push({
      panel_name: 'Analyst Notes',
      result: form.notes.trim(),
      specification: '—',
      pass: overallPass,
    });
  }

  return rows;
}

export function buildCOAInsertPayload(
  submission: Submission,
  sample: SubmissionSample,
  panel: TestPanel | undefined,
  result: SubmissionResult | undefined,
  slug: string,
) {
  const form = parseResultFormData(result?.result_data);
  const overallPass = form.overall_pass ?? result?.overall_pass ?? true;
  const overallResult: COAResult = overallPass ? 'pass' : 'fail';
  const purity = form.purity_percent ?? (overallPass ? 98.5 : 94.0);
  const panelResults = buildPanelResults(panel, form, overallPass);
  const chromatogram = buildChromatogram(purity);
  const contentBase = JSON.stringify({
    submission: submission.submission_number,
    sample: sample.sample_number,
    product: sample.product_name,
    batch: sample.batch_lot_number,
    purity,
    panelResults,
  });
  const contentHash = `sha256:${hashContent(contentBase)}`;
  const signature = `AA-${submission.submission_number.replace('SUB-', '')}-${sample.sample_number.replace('SMP-', '')}`;

  return {
    user_id: submission.user_id,
    submission_sample_id: sample.id,
    sample_name: sample.product_name,
    display_name: sample.product_name,
    company_name: submission.company_name,
    batch_number: sample.batch_lot_number || 'N/A',
    peptide_sequence: '',
    purity_percent: purity,
    molecular_weight: null,
    panel_results: panelResults,
    chromatogram_data: chromatogram,
    result_summary: {
      source: 'submission_workflow',
      submission_number: submission.submission_number,
      sample_number: sample.sample_number,
      urgency: submission.urgency,
    },
    overall_result: overallResult,
    is_public: false,
    content_hash: contentHash,
    signature,
    pdf_url: '',
    slug,
    issued_at: new Date().toISOString(),
  };
}
