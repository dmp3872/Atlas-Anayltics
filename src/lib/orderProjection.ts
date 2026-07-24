/**
 * Shared order projection — single source of truth for package capabilities,
 * vial allocation, selected methods, and wizard/preview stages.
 */
import {
  ATLAS_PRO_INCLUDED_CONFORMITY_VIALS,
  CONFORMITY_PRICE,
  FULL_QC_PANEL,
  ATLAS_PRO_PANEL,
  LabTestService,
  TestMode,
  WizardSample,
  bundledTestsForMode,
  findTestService,
  isPackageMode,
  sampleIncludesConformity,
  sampleIncludesFentanyl,
  sampleVialCount,
  selectedServiceIds,
} from './orderCatalog';

export type WizardStage = 'package' | 'details' | 'checkout' | 'submitted' | 'tracking';

export type TrackingStage =
  | 'submitted'
  | 'awaiting_sample'
  | 'received'
  | 'analyzing'
  | 'in_review'
  | 'issued'
  | 'complete';

export interface PackageCapability {
  id: 'full_qc' | 'atlas_pro';
  name: string;
  price: number;
  vialsRequired: number;
  includesIdentity: boolean;
  includesPurity: boolean;
  includesQuantity: boolean;
  includesHeavyMetals: boolean;
  includesEndotoxin: boolean;
  includesSterility: boolean;
  includesConformity: boolean;
  includesFentanylOption: boolean;
  methodKeys: MethodKey[];
}

export type MethodKey =
  | 'identity'
  | 'purity'
  | 'quantity'
  | 'conformity'
  | 'heavy_metals_icpms'
  | 'endotoxin_usp85'
  | 'sterility_pcr'
  | 'sterility_culture'
  | 'fentanyl_detection'
  | 'residual_solvents'
  | 'residual_moisture';

export interface MethodBlurb {
  key: MethodKey;
  label: string;
  instrument: string;
  blurb: string;
}

export const METHOD_LIBRARY: Record<MethodKey, MethodBlurb> = {
  identity: {
    key: 'identity',
    label: 'Identity',
    instrument: 'MS / HPLC',
    blurb: 'Confirms the analyte matches the labeled compound by chromatographic retention and mass signature.',
  },
  purity: {
    key: 'purity',
    label: 'Purity',
    instrument: 'HPLC',
    blurb: 'Reports percent purity of the primary peak versus related substances on a calibrated HPLC run.',
  },
  quantity: {
    key: 'quantity',
    label: 'Quantity',
    instrument: 'HPLC',
    blurb: 'Quantifies net content against the label claim so reported mg (or unit) matches what’s on the vial.',
  },
  heavy_metals_icpms: {
    key: 'heavy_metals_icpms',
    label: 'Heavy Metals',
    instrument: 'ICP-MS',
    blurb: 'Screens elemental impurities (e.g. Pb, As, Cd, Hg) at trace levels by inductively coupled plasma mass spectrometry.',
  },
  endotoxin_usp85: {
    key: 'endotoxin_usp85',
    label: 'Endotoxin',
    instrument: 'LAL',
    blurb: 'USP <85> Limulus Amebocyte Lysate screen for bacterial endotoxin that can indicate gram-negative contamination.',
  },
  sterility_pcr: {
    key: 'sterility_pcr',
    label: 'Sterility',
    instrument: 'PCR',
    blurb: 'Rapid molecular screen for microbial DNA — faster than culture while flagging common contaminants.',
  },
  sterility_culture: {
    key: 'sterility_culture',
    label: 'Sterility (Culture)',
    instrument: 'Culture',
    blurb: '14-day growth-based sterility verification for full culture confirmation when required.',
  },
  fentanyl_detection: {
    key: 'fentanyl_detection',
    label: 'Fentanyl',
    instrument: 'LC-MS',
    blurb: 'Targeted screen for fentanyl and related analogs to rule out illicit opioid contamination.',
  },
  conformity: {
    key: 'conformity',
    label: 'Conformity',
    instrument: 'Multi-vial',
    blurb: 'Repeats identity, purity, and quantity across multiple vials from the same lot to check sample-to-sample conformance.',
  },
  residual_solvents: {
    key: 'residual_solvents',
    label: 'Residual Solvents',
    instrument: 'GC',
    blurb: 'Profiles leftover process solvents that can remain from synthesis or purification.',
  },
  residual_moisture: {
    key: 'residual_moisture',
    label: 'Residual Moisture',
    instrument: 'KF / LOD',
    blurb: 'Measures water content that can affect stability, potency, and reconstitution behavior.',
  },
};

