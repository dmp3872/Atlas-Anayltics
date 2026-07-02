import { SampleType } from './types';
import { formatCurrency } from './utils';
import { ATLAS_SAFETY_PRO_INCLUDES, ATLAS_SAFETY_PRO_PRICE } from './submissionUtils';

export type SampleMatrix =
  | 'Powder'
  | 'Liquid/Solution'
  | 'Lyophilized'
  | 'Capsule/Tablet'
  | 'Raw Material'
  | 'BAC Water'
  | 'Other';

export const SAMPLE_MATRICES: SampleMatrix[] = [
  'Powder',
  'Liquid/Solution',
  'Lyophilized',
  'Capsule/Tablet',
  'Raw Material',
  'BAC Water',
  'Other',
];

export type TestMode = 'atlas_pro' | 'full_qc' | 'individual';

export interface IndividualTestOption {
  id: string;
  name: string;
  description: string;
  price: number;
}

/** ILS-aligned individual test menu (portal.ils-lab.com). */
export const INDIVIDUAL_TESTS: IndividualTestOption[] = [
  { id: 'endotoxin_usp85', name: 'Endotoxin (USP <85>)', description: 'Gel-clot LAL endotoxin testing', price: 150 },
  { id: 'heavy_metals_icpms', name: 'Heavy Metals (ICP-MS)', description: 'Inductively coupled plasma mass spectrometry', price: 150 },
  { id: 'purity_hplc', name: 'Purity & Quantitation (HPLC)', description: 'HPLC purity and net content', price: 150 },
  { id: 'sterility_pcr', name: 'Sterility (PCR)', description: 'Rapid sterility screen by PCR', price: 150 },
  { id: 'sterility_culture', name: 'Sterility by Culture (USP <71>)', description: 'Full USP <71> sterility verification', price: 350 },
  { id: 'water_analysis', name: 'Water Analysis (incl. Endotoxin)', description: 'Water content and endotoxin for aqueous samples', price: 300 },
  { id: 'recon_stability', name: 'Reconstitution Stability', description: 'Stability after reconstitution study', price: 650 },
];

/** Optional add-on for Atlas Safety Pro — same package price either way. */
export const FENTANYL_TEST_ID = 'fentanyl_detection';
export const FENTANYL_OPTION_LABEL = 'Fentanyl Detection';

/** Bundled tests included in Atlas Safety Pro (matches pricing page). */
export const ATLAS_PRO_BUNDLED_TEST_IDS = [
  'purity_hplc',
  'heavy_metals_icpms',
  'endotoxin_usp85',
  'sterility_pcr',
] as const;

export const ATLAS_PRO_PANEL = {
  id: 'atlas_pro' as const,
  name: 'Atlas Safety Pro',
  description: ATLAS_SAFETY_PRO_INCLUDES.filter(i => i !== 'Fentanyl Detection').join(', '),
  price: ATLAS_SAFETY_PRO_PRICE,
  vialsRequired: 3,
  bundledTestIds: [...ATLAS_PRO_BUNDLED_TEST_IDS],
  includesConformity: true,
};

export const FULL_QC_BUNDLED_TEST_IDS = [
  'purity_hplc',
  'heavy_metals_icpms',
  'endotoxin_usp85',
  'sterility_pcr',
] as const;

export const FULL_QC_PANEL = {
  id: 'full_qc' as const,
  name: 'Full QC Panel',
  description: 'Purity, Content ID, Heavy Metals, Endotoxin, Sterility Screen, Conformity',
  price: 500,
  vialsRequired: 3,
  bundledTestIds: [...FULL_QC_BUNDLED_TEST_IDS],
  includesConformity: true,
};

export const CONFORMITY_PRICE = 50;
export const MULTI_BRAND_PRICE = 100;
export const RUSH_PRICE_PER_SAMPLE = 75;
export const MAX_BRANDS_PER_SAMPLE = 5;

