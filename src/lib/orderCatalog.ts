import { SampleType } from './types';
import { formatCurrency } from './utils';
import { ATLAS_SAFETY_PRO_INCLUDES, ATLAS_SAFETY_PRO_PRICE } from './submissionUtils';

export type SampleMatrix =
  | 'Powder'
  | 'Liquid/Solution'
  | 'Lyophilized'
  | 'Capsule/Tablet'
  | 'Raw Material'
  | 'Creams/Gels'
  | 'Capsules'
  | 'BAC Water'
  | 'Other';

export const SAMPLE_MATRICES: SampleMatrix[] = [
  'Powder',
  'Liquid/Solution',
  'Lyophilized',
  'Capsule/Tablet',
  'Raw Material',
  'Creams/Gels',
  'Capsules',
  'BAC Water',
  'Other',
];

/** Subtypes shown when “Other Research Material” is selected. */
export const OTHER_RESEARCH_MATERIALS = ['Raw Material', 'Creams/Gels', 'Capsules'] as const;
export type OtherResearchMaterial = (typeof OTHER_RESEARCH_MATERIALS)[number];

export function isOtherResearchMaterial(value: string): value is OtherResearchMaterial {
  return (OTHER_RESEARCH_MATERIALS as readonly string[]).includes(value);
}

export type SampleCategory =
  | 'single_peptide'
  | 'peptide_blend'
  | 'bac_water'
  | 'other';

export const SAMPLE_CATEGORIES: {
  id: SampleCategory;
  label: string;
  description: string;
}[] = [
  { id: 'single_peptide', label: 'Single Peptide', description: 'One peptide analyte per sample' },
  { id: 'peptide_blend', label: 'Peptide Blend', description: 'Up to four compounds with label claims' },
  { id: 'bac_water', label: 'Bacteriostatic Water', description: 'BAC water and aqueous diluents' },
  { id: 'other', label: 'Other Research Material', description: 'Non-peptide research materials' },
];

export type TestMode = 'atlas_pro' | 'full_qc' | 'individual';

export interface LabTestService {
  id: string;
  name: string;
  description: string;
  price: number;
  /** Upper bound in business days for estimates; null when unavailable. */
  turnaroundDays: number | null;
  /** Optional display override (e.g. packages: "3–5 business days"). */
  turnaroundLabel?: string;
  vialsRequired: number;
  available: boolean;
  /** Can be chosen as the sample’s primary assay. */
  canBePrimary: boolean;
  /** Bundled package vs single assay. */
  kind: 'package' | 'assay';
  comingSoonLabel?: string;
}

