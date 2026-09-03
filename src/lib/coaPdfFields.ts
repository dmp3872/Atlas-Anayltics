import { COA, PanelResult } from './types';
import { formatDate } from './utils';
import { readCoaPdfStats } from './coaImages';
import { ENDOTOXIN_SPEC_EU_ML, STERILITY_METHOD_LABELS, formatCoaDecimal, parseAssayMethod, withAssayMethodSpec, withSterilityMethodSpec, ASSAY_METHOD_LABELS, assayMethodFromPanels, hydrateMultiVialPanelResults, formatPurityResultWithUncertainty, formatSterilityPendingResult, applyQuantityUnit } from './labCoaForm';
import { collapseConformityPanels } from './coaDisplayPanels';
import { labelClaimFromSummary, netContentSpecificationDisplay } from './orderCatalog';

export type CoaPdfFieldValues = Record<string, string>;

function findPanel(panels: PanelResult[], ...keywords: string[]): PanelResult | undefined {
  const lowered = keywords.map(k => k.toLowerCase());
  const lookingForContent = lowered.some(k => k.includes('net content') || k.includes('peptide content'));
  return panels.find(p => {
    const name = p.panel_name.toLowerCase();
    // Per-peptide blend rows must not steal the total Net Content field.
    if (lookingForContent && name.startsWith('blend content')) return false;
    return lowered.some(k => name.includes(k));
  });
}

function conformityLabel(panel: PanelResult | undefined): string {
  if (!panel) return '';
  if (!panel.result?.trim() && panel.specification === undefined) return '';
  if (panel.pass === null || /^pending\b/i.test((panel.result || '').trim())) return 'PENDING';
  return panel.pass ? 'PASS' : 'FAIL';
}

function netContentConformityLabel(panel: PanelResult | undefined): string {
  if (!panel) return '';
  if (!panel.result?.trim() && panel.specification === undefined) return '';
  if (panel.pass === null || /^pending\b/i.test((panel.result || '').trim())) return 'PENDING';
  return 'Reported Value';
}

function panelTriplet(
  panels: PanelResult[],
  keywords: string[],
): { specification: string; result: string; conformity: string } {
  const panel = findPanel(panels, ...keywords);
  const lookingForContent = keywords.some(k => {
    const n = k.toLowerCase();
    return n.includes('net content') || n.includes('peptide content');
  });
  return {
    specification: panel?.specification?.trim() ?? '',
    result: (panel?.value ?? panel?.result ?? '').trim(),
    conformity: lookingForContent ? netContentConformityLabel(panel) : conformityLabel(panel),
  };
}

function usedPanelNames(panels: PanelResult[]): Set<PanelResult> {
  const keys = [
    ['ident'],
    ['net content', 'peptide content'],
    ['purity', 'hplc'],
    ['steril'],
    ['endotoxin', 'lal'],
    ['molecular'],
  ];
  const used = new Set<PanelResult>();
  for (const group of keys) {
    const p = findPanel(panels, ...group);
    if (p) used.add(p);
  }
  return used;
}

function resolveSterility(coa: COA, panels: PanelResult[]) {
  const stats = readCoaPdfStats(coa);
  const panel = findPanel(panels, 'steril');
  const methodLabel = STERILITY_METHOD_LABELS[stats.sterility_method];
  const pass = stats.sterility_pass;
  const specification = withSterilityMethodSpec('Not Detected', stats.sterility_method);
  if (pass === null) {
    return {
      specification,
      result: formatSterilityPendingResult(
        stats.sterility_method === 'culture_14_day'
          ? stats.sterility_projected_completion
          : '',
      ),
      conformity: 'PENDING',
      panel,
    };
  }
  return {
    specification,
    result: pass
      ? `Not Detected (${methodLabel})`
      : `Detected (${methodLabel})`,
    conformity: pass ? 'PASS' : 'FAIL',
    panel,
  };
}

function resolveEndotoxin(coa: COA, panels: PanelResult[]) {
  const stats = readCoaPdfStats(coa);
  const panel = findPanel(panels, 'endotoxin', 'lal');
  if (stats.endotoxin_pass === null) {
    return {
      specification: ENDOTOXIN_SPEC_EU_ML,
      result: 'Pending',
      conformity: 'PENDING',
      panel,
    };
  }
  const value = stats.endotoxin_eu_ml.trim();
  const raw = value ? `${value} EU/mL` : (panel?.result ?? '').trim();
  const result = raw && !/\(\s*lal\s*\)/i.test(raw) ? `${raw.replace(/\s+$/, '')} (LAL)` : raw;
  return {
    specification: ENDOTOXIN_SPEC_EU_ML,
    result,
    conformity: stats.endotoxin_pass ? 'PASS' : 'FAIL',
    panel,
  };
}