export interface WizardSample {
  id: string;
  sample_name: string;
  display_name: string;
  is_peptide: boolean;
  batch_number: string;
  labeled_content: string;
  vial_size: string;
  sample_matrix: SampleMatrix;
  quantity: number;
  peptide_identification: string;
  sample_type: SampleType;
  blend_compounds: number;
  test_mode: TestMode;
  individual_tests: string[];
  conformity_extra: number;
  brand_names: string[];
  rush: boolean;
  catalog_mode: boolean;
  /** Atlas Safety Pro only — included by default, no price change. */
  include_fentanyl: boolean;
}

export function bundledTestsForMode(mode: TestMode): string[] {
  if (mode === 'atlas_pro') return [...ATLAS_PRO_PANEL.bundledTestIds];
  if (mode === 'full_qc') return [...FULL_QC_PANEL.bundledTestIds];
  return [];
}

export function isPackageMode(mode: TestMode): boolean {
  return mode === 'atlas_pro' || mode === 'full_qc';
}

export function panelVialsRequired(mode: TestMode): number {
  if (mode === 'atlas_pro') return ATLAS_PRO_PANEL.vialsRequired;
  if (mode === 'full_qc') return FULL_QC_PANEL.vialsRequired;
  return Math.max(1, 1);
}

export function createEmptySample(partial?: Partial<WizardSample>): WizardSample {
  return {
    id: Math.random().toString(36).slice(2),
    sample_name: '',
    display_name: '',
    is_peptide: true,
    batch_number: '',
    labeled_content: '',
    vial_size: '',
    sample_matrix: 'Lyophilized',
    quantity: 1,
    peptide_identification: '',
    sample_type: 'single',
    blend_compounds: 2,
    test_mode: 'atlas_pro',
    individual_tests: [...ATLAS_PRO_BUNDLED_TEST_IDS],
    conformity_extra: 0,
    brand_names: [],
    rush: false,
    catalog_mode: false,
    include_fentanyl: true,
    ...partial,
  };
}

export function sampleIncludesFentanyl(sample: WizardSample): boolean {
  return sample.test_mode === 'atlas_pro' && sample.include_fentanyl;
}

export function sampleTestCount(sample: WizardSample): number {
  if (isPackageMode(sample.test_mode)) return 1;
  return sample.individual_tests.length;
}

export function sampleVialCount(sample: WizardSample): number {
  const base = isPackageMode(sample.test_mode)
    ? panelVialsRequired(sample.test_mode)
    : Math.max(1, sample.individual_tests.length);
  return base + Math.max(0, sample.conformity_extra);
}

export function billableBrandCount(sample: WizardSample, primaryBrand = ''): number {
  const names = sample.brand_names.filter(Boolean);
  const primary = primaryBrand.trim().toLowerCase();
  if (!primary) return names.length;
  return names.filter(n => n.trim().toLowerCase() !== primary).length;
}

export function sampleChipLabel(sample: WizardSample, index: number): string {
  const parts = [`${index + 1} ${sample.sample_name || 'New sample'}`];
  if (sample.batch_number) parts.push(`Batch: ${sample.batch_number}`);
  const tests = sampleTestCount(sample);
  if (tests > 0 && sample.sample_name) parts.push(`${tests} test${tests === 1 ? '' : 's'}`);
  return parts.join(' ');
}

export function sampleTestPrice(sample: WizardSample): number {
  if (sample.test_mode === 'atlas_pro') return ATLAS_PRO_PANEL.price;
  if (sample.test_mode === 'full_qc') return FULL_QC_PANEL.price;
  return sample.individual_tests.reduce((sum, id) => {
    const t = INDIVIDUAL_TESTS.find(x => x.id === id);
    return sum + (t?.price ?? 0);
  }, 0);
}

export function sampleAddOnPrice(sample: WizardSample, primaryBrand = ''): number {
  const conformity = sample.conformity_extra * CONFORMITY_PRICE;
  const brands = billableBrandCount(sample, primaryBrand) * MULTI_BRAND_PRICE;
  const rush = sample.rush ? RUSH_PRICE_PER_SAMPLE : 0;
  return conformity + brands + rush;
}