/** Catalog used when DB panels are unavailable — prices may be overridden from test_panels. */
export const LAB_TEST_SERVICES: LabTestService[] = [
  {
    id: 'atlas_pro',
    name: 'Atlas Safety Pro',
    description: ATLAS_SAFETY_PRO_INCLUDES.filter(i => i !== 'Fentanyl Detection').join(', '),
    price: ATLAS_SAFETY_PRO_PRICE,
    turnaroundDays: 5,
    turnaroundLabel: '3–5 business days',
    vialsRequired: 5,
    available: true,
    canBePrimary: true,
    kind: 'package',
  },
  {
    id: 'full_qc',
    name: 'Full QC Panel',
    description: 'Identity, purity, quantity, and sterility screen',
    price: 400,
    turnaroundDays: 5,
    turnaroundLabel: '3–5 business days',
    vialsRequired: 3,
    available: true,
    canBePrimary: true,
    kind: 'package',
  },
  {
    id: 'identity_purity_quantity',
    name: 'Identity, Purity & Quantity',
    description: 'HPLC identity confirmation, purity analysis (%), and net content quantitation',
    price: 450,
    turnaroundDays: 3,
    vialsRequired: 1,
    available: true,
    canBePrimary: true,
    kind: 'assay',
  },
  /** Kept for package / lab ID resolution — not shown in à la carte. */
  {
    id: 'purity_hplc',
    name: 'Purity',
    description: 'HPLC purity assay for the primary analyte',
    price: 150,
    turnaroundDays: 3,
    vialsRequired: 1,
    available: true,
    canBePrimary: false,
    kind: 'assay',
  },
  {
    id: 'endotoxin_usp85',
    name: 'Endotoxin',
    description: 'LAL endotoxin screen (USP <85>)',
    price: 150,
    turnaroundDays: 3,
    vialsRequired: 1,
    available: true,
    canBePrimary: true,
    kind: 'assay',
  },
  {
    id: 'sterility_pcr',
    name: 'Sterility (PCR)',
    description: 'Rapid sterility screen by PCR',
    price: 150,
    turnaroundDays: 3,
    vialsRequired: 1,
    available: true,
    canBePrimary: true,
    kind: 'assay',
  },
  {
    id: 'sterility_culture',
    name: 'Sterility by Culture (14-day)',
    description: 'Full sterility verification by culture method',
    price: 350,
    turnaroundDays: 14,
    turnaroundLabel: '14 business days',
    vialsRequired: 1,
    available: true,
    canBePrimary: true,
    kind: 'assay',
  },
  {
    id: 'heavy_metals_icpms',
    name: 'Heavy Metals',
    description: 'ICP-MS elemental impurities screen',
    price: 150,
    turnaroundDays: 5,
    vialsRequired: 1,
    available: true,
    canBePrimary: true,
    kind: 'assay',
  },
  {
    id: 'fentanyl_detection',
    name: 'Fentanyl Detection',
    description: 'Screen for fentanyl contamination',
    price: 150,
    turnaroundDays: 3,
    vialsRequired: 1,
    available: true,
    canBePrimary: true,
    kind: 'assay',
  },
  {
    id: 'residual_solvents',
    name: 'Residual Solvents',
    description: 'Organic residual solvent profile',
    price: 250,
    turnaroundDays: null,
    vialsRequired: 1,
    available: false,
    canBePrimary: false,
    kind: 'assay',
    comingSoonLabel: 'Coming soon',
  },
  {
    id: 'residual_moisture',
    name: 'Residual Moisture',
    description: 'Moisture / water content determination',
    price: 200,
    turnaroundDays: null,
    vialsRequired: 1,
    available: false,
    canBePrimary: false,
    kind: 'assay',
    comingSoonLabel: 'Coming soon',
  },
];

/** Legacy alias — individual (non-package) services. */
export type IndividualTestOption = LabTestService;
export const INDIVIDUAL_TESTS: LabTestService[] = LAB_TEST_SERVICES.filter(
  t => t.id !== 'atlas_pro' && t.id !== 'full_qc',
);

export const FENTANYL_TEST_ID = 'fentanyl_detection';
export const FENTANYL_OPTION_LABEL = 'Fentanyl Detection';
/** Atlas Pro runs the primary vial plus two included comparison vials. */
export const ATLAS_PRO_INCLUDED_CONFORMITY_VIALS = 3;
export const ATLAS_PRO_INCLUDED_EXTRA_CONFORMITY_VIALS = 2;
/** @deprecated Use ATLAS_PRO_INCLUDED_CONFORMITY_VIALS */
export const ATLAS_PRO_INCLUDED_VARIANCE_VIALS = ATLAS_PRO_INCLUDED_CONFORMITY_VIALS;
/** @deprecated Use ATLAS_PRO_INCLUDED_EXTRA_CONFORMITY_VIALS */
export const ATLAS_PRO_INCLUDED_EXTRA_VARIANCE_VIALS = ATLAS_PRO_INCLUDED_EXTRA_CONFORMITY_VIALS;

export const ATLAS_PRO_BUNDLED_TEST_IDS = [
  'purity_hplc',
  'heavy_metals_icpms',
  'endotoxin_usp85',
  'sterility_pcr',
] as const;