const METHOD_ORDER: MethodKey[] = [
  'identity',
  'purity',
  'quantity',
  'conformity',
  'heavy_metals_icpms',
  'endotoxin_usp85',
  'sterility_pcr',
  'sterility_culture',
  'fentanyl_detection',
  'residual_solvents',
  'residual_moisture',
];

export type VialRole = 'primary' | 'comparison' | 'assay' | 'reserve';

export interface AllocatedVial {
  index: number;
  label: string;
  purpose: string;
  assays: string[];
  role: VialRole;
  included: boolean;
  paidExtra: boolean;
  price: number;
}

export interface VialAllocation {
  vials: AllocatedVial[];
  totalVials: number;
  includedConformityVials: number;
  extraConformityVials: number;
  conformityVials: number;
}

export function packageCapabilities(id: 'full_qc' | 'atlas_pro'): PackageCapability {
  if (id === 'atlas_pro') {
    return {
      id: 'atlas_pro',
      name: ATLAS_PRO_PANEL.name,
      price: ATLAS_PRO_PANEL.price,
      vialsRequired: ATLAS_PRO_PANEL.vialsRequired,
      includesIdentity: true,
      includesPurity: true,
      includesQuantity: true,
      includesHeavyMetals: true,
      includesEndotoxin: true,
      includesSterility: true,
      includesConformity: true,
      includesFentanylOption: true,
      methodKeys: [
        'identity',
        'purity',
        'quantity',
        'conformity',
        'heavy_metals_icpms',
        'endotoxin_usp85',
        'sterility_pcr',
      ],
    };
  }
  return {
    id: 'full_qc',
    name: FULL_QC_PANEL.name,
    price: FULL_QC_PANEL.price,
    vialsRequired: FULL_QC_PANEL.vialsRequired,
    includesIdentity: true,
    includesPurity: true,
    includesQuantity: true,
    includesHeavyMetals: false,
    includesEndotoxin: false,
    includesSterility: true,
    includesConformity: false,
    includesFentanylOption: false,
    methodKeys: ['identity', 'purity', 'quantity', 'sterility_pcr'],
  };
}

export function methodKeysForSample(sample: WizardSample | null | undefined): MethodKey[] {
  if (!sample?.primary_test_id) return ['identity', 'purity', 'quantity'];

  const keys = new Set<MethodKey>();
  const addHplcTrio = () => {
    keys.add('identity');
    keys.add('purity');
    keys.add('quantity');
  };

  if (sample.test_mode === 'atlas_pro') {
    for (const k of packageCapabilities('atlas_pro').methodKeys) keys.add(k);
  } else if (sample.test_mode === 'full_qc') {
    for (const k of packageCapabilities('full_qc').methodKeys) keys.add(k);
  } else {
    const ids = selectedServiceIds(sample);
    for (const id of ids) {
      if (id === 'identity_purity_quantity' || id === 'purity_hplc') addHplcTrio();
      else if (id in METHOD_LIBRARY) keys.add(id as MethodKey);
    }
  }

  if (sampleIncludesFentanyl(sample)) keys.add('fentanyl_detection');
  if (sampleIncludesConformity(sample)) keys.add('conformity');

  return METHOD_ORDER.filter(k => keys.has(k));
}

export function methodsForSample(sample: WizardSample | null | undefined): MethodBlurb[] {
  return methodKeysForSample(sample).map(k => METHOD_LIBRARY[k]);
}

/** Assay/test ids that should appear on COAs for this sample (from live wizard or persisted metadata). */
export function orderedAssayIds(sample: WizardSample | { metadata?: unknown; test_mode?: string }): string[] {
  const meta =
    'metadata' in sample && sample.metadata && typeof sample.metadata === 'object'
      ? (sample.metadata as Record<string, unknown>)
      : (sample as unknown as Record<string, unknown>);

  const mode = (meta.test_mode as TestMode | undefined) ?? ('test_mode' in sample ? (sample as WizardSample).test_mode : undefined);
  if (mode === 'atlas_pro' || mode === 'full_qc') {
    const bundled = bundledTestsForMode(mode);
    const fentanyl =
      meta.include_fentanyl === true ||
      (Array.isArray(meta.individual_tests) && meta.individual_tests.includes('fentanyl_detection'));
    return fentanyl ? [...bundled, 'fentanyl_detection'] : [...bundled];
  }

  if ('primary_test_id' in sample && typeof (sample as WizardSample).primary_test_id === 'string') {
    return selectedServiceIds(sample as WizardSample);
  }

  const ids = Array.isArray(meta.individual_tests) ? (meta.individual_tests as string[]) : [];
  return ids;
}

