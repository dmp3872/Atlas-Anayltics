import { COA, OrderSample, PanelResult } from './types';
import { OrderSampleMetadata, parseSampleMetadata, orderSampleIncludesFentanyl } from './coaPanels';

export const VIAL_SIZE_OPTIONS = ['3ml', '5ml', '10ml'] as const;
export type VialSizeOption = (typeof VIAL_SIZE_OPTIONS)[number];

export const HEAVY_METAL_NAMES = [
  'Lead (Pb)',
  'Arsenic (As)',
  'Cadmium (Cd)',
  'Mercury (Hg)',
  'Chromium (Cr)',
] as const;

export type HeavyMetalName = (typeof HEAVY_METAL_NAMES)[number];

export type SterilityMethod = 'pcr' | 'culture_14_day';

export const STERILITY_METHOD_LABELS: Record<SterilityMethod, string> = {
  pcr: 'PCR',
  culture_14_day: '14-day culture',
};

export const ENDOTOXIN_SPEC_EU_ML = '<= 5.0 EU/mL';

export interface ConformityPeptideRow {
  name: string;
  netContent: string;
  netPurity: string;
}

export interface LabCoaResults {
  identification: string;
  netContent: string;
  netPurity: string;
  molecularWeight: string;
  /** When false, Molecular Weight is omitted from the COA. */
  includeMolecularWeight: boolean;
  sterilityMethod: SterilityMethod;
  sterilityPass: boolean;
  endotoxinEuMl: string;
  endotoxinPass: boolean;
  /** When false, Endotoxin is omitted from the COA (e.g. revised Full QC). */
  includeEndotoxin: boolean;
  heavyMetals: Record<HeavyMetalName, string>;
  /** When false, Heavy Metals rows are omitted from the COA. */
  includeHeavyMetals: boolean;
  includeSterility: boolean;
  conformityPeptides: ConformityPeptideRow[];
  includeFentanyl: boolean;
  fentanylPass: boolean;
}

export const EMPTY_LAB_RESULTS: LabCoaResults = {
  identification: '',
  netContent: '',
  netPurity: '',
  molecularWeight: '',
  includeMolecularWeight: false,
  sterilityMethod: 'pcr',
  sterilityPass: true,
  endotoxinEuMl: '',
  endotoxinPass: true,
  includeEndotoxin: true,
  heavyMetals: {
    'Lead (Pb)': '',
    'Arsenic (As)': '',
    'Cadmium (Cd)': '',
    'Mercury (Hg)': '',
    'Chromium (Cr)': '',
  },
  includeHeavyMetals: true,
  includeSterility: true,
  conformityPeptides: [],
  includeFentanyl: false,
  fentanylPass: true,
};

/** Well-known peptide → CAS for chemist COA autocomplete. */
export const PEPTIDE_CAS_LOOKUP: { name: string; cas: string }[] = [
  { name: 'BPC-157', cas: '137266-51-2' },
  { name: 'TB-500', cas: '77591-33-4' },
  { name: 'GHK-Cu', cas: '49557-75-7' },
  { name: 'Ipamorelin', cas: '170851-70-4' },
  { name: 'CJC-1295', cas: '863288-34-0' },
  { name: 'Semaglutide', cas: '910463-68-2' },
  { name: 'Tirzepatide', cas: '2023788-19-2' },
  { name: 'Retatrutide', cas: '2381089-83-2' },
  { name: 'MOTS-c', cas: '1627580-64-6' },
  { name: 'Thymosin Beta-4', cas: '77591-33-4' },
  { name: 'PT-141', cas: '189691-06-3' },
  { name: 'Melanotan II', cas: '121062-08-6' },
  { name: 'AOD-9604', cas: '221231-10-3' },
  { name: 'Selank', cas: '129954-34-3' },
  { name: 'Semax', cas: '80714-61-0' },
];