export const ATLAS_PRO_PANEL = {
  id: 'atlas_pro' as const,
  name: 'Atlas Safety Pro',
  tagline: 'Full QC + biosafety & conformity',
  description: ATLAS_SAFETY_PRO_INCLUDES.filter(i => i !== 'Fentanyl Detection').join(', '),
  price: ATLAS_SAFETY_PRO_PRICE,
  vialsRequired: 5,
  bundledTestIds: [...ATLAS_PRO_BUNDLED_TEST_IDS],
  includesConformity: true,
  features: [
    'Identity confirmation',
    'Purity analysis (%)',
    'Quantity verification',
    'Heavy metals screen',
    '+ Endotoxin (LAL)',
    '+ Sterility (PCR)',
    '+ 3-vial conformity testing (2 comparison vials included)',
  ],
  emphasized: true as const,
};

export const FULL_QC_BUNDLED_TEST_IDS = [
  'purity_hplc',
  'sterility_pcr',
] as const;

export const FULL_QC_PANEL = {
  id: 'full_qc' as const,
  name: 'Full QC Panel',
  tagline: 'Identity, purity, quantity & sterility',
  description: 'Identity, Purity, Quantity, Sterility Screen',
  price: 400,
  vialsRequired: 3,
  bundledTestIds: [...FULL_QC_BUNDLED_TEST_IDS],
  includesConformity: false,
  features: [
    'Identity confirmation',
    'Purity analysis (%)',
    'Quantity verification',
    'Sterility (PCR)',
  ],
  emphasized: false as const,
};

export function packageCardMeta(id: string) {
  if (id === 'atlas_pro') return ATLAS_PRO_PANEL;
  if (id === 'full_qc') return FULL_QC_PANEL;
  return null;
}

export const CONFORMITY_PRICE = 50;
export const MULTI_BRAND_PRICE = 100;
export const RUSH_PRICE_PER_SAMPLE = 75;
export const MAX_BRANDS_PER_SAMPLE = 5;
export const MAX_BLEND_COMPONENTS = 4;
export const MIN_BLEND_COMPONENTS = 2;

export const LABEL_CLAIM_UNITS = ['mg', 'mcg', 'g', 'mL', '%', 'IU', 'other'] as const;

export interface BlendComponent {
  name: string;
  amount_mg: string;
}

export function defaultBlendComponents(count = MIN_BLEND_COMPONENTS): BlendComponent[] {
  return Array.from({ length: count }, () => ({ name: '', amount_mg: '' }));
}

export function activeBlendComponents(components: BlendComponent[]): BlendComponent[] {
  return components.filter(c => c.name.trim() || c.amount_mg.trim());
}

export function formatBlendLabel(components: BlendComponent[]): string {
  return activeBlendComponents(components)
    .map(c => `${c.name.trim()} ${c.amount_mg.trim().replace(/\s*mg\s*$/i, '')}mg`.replace(/\s+/g, ' '))
    .join(' · ');
}

export function findTestService(id: string, catalog: LabTestService[] = LAB_TEST_SERVICES): LabTestService | undefined {
  return catalog.find(t => t.id === id);
}

export function categoryLabel(category: SampleCategory): string {
  return SAMPLE_CATEGORIES.find(c => c.id === category)?.label ?? category;
}

export function applyCategoryDefaults(category: SampleCategory): Partial<WizardSample> {
  if (category === 'peptide_blend') {
    return {
      category,
      sample_type: 'blend',
      is_peptide: true,
      sample_matrix: 'Lyophilized',
      blend_components: defaultBlendComponents(MIN_BLEND_COMPONENTS),
      blend_compounds: MIN_BLEND_COMPONENTS,
    };
  }
  if (category === 'bac_water') {
    return {
      category,
      sample_type: 'single',
      is_peptide: false,
      sample_matrix: 'BAC Water',
      blend_components: [],
      peptide_identification: '',
    };
  }
  if (category === 'other') {
    return {
      category,
      sample_type: 'single',
      is_peptide: false,
      sample_matrix: 'Raw Material',
      blend_components: [],
    };
  }
  return {
    category: 'single_peptide',
    sample_type: 'single',
    is_peptide: true,
    sample_matrix: 'Lyophilized',
    blend_components: [],
  };
}