export function sampleIncludesAssay(
  sample: WizardSample | { metadata?: unknown },
  assayId: string,
): boolean {
  const ids = orderedAssayIds(sample);
  if (ids.includes(assayId)) return true;
  // HPLC package implies identity/purity/quantity
  if (
    (assayId === 'purity_hplc' || assayId === 'identity_purity_quantity') &&
    (ids.includes('purity_hplc') || ids.includes('identity_purity_quantity') || ids.includes('atlas_pro') || ids.includes('full_qc'))
  ) {
    return true;
  }
  const mode =
    'test_mode' in sample
      ? (sample as WizardSample).test_mode
      : ((sample as { metadata?: { test_mode?: string } }).metadata?.test_mode as TestMode | undefined);
  if (mode === 'atlas_pro' || mode === 'full_qc') {
    return bundledTestsForMode(mode).includes(assayId as never) || assayId === 'purity_hplc';
  }
  return false;
}

export function buildVialAllocation(
  sample: WizardSample,
  catalog: LabTestService[] = [],
): VialAllocation {
  const extras = Math.max(0, sample.conformity_extra);

  if (sample.test_mode === 'atlas_pro') {
    const vials: AllocatedVial[] = [
      {
        index: 1,
        label: 'V1',
        purpose: 'HPLC primary',
        assays: ['Identity', 'Purity', 'Quantity'],
        role: 'primary',
        included: true,
        paidExtra: false,
        price: 0,
      },
      {
        index: 2,
        label: 'V2',
        purpose: 'Conformity comparison',
        assays: ['Identity', 'Purity', 'Quantity'],
        role: 'comparison',
        included: true,
        paidExtra: false,
        price: 0,
      },
      {
        index: 3,
        label: 'V3',
        purpose: 'Conformity comparison',
        assays: ['Identity', 'Purity', 'Quantity'],
        role: 'comparison',
        included: true,
        paidExtra: false,
        price: 0,
      },
      {
        index: 4,
        label: 'V4',
        purpose: 'Endotoxin (LAL)',
        assays: ['Endotoxin', 'Heavy Metals'],
        role: 'assay',
        included: true,
        paidExtra: false,
        price: 0,
      },
      {
        index: 5,
        label: 'V5',
        purpose: 'Sterility (PCR)',
        assays: ['Sterility'],
        role: 'assay',
        included: true,
        paidExtra: false,
        price: 0,
      },
    ];
    for (let i = 0; i < extras; i++) {
      const n = 6 + i;
      vials.push({
        index: n,
        label: `V${n}`,
        purpose: 'Extra conformity vial',
        assays: ['Identity', 'Purity', 'Quantity'],
        role: 'comparison',
        included: false,
        paidExtra: true,
        price: CONFORMITY_PRICE,
      });
    }
    return {
      vials,
      totalVials: vials.length,
      includedConformityVials: ATLAS_PRO_INCLUDED_CONFORMITY_VIALS,
      extraConformityVials: extras,
      conformityVials: ATLAS_PRO_INCLUDED_CONFORMITY_VIALS + extras,
    };
  }

  if (sample.test_mode === 'full_qc') {
    const vials: AllocatedVial[] = [
      {
        index: 1,
        label: 'V1',
        purpose: 'HPLC primary',
        assays: ['Identity', 'Purity', 'Quantity'],
        role: 'primary',
        included: true,
        paidExtra: false,
        price: 0,
      },
      {
        index: 2,
        label: 'V2',
        purpose: 'HPLC confirmation',
        assays: ['Identity', 'Purity', 'Quantity'],
        role: 'reserve',
        included: true,
        paidExtra: false,
        price: 0,
      },
      {
        index: 3,
        label: 'V3',
        purpose: 'Sterility (PCR)',
        assays: ['Sterility'],
        role: 'assay',
        included: true,
        paidExtra: false,
        price: 0,
      },
    ];
    for (let i = 0; i < extras; i++) {
      const n = 4 + i;
      vials.push({
        index: n,
        label: `V${n}`,
        purpose: 'Extra conformity vial',
        assays: ['Identity', 'Purity', 'Quantity'],
        role: 'comparison',
        included: false,
        paidExtra: true,
        price: CONFORMITY_PRICE,
      });
    }
    return {
      vials,
      totalVials: vials.length,
      includedConformityVials: 0,
      extraConformityVials: extras,
      conformityVials: extras,
    };
  }

  // À la carte: one vial per assay (plus paid conformity extras).
  const ids = selectedServiceIds(sample);
  const vials: AllocatedVial[] = ids.map((id, i) => {
    const svc = findTestService(id, catalog);
    return {
      index: i + 1,
      label: `V${i + 1}`,
      purpose: svc?.name ?? id,
      assays: [svc?.name ?? id],
      role: i === 0 ? 'primary' : 'assay',
      included: true,
      paidExtra: false,
      price: 0,
    };
  });
  const base = Math.max(1, vials.length);
  for (let i = 0; i < extras; i++) {
    const n = base + i + (vials.length ? 0 : 1);
    const index = vials.length + 1;
    vials.push({
      index,
      label: `V${index}`,
      purpose: 'Extra conformity vial',
      assays: ['Identity', 'Purity', 'Quantity'],
      role: 'comparison',
      included: false,
      paidExtra: true,
      price: CONFORMITY_PRICE,
    });
    void n;
  }

  const total = sampleVialCount(sample, catalog);
  // Ensure labels match sampleVialCount when assays require multiple vials.
  while (vials.length < total) {
    const index = vials.length + 1;
    vials.push({
      index,
      label: `V${index}`,
      purpose: 'Additional assay vial',
      assays: ['Assay'],
      role: 'assay',
      included: true,
      paidExtra: false,
      price: 0,
    });
  }

  return {
    vials: vials.slice(0, Math.max(total, vials.length)),
    totalVials: Math.max(total, vials.length),
    includedConformityVials: 0,
    extraConformityVials: extras,
    conformityVials: extras,
  };
}