export function lookupCas(query: string): { name: string; cas: string }[] {
  const q = query.trim().toLowerCase();
  if (!q) return PEPTIDE_CAS_LOOKUP.slice(0, 8);
  return PEPTIDE_CAS_LOOKUP.filter(
    p => p.name.toLowerCase().includes(q) || p.cas.includes(q),
  ).slice(0, 10);
}

export function casForSampleName(sampleName: string): string {
  const key = sampleName.trim().toLowerCase();
  if (!key) return '';
  const hit = PEPTIDE_CAS_LOOKUP.find(p => {
    const n = p.name.toLowerCase();
    return n === key || n.startsWith(`${key}-`) || n.startsWith(`${key} `) || key.includes(n);
  });
  return hit?.cas ?? '';
}

/** Normalizes a free-typed mg amount into "10 mg" (space before unit, trimmed). */
export function formatMgAmount(raw: string): string {
  const numeric = raw.trim().replace(/\s*mg\s*$/i, '').trim();
  return numeric ? `${numeric} mg` : '';
}

/** Normalizes a free-typed percent amount into "9.8%" (no space before unit). */
export function formatPurityPercent(raw: string): string {
  const numeric = raw.trim().replace(/%\s*$/, '').trim();
  return numeric ? `${numeric}%` : '';
}

/** Joins conformity row net-content amounts into one comma-separated string, e.g. "10 mg, 10.1 mg". */
export function joinConformityMg(rows: ConformityPeptideRow[]): string {
  return rows.map(r => formatMgAmount(r.netContent)).filter(Boolean).join(', ');
}

/** Joins conformity row net-purity amounts into one comma-separated string, e.g. "9.8%, 9.7%". */
export function joinConformityPurity(rows: ConformityPeptideRow[]): string {
  return rows.map(r => formatPurityPercent(r.netPurity)).filter(Boolean).join(', ');
}

export function buildLabResultsFromSample(metadata: OrderSample['metadata'], sampleName = ''): LabCoaResults {
  const meta = parseSampleMetadata(metadata);
  const identification = meta.peptide_identification?.trim() || sampleName.trim();
  const includeFentanyl = orderSampleIncludesFentanyl(metadata);
  const assayIds = Array.isArray(meta.individual_tests) ? meta.individual_tests.map(String) : [];
  const mode = typeof meta.test_mode === 'string' ? meta.test_mode : '';
  // Atlas Pro always includes biosafety metals/endotoxin; revised Full QC does not.
  const includeHeavyMetals =
    mode === 'atlas_pro' || assayIds.includes('heavy_metals_icpms');
  const includeEndotoxin =
    mode === 'atlas_pro' || assayIds.includes('endotoxin_usp85');
  const includeSterility =
    mode === 'atlas_pro' ||
    mode === 'full_qc' ||
    assayIds.includes('sterility_pcr') ||
    assayIds.includes('sterility_culture') ||
    // Legacy Full QC rows that still list endotoxin/metals in metadata still had sterility.
    assayIds.length === 0;
  return {
    ...EMPTY_LAB_RESULTS,
    identification,
    // Leave measured fields empty — label claim must not seed Net Content or averages.
    netContent: '',
    includeFentanyl,
    includeHeavyMetals,
    includeEndotoxin,
    includeSterility,
    conformityPeptides: [],
  };
}

