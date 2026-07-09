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
  sterilityPass: boolean;
  endotoxinEuMg: string;
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
  sterilityPass: true,
  endotoxinEuMg: '',
  heavyMetals: {
    'Lead (Pb)': '',
    'Arsenic (As)': '',
    'Cadmium (Cd)': '',
    'Mercury (Hg)': '',
    'Chromium (Cr)': '',
  },
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
  const hit = PEPTIDE_CAS_LOOKUP.find(
    p => p.name.toLowerCase() === key || key.includes(p.name.toLowerCase()),
  );
  return hit?.cas ?? '';
}

export function buildLabResultsFromSample(metadata: OrderSample['metadata'], sampleName = ''): LabCoaResults {
  const meta = parseSampleMetadata(metadata);
  const includeFentanyl = orderSampleIncludesFentanyl(metadata);
  const blendComponents = meta.blend_components?.filter(c => c.name.trim()) ?? [];

  if (meta.sample_type === 'blend' && blendComponents.length > 0) {
    return {
      ...EMPTY_LAB_RESULTS,
      identification: meta.peptide_identification?.trim() || sampleName.trim() || meta.blend_label?.trim() || '',
      netContent: meta.labeled_content?.trim() ?? '',
      includeFentanyl,
      conformityPeptides: blendComponents.map(c => ({
        name: c.name.trim(),
        netContent: `${c.amount_mg.trim().replace(/\s*mg\s*$/i, '')}mg`,
        netPurity: '',
      })),
    };
  }

  const identification = meta.peptide_identification?.trim() || sampleName.trim();
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

export function labResultsToPanelResults(results: LabCoaResults): PanelResult[] {
  const rows: PanelResult[] = [
    { panel_name: 'Identification', specification: 'Peptide ID', result: results.identification, pass: !!results.identification.trim() },
    { panel_name: 'Net Content', specification: 'Label claim', result: results.netContent, pass: !!results.netContent.trim() },
    { panel_name: 'Net Purity', specification: '≥95.0%', result: results.netPurity ? `${results.netPurity}%` : '', pass: true },
    { panel_name: 'Molecular Weight (Da)', specification: '± 2 Da', result: results.molecularWeight, pass: !!results.molecularWeight.trim() },
    { panel_name: 'Sterility', specification: 'Pass / Fail', result: results.sterilityPass ? 'Pass' : 'Fail', pass: results.sterilityPass },
    { panel_name: 'Endotoxin', specification: 'EU/mg', result: results.endotoxinEuMg, pass: !!results.endotoxinEuMg.trim() },
  ];

  for (const metal of HEAVY_METAL_NAMES) {
    rows.push({
      panel_name: metal,
      specification: 'ppm',
      result: results.heavyMetals[metal] ?? '',
      pass: true,
    });
  }

  if (results.includeFentanyl) {
    rows.push({
      panel_name: 'Fentanyl Detection',
      specification: 'Pass / Fail',
      result: results.fentanylPass ? 'Pass' : 'Fail',
      pass: results.fentanylPass,
    });
  }

  for (const row of results.conformityPeptides) {
    if (!row.name.trim()) continue;
    rows.push({
      panel_name: `Conformity — ${row.name.trim()}`,
      specification: 'Content / Purity',
      result: [row.netContent, row.netPurity ? `${row.netPurity}%` : ''].filter(Boolean).join(' · '),
      pass: true,
    });
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
