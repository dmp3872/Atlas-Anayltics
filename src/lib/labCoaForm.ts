import { COA, OrderSample, PanelResult } from './types';
import { OrderSampleMetadata, parseSampleMetadata, orderSampleIncludesFentanyl } from './coaPanels';
import { ATLAS_PRO_INCLUDED_CONFORMITY_VIALS } from './orderCatalog';

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

/** Empty metal cells while Heavy Metals conformity is still Pending. */
export function heavyMetalsEmptyDefaults(): Record<HeavyMetalName, string> {
  return {
    'Lead (Pb)': '',
    'Arsenic (As)': '',
    'Cadmium (Cd)': '',
    'Mercury (Hg)': '',
    'Chromium (Cr)': '',
  };
}

/** Pass / fail / pending for biosafety assays that may return after the COA is started. */
export type AssayPassState = boolean | null;

export function assayPassSelectValue(state: AssayPassState): 'pass' | 'fail' | 'pending' {
  if (state === true) return 'pass';
  if (state === false) return 'fail';
  return 'pending';
}

export function assayPassFromSelect(value: string): AssayPassState {
  if (value === 'pass') return true;
  if (value === 'fail') return false;
  return null;
}

export function parseAssayPassState(value: unknown, fallback: AssayPassState = null): AssayPassState {
  if (value === true || value === false) return value;
  if (value === 'pass') return true;
  if (value === 'fail') return false;
  if (value === 'pending' || value === null) return null;
  return fallback;
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

/** One peptide in a blend — claim from the order, tested net content from the lab. */
export interface BlendPeptideRow {
  name: string;
  claimMg: string;
  netContent: string;
}

export const BLEND_CONTENT_PANEL_PREFIX = 'Blend Content — ';

export function blendContentPanelName(peptideName: string): string {
  return `${BLEND_CONTENT_PANEL_PREFIX}${peptideName.trim()}`;
}

export function parseBlendContentPanelName(panelName: string): string | null {
  const m = /^blend content\s*[—–-]\s*(.+)$/i.exec((panelName || '').trim());
  return m ? m[1].trim() || null : null;
}

export function isBlendContentPanel(panelName: string): boolean {
  return parseBlendContentPanelName(panelName) != null;
}

export function sampleIsBlend(metadata: OrderSample['metadata'] | null | undefined): boolean {
  const meta = parseSampleMetadata(metadata ?? null);
  if (meta.sample_type === 'blend' || meta.category === 'peptide_blend') return true;
  return Array.isArray(meta.blend_components)
    && meta.blend_components.some(c => (c?.name || '').trim());
}

export function blendPeptidesFromMetadata(metadata: OrderSample['metadata'] | null | undefined): BlendPeptideRow[] {
  const meta = parseSampleMetadata(metadata ?? null);
  const components = Array.isArray(meta.blend_components) ? meta.blend_components : [];
  return components
    .map(c => ({
      name: (c?.name || '').trim(),
      claimMg: (c?.amount_mg || '').trim(),
      netContent: '',
    }))
    .filter(c => c.name);
}

/** Extra conformity vials beyond the primary assay vial (Atlas Pro includes 3 total). */
export function extraConformityVialCount(metadata: OrderSample['metadata'] | null | undefined): number {
  const meta = parseSampleMetadata(metadata ?? null);
  const extras = typeof meta.conformity_extra === 'number' ? Math.max(0, meta.conformity_extra) : 0;
  if (meta.test_mode === 'atlas_pro') {
    return Math.max(0, ATLAS_PRO_INCLUDED_CONFORMITY_VIALS - 1) + extras;
  }
  return extras;
}

/** One conformity vial for a blend: peptide names auto-filled, content empty, no per-peptide purity. */
export function blendConformityVialRows(blendPeptides: BlendPeptideRow[]): ConformityPeptideRow[] {
  return blendPeptides
    .filter(p => p.name.trim())
    .map(p => ({
      name: p.name.trim(),
      netContent: '',
      netPurity: '',
    }));
}

/** Seed N extra blend conformity vials (total + peptide names). */
export function seedBlendConformityPeptides(
  blendPeptides: BlendPeptideRow[],
  vialCount: number,
): ConformityPeptideRow[] {
  if (blendPeptides.length === 0 || vialCount <= 0) return [];
  const rows: ConformityPeptideRow[] = [];
  for (let i = 0; i < vialCount; i += 1) {
    rows.push({ name: `Total (vial ${i + 2})`, netContent: '', netPurity: '' });
    rows.push(...blendConformityVialRows(blendPeptides));
  }
  return rows;
}

export function isBlendTotalConformityRow(name: string): boolean {
  return /^total\b/i.test((name || '').trim());
}

export interface LabCoaResults {
  identification: string;
  netContent: string;
  netPurity: string;
  molecularWeight: string;
  /** When false, Molecular Weight is omitted from the COA. */
  includeMolecularWeight: boolean;
  sterilityMethod: SterilityMethod;
  /** null = Pending until the lab result is entered. */
  sterilityPass: AssayPassState;
  endotoxinEuMl: string;
  /** null = Pending until the lab result is entered. */
  endotoxinPass: AssayPassState;
  /** When false, Endotoxin is omitted from the COA (e.g. revised Full QC). */
  includeEndotoxin: boolean;
  /** null = Pending; true fills metal boxes with Not Detected. */
  heavyMetalsPass: AssayPassState;
  heavyMetals: Record<HeavyMetalName, string>;
  /** When false, Heavy Metals rows are omitted from the COA. */
  includeHeavyMetals: boolean;
  includeSterility: boolean;
  conformityPeptides: ConformityPeptideRow[];
  /**
   * Blend components listed on the order. Chemist fills net content per peptide;
   * purity stays on the total Net Purity field only.
   */
  blendPeptides: BlendPeptideRow[];
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
  sterilityPass: null,
  endotoxinEuMl: '',
  endotoxinPass: null,
  includeEndotoxin: true,
  heavyMetalsPass: null,
  heavyMetals: heavyMetalsEmptyDefaults(),
  includeHeavyMetals: true,
  includeSterility: true,
  conformityPeptides: [],
  blendPeptides: [],
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

/** Normalizes a free-typed mg amount into "10.0 mg" (always includes a decimal). */
export function formatMgAmount(raw: string): string {
  const numeric = raw.trim().replace(/\s*mg\s*$/i, '').trim();
  if (!numeric) return '';
  const formatted = formatCoaDecimal(numeric);
  return formatted ? `${formatted} mg` : '';
}

/** Normalizes a free-typed percent amount into "99.8%" (always includes a decimal). */
export function formatPurityPercent(raw: string): string {
  const numeric = raw.trim().replace(/%\s*$/, '').trim();
  if (!numeric) return '';
  const formatted = formatCoaDecimal(numeric);
  return formatted ? `${formatted}%` : '';
}

/**
 * COA numeric display requirement: always include a decimal place.
 * 10 → "10.0", 10.5 → "10.5", 99.87 → "99.9" (one decimal).
 */
export function formatCoaDecimal(raw: string | number): string {
  if (raw === '' || raw == null) return '';
  const n = typeof raw === 'number'
    ? raw
    : Number(String(raw).trim().replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)?.[0] ?? NaN);
  if (!Number.isFinite(n)) return '';
  return (Math.round(n * 10) / 10).toFixed(1);
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
  const blendPeptides = blendPeptidesFromMetadata(metadata);
  const isBlend = sampleIsBlend(metadata) || blendPeptides.length > 0;
  const identification = isBlend && blendPeptides.length > 0
    ? blendPeptides.map(p => p.name).join(' + ')
    : (meta.peptide_identification?.trim() || sampleName.trim());
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
    conformityPeptides: isBlend
      ? seedBlendConformityPeptides(blendPeptides, extraConformityVialCount(metadata))
      : [],
    blendPeptides,
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
    panels.find(p => {
      if (isBlendContentPanel(p.panel_name)) return false;
      return names.some(n => p.panel_name.toLowerCase().includes(n.toLowerCase()));
    });

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

  // Prefer order metadata for blend component names/claims; overlay saved panel results.
  const blendFromMeta = blendPeptidesFromMetadata(sampleMetadata);
  const blendPanelParts = panels
    .map(p => {
      const name = parseBlendContentPanelName(p.panel_name);
      if (!name) return null;
      const parts = (p.result || '')
        .split(',')
        .map(s => s.trim().replace(/\s*mg\s*$/i, '').trim())
        .filter(Boolean);
      return {
        name,
        claimMg: (p.specification || '').replace(/^label claim:?\s*/i, '').replace(/\s*mg\s*$/i, '').trim(),
        parts,
      };
    })
    .filter((row): row is { name: string; claimMg: string; parts: string[] } => !!row);

  const blendPeptides: BlendPeptideRow[] = (blendFromMeta.length > 0 ? blendFromMeta : blendPanelParts.map(p => ({
    name: p.name,
    claimMg: p.claimMg,
    netContent: '',
  }))).map(row => {
    const saved = blendPanelParts.find(p => p.name.toLowerCase() === row.name.toLowerCase());
    return {
      ...row,
      claimMg: row.claimMg || saved?.claimMg || '',
      netContent: saved?.parts[0] || row.netContent || '',
    };
  });

  // Also accept result_summary.blend_peptides when panels were wiped.
  if (blendPeptides.length === 0 && Array.isArray(summary.blend_peptides)) {
    for (const raw of summary.blend_peptides) {
      if (!raw || typeof raw !== 'object') continue;
      const row = raw as Record<string, unknown>;
      const name = String(row.name || '').trim();
      if (!name) continue;
      blendPeptides.push({
        name,
        claimMg: String(row.claimMg || row.claim_mg || '').trim(),
        netContent: String(row.netContent || row.net_content || '').trim(),
      });
    }
  }

  const isBlend = blendPeptides.length > 0;
  const conformityPeptides: ConformityPeptideRow[] = [];

  if (isBlend) {
    // Extra vial totals from comma-separated Net Content / Net Purity.
    const maxExtraTotals = Math.max(netParts.length, purityParts.length) - 1;
    for (let i = 1; i <= maxExtraTotals; i += 1) {
      conformityPeptides.push({
        name: `Total (vial ${i + 1})`,
        netContent: (netParts[i] || '').replace(/\s*mg\s*$/i, '').trim(),
        netPurity: purityParts[i] || '',
      });
    }
    // Extra per-peptide measurements after the primary value on each Blend Content panel.
    const maxExtraPeptide = Math.max(0, ...blendPanelParts.map(p => p.parts.length - 1));
    for (let vial = 1; vial <= maxExtraPeptide; vial += 1) {
      for (const peptide of blendPeptides) {
        const saved = blendPanelParts.find(p => p.name.toLowerCase() === peptide.name.toLowerCase());
        conformityPeptides.push({
          name: peptide.name,
          netContent: saved?.parts[vial] || '',
          netPurity: '',
        });
      }
    }
    // If COA had no extra peptide values yet, keep order-seeded blank conformity vials.
    if (maxExtraPeptide === 0 && maxExtraTotals === 0 && base.conformityPeptides.length > 0) {
      conformityPeptides.push(...base.conformityPeptides);
    }
  } else {
    const maxExtra = Math.max(netParts.length, purityParts.length) - 1;
    for (let i = 1; i <= maxExtra; i += 1) {
      conformityPeptides.push({
        name: idPanel?.result?.trim() || coa.sample_name || `Vial ${i + 1}`,
        netContent: netParts[i] || '',
        netPurity: purityParts[i] || '',
      });
    }
  }

  const heavyMetals = { ...base.heavyMetals };
  let includeHeavyMetals = false;
  let sawMetal = false;
  let sawFilledMetal = false;
  let anyMetalFail = false;
  let anyMetalPending = false;
  for (const metal of HEAVY_METAL_NAMES) {
    const row = panels.find(p => p.panel_name === metal);
    if (row) {
      includeHeavyMetals = true;
      sawMetal = true;
      const result = (row.result || '').trim();
      const pendingText = !result || /^pending$/i.test(result);
      heavyMetals[metal] = pendingText ? '' : result;
      if (!pendingText) sawFilledMetal = true;
      if (row.pass === null || pendingText) anyMetalPending = true;
      else if (row.pass === false) anyMetalFail = true;
    }
  }
  const heavyMetalsPass: AssayPassState = !sawMetal
    ? parseAssayPassState(summary.heavy_metals_pass, null)
    : anyMetalFail
      ? false
      : (!sawFilledMetal || anyMetalPending)
        ? null
        : true;

  const sterilityResult = (sterilityPanel?.result || '').trim();
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
    || (typeof summary.endotoxin_eu_ml === 'string' ? summary.endotoxin_eu_ml : '');

  const mwRaw = mwPanel?.result?.trim()
    || (coa.molecular_weight != null ? String(coa.molecular_weight) : '')
    || (typeof summary.molecular_weight === 'string' ? summary.molecular_weight : '');

  const sterilityPass: AssayPassState = sterilityPanel
    ? (sterilityPanel.pass === null || !sterilityResult || /^pending$/i.test(sterilityResult)
      ? parseAssayPassState(summary.sterility_pass, null)
      : sterilityPanel.pass !== false && !/^detected\b/i.test(sterilityResult))
    : parseAssayPassState(summary.sterility_pass, null);

  const endotoxinPass: AssayPassState = endotoxinPanel
    ? (endotoxinPanel.pass === null
      || !(endotoxinPanel.result || '').trim()
      || /^pending$/i.test((endotoxinPanel.result || '').trim())
      ? parseAssayPassState(summary.endotoxin_pass, null)
      : endotoxinPanel.pass !== false)
    : parseAssayPassState(summary.endotoxin_pass, null);

  return {
    ...base,
    identification: idPanel?.result?.trim() || base.identification,
    netContent: primaryNet.replace(/\s*mg$/i, '').trim() || primaryNet,
    netPurity: primaryPurity,
    molecularWeight: mwRaw,
    includeMolecularWeight: !!mwRaw || summary.include_molecular_weight === true,
    sterilityMethod,
    sterilityPass,
    includeSterility: !!sterilityPanel || base.includeSterility,
    endotoxinEuMl,
    endotoxinPass,
    includeEndotoxin: !!endotoxinPanel || base.includeEndotoxin,
    includeHeavyMetals: includeHeavyMetals || base.includeHeavyMetals,
    heavyMetalsPass,
    heavyMetals,
    includeFentanyl: !!fentanylPanel || base.includeFentanyl,
    fentanylPass: fentanylPanel ? fentanylPanel.pass !== false : true,
    conformityPeptides,
    blendPeptides: blendPeptides.length > 0 ? blendPeptides : base.blendPeptides,
  };
}

export function sterilitySpecLabel(_method?: SterilityMethod): string {
  return 'Not Detected';
}

export function labResultsToPanelResults(results: LabCoaResults): PanelResult[] {
  const isBlend = results.blendPeptides.some(r => r.name.trim());
  const rows: PanelResult[] = [
    {
      panel_name: 'Identification',
      specification: isBlend ? 'Blend peptide ID' : 'Peptide ID',
      result: results.identification,
      pass: !!results.identification.trim(),
    },
    {
      panel_name: 'Net Content',
      specification: isBlend ? 'Total peptide content' : 'Label claim',
      result: formatMgAmount(results.netContent) || results.netContent,
      pass: !!results.netContent.trim(),
    },
    {
      panel_name: 'Net Purity',
      specification: '≥98%',
      result: results.netPurity.trim() ? formatPurityPercent(results.netPurity) : '',
      pass: true,
    },
  ];

  for (const row of results.blendPeptides) {
    const name = row.name.trim();
    if (!name) continue;
    const claim = row.claimMg.trim();
    const contentParts = [formatMgAmount(row.netContent)].filter(Boolean);
    for (const c of results.conformityPeptides) {
      if (isBlendTotalConformityRow(c.name)) continue;
      if (c.name.trim().toLowerCase() !== name.toLowerCase()) continue;
      const formatted = formatMgAmount(c.netContent);
      if (formatted) contentParts.push(formatted);
    }
    rows.push({
      panel_name: blendContentPanelName(name),
      specification: claim ? `Label claim: ${claim} mg` : 'Label claim',
      result: contentParts.join(', '),
      pass: contentParts.length > 0,
    });
  }

  if (results.includeMolecularWeight && results.molecularWeight.trim()) {
    rows.push({
      panel_name: 'Molecular Weight (Da)',
      specification: '+/- 2 Da',
      result: results.molecularWeight.trim(),
      pass: true,
    });
  }

  if (results.includeSterility !== false) {
    if (results.sterilityPass === null) {
      rows.push({
        panel_name: 'Sterility',
        specification: 'Not Detected',
        result: 'Pending',
        pass: null,
      });
    } else {
      rows.push({
        panel_name: 'Sterility',
        specification: 'Not Detected',
        result: results.sterilityPass
          ? `Not Detected (${STERILITY_METHOD_LABELS[results.sterilityMethod]})`
          : `Detected (${STERILITY_METHOD_LABELS[results.sterilityMethod]})`,
        pass: results.sterilityPass,
      });
    }
  }

  if (results.includeEndotoxin !== false) {
    if (results.endotoxinPass === null) {
      rows.push({
        panel_name: 'Endotoxin',
        specification: ENDOTOXIN_SPEC_EU_ML,
        result: 'Pending',
        pass: null,
      });
    } else {
      rows.push({
        panel_name: 'Endotoxin',
        specification: ENDOTOXIN_SPEC_EU_ML,
        result: formatEndotoxinResult(results.endotoxinEuMl),
        pass: results.endotoxinPass,
      });
    }
  }

  if (results.includeHeavyMetals !== false) {
    for (const metal of HEAVY_METAL_NAMES) {
      const filled = (results.heavyMetals[metal] ?? '').trim();
      const pending = results.heavyMetalsPass === null;
      rows.push({
        panel_name: metal,
        specification: HEAVY_METAL_USP_SPECS[metal],
        result: pending ? 'Pending' : filled,
        pass: pending ? null : results.heavyMetalsPass === true,
      });
    }
  }

  if (results.includeFentanyl) {
    rows.push({
      panel_name: 'Fentanyl Detection',
      specification: 'Not Detected',
      result: results.fentanylPass ? 'Not Detected' : 'Detected',
      pass: results.fentanylPass,
    });
  }

  // Fold multi-vial conformity into Net Content / Net Purity totals only — never blend component rows.
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
  return formatCoaDecimal(mean);
}

function collectContentPurityParts(results: LabCoaResults): {
  contentParts: string[];
  purityParts: string[];
} {
  const contentParts: string[] = [];
  const purityParts: string[] = [];
  const asMg = (v: string) => formatMgAmount(v);
  const asPct = (v: string) => formatPurityPercent(v);

  // Primary assay fields = first vial tested. Conformity rows = additional measured vials
  // only (never seed them from label claim — that inflated averages for single-vial COAs).
  if (results.netContent.trim()) contentParts.push(asMg(results.netContent));
  if (results.netPurity.trim()) purityParts.push(asPct(results.netPurity));

  const isBlend = results.blendPeptides.some(r => r.name.trim());
  const blendNames = new Set(
    results.blendPeptides.map(r => r.name.trim().toLowerCase()).filter(Boolean),
  );

  for (const row of results.conformityPeptides) {
    if (!row.name.trim() && !row.netContent.trim() && !row.netPurity.trim()) continue;
    if (isBlend) {
      // Per-peptide blend conformity rows feed Blend Content panels, not total averages.
      // Only explicit "Total …" rows (or unknown names) contribute to vial totals/purity.
      const nameKey = row.name.trim().toLowerCase();
      if (blendNames.has(nameKey) && !isBlendTotalConformityRow(row.name)) continue;
      if (row.netContent.trim()) contentParts.push(asMg(row.netContent));
      if (row.netPurity.trim()) purityParts.push(asPct(row.netPurity));
      continue;
    }
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
  const net = panels.find(p => /net content|peptide content/i.test(p.panel_name) && !/^blend content\b/i.test(p.panel_name));
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