/** Map a COA row to AcroForm field names on the Certificate of Analysis template. */
export function buildCoaPdfFieldValues(coa: COA): CoaPdfFieldValues {
  const summary = (coa.result_summary ?? {}) as Record<string, unknown>;
  const panels = collapseConformityPanels(
    hydrateMultiVialPanelResults(
      Array.isArray(coa.panel_results) ? coa.panel_results : [],
      summary,
    ),
  );
  const identity = panelTriplet(panels, ['ident']);
  const netContent = panelTriplet(panels, ['net content', 'peptide content']);
  const purity = panelTriplet(panels, ['purity', 'hplc']);
  const sterility = resolveSterility(coa, panels);
  const endotoxin = resolveEndotoxin(coa, panels);
  const stats = readCoaPdfStats(coa);

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
    (coa.purity_percent != null ? `${formatCoaDecimal(coa.purity_percent)}%` : '');
  const vialsTested = meanOfVials || (typeof chrom.vial_size === 'string' ? chrom.vial_size : '');
  const labelClaim = labelClaimFromSummary(summary);
  const claimUnit = typeof summary.label_claim_unit === 'string' ? summary.label_claim_unit : '';
  const netContentSpecification = netContentSpecificationDisplay(netContent.specification, labelClaim)
    || netContent.specification;
  const assayMethod = parseAssayMethod(
    summary.assay_method
      ?? summary.assay_method_label
      ?? assayMethodFromPanels(panels),
  );
  const methodLabel = ASSAY_METHOD_LABELS[assayMethod];

  const fields: CoaPdfFieldValues = {
    CLIENT: coa.company_name || '',
    'SAMPLE CODE': coa.accession_number || coa.slug || '',
    'LIMS ID': coa.accession_number || coa.slug || '',
    'SAMPLE NAME': coa.display_name || coa.sample_name || '',
    'RECEIVED DATE': received,
    'MATRIX TYPE': matrix,
    'PUBLISHED DATE': published,
    'LOT CODE': coa.batch_number || '',
    'VIALS TESTED': vialsTested,
    'LABEL CLAIM': labelClaim,
    'ASSAY METHOD': methodLabel,

    // Average Net Peptide Content card
    VIALS_33: applyQuantityUnit(avgNetPeptide, claimUnit),
    VIALS_55: meanOfVials,
    VIALS_222: '',

    // Average Purity card
    VIALS_44: avgPurity,
    VIALS_66: meanOfVials,
    VIALS_22: '',

    SpecificationIdentity: withAssayMethodSpec(identity.specification || 'Peptide ID', assayMethod),
    ResultIdentity: identity.result,
    ConformityIdentity: identity.conformity,

    'SpecificationNet Peptide Content': withAssayMethodSpec(
      netContentSpecification || 'Label claim',
      assayMethod,
    ),
    'ResultNet Peptide Content': applyQuantityUnit(netContent.result, claimUnit),
    'ConformityNet Peptide Content': netContent.conformity,

    'SpecificationPurity HPLC': withAssayMethodSpec(
      purity.specification || (coa.purity_percent != null ? '≥98%' : ''),
      assayMethod,
    ),
    'ResultPurity HPLC': (() => {
      const raw = purity.result
        || (coa.purity_percent != null ? `${formatCoaDecimal(coa.purity_percent)}%` : '');
      if (!raw) return '';
      return raw
        .split(/\s*,\s*/)
        .map(part => formatPurityResultWithUncertainty(part))
        .filter(Boolean)
        .join(', ');
    })(),
    'ConformityPurity HPLC': purity.conformity || (coa.overall_result === 'pass' ? 'PASS' : coa.overall_result === 'fail' ? 'FAIL' : ''),

    SpecificationSterility: sterility.specification,
    ResultSterility: sterility.result,
    ConformitySterility: sterility.conformity,

    'SpecificationEndotoxins LAL': endotoxin.specification,
    'ResultEndotoxins LAL': endotoxin.result,
    'ConformityEndotoxins LAL': endotoxin.conformity,
  };

  const fenMark = stats.fentanyl_detection;
  const redrawBelowEndotoxins = fenMark === 'none_detected' || fenMark === 'detected';

  // When Fentanyl is on the COA we redraw the Heavy Metals block under it — leave Text2 blank.
  if (!redrawBelowEndotoxins) {
    const used = usedPanelNames(panels);
    const extras = panels.filter(
      p =>
        !used.has(p) &&
        !p.panel_name.toLowerCase().includes('fentanyl') &&
        !p.panel_name.toLowerCase().includes('molecular') &&
        (p.result?.trim() || p.specification?.trim() || /^blend content\b/i.test(p.panel_name)),
    );
    // Show blend component content rows first in the optional Text2 slots.
    extras.sort((a, b) => {
      const aBlend = /^blend content\b/i.test(a.panel_name) ? 0 : 1;
      const bBlend = /^blend content\b/i.test(b.panel_name) ? 0 : 1;
      return aBlend - bBlend;
    });

    // Optional molecular weight occupies the first Text2 slot when included.
    let slot = 0;
    if (stats.include_molecular_weight && stats.molecular_weight.trim()) {
      fields[`Text2_T1`] = `MW ${stats.molecular_weight.trim()} Da`;
      fields[`Text2_T6`] = 'PASS';
      slot = 1;
    }

    for (let i = slot; i < 5; i++) {
      const panel = extras[i - slot];
      fields[`Text2_T${i + 1}`] = panel
        ? (/^\s*ph\b/i.test(panel.panel_name)
          ? `pH ${panel.result || 'Pending'} (${panel.specification || '4.5–7.0'})`
          : (panel.panel_name.toLowerCase().startsWith('blend content')
            ? `${panel.panel_name.replace(/^blend content\s*[—–-]\s*/i, '').trim()}: ${applyQuantityUnit(panel.result || 'Pending', claimUnit)}`
            : (panel.result || panel.panel_name)))
        : '';
      fields[`Text2_T${i + 6}`] = panel ? conformityLabel(panel) : '';
    }
  } else {
    for (let i = 1; i <= 10; i++) fields[`Text2_T${i}`] = '';
  }

  return fields;
}