/** Rebuild Issue COA form values from an existing certificate (restart / re-issue). */
export function buildLabResultsFromCoa(
  coa: Pick<COA, 'panel_results' | 'purity_percent' | 'molecular_weight' | 'result_summary' | 'sample_name'>,
  sampleMetadata?: OrderSample['metadata'],
): LabCoaResults {
  const base = buildLabResultsFromSample(sampleMetadata ?? null, coa.sample_name || '');
  const panels = Array.isArray(coa.panel_results) ? coa.panel_results : [];
  const summary = (coa.result_summary && typeof coa.result_summary === 'object')
    ? coa.result_summary as Record<string, unknown>
    : {};

  const findPanel = (...names: string[]) =>
    panels.find(p => names.some(n => p.panel_name.toLowerCase().includes(n.toLowerCase())));

  const idPanel = findPanel('identification');
  const netPanel = findPanel('net content', 'peptide content');
  const purityPanel = findPanel('net purity', 'purity');
  const mwPanel = findPanel('molecular weight');
  const sterilityPanel = findPanel('sterility');
  const endotoxinPanel = findPanel('endotoxin');
  const fentanylPanel = findPanel('fentanyl');

  const netParts = (netPanel?.result || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const purityParts = (purityPanel?.result || '')
    .split(',')
    .map(s => s.trim().replace(/%\s*$/, ''))
    .filter(Boolean);

  const primaryNet = netParts[0] || '';
  const primaryPurity = purityParts[0]
    || (coa.purity_percent != null ? String(coa.purity_percent) : '');

  const conformityPeptides: ConformityPeptideRow[] = [];
  const maxExtra = Math.max(netParts.length, purityParts.length) - 1;
  for (let i = 1; i <= maxExtra; i += 1) {
    conformityPeptides.push({
      name: idPanel?.result?.trim() || coa.sample_name || `Vial ${i + 1}`,
      netContent: netParts[i] || '',
      netPurity: purityParts[i] || '',
    });
  }

  const heavyMetals = { ...base.heavyMetals };
  let includeHeavyMetals = false;
  let heavyMetalsPass = true;
  for (const metal of HEAVY_METAL_NAMES) {
    const row = panels.find(p => p.panel_name === metal);
    if (row) {
      includeHeavyMetals = true;
      heavyMetals[metal] = row.result || '';
      if (row.pass === false) heavyMetalsPass = false;
    }
  }

  const sterilityResult = sterilityPanel?.result || '';
  const sterilityMethod: SterilityMethod =
    /14.?day|culture/i.test(sterilityResult)
    || summary.sterility_method === 'culture_14_day'
      ? 'culture_14_day'
      : 'pcr';

  const endotoxinRaw = endotoxinPanel?.result || '';
  const endotoxinEuMl = endotoxinRaw
    .replace(/\s*\(LAL\)\s*$/i, '')
    .replace(/\s*EU\s*\/\s*mL\s*$/i, '')
    .trim()
    || (typeof summary.endotoxin_eu_ml === 'string' ? summary.endotoxin_eu_ml : ENDOTOXIN_PASS_RESULT);

  const mwRaw = mwPanel?.result?.trim()
    || (coa.molecular_weight != null ? String(coa.molecular_weight) : '')
    || (typeof summary.molecular_weight === 'string' ? summary.molecular_weight : '');

  return {
    ...base,
    identification: idPanel?.result?.trim() || base.identification,
    netContent: primaryNet.replace(/\s*mg$/i, '').trim() || primaryNet,
    netPurity: primaryPurity,
    molecularWeight: mwRaw,
    includeMolecularWeight: !!mwRaw || summary.include_molecular_weight === true,
    sterilityMethod,
    sterilityPass: sterilityPanel ? sterilityPanel.pass !== false && !/^detected\b/i.test(sterilityResult) : true,
    includeSterility: !!sterilityPanel || base.includeSterility,
    endotoxinEuMl,
    endotoxinPass: endotoxinPanel ? endotoxinPanel.pass !== false : true,
    includeEndotoxin: !!endotoxinPanel || base.includeEndotoxin,
    includeHeavyMetals: includeHeavyMetals || base.includeHeavyMetals,
    heavyMetalsPass,
    heavyMetals,
    includeFentanyl: !!fentanylPanel || base.includeFentanyl,
    fentanylPass: fentanylPanel ? fentanylPanel.pass !== false : true,
    conformityPeptides,
  };
}

export function sterilitySpecLabel(_method?: SterilityMethod): string {
  return 'Not Detected';
}

export function labResultsToPanelResults(results: LabCoaResults): PanelResult[] {
  const rows: PanelResult[] = [
    { panel_name: 'Identification', specification: 'Peptide ID', result: results.identification, pass: !!results.identification.trim() },
    { panel_name: 'Net Content', specification: 'Label claim', result: results.netContent, pass: !!results.netContent.trim() },
    { panel_name: 'Net Purity', specification: '≥98%', result: results.netPurity ? `${results.netPurity}%` : '', pass: true },
  ];

  if (results.includeMolecularWeight && results.molecularWeight.trim()) {
    rows.push({
      panel_name: 'Molecular Weight (Da)',
      specification: '+/- 2 Da',
      result: results.molecularWeight.trim(),
      pass: true,
    });
  }

  if (results.includeSterility !== false) {
    rows.push({
      panel_name: 'Sterility',
      specification: 'Not Detected',
      result: results.sterilityPass
        ? `Not Detected (${STERILITY_METHOD_LABELS[results.sterilityMethod]})`
        : `Detected (${STERILITY_METHOD_LABELS[results.sterilityMethod]})`,
      pass: results.sterilityPass,
    });
  }

  if (results.includeEndotoxin !== false) {
    rows.push({
      panel_name: 'Endotoxin',
      specification: ENDOTOXIN_SPEC_EU_ML,
      result: results.endotoxinEuMl.trim()
        ? `${results.endotoxinEuMl.trim()} EU/mL (LAL)`
        : '',
      pass: results.endotoxinPass,
    });
  }

  if (results.includeHeavyMetals !== false) {
    for (const metal of HEAVY_METAL_NAMES) {
      rows.push({
        panel_name: metal,
        specification: 'ppm',
        result: results.heavyMetals[metal] ?? '',
        pass: true,
      });
    }
  }

  if (results.includeFentanyl) {
    rows.push({
      panel_name: 'Fentanyl Detection',
      specification: 'None Detected',
      result: results.fentanylPass ? 'None Detected' : 'Detected',
      pass: results.fentanylPass,
    });
  }

  // Fold conformity vials into Net Content / Net Purity (one line each), not extra rows.
  const contentParts: string[] = [];
  const purityParts: string[] = [];
  const asMg = (v: string) => {
    const t = v.trim();
    if (!t) return '';
    const m = t.match(/^(-?\d+(?:\.\d+)?)\s*(mg)?$/i);
    return m ? `${m[1]} mg` : t;
  };
  const asPct = (v: string) => {
    const t = v.trim();
    if (!t) return '';
    const m = t.match(/^(-?\d+(?:\.\d+)?)\s*%?$/);
    return m ? `${m[1]}%` : t;
  };

  if (results.netContent.trim()) contentParts.push(asMg(results.netContent));
  if (results.netPurity.trim()) purityParts.push(asPct(results.netPurity));

  for (const row of results.conformityPeptides) {
    if (!row.name.trim() && !row.netContent.trim() && !row.netPurity.trim()) continue;
    if (row.netContent.trim()) contentParts.push(asMg(row.netContent));
    if (row.netPurity.trim()) purityParts.push(asPct(row.netPurity));
  }

  if (contentParts.length > 0) {
    const net = rows.find(r => r.panel_name === 'Net Content');
    if (net) net.result = contentParts.join(', ');
  }
  if (purityParts.length > 0) {
    const pur = rows.find(r => r.panel_name === 'Net Purity');
    if (pur) pur.result = purityParts.join(', ');
  }

  return rows;
}

export function parsePurityPercent(netPurity: string): number | null {
  const n = parseFloat(netPurity.replace(/%/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

export function parseMolecularWeight(mw: string): number | null {
  const n = parseFloat(mw.trim());
  return Number.isFinite(n) ? n : null;
}

export type { OrderSampleMetadata };
