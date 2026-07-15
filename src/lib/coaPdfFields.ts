import { COA, PanelResult } from './types';
import { formatDate } from './utils';

export type CoaPdfFieldValues = Record<string, string>;

function findPanel(panels: PanelResult[], ...keywords: string[]): PanelResult | undefined {
  const lowered = keywords.map(k => k.toLowerCase());
  return panels.find(p => {
    const name = p.panel_name.toLowerCase();
    return lowered.some(k => name.includes(k));
  });
}

function conformityLabel(panel: PanelResult | undefined): string {
  if (!panel) return '';
  if (!panel.result?.trim() && panel.specification === undefined) return '';
  return panel.pass ? 'PASS' : 'FAIL';
}

function panelTriplet(
  panels: PanelResult[],
  keywords: string[],
): { specification: string; result: string; conformity: string } {
  const panel = findPanel(panels, ...keywords);
  return {
    specification: panel?.specification?.trim() ?? '',
    result: (panel?.value ?? panel?.result ?? '').trim(),
    conformity: conformityLabel(panel),
  };
}

function usedPanelNames(panels: PanelResult[]): Set<PanelResult> {
  const keys = [
    ['ident'],
    ['net content', 'peptide content'],
    ['purity', 'hplc'],
    ['steril'],
    ['endotoxin', 'lal'],
  ];
  const used = new Set<PanelResult>();
  for (const group of keys) {
    const p = findPanel(panels, ...group);
    if (p) used.add(p);
  }
  return used;
}

/** Map a COA row to AcroForm field names on the Certificate of Analysis template. */
export function buildCoaPdfFieldValues(coa: COA): CoaPdfFieldValues {
  const panels = Array.isArray(coa.panel_results) ? coa.panel_results : [];
  const identity = panelTriplet(panels, ['ident']);
  const netContent = panelTriplet(panels, ['net content', 'peptide content']);
  const purity = panelTriplet(panels, ['purity', 'hplc']);
  const sterility = panelTriplet(panels, ['steril']);
  const endotoxin = panelTriplet(panels, ['endotoxin', 'lal']);

  const summary = (coa.result_summary ?? {}) as Record<string, unknown>;
  const chrom = (coa.chromatogram_data ?? {}) as Record<string, unknown>;

  const received =
    (typeof summary.received_date === 'string' && summary.received_date) ||
    (typeof summary.received_at === 'string' && formatDate(summary.received_at)) ||
    '';
  const published = coa.published_at
    ? formatDate(coa.published_at)
    : coa.issued_at
      ? formatDate(coa.issued_at)
      : '';
  const matrix =
    (typeof summary.matrix_type === 'string' && summary.matrix_type) ||
    (typeof summary.sample_matrix === 'string' && summary.sample_matrix) ||
    (typeof chrom.sample_matrix === 'string' && chrom.sample_matrix) ||
    '';
  const meanOfVials =
    (typeof summary.mean_of_vials_tested === 'string' && summary.mean_of_vials_tested) ||
    (typeof summary.vials_tested === 'string' && summary.vials_tested) ||
    (typeof summary.vial_count === 'number' && String(summary.vial_count)) ||
    '';
  const avgNetPeptide =
    (typeof summary.avg_net_peptide_content === 'string' && summary.avg_net_peptide_content) ||
    netContent.result ||
    '';
  const avgPurity =
    (typeof summary.avg_purity === 'string' && summary.avg_purity) ||
    purity.result ||
    (coa.purity_percent != null ? `${coa.purity_percent}%` : '');
  const vialsTested = meanOfVials || (typeof chrom.vial_size === 'string' ? chrom.vial_size : '');

  const fields: CoaPdfFieldValues = {
    CLIENT: coa.company_name || '',
    'SAMPLE CODE': coa.slug || '',
    'SAMPLE NAME': coa.display_name || coa.sample_name || '',
    'RECEIVED DATE': received,
    'MATRIX TYPE': matrix,
    'PUBLISHED DATE': published,
    'LOT CODE': coa.batch_number || '',
    'VIALS TESTED': vialsTested,

    // Average Net Peptide Content card
    VIALS_33: avgNetPeptide,
    VIALS_55: meanOfVials,
    VIALS_222: '',

    // Average Purity card
    VIALS_44: avgPurity,
    VIALS_66: meanOfVials,
    VIALS_22: '',

    SpecificationIdentity: identity.specification,
    ResultIdentity: identity.result,
    ConformityIdentity: identity.conformity,

    'SpecificationNet Peptide Content': netContent.specification,
    'ResultNet Peptide Content': netContent.result,
    'ConformityNet Peptide Content': netContent.conformity,

    'SpecificationPurity HPLC': purity.specification || (coa.purity_percent != null ? '>=95.0%' : ''),
    'ResultPurity HPLC': purity.result || (coa.purity_percent != null ? `${coa.purity_percent}%` : ''),
    'ConformityPurity HPLC': purity.conformity || (coa.overall_result === 'pass' ? 'PASS' : coa.overall_result === 'fail' ? 'FAIL' : ''),

    SpecificationSterility: sterility.specification,
    ResultSterility: sterility.result,
    ConformitySterility: sterility.conformity,

    'SpecificationEndotoxins LAL': endotoxin.specification,
    'ResultEndotoxins LAL': endotoxin.result,
    'ConformityEndotoxins LAL': endotoxin.conformity,
  };

  const used = usedPanelNames(panels);
  const extras = panels.filter(p => !used.has(p) && (p.result?.trim() || p.specification?.trim()));
  for (let i = 0; i < 5; i++) {
    const panel = extras[i];
    fields[`Text2_T${i + 1}`] = panel ? (panel.result || panel.panel_name) : '';
    fields[`Text2_T${i + 6}`] = panel ? conformityLabel(panel) : '';
  }

  return fields;
}