export function conformityChartVialCount(sample: WizardSample | null | undefined): number {
  if (!sample) return 3;
  if (sample.test_mode === 'atlas_pro') {
    return ATLAS_PRO_INCLUDED_CONFORMITY_VIALS + Math.max(0, sample.conformity_extra);
  }
  if (sample.conformity_extra > 0) {
    return Math.max(1, sample.conformity_extra);
  }
  return 0;
}

/** @deprecated Use conformityChartVialCount */
export function varianceChartVialCount(sample: WizardSample | null | undefined): number {
  return conformityChartVialCount(sample) || 3;
}

export function wizardStageFromStep(step: number): WizardStage {
  if (step <= 1) return 'package';
  if (step === 2) return 'details';
  return 'checkout';
}

export function trackingStageFromStatuses(opts: {
  orderStatus?: string | null;
  sampleStatus?: string | null;
  hasIssuedCoa?: boolean;
}): TrackingStage {
  if (opts.hasIssuedCoa || opts.sampleStatus === 'complete' || opts.orderStatus === 'complete') {
    return opts.orderStatus === 'complete' || opts.sampleStatus === 'complete' ? 'complete' : 'issued';
  }
  const s = opts.sampleStatus || opts.orderStatus || 'awaiting_sample';
  if (s === 'in_review') return 'in_review';
  if (s === 'analyzing' || s === 'processing') return 'analyzing';
  if (s === 'received') return 'received';
  if (s === 'awaiting_sample') return 'awaiting_sample';
  return 'submitted';
}

export function packageCompareDiff(a: 'full_qc' | 'atlas_pro', b: 'full_qc' | 'atlas_pro') {
  const left = packageCapabilities(a);
  const right = packageCapabilities(b);
  return {
    left,
    right,
    priceDelta: right.price - left.price,
    vialDelta: right.vialsRequired - left.vialsRequired,
    addedMethods: right.methodKeys.filter(k => !left.methodKeys.includes(k)),
    removedMethods: left.methodKeys.filter(k => !right.methodKeys.includes(k)),
  };
}

export function isPackageModeId(id: string): id is 'full_qc' | 'atlas_pro' {
  return id === 'full_qc' || id === 'atlas_pro';
}

export function previewSampleForPackage(
  sample: WizardSample,
  packageId: 'full_qc' | 'atlas_pro' | null,
): WizardSample {
  if (!packageId) return sample;
  if (packageId === 'atlas_pro') {
    return {
      ...sample,
      primary_test_id: 'atlas_pro',
      test_mode: 'atlas_pro',
      individual_tests: [...ATLAS_PRO_PANEL.bundledTestIds],
    };
  }
  return {
    ...sample,
    primary_test_id: 'full_qc',
    test_mode: 'full_qc',
    individual_tests: [...FULL_QC_PANEL.bundledTestIds],
    include_fentanyl: false,
    conformity_extra: 0,
  };
}

export function allocationMetadata(sample: WizardSample, catalog?: LabTestService[]) {
  const alloc = buildVialAllocation(sample, catalog);
  return {
    vial_allocation: alloc.vials.map(v => ({
      index: v.index,
      label: v.label,
      purpose: v.purpose,
      assays: v.assays,
      role: v.role,
      included: v.included,
      paid_extra: v.paidExtra,
    })),
    included_conformity_vials: alloc.includedConformityVials,
    additional_conformity_vials: alloc.extraConformityVials,
    conformity_vials: alloc.conformityVials,
    // Legacy aliases
    included_variance_vials: alloc.includedConformityVials,
    additional_variance_vials: alloc.extraConformityVials,
    variance_vials: alloc.conformityVials,
  };
}

export { isPackageMode };