export interface WizardSample {
  id: string;
  sample_name: string;
  display_name: string;
  category: SampleCategory;
  is_peptide: boolean;
  batch_number: string;
  labeled_content: string;
  label_claim_unit: string;
  vial_size: string;
  sample_matrix: SampleMatrix;
  quantity: number;
  peptide_identification: string;
  sample_type: SampleType;
  blend_compounds: number;
  blend_components: BlendComponent[];
  /** Primary selected assay / package id. */
  primary_test_id: string;
  test_mode: TestMode;
  /** Optional add-on service ids (never includes primary). */
  individual_tests: string[];
  conformity_extra: number;
  brand_names: string[];
  rush: boolean;
  catalog_mode: boolean;
  include_fentanyl: boolean;
  client_reference: string;
  special_instructions: string;
}

export function resolveTestMode(primaryId: string): TestMode {
  if (primaryId === 'atlas_pro') return 'atlas_pro';
  if (primaryId === 'full_qc') return 'full_qc';
  return 'individual';
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
  return 1;
}

export function selectedServiceIds(sample: WizardSample): string[] {
  if (!sample.primary_test_id) return [];
  if (isPackageMode(sample.test_mode)) return [sample.primary_test_id];
  return [sample.primary_test_id, ...sample.individual_tests.filter(id => id !== sample.primary_test_id)];
}

export function createEmptySample(partial?: Partial<WizardSample>): WizardSample {
  const category = partial?.category ?? 'single_peptide';
  const categoryDefaults = applyCategoryDefaults(category);
  return {
    id: Math.random().toString(36).slice(2),
    sample_name: '',
    display_name: '',
    category: 'single_peptide',
    is_peptide: true,
    batch_number: '',
    labeled_content: '',
    label_claim_unit: 'mg',
    vial_size: '',
    sample_matrix: 'Lyophilized',
    peptide_identification: '',
    sample_type: 'single',
    blend_compounds: 2,
    blend_components: [],
    primary_test_id: '',
    test_mode: 'individual',
    individual_tests: [],
    conformity_extra: 0,
    brand_names: [],
    rush: false,
    catalog_mode: false,
    include_fentanyl: false,
    client_reference: '',
    special_instructions: '',
    ...categoryDefaults,
    ...partial,
    // One wizard row is one physical sample. Add another sample instead of
    // multiplying an ambiguous "identical copies" quantity.
    quantity: 1,
  };
}

/**
 * "10" + "mg" → "10 mg"; "10 mg" + "mg" → "10 mg" (never doubles the unit).
 */
