import { COA, OrderSample, PanelResult } from './types';
import { OrderSampleMetadata, parseSampleMetadata, orderSampleIncludesFentanyl } from './coaPanels';
import { ATLAS_PRO_INCLUDED_CONFORMITY_VIALS, formatLabelClaim } from './orderCatalog';
import { sampleIncludesAssay } from './orderProjection';

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

/** Panel title with method in parentheses — same pattern as Identification (HPLC-UV/VIS). */
export function sterilityPanelName(method: SterilityMethod): string {
  return `Sterility (${STERILITY_METHOD_LABELS[method]})`;
}

/** Endotoxin panel title — LAL (Limulus Amebocyte Lysate / USP <85>). */
export function endotoxinPanelName(): string {
  return 'Endotoxin (LAL)';
}

/** Append sterility method to a specification cell (PDF AcroForm). */
export function withSterilityMethodSpec(specification: string, method: SterilityMethod): string {
  const label = STERILITY_METHOD_LABELS[method];
  const base = (specification || '').trim();
  if (!base) return label;
  if (base.includes(label) || /\b(PCR|14-day culture)\b/i.test(base)) return base;
  return `${base} · ${label}`;
}

/** YYYY-MM-DD local date, `days` after today (or after an optional start YYYY-MM-DD / ISO). */
export function addDaysYmd(days: number, from?: string): string {
  const base = new Date();
  const m = (from || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    base.setFullYear(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  base.setHours(12, 0, 0, 0);
  base.setDate(base.getDate() + days);
  const y = base.getFullYear();
  const mo = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(base.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/** Normalize an intake timestamp / date field to YYYY-MM-DD (local). */
export function intakeYmdFromValue(raw?: string | null): string {
  const value = (raw || '').trim();
  if (!value) return '';
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/** Sample intake date from a COA result_summary snapshot. */
export function coaIntakeYmd(summary: Record<string, unknown> | null | undefined): string {
  if (!summary || typeof summary !== 'object') return '';
  return intakeYmdFromValue(
    (typeof summary.received_at === 'string' && summary.received_at)
    || (typeof summary.received_date === 'string' && summary.received_date)
    || '',
  );
}

/** Default projected completion = 14 days after sample intake (or today if intake unknown). */
export function defaultCultureProjectedCompletion(intakeYmdOrIso?: string): string {
  return addDaysYmd(14, intakeYmdFromValue(intakeYmdOrIso) || undefined);
}

/** Format YYYY-MM-DD without UTC shift. */
export function formatLocalYmd(ymd: string): string {
  const m = ymd.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return ymd.trim();
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

export function formatSterilityPendingResult(projectedYmd?: string): string {
  const ymd = (projectedYmd || '').trim();
  if (!ymd) return 'Pending';
  return `Pending (projected ${formatLocalYmd(ymd)})`;
}

export function parseSterilityMethod(
  value: unknown,
  panel?: { panel_name?: string; specification?: string; result?: string } | null,
): SterilityMethod {
  if (value === 'pcr' || value === 'culture_14_day') return value;
  if (typeof value === 'string') {
    const n = value.toLowerCase();
    if (/14.?day|culture/.test(n)) return 'culture_14_day';
    if (/\bpcr\b/.test(n)) return 'pcr';
  }
  const blob = `${panel?.panel_name ?? ''} ${panel?.specification ?? ''} ${panel?.result ?? ''}`.toLowerCase();
  if (/14.?day|culture/.test(blob)) return 'culture_14_day';
  return 'pcr';
}

/** Parse projected completion YYYY-MM-DD from summary or "Pending (projected …)" text. */
export function parseSterilityProjectedCompletion(
  summaryValue: unknown,
  panelResult?: string,
): string {
  if (typeof summaryValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(summaryValue.trim())) {
    return summaryValue.trim();
  }
  const raw = (panelResult || '').trim();
  const m = raw.match(/projected\s+(\d{4}-\d{2}-\d{2})/i);
  if (m) return m[1];
  const pretty = raw.match(/projected\s+([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4})/i);
  if (pretty) {
    const d = new Date(pretty[1]);
    if (!Number.isNaN(d.getTime())) {
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${mo}-${day}`;
    }
  }
  return '';
}

/** Analytical method for Identification / Net Content / Net Purity. */
export type AssayMethod = 'hplc_uv_vis' | 'lcms';

export const ASSAY_METHOD_LABELS: Record<AssayMethod, string> = {
  hplc_uv_vis: 'HPLC-UV/VIS',
  lcms: 'LCMS',
};

export function parseAssayMethod(value: unknown, fallback: AssayMethod = 'hplc_uv_vis'): AssayMethod {
  if (value === 'lcms' || value === 'LCMS' || value === 'lc-ms' || value === 'LC-MS') return 'lcms';
  if (
    value === 'hplc_uv_vis'
    || value === 'hplc-uv/vis'
    || value === 'HPLC-UV/VIS'
    || value === 'hplc'
  ) {
    return 'hplc_uv_vis';
  }
  if (typeof value === 'string') {
    const n = value.toLowerCase();
    if (/\blcms\b|\blc-ms\b|\blc\/ms\b/.test(n)) return 'lcms';
    if (/hplc-uv\/vis|hplc.?uv|\bhplc\b/.test(n)) return 'hplc_uv_vis';
  }
  return fallback;
}

/** Append method label to a specification cell (digital COA + PDF AcroForm). */
export function withAssayMethodSpec(specification: string, method: AssayMethod): string {
  const label = ASSAY_METHOD_LABELS[method];
  const base = (specification || '').trim();
  if (!base) return label;
  if (base.includes(label) || /\b(HPLC-UV\/VIS|LCMS|LC-MS)\b/i.test(base)) return base;
  return `${base} · ${label}`;
}

export function assayMethodFromPanels(panels: PanelResult[]): AssayMethod | null {
  for (const p of panels) {
    const blob = `${p.panel_name} ${p.specification || ''} ${p.result || ''}`;
    const parsed = parseAssayMethod(blob, 'hplc_uv_vis');
    if (/\blcms\b|\blc-ms\b|\blc\/ms\b|hplc-uv\/vis|hplc.?uv|\bhplc\b/i.test(blob)) {
      return parsed;
    }
  }
  return null;
}

/**
 * Restore multi-vial Net Content / Net Purity result strings from result_summary
 * when panel cells only kept the primary vial (Issue fold miss).
 */
export function hydrateMultiVialPanelResults(
  panels: PanelResult[] | null | undefined,
  summary?: Record<string, unknown> | null,
): PanelResult[] {
  if (!Array.isArray(panels) || panels.length === 0) return panels || [];
  if (!summary || typeof summary !== 'object') return panels;

  const contentValues = Array.isArray(summary.content_values)
    ? summary.content_values.map(v => String(v || '').trim()).filter(Boolean)
    : [];
  const purityValues = Array.isArray(summary.purity_values)
    ? summary.purity_values.map(v => String(v || '').trim()).filter(Boolean)
    : [];
  if (contentValues.length <= 1 && purityValues.length <= 1) return panels;

  return panels.map(p => {
    const n = p.panel_name.toLowerCase();
    const existing = (p.result || '').split(/\s*,\s*/).map(s => s.trim()).filter(Boolean);
    if (
      contentValues.length > existing.length
      && (n.includes('net content') || n.includes('peptide content'))
      && !n.startsWith('blend content')
    ) {
      return { ...p, result: contentValues.join(', ') };
    }
    if (
      purityValues.length > existing.length
      && (n.includes('net purity') || n.includes('purity (hplc)') || n.includes('purity (lcms)') || n.includes('purity (lc-ms)') || /^purity\b/.test(n))
    ) {
      return { ...p, result: purityValues.join(', ') };
    }
    return p;
  });
}

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
  /** HPLC-UV/VIS or LCMS — applied to Identification, Net Content, and Net Purity. */
  assayMethod: AssayMethod;
  molecularWeight: string;
  /** When false, Molecular Weight is omitted from the COA. */
  includeMolecularWeight: boolean;
  sterilityMethod: SterilityMethod;
  /**
   * Projected completion date (YYYY-MM-DD) when method is 14-day culture and result is still Pending.
   */
  sterilityProjectedCompletion: string;
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
  assayMethod: 'hplc_uv_vis',
  molecularWeight: '',
  includeMolecularWeight: false,
  sterilityMethod: 'pcr',
  sterilityProjectedCompletion: '',
  sterilityPass: null,
  endotoxinEuMl: '',
  endotoxinPass: null,
  includeEndotoxin: false,
  heavyMetalsPass: null,
  heavyMetals: heavyMetalsEmptyDefaults(),
  includeHeavyMetals: false,
  includeSterility: false,
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
  { name: 'Tesamorelin', cas: '218949-48-5' },
  { name: 'HCG', cas: '9002-61-3' },
  { name: 'Chorionic Gonadotropin', cas: '9002-61-3' },
];

/** True when value looks like a CAS registry number (e.g. 218949-48-5). */
export function looksLikeCasNumber(raw: string): boolean {
  return /^\d{2,7}-\d{2}-\d$/.test((raw || '').trim());
}

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
  // Prefer longest name match so "Tesamorelin/Ipamorelin Blend" still hits Tesamorelin.
  const hits = PEPTIDE_CAS_LOOKUP
    .filter(p => {
      const n = p.name.toLowerCase();
      return n === key || key === n || key.includes(n) || n.includes(key);
    })
    .sort((a, b) => b.name.length - a.name.length);
  return hits[0]?.cas ?? '';
}

/** Resolve a displayable CAS — never returns a peptide name. */
export function resolveCasNumber(
  peptideSequence: string | null | undefined,
  ...nameHints: Array<string | null | undefined>
): string {
  const raw = (peptideSequence || '').trim();
  if (looksLikeCasNumber(raw)) return raw;
  for (const hint of nameHints) {
    const fromName = casForSampleName(hint || '');
    if (fromName) return fromName;
  }
  // If peptide_sequence stored a name, look that up.
  if (raw) {
    const fromStored = casForSampleName(raw);
    if (fromStored) return fromStored;
  }
  return '';
}

/** Normalizes claim/result quantity units for COA display (IU stays IU, not mg). */
export function normalizeClaimUnit(unit?: string | null): string {
  const u = (unit || '').trim();
  if (!u || /^other$/i.test(u)) return 'mg';
  if (/^iu$/i.test(u)) return 'IU';
  if (/^ml$/i.test(u)) return 'mL';
  if (/^(ug|µg)$/i.test(u)) return 'mcg';
  return u;
}

const QUANTITY_UNIT_SUFFIX_RE = /\s*(?:mg|mcg|µg|ug|g|mL|ml|IU|iu)\s*$/i;

/** Strip a trailing quantity unit (mg / IU / mcg / …) from a typed amount. */
export function stripQuantityUnit(raw: string): string {
  return (raw || '').trim().replace(QUANTITY_UNIT_SUFFIX_RE, '').trim();
}

/**
 * Normalizes a free-typed quantity into "10.0 mg" / "5000.0 IU" (always includes a decimal).
 * Uses the selected label-claim unit so HCG and similar assays can show IU instead of mg.
 */
export function formatMgAmount(raw: string, unit: string = 'mg'): string {
  const u = normalizeClaimUnit(unit);
  const numeric = stripQuantityUnit(raw);
  if (!numeric) return '';
  const formatted = formatCoaDecimal(numeric);
  return formatted ? `${formatted} ${u}` : '';
}

/**
 * Max reportable HPLC purity. Method uncertainty is ±0.18%, so 100% is never reportable
 * (99.80 + 0.18 = 99.98).
 */
export const MAX_PURITY_PERCENT = 99.8;
export const PURITY_UNCERTAINTY_PERCENT = 0.18;
export const PURITY_INPUT_HINT = `Max ${MAX_PURITY_PERCENT.toFixed(2)}% ± ${PURITY_UNCERTAINTY_PERCENT.toFixed(2)}%. 100% is not allowed.`;

/** Strip " + 0.18%" / " ± 0.18%" uncertainty suffix before parsing. */
export function stripPurityUncertainty(raw: string): string {
  return (raw || '')
    .replace(/\s*[+±]\s*0\.?18\s*%?\s*$/i, '')
    .replace(/%\s*$/g, '')
    .trim();
}

/** True when a purity value rounds to the reportable max (99.8). */
export function isMaxReportablePurity(n: number): boolean {
  if (!Number.isFinite(n)) return false;
  return Math.round(n * 10) / 10 === MAX_PURITY_PERCENT;
}

/**
 * COA Results display for purity at the method ceiling:
 * 99.8% → "99.8% + 0.18%"
 */
export function formatPurityResultWithUncertainty(raw: string | number): string {
  if (raw === '' || raw == null) return '';
  const text = String(raw).trim();
  if (!text) return '';
  // Already decorated.
  if (/\+\s*0\.?18\s*%/i.test(text) || /±\s*0\.?18\s*%/i.test(text)) {
    const n = parseFloat(stripPurityUncertainty(text));
    if (!Number.isFinite(n)) return text;
    const base = formatCoaDecimal(clampPurityPercent(n));
    return base ? `${base}% + ${PURITY_UNCERTAINTY_PERCENT.toFixed(2)}%` : text;
  }
  const n = typeof raw === 'number'
    ? raw
    : Number(stripPurityUncertainty(text).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)?.[0] ?? NaN);
  if (!Number.isFinite(n)) return text.endsWith('%') ? text : `${text}%`;
  const capped = clampPurityPercent(n);
  const base = formatCoaDecimal(capped);
  if (!base) return '';
  if (isMaxReportablePurity(capped)) {
    return `${base}% + ${PURITY_UNCERTAINTY_PERCENT.toFixed(2)}%`;
  }
  return `${base}%`;
}

/** Clamp a numeric purity to the allowed reportable range (never 100%). */
export function clampPurityPercent(n: number): number {
  if (!Number.isFinite(n)) return n;
  if (n > MAX_PURITY_PERCENT) return MAX_PURITY_PERCENT;
  if (n < 0) return 0;
  return n;
}

/**
 * Sanitize a purity % text field while typing.
 * Caps finished numbers at 99.80; leaves incomplete input (e.g. "99.") alone.
 */
export function sanitizePurityInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  // Allow interim typing: trailing decimal / empty fraction.
  if (/^\d+\.$/.test(trimmed) || trimmed === '.') return trimmed;
  const n = parseFloat(stripPurityUncertainty(trimmed));
  if (!Number.isFinite(n)) return raw;
  if (n > MAX_PURITY_PERCENT) return String(MAX_PURITY_PERCENT);
  return raw;
}

/** Normalizes a free-typed percent amount into "99.8%" (or "99.8% + 0.18%" at max). */
export function formatPurityPercent(raw: string): string {
  const numeric = stripPurityUncertainty(raw.trim());
  if (!numeric) return '';
  const n = Number(numeric.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)?.[0] ?? NaN);
  if (!Number.isFinite(n)) return '';
  return formatPurityResultWithUncertainty(clampPurityPercent(n));
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

/** Joins conformity row net-content amounts into one comma-separated string, e.g. "10.0 mg, 10.1 mg". */
export function joinConformityMg(rows: ConformityPeptideRow[], unit: string = 'mg'): string {
  return rows.map(r => formatMgAmount(r.netContent, unit)).filter(Boolean).join(', ');
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
  const orderRef = { metadata };
  // Only assays present on the order appear on the COA (basic IPQ ≠ Atlas Pro biosafety).
  const includeHeavyMetals = sampleIncludesAssay(orderRef, 'heavy_metals_icpms');
  const includeEndotoxin = sampleIncludesAssay(orderRef, 'endotoxin_usp85');
  const includeSterilityCulture = sampleIncludesAssay(orderRef, 'sterility_culture');
  const includeSterility =
    includeSterilityCulture || sampleIncludesAssay(orderRef, 'sterility_pcr');
  return {
    ...EMPTY_LAB_RESULTS,
    identification,
    // Leave measured fields empty — label claim must not seed Net Content or averages.
    netContent: '',
    includeFentanyl,
    includeHeavyMetals,
    includeEndotoxin,
    includeSterility,
    sterilityMethod: includeSterilityCulture ? 'culture_14_day' : 'pcr',
    conformityPeptides: isBlend
      ? seedBlendConformityPeptides(blendPeptides, extraConformityVialCount(metadata))
      : [],
    blendPeptides,
  };
}

/**
 * Whether sterility belongs on a COA. Order metadata wins; otherwise trust an
 * existing sterility panel (including Pending) or an explicit include flag.
 * Never treat a Pending sterility row as "not included".
 */
export function resolveIncludeSterility(
  coa: Pick<COA, 'panel_results' | 'result_summary'>,
  sampleMetadata?: OrderSample['metadata'] | null,
): boolean {
  if (sampleMetadata != null) {
    const orderRef = { metadata: sampleMetadata };
    return (
      sampleIncludesAssay(orderRef, 'sterility_pcr')
      || sampleIncludesAssay(orderRef, 'sterility_culture')
    );
  }
  const summary = (coa.result_summary && typeof coa.result_summary === 'object')
    ? (coa.result_summary as Record<string, unknown>)
    : {};
  const panels = Array.isArray(coa.panel_results) ? coa.panel_results : [];
  if (panels.some(p => /steril/i.test(p.panel_name))) return true;
  if (typeof summary.include_sterility === 'boolean') return summary.include_sterility;
  if (summary.test_mode === 'atlas_pro' || summary.test_mode === 'full_qc') return true;
  return false;
}

/** Same rules as resolveIncludeSterility for endotoxin. */
export function resolveIncludeEndotoxin(
  coa: Pick<COA, 'panel_results' | 'result_summary'>,
  sampleMetadata?: OrderSample['metadata'] | null,
): boolean {
  if (sampleMetadata != null) {
    return sampleIncludesAssay({ metadata: sampleMetadata }, 'endotoxin_usp85');
  }
  const summary = (coa.result_summary && typeof coa.result_summary === 'object')
    ? (coa.result_summary as Record<string, unknown>)
    : {};
  const panels = Array.isArray(coa.panel_results) ? coa.panel_results : [];
  if (panels.some(p => /endotoxin|lal/i.test(p.panel_name))) return true;
  if (typeof summary.include_endotoxin === 'boolean') return summary.include_endotoxin;
  if (summary.test_mode === 'atlas_pro') return true;
  return false;
}

/** Same rules as resolveIncludeSterility for heavy metals. */
export function resolveIncludeHeavyMetals(
  coa: Pick<COA, 'panel_results' | 'result_summary'>,
  sampleMetadata?: OrderSample['metadata'] | null,
): boolean {
  if (sampleMetadata != null) {
    return sampleIncludesAssay({ metadata: sampleMetadata }, 'heavy_metals_icpms');
  }
  const summary = (coa.result_summary && typeof coa.result_summary === 'object')
    ? (coa.result_summary as Record<string, unknown>)
    : {};
  const panels = Array.isArray(coa.panel_results) ? coa.panel_results : [];
  if (panels.some(p => /lead|arsenic|cadmium|mercury|chromium/i.test(p.panel_name))) return true;
  if (typeof summary.include_heavy_metals === 'boolean') return summary.include_heavy_metals;
  if (summary.test_mode === 'atlas_pro') return true;
  return false;
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

  const summaryContentValues = Array.isArray(summary.content_values)
    ? summary.content_values.map(v => String(v || '').trim()).filter(Boolean)
    : [];
  const summaryPurityValues = Array.isArray(summary.purity_values)
    ? summary.purity_values.map(v => String(v || '').trim()).filter(Boolean)
    : [];

  const netPartsFromPanel = (netPanel?.result || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const purityPartsFromPanel = (purityPanel?.result || '')
    .split(',')
    .map(s => stripPurityUncertainty(s))
    .filter(Boolean);
  // Prefer result_summary multi-vial lists when panels only stored the primary
  // (bug after assay-method rename broke the Net Content / Net Purity fold).
  const netParts = summaryContentValues.length > netPartsFromPanel.length
    ? summaryContentValues
    : netPartsFromPanel;
  const purityParts = summaryPurityValues.length > purityPartsFromPanel.length
    ? summaryPurityValues.map(s => stripPurityUncertainty(s))
    : purityPartsFromPanel;

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
        .map(s => stripQuantityUnit(s.trim()))
        .filter(Boolean);
      return {
        name,
        claimMg: stripQuantityUnit(
          (p.specification || '').replace(/^label claim:?\s*/i, ''),
        ),
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
        netContent: stripQuantityUnit(netParts[i] || ''),
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
  const sterilityMethod: SterilityMethod = parseSterilityMethod(
    summary.sterility_method ?? summary.sterility_method_label,
    sterilityPanel,
  );
  const sterilityProjectedCompletion = parseSterilityProjectedCompletion(
    summary.sterility_projected_completion,
    sterilityResult,
  );

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
    ? (sterilityPanel.pass === null || !sterilityResult || /^pending\b/i.test(sterilityResult)
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
    netContent: stripQuantityUnit(primaryNet) || primaryNet,
    netPurity: primaryPurity,
    assayMethod: parseAssayMethod(
      summary.assay_method
        ?? summary.assay_method_label
        ?? assayMethodFromPanels(panels)
        ?? base.assayMethod,
    ),
    molecularWeight: mwRaw,
    includeMolecularWeight: !!mwRaw || summary.include_molecular_weight === true,
    sterilityMethod,
    sterilityProjectedCompletion:
      sterilityMethod === 'culture_14_day' ? sterilityProjectedCompletion : '',
    sterilityPass,
    includeSterility: sampleMetadata != null ? base.includeSterility : (!!sterilityPanel || base.includeSterility),
    endotoxinEuMl,
    endotoxinPass,
    includeEndotoxin: sampleMetadata != null ? base.includeEndotoxin : (!!endotoxinPanel || base.includeEndotoxin),
    includeHeavyMetals: sampleMetadata != null ? base.includeHeavyMetals : (includeHeavyMetals || base.includeHeavyMetals),
    heavyMetalsPass,
    heavyMetals,
    includeFentanyl: sampleMetadata != null ? base.includeFentanyl : (!!fentanylPanel || base.includeFentanyl),
    fentanylPass: fentanylPanel ? fentanylPanel.pass !== false : true,
    conformityPeptides,
    blendPeptides: blendPeptides.length > 0 ? blendPeptides : base.blendPeptides,
  };
}

export function sterilitySpecLabel(_method?: SterilityMethod): string {
  return 'Not Detected';
}

export function labResultsToPanelResults(
  results: LabCoaResults,
  claim?: { labeledContent?: string; labelClaimUnit?: string },
): PanelResult[] {
  const isBlend = results.blendPeptides.some(r => r.name.trim());
  const claimUnit = normalizeClaimUnit(claim?.labelClaimUnit);
  const claimLabel = formatLabelClaim(
    (claim?.labeledContent || '').trim(),
    claimUnit,
  );
  const method = results.assayMethod || 'hplc_uv_vis';
  const methodLabel = ASSAY_METHOD_LABELS[method];
  const rows: PanelResult[] = [
    {
      panel_name: `Identification (${methodLabel})`,
      specification: isBlend ? 'Blend peptide ID' : 'Peptide ID',
      result: results.identification,
      pass: !!results.identification.trim(),
    },
    {
      panel_name: `Net Content (${methodLabel})`,
      specification: isBlend
        ? 'Total peptide content'
        : (claimLabel ? `Label claim: ${claimLabel}` : 'Label claim'),
      result: formatMgAmount(results.netContent, claimUnit) || results.netContent,
      pass: !!results.netContent.trim(),
    },
    {
      panel_name: `Net Purity (${methodLabel})`,
      specification: '≥98%',
      result: results.netPurity.trim() ? formatPurityPercent(results.netPurity) : '',
      pass: true,
    },
  ];

  for (const row of results.blendPeptides) {
    const name = row.name.trim();
    if (!name) continue;
    const claimAmt = row.claimMg.trim();
    const contentParts = [formatMgAmount(row.netContent, claimUnit)].filter(Boolean);
    for (const c of results.conformityPeptides) {
      if (isBlendTotalConformityRow(c.name)) continue;
      if (c.name.trim().toLowerCase() !== name.toLowerCase()) continue;
      const formatted = formatMgAmount(c.netContent, claimUnit);
      if (formatted) contentParts.push(formatted);
    }
    rows.push({
      panel_name: blendContentPanelName(name),
      specification: claimAmt
        ? `Label claim: ${formatLabelClaim(claimAmt, claimUnit)}`
        : 'Label claim',
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

  if (results.includeSterility) {
    const sterilityMethodLabel = STERILITY_METHOD_LABELS[results.sterilityMethod];
    const projected = results.sterilityMethod === 'culture_14_day'
      ? (results.sterilityProjectedCompletion || '').trim()
      : '';
    if (results.sterilityPass === null) {
      rows.push({
        panel_name: sterilityPanelName(results.sterilityMethod),
        specification: 'Not Detected',
        result: formatSterilityPendingResult(projected),
        pass: null,
      });
    } else {
      rows.push({
        panel_name: sterilityPanelName(results.sterilityMethod),
        specification: 'Not Detected',
        result: results.sterilityPass
          ? `Not Detected (${sterilityMethodLabel})`
          : `Detected (${sterilityMethodLabel})`,
        pass: results.sterilityPass,
      });
    }
  }

  if (results.includeEndotoxin) {
    if (results.endotoxinPass === null) {
      rows.push({
        panel_name: endotoxinPanelName(),
        specification: ENDOTOXIN_SPEC_EU_ML,
        result: 'Pending',
        pass: null,
      });
    } else {
      rows.push({
        panel_name: endotoxinPanelName(),
        specification: ENDOTOXIN_SPEC_EU_ML,
        result: formatEndotoxinResult(results.endotoxinEuMl),
        pass: results.endotoxinPass,
      });
    }
  }

  if (results.includeHeavyMetals) {
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
    const net = rows.find(r => {
      const n = r.panel_name.toLowerCase();
      return (n.includes('net content') || n.includes('peptide content'))
        && !n.startsWith('blend content');
    });
    if (net) net.result = contentParts.join(', ');
  }
  if (purityParts.length > 0) {
    const pur = rows.find(r => {
      const n = r.panel_name.toLowerCase();
      return n.includes('net purity') || /^purity\b/.test(n);
    });
    if (pur) pur.result = purityParts.join(', ');
  }

  return rows;
}

export function parsePurityPercent(netPurity: string): number | null {
  const n = parseFloat(stripPurityUncertainty(netPurity));
  if (!Number.isFinite(n)) return null;
  return clampPurityPercent(n);
}

/** Raw parse without clamping — used to detect over-max entry before save. */
export function parsePurityPercentRaw(netPurity: string): number | null {
  const n = parseFloat(stripPurityUncertainty(netPurity));
  return Number.isFinite(n) ? n : null;
}

export function purityExceedsMax(raw: string): boolean {
  const n = parsePurityPercentRaw(raw);
  return n != null && n > MAX_PURITY_PERCENT;
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

function collectContentPurityParts(
  results: LabCoaResults,
  unit: string = 'mg',
): {
  contentParts: string[];
  purityParts: string[];
} {
  const contentParts: string[] = [];
  const purityParts: string[] = [];
  const claimUnit = normalizeClaimUnit(unit);
  const asQty = (v: string) => formatMgAmount(v, claimUnit);
  const asPct = (v: string) => formatPurityPercent(v);

  // Primary assay fields = first vial tested. Conformity rows = additional measured vials
  // only (never seed them from label claim — that inflated averages for single-vial COAs).
  if (results.netContent.trim()) contentParts.push(asQty(results.netContent));
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
      if (row.netContent.trim()) contentParts.push(asQty(row.netContent));
      if (row.netPurity.trim()) purityParts.push(asPct(row.netPurity));
      continue;
    }
    if (row.netContent.trim()) contentParts.push(asQty(row.netContent));
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
export function computeLabAssayAverages(
  results: LabCoaResults,
  unit: string = 'mg',
): AssayAverages {
  const claimUnit = normalizeClaimUnit(unit);
  const { contentParts, purityParts } = collectContentPurityParts(results, claimUnit);
  const contentNums = contentParts.flatMap(parseNumericTokens);
  const purityNums = purityParts.flatMap(parseNumericTokens).map(clampPurityPercent);
  const meanQty = formatMeanNumber(contentNums);
  const meanPct = formatMeanNumber(purityNums);
  const vialCount = Math.max(contentParts.length, purityParts.length, contentNums.length ? 1 : 0);

  return {
    avg_net_peptide_content: meanQty ? `${meanQty} ${claimUnit}` : '',
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
  summary?: Record<string, unknown> | null,
): AssayAverages {
  const hydrated = hydrateMultiVialPanelResults(panels, summary);
  const claimUnit = normalizeClaimUnit(
    typeof summary?.label_claim_unit === 'string' ? summary.label_claim_unit : 'mg',
  );
  const net = hydrated.find(p => /net content|peptide content/i.test(p.panel_name) && !/^blend content\b/i.test(p.panel_name));
  const pur = hydrated.find(p => /net purity|^purity\b/i.test(p.panel_name));
  const contentParts = (net?.result || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const purityParts = (pur?.result || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const contentNums = contentParts.flatMap(parseNumericTokens);
  const purityNums = purityParts.flatMap(parseNumericTokens).map(clampPurityPercent);
  const meanQty = formatMeanNumber(contentNums);
  const meanPct = formatMeanNumber(purityNums);
  const vialCount = Math.max(contentParts.length, purityParts.length, contentNums.length ? 1 : 0);

  // Prefer unit already present on measured results (e.g. "5000.0 IU") over summary fallback.
  const unitFromResult = contentParts[0]?.match(/\b(mg|mcg|µg|ug|g|mL|ml|IU|iu)\b/i)?.[1];
  const displayUnit = unitFromResult ? normalizeClaimUnit(unitFromResult) : claimUnit;

  return {
    avg_net_peptide_content: meanQty ? `${meanQty} ${displayUnit}` : '',
    avg_purity: meanPct
      ? `${meanPct}%`
      : (purityPercent != null && Number.isFinite(purityPercent) ? `${purityPercent}%` : ''),
    mean_of_vials_tested: vialCount > 0 ? String(vialCount) : '',
    content_values: contentParts,
    purity_values: purityParts,
  };
}

export type { OrderSampleMetadata };