export function sampleLineTotal(sample: WizardSample, primaryBrand = ''): number {
  return (sampleTestPrice(sample) + sampleAddOnPrice(sample, primaryBrand)) * Math.max(1, sample.quantity);
}

export function orderTotals(samples: WizardSample[], primaryBrand = '') {
  const subtotal = samples.reduce((s, sample) => s + sampleLineTotal(sample, primaryBrand), 0);
  const sampleCount = samples.reduce((n, s) => n + Math.max(1, s.quantity), 0);
  const testCount = samples.reduce((n, s) => {
    const tests = isPackageMode(s.test_mode) ? 1 : s.individual_tests.length;
    return n + tests * Math.max(1, s.quantity);
  }, 0);
  return { subtotal, sampleCount, testCount };
}

export function sampleSummaryLabel(sample: WizardSample): string {
  const parts = [sample.labeled_content, sample.vial_size, sample.sample_matrix].filter(Boolean);
  return parts.join(' | ');
}

export function validateStep1(samples: WizardSample[]): string | null {
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (!s.sample_name.trim()) return `Sample ${i + 1}: enter a product name.`;
    if (!s.batch_number.trim()) return `Sample ${i + 1}: batch / lot number is required.`;
    if (!s.labeled_content.trim()) return `Sample ${i + 1}: labeled content is required.`;
    if (s.is_peptide && !s.peptide_identification.trim()) return `Sample ${i + 1}: peptide identification is required.`;
    if (s.test_mode === 'individual' && s.individual_tests.length === 0) {
      return `Sample ${i + 1}: select at least one individual test.`;
    }
  }
  return null;
}

export function formatSampleTests(sample: WizardSample): string {
  if (sample.test_mode === 'atlas_pro') {
    const base = ATLAS_PRO_PANEL.name;
    if (sample.include_fentanyl) return `${base} (+ ${FENTANYL_OPTION_LABEL})`;
    return base;
  }
  if (sample.test_mode === 'full_qc') return FULL_QC_PANEL.name;
  return sample.individual_tests
    .map(id => INDIVIDUAL_TESTS.find(t => t.id === id)?.name ?? id)
    .join(', ') || 'No tests selected';
}

export function sampleMetadataPayload(sample: WizardSample, primaryBrand = '') {
  return {
    batch_number: sample.batch_number,
    labeled_content: sample.labeled_content,
    vial_size: sample.vial_size,
    sample_matrix: sample.sample_matrix,
    is_peptide: sample.is_peptide,
    peptide_identification: sample.peptide_identification,
    test_mode: sample.test_mode,
    individual_tests: sample.individual_tests,
    conformity_extra: sample.conformity_extra,
    brand_names: sample.brand_names.filter(Boolean),
    rush: sample.rush,
    include_fentanyl: sampleIncludesFentanyl(sample),
    tests_label: formatSampleTests(sample),
    line_total: sampleLineTotal(sample, primaryBrand),
  };
}

export function describePricing(sample: WizardSample, primaryBrand = ''): string {
  const base = sampleTestPrice(sample);
  const extras: string[] = [];
  if (sample.conformity_extra) extras.push(`${sample.conformity_extra} conformity (+${formatCurrency(sample.conformity_extra * CONFORMITY_PRICE)})`);
  const brands = billableBrandCount(sample, primaryBrand);
  if (brands) extras.push(`${brands} extra brand(s) (+${formatCurrency(brands * MULTI_BRAND_PRICE)})`);
  if (sample.rush) extras.push(`rush (+${formatCurrency(RUSH_PRICE_PER_SAMPLE)})`);
  if (!extras.length) return formatCurrency(base);
  return `${formatCurrency(base)} + ${extras.join(', ')}`;
}

export function packageIncludesConformity(mode: TestMode): boolean {
  return mode === 'atlas_pro' || mode === 'full_qc';
}