export function formatLabelClaim(content: string, unit: string): string {
  const value = content.trim();
  if (!value) return '';
  const u = unit.trim();
  if (!u) return value;
  const endsWithUnit = new RegExp(`${u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i').test(value);
  return endsWithUnit ? value : `${value} ${u}`;
}

export function normalizeWizardSample(sample: Partial<WizardSample> & Pick<WizardSample, 'id'>): WizardSample {
  const base = createEmptySample({ id: sample.id });
  const merged = { ...base, ...sample };
  if (!merged.category) {
    if (merged.sample_type === 'blend') merged.category = 'peptide_blend';
    else if (merged.sample_matrix === 'BAC Water') merged.category = 'bac_water';
    else if (merged.is_peptide) merged.category = 'single_peptide';
    else merged.category = 'other';
  }
  if (!merged.primary_test_id) {
    if (merged.test_mode === 'atlas_pro') merged.primary_test_id = 'atlas_pro';
    else if (merged.test_mode === 'full_qc') merged.primary_test_id = 'full_qc';
    else if (merged.individual_tests[0]) merged.primary_test_id = merged.individual_tests[0];
  }
  merged.test_mode = resolveTestMode(merged.primary_test_id);
  if (isPackageMode(merged.test_mode)) {
    merged.individual_tests = bundledTestsForMode(merged.test_mode);
  } else {
    merged.individual_tests = (merged.individual_tests || []).filter(id => id !== merged.primary_test_id);
  }
  if (!merged.label_claim_unit) merged.label_claim_unit = 'mg';
  if (typeof merged.client_reference !== 'string') merged.client_reference = '';
  if (typeof merged.special_instructions !== 'string') merged.special_instructions = '';
  merged.quantity = 1;
  if (!Array.isArray(merged.blend_components)) merged.blend_components = [];
  if (merged.sample_type === 'blend' && merged.blend_components.length === 0) {
    merged.blend_components = defaultBlendComponents(merged.blend_compounds || MIN_BLEND_COMPONENTS);
  }
  merged.blend_compounds = activeBlendComponents(merged.blend_components).length || merged.blend_compounds;
  return merged;
}

export function sampleIncludesFentanyl(sample: WizardSample): boolean {
  if (sample.test_mode === 'atlas_pro') return sample.include_fentanyl;
  return (
    sample.primary_test_id === FENTANYL_TEST_ID ||
    sample.individual_tests.includes(FENTANYL_TEST_ID)
  );
}

export function sampleTestCount(sample: WizardSample): number {
  return selectedServiceIds(sample).length;
}

export function sampleVialCount(sample: WizardSample, catalog: LabTestService[] = LAB_TEST_SERVICES): number {
  const ids = selectedServiceIds(sample);
  if (ids.length === 0) return 0;
  if (isPackageMode(sample.test_mode)) {
    return panelVialsRequired(sample.test_mode) + Math.max(0, sample.conformity_extra);
  }
  const vials = ids.reduce((sum, id) => sum + (findTestService(id, catalog)?.vialsRequired ?? 1), 0);
  return Math.max(1, vials) + Math.max(0, sample.conformity_extra);
}

export function billableBrandCount(sample: WizardSample, primaryBrand = ''): number {
  const names = sample.brand_names.filter(Boolean);
  const primary = primaryBrand.trim().toLowerCase();
  if (!primary) return names.length;
  return names.filter(n => n.trim().toLowerCase() !== primary).length;
}

export function sampleChipLabel(sample: WizardSample, index: number): string {
  const parts = [`${index + 1} ${sample.sample_name || 'New sample'}`];
  if (sample.batch_number) parts.push(`Lot: ${sample.batch_number}`);
  const tests = sampleTestCount(sample);
  if (tests > 0) parts.push(`${tests} test${tests === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

export function sampleTestPrice(sample: WizardSample, catalog: LabTestService[] = LAB_TEST_SERVICES): number {
  if (sample.test_mode === 'atlas_pro') {
    return findTestService('atlas_pro', catalog)?.price ?? ATLAS_PRO_PANEL.price;
  }
  if (sample.test_mode === 'full_qc') {
    return findTestService('full_qc', catalog)?.price ?? FULL_QC_PANEL.price;
  }
  return selectedServiceIds(sample).reduce((sum, id) => sum + (findTestService(id, catalog)?.price ?? 0), 0);
}

export function sampleAddOnPrice(sample: WizardSample, primaryBrand = ''): number {
  const conformity = sample.conformity_extra * CONFORMITY_PRICE;
  const brands = billableBrandCount(sample, primaryBrand) * MULTI_BRAND_PRICE;
  const rush = sample.rush ? RUSH_PRICE_PER_SAMPLE : 0;
  return conformity + brands + rush;
}

export function sampleLineTotal(
  sample: WizardSample,
  primaryBrand = '',
  catalog: LabTestService[] = LAB_TEST_SERVICES,
): number {
  return sampleTestPrice(sample, catalog) + sampleAddOnPrice(sample, primaryBrand);
}

export function orderTotals(
  samples: WizardSample[],
  primaryBrand = '',
  catalog: LabTestService[] = LAB_TEST_SERVICES,
) {
  const subtotal = samples.reduce((s, sample) => s + sampleLineTotal(sample, primaryBrand, catalog), 0);
  const testSubtotal = samples.reduce(
    (s, sample) => s + sampleTestPrice(sample, catalog),
    0,
  );
  const addOnSubtotal = samples.reduce(
    (s, sample) => s + sampleAddOnPrice(sample, primaryBrand),
    0,
  );
  const sampleCount = samples.length;
  const testCount = samples.reduce((n, s) => n + sampleTestCount(s), 0);
  // Package/assay vial requirement per sample line — not multiplied by quantity
  // (quantity is identical-copy count for pricing). Blends do not add vials per compound.
  const totalVials = samples.reduce((n, s) => n + sampleVialCount(s, catalog), 0);
  const turnaround = estimatedTurnaroundDays(samples, catalog);
  return { subtotal, testSubtotal, addOnSubtotal, sampleCount, testCount, totalVials, turnaround };
}

export function estimatedTurnaroundDays(
  samples: WizardSample[],
  catalog: LabTestService[] = LAB_TEST_SERVICES,
): number | null {
  let max: number | null = null;
  for (const sample of samples) {
    for (const id of selectedServiceIds(sample)) {
      const days = findTestService(id, catalog)?.turnaroundDays;
      if (typeof days === 'number') max = max == null ? days : Math.max(max, days);
    }
    if (sample.rush && max != null) max = Math.max(1, Math.ceil(max / 2));
  }
  return max;
}

export function formatTurnaround(days: number | null, label?: string | null): string {
  if (label?.trim()) return label.trim();
  if (days == null || days <= 0) return '—';
  if (days === 1) return '1 business day';
  return `${days} business days`;
}

export function formatServiceTurnaround(service: Pick<LabTestService, 'turnaroundDays' | 'turnaroundLabel'> | undefined): string {
  if (!service) return '—';
  return formatTurnaround(service.turnaroundDays, service.turnaroundLabel);
}

/** Prefer shared package labels (e.g. 3–5 days) when that is the controlling turnaround. */
export function formatOrderTurnaround(
  samples: WizardSample[],
  catalog: LabTestService[] = LAB_TEST_SERVICES,
): string {
  const labels = new Set<string>();
  for (const sample of samples) {
    for (const id of selectedServiceIds(sample)) {
      const service = findTestService(id, catalog);
      if (service?.turnaroundLabel?.trim()) labels.add(service.turnaroundLabel.trim());
    }
  }
  if (labels.size === 1) return [...labels][0];
  return formatTurnaround(estimatedTurnaroundDays(samples, catalog));
}

export function validateTestingSelection(samples: WizardSample[]): string | null {
  if (!samples.length) return 'Add at least one sample configuration.';
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (!s.category) return `Sample ${i + 1}: choose a sample category.`;
    if (!s.primary_test_id) return `Select a primary test for Sample ${i + 1}.`;
  }
  return null;
}

export function validateSampleInformation(samples: WizardSample[]): string | null {
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (!s.sample_name.trim()) return `Sample ${i + 1}: enter a product or sample name.`;
    if (!s.batch_number.trim()) return `Sample ${i + 1}: lot / batch number is required.`;
    if (!s.labeled_content.trim()) return `Sample ${i + 1}: label claim is required.`;
    if (s.category === 'single_peptide' && !s.peptide_identification.trim()) {
      return `Sample ${i + 1}: compound / analyte is required.`;
    }
    if (s.category === 'peptide_blend' || s.sample_type === 'blend') {
      const components = activeBlendComponents(s.blend_components);
      if (components.length < MIN_BLEND_COMPONENTS) {
        return `Sample ${i + 1}: add at least ${MIN_BLEND_COMPONENTS} blend compounds with names and claims.`;
      }
      if (components.length > MAX_BLEND_COMPONENTS) {
        return `Sample ${i + 1}: blends support up to ${MAX_BLEND_COMPONENTS} compounds.`;
      }
      const names = new Set<string>();
      for (let j = 0; j < components.length; j++) {
        const c = components[j];
        if (!c.name.trim()) return `Sample ${i + 1}, compound ${j + 1}: enter a name.`;
        if (!c.amount_mg.trim()) return `Sample ${i + 1}, compound ${j + 1}: enter a label claim.`;
        const key = c.name.trim().toLowerCase();
        if (names.has(key)) return `Sample ${i + 1}: duplicate compound “${c.name.trim()}”.`;
        names.add(key);
      }
    }
    if (!s.primary_test_id) return `Sample ${i + 1}: select a primary test.`;
  }
  return null;
}

/** @deprecated use validateSampleInformation / validateTestingSelection */
export function validateStep1(samples: WizardSample[]): string | null {
  return validateTestingSelection(samples) || validateSampleInformation(samples);
}

export function formatSampleTests(
  sample: WizardSample,
  catalog: LabTestService[] = LAB_TEST_SERVICES,
): string {
  if (sample.test_mode === 'atlas_pro') {
    const base = findTestService('atlas_pro', catalog)?.name ?? ATLAS_PRO_PANEL.name;
    if (sample.include_fentanyl) return `${base} (+ ${FENTANYL_OPTION_LABEL})`;
    return base;
  }
  if (sample.test_mode === 'full_qc') {
    return findTestService('full_qc', catalog)?.name ?? FULL_QC_PANEL.name;
  }
  return selectedServiceIds(sample)
    .map(id => findTestService(id, catalog)?.name ?? id)
    .join(', ') || 'No tests selected';
}

export function sampleMetadataPayload(
  sample: WizardSample,
  primaryBrand = '',
  catalog: LabTestService[] = LAB_TEST_SERVICES,
) {
  const assayIds = isPackageMode(sample.test_mode)
    ? bundledTestsForMode(sample.test_mode)
    : selectedServiceIds(sample);
  const alloc = (() => {
    try {
      // Lazy import avoided — build allocation inline for package modes.
      const extras = Math.max(0, sample.conformity_extra);
      if (sample.test_mode === 'atlas_pro') {
        return {
          included_conformity_vials: ATLAS_PRO_INCLUDED_CONFORMITY_VIALS,
          included_comparison_vials: ATLAS_PRO_INCLUDED_EXTRA_CONFORMITY_VIALS,
          additional_conformity_vials: extras,
          conformity_vials: ATLAS_PRO_INCLUDED_CONFORMITY_VIALS + extras,
          // Legacy aliases for older trackers / embeds.
          included_variance_vials: ATLAS_PRO_INCLUDED_CONFORMITY_VIALS,
          additional_variance_vials: extras,
          variance_vials: ATLAS_PRO_INCLUDED_CONFORMITY_VIALS + extras,
        };
      }
      return {
        included_conformity_vials: 0,
        included_comparison_vials: 0,
        additional_conformity_vials: extras,
        conformity_vials: extras,
        included_variance_vials: 0,
        additional_variance_vials: extras,
        variance_vials: extras,
      };
    } catch {
      return {
        included_conformity_vials: 0,
        included_comparison_vials: 0,
        additional_conformity_vials: sample.conformity_extra,
        conformity_vials: sample.conformity_extra,
        included_variance_vials: 0,
        additional_variance_vials: sample.conformity_extra,
        variance_vials: sample.conformity_extra,
      };
    }
  })();

  return {
    batch_number: sample.batch_number,
    labeled_content: sample.labeled_content,
    label_claim_unit: sample.label_claim_unit,
    vial_size: sample.vial_size,
    sample_matrix: sample.sample_matrix,
    category: sample.category,
    is_peptide: sample.is_peptide,
    peptide_identification: sample.peptide_identification,
    sample_type: sample.sample_type,
    blend_compounds: activeBlendComponents(sample.blend_components).length,
    blend_components: activeBlendComponents(sample.blend_components),
    blend_label: sample.sample_type === 'blend' ? formatBlendLabel(sample.blend_components) : undefined,
    primary_test_id: sample.primary_test_id,
    test_mode: sample.test_mode,
    individual_tests: assayIds,
    conformity_extra: sample.conformity_extra,
    ...alloc,
    brand_names: sample.brand_names.filter(Boolean),
    rush: sample.rush,
    include_fentanyl: sampleIncludesFentanyl(sample),
    client_reference: sample.client_reference,
    special_instructions: sample.special_instructions,
    tests_label: formatSampleTests(sample, catalog),
    line_total: sampleLineTotal(sample, primaryBrand, catalog),
    vials_required: sampleVialCount(sample, catalog),
    turnaround_days: estimatedTurnaroundDays([sample], catalog),
  };
}

export function describePricing(
  sample: WizardSample,
  primaryBrand = '',
  catalog: LabTestService[] = LAB_TEST_SERVICES,
): string {
  const base = sampleTestPrice(sample, catalog);
  const extras: string[] = [];
  if (sample.conformity_extra) {
    extras.push(`${sample.conformity_extra} conformity (+${formatCurrency(sample.conformity_extra * CONFORMITY_PRICE)})`);
  }
  const brands = billableBrandCount(sample, primaryBrand);
  if (brands) extras.push(`${brands} extra brand(s) (+${formatCurrency(brands * MULTI_BRAND_PRICE)})`);
  if (sample.rush) extras.push(`rush (+${formatCurrency(RUSH_PRICE_PER_SAMPLE)})`);
  if (!extras.length) return formatCurrency(base);
  return `${formatCurrency(base)} + ${extras.join(', ')}`;
}

export function packageIncludesConformity(mode: TestMode): boolean {
  return mode === 'atlas_pro';
}

/** True when Atlas Pro is selected or extra conformity vials were added. */
export function sampleIncludesConformity(sample: Pick<WizardSample, 'test_mode' | 'conformity_extra'>): boolean {
  return sample.test_mode === 'atlas_pro' || sample.conformity_extra > 0;
}

export function applyPrimaryTest(sample: WizardSample, primaryId: string): WizardSample {
  const mode = resolveTestMode(primaryId);
  return {
    ...sample,
    primary_test_id: primaryId,
    test_mode: mode,
    individual_tests: isPackageMode(mode) ? bundledTestsForMode(mode) : sample.individual_tests.filter(id => id !== primaryId),
    include_fentanyl: mode === 'atlas_pro' ? sample.include_fentanyl : false,
  };
}

export function toggleAddonTest(sample: WizardSample, testId: string): WizardSample {
  if (!sample.primary_test_id || isPackageMode(sample.test_mode)) return sample;
  if (testId === sample.primary_test_id) return sample;
  const has = sample.individual_tests.includes(testId);
  return {
    ...sample,
    test_mode: 'individual',
    individual_tests: has
      ? sample.individual_tests.filter(t => t !== testId)
      : [...sample.individual_tests, testId],
  };
}

/**
 * Combined à la carte selection: first pick is primary; further picks are add-ons.
 * Replaces separate primary + addon toggles for individual assays.
 */
export function toggleAlaCarteAssay(sample: WizardSample, testId: string): WizardSample {
  if (isPackageMode(sample.test_mode) || !sample.primary_test_id) {
    return applyPrimaryTest({ ...sample, individual_tests: [] }, testId);
  }

  if (sample.primary_test_id === testId) {
    const [nextPrimary, ...rest] = sample.individual_tests;
    if (!nextPrimary) {
      return applyPrimaryTest({ ...sample, individual_tests: [] }, '');
    }
    return {
      ...sample,
      primary_test_id: nextPrimary,
      test_mode: 'individual',
      individual_tests: rest,
      include_fentanyl: false,
    };
  }

  return toggleAddonTest(sample, testId);
}

/** Merge optional DB panel rows onto catalog by fuzzy name match. */
export function mergeCatalogWithDbPanels(
  base: LabTestService[],
  dbPanels: Array<{
    id?: string;
    name?: string;
    description?: string | null;
    price?: number | null;
    price_per_sample?: number | null;
    is_active?: boolean | null;
  }>,
): LabTestService[] {
  if (!dbPanels.length) return base;
  return base.map(service => {
    const hit = dbPanels.find(p => {
      const n = (p.name || '').toLowerCase();
      return (
        n === service.name.toLowerCase()
        || n.includes(service.name.toLowerCase())
        || service.name.toLowerCase().includes(n.split('(')[0].trim())
      );
    });
    if (!hit) return service;
    const dbPrice = typeof hit.price_per_sample === 'number'
      ? hit.price_per_sample
      : typeof hit.price === 'number'
        ? hit.price
        : null;
    // Safety Pro price is owned by ATLAS_SAFETY_PRO_PRICE — ignore stale DB amounts.
    const price = service.id === 'atlas_pro'
      ? service.price
      : (typeof dbPrice === 'number' && dbPrice > 0 ? dbPrice : service.price);
    return {
      ...service,
      description: (hit.description || service.description).trim() || service.description,
      price,
      available: service.available && hit.is_active !== false,
    };
  });
}
