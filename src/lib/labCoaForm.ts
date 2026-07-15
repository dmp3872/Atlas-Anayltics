import { OrderSample, PanelResult } from './types';
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

/** Default result when Heavy Metals conformity is PASS. */
export const HEAVY_METAL_PASS_RESULT = 'Not Detected';

export const HEAVY_METAL_USP_SPECS: Record<HeavyMetalName, string> = {
  'Lead (Pb)': 'NMT 1 ppm',
  'Arsenic (As)': 'NMT 1.5 ppm',
  'Cadmium (Cd)': 'NMT 0.5 ppm',
  'Mercury (Hg)': 'NMT 1.5 ppm',
  'Chromium (Cr)': 'NMT 10 ppm',
};

export function heavyMetalsPassDefaults(): Record<HeavyMetalName, string> {
  return {
    'Lead (Pb)': HEAVY_METAL_PASS_RESULT,
    'Arsenic (As)': HEAVY_METAL_PASS_RESULT,
    'Cadmium (Cd)': HEAVY_METAL_PASS_RESULT,
    'Mercury (Hg)': HEAVY_METAL_PASS_RESULT,
    'Chromium (Cr)': HEAVY_METAL_PASS_RESULT,
  };
}

export type SterilityMethod = 'pcr' | 'culture_14_day';

export const STERILITY_METHOD_LABELS: Record<SterilityMethod, string> = {
  pcr: 'PCR',
  culture_14_day: '14-day culture',
};

export const ENDOTOXIN_SPEC_EU_ML = '≤ 5.0 EU/mL';
/** Default measured result when Endotoxin conformity is PASS. */
export const ENDOTOXIN_PASS_RESULT = '≤ 5.0 EU/mL';

/** Format endotoxin entry for panel_results without doubling "EU/mL". */
export function formatEndotoxinResult(value: string): string {
  const v = value.trim();
  if (!v) return '';
  if (/eu\s*\/\s*ml/i.test(v)) {
    return /\(\s*lal\s*\)/i.test(v) ? v : `${v} (LAL)`;
  }
  return `${v} EU/mL (LAL)`;
}

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
  /** When true, metal result boxes default to Not Detected. */
  heavyMetalsPass: boolean;
  heavyMetals: Record<HeavyMetalName, string>;
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
  endotoxinEuMl: ENDOTOXIN_PASS_RESULT,
  endotoxinPass: true,
  heavyMetalsPass: true,
  heavyMetals: heavyMetalsPassDefaults(),
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
  return {
    ...EMPTY_LAB_RESULTS,
    identification,
    netContent: meta.labeled_content?.trim() ?? '',
    includeFentanyl,
    conformityPeptides: identification
      ? [{ name: identification, netContent: meta.labeled_content?.trim() ?? '', netPurity: '' }]
      : [],
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

  rows.push(
    {
      panel_name: 'Sterility',
      specification: 'Not Detected',
      result: results.sterilityPass
        ? `Not Detected (${STERILITY_METHOD_LABELS[results.sterilityMethod]})`
        : `Detected (${STERILITY_METHOD_LABELS[results.sterilityMethod]})`,
      pass: results.sterilityPass,
    },
    {
      panel_name: 'Endotoxin',
      specification: ENDOTOXIN_SPEC_EU_ML,
      result: formatEndotoxinResult(results.endotoxinEuMl),
      pass: results.endotoxinPass,
    },
  );

  for (const metal of HEAVY_METAL_NAMES) {
    rows.push({
      panel_name: metal,
      specification: HEAVY_METAL_USP_SPECS[metal],
      result: (results.heavyMetals[metal] ?? '').trim(),
      pass: results.heavyMetalsPass,
    });
  }

  if (results.includeFentanyl) {
    rows.push({
      panel_name: 'Fentanyl Detection',
      specification: 'Not Detected',
      result: results.fentanylPass ? 'Not Detected' : 'Detected',
      pass: results.fentanylPass,
    });
  }

  // Fold conformity vials into Net Content / Net Purity (one line each), not extra rows.
  const { contentParts, purityParts } = collectContentPurityParts(results);

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

function parseNumericTokens(raw: string): number[] {
  return (raw || '')
    .split(',')
    .map(part => {
      const m = part.trim().match(/-?\d+(?:\.\d+)?/);
      return m ? Number(m[0]) : NaN;
    })
    .filter((n): n is number => Number.isFinite(n));
}

function formatMeanNumber(values: number[]): string {
  if (values.length === 0) return '';
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const rounded = Math.round(mean * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded);
}

function collectContentPurityParts(results: LabCoaResults): {
  contentParts: string[];
  purityParts: string[];
} {
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
  return { contentParts, purityParts };
}

export type AssayAverages = {
  avg_net_peptide_content: string;
  avg_purity: string;
  mean_of_vials_tested: string;
  content_values: string[];
  purity_values: string[];
};

/** Mean net peptide content / purity from Issue COA assay + conformity rows. */
export function computeLabAssayAverages(results: LabCoaResults): AssayAverages {
  const { contentParts, purityParts } = collectContentPurityParts(results);
  const contentNums = contentParts.flatMap(parseNumericTokens);
  const purityNums = purityParts.flatMap(parseNumericTokens);
  const meanMg = formatMeanNumber(contentNums);
  const meanPct = formatMeanNumber(purityNums);
  const vialCount = Math.max(contentParts.length, purityParts.length, contentNums.length ? 1 : 0);

  return {
    avg_net_peptide_content: meanMg ? `${meanMg} mg` : '',
    avg_purity: meanPct ? `${meanPct}%` : '',
    mean_of_vials_tested: vialCount > 0 ? String(vialCount) : '',
    content_values: contentParts,
    purity_values: purityParts,
  };
}

/** Recover averages from an issued COA's Net Content / Net Purity panel strings. */
export function computeAssayAveragesFromPanels(
  panels: PanelResult[],
  purityPercent?: number | null,
): AssayAverages {
  const net = panels.find(p => /net content|peptide content/i.test(p.panel_name));
  const pur = panels.find(p => /net purity|^purity\b/i.test(p.panel_name));
  const contentParts = (net?.result || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const purityParts = (pur?.result || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const contentNums = contentParts.flatMap(parseNumericTokens);
  const purityNums = purityParts.flatMap(parseNumericTokens);
  const meanMg = formatMeanNumber(contentNums);
  const meanPct = formatMeanNumber(purityNums);
  const vialCount = Math.max(contentParts.length, purityParts.length, contentNums.length ? 1 : 0);

  return {
    avg_net_peptide_content: meanMg ? `${meanMg} mg` : '',
    avg_purity: meanPct
      ? `${meanPct}%`
      : (purityPercent != null && Number.isFinite(purityPercent) ? `${purityPercent}%` : ''),
    mean_of_vials_tested: vialCount > 0 ? String(vialCount) : '',
    content_values: contentParts,
    purity_values: purityParts,
  };
}

export type { OrderSampleMetadata };
