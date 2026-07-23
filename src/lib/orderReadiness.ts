import {
  WizardSample,
  activeBlendComponents,
  categoryLabel,
  isPackageMode,
  MAX_BLEND_COMPONENTS,
  MIN_BLEND_COMPONENTS,
  sampleVialCount,
  selectedServiceIds,
} from './orderCatalog';

export type ReadinessState =
  | 'getting_started'
  | 'information_missing'
  | 'ready_to_review'
  | 'ready_to_submit';

export interface ReadinessCheckItem {
  id: string;
  label: string;
  done: boolean;
  blocking?: string;
}

export interface ReadinessReport {
  percent: number;
  state: ReadinessState;
  stateLabel: string;
  messages: string[];
  blocking: string[];
  /** Sample-only completeness (wizard steps 1–2). */
  samplePercent: number;
  sampleBlocking: string[];
  checklist: ReadinessCheckItem[];
}

function sampleChecks(sample: WizardSample, index: number): { done: number; total: number; blocking: string[] } {
  const blocking: string[] = [];
  let done = 0;
  const total = 6;

  if (sample.category) done += 1;
  else blocking.push(`Choose a category for Sample ${index + 1}`);

  if (sample.primary_test_id) done += 1;
  else blocking.push(`Select a primary test for Sample ${index + 1}`);

  if (sample.sample_name.trim()) done += 1;
  else blocking.push(`Add a sample name for Sample ${index + 1}`);

  if (sample.batch_number.trim()) done += 1;
  else blocking.push(`Add a lot number for Sample ${index + 1}`);

  if (sample.labeled_content.trim()) done += 1;
  else blocking.push(`Add a label claim for Sample ${index + 1}`);

  const needsCompound =
    sample.category === 'single_peptide'
      ? !!sample.peptide_identification.trim()
      : sample.category === 'peptide_blend'
        ? (() => {
            const comps = activeBlendComponents(sample.blend_components);
            if (comps.length < MIN_BLEND_COMPONENTS) return false;
            if (comps.length > MAX_BLEND_COMPONENTS) return false;
            const names = new Set<string>();
            for (const c of comps) {
              if (!c.name.trim() || !c.amount_mg.trim()) return false;
              const key = c.name.trim().toLowerCase();
              if (names.has(key)) return false;
              names.add(key);
            }
            return true;
          })()
        : true;

  if (needsCompound) done += 1;
  else if (sample.category === 'peptide_blend') {
    blocking.push(`Complete blend compounds for Sample ${index + 1}`);
  } else if (sample.category === 'single_peptide') {
    blocking.push(`Add a compound / analyte for Sample ${index + 1}`);
  }

  return { done, total, blocking };
}

export interface CheckoutReadinessInput {
  samples: WizardSample[];
  hasCoaProfile?: boolean;
  confirmations?: { accurate: boolean; labelsMatch: boolean; agreeTerms: boolean };
  paymentPaid?: boolean;
  /** When true, include checkout gates in percent/state. */
  includeCheckout?: boolean;
}

export function computeOrderReadiness(
  samplesOrOpts: WizardSample[] | CheckoutReadinessInput,
): ReadinessReport {
  const opts: CheckoutReadinessInput = Array.isArray(samplesOrOpts)
    ? { samples: samplesOrOpts }
    : samplesOrOpts;
  const { samples, includeCheckout = false } = opts;

  if (!samples.length) {
    return {
      percent: 0,
      samplePercent: 0,
      state: 'getting_started',
      stateLabel: 'Getting Started',
      messages: ['Add a sample and choose a primary test to begin.'],
      blocking: ['Add at least one sample'],
      sampleBlocking: ['Add at least one sample'],
      checklist: [],
    };
  }

  let done = 0;
  let total = 0;
  const sampleBlocking: string[] = [];

  for (let i = 0; i < samples.length; i++) {
    const check = sampleChecks(samples[i], i);
    done += check.done;
    total += check.total;
    sampleBlocking.push(...check.blocking);
  }

  const samplePercent = total === 0 ? 0 : Math.round((done / total) * 100);

  const checklist: ReadinessCheckItem[] = [
    {
      id: 'tests',
      label: 'Test package or assays selected',
      done: samples.every(s => !!s.primary_test_id),
      blocking: samples.every(s => !!s.primary_test_id) ? undefined : 'Select a primary test',
    },
    {
      id: 'sample_info',
      label: 'Sample name, lot, and label claim',
      done: samples.every(
        s => s.sample_name.trim() && s.batch_number.trim() && s.labeled_content.trim(),
      ),
      blocking: sampleBlocking.find(b => /name|lot|label/i.test(b)),
    },
    {
      id: 'vials',
      label: `Vials ready to ship (${samples.reduce((n, s) => n + sampleVialCount(s), 0)})`,
      done: samples.every(s => sampleVialCount(s) > 0),
      blocking: samples.every(s => sampleVialCount(s) > 0) ? undefined : 'Select tests to determine vials',
    },
  ];

  const checkoutBlocking: string[] = [];
  if (includeCheckout) {
    const hasProfile = !!opts.hasCoaProfile;
    checklist.push({
      id: 'coa_profile',
      label: 'COA profile selected',
      done: hasProfile,
      blocking: hasProfile ? undefined : 'Create or select a COA profile',
    });
    if (!hasProfile) checkoutBlocking.push('Create or select a COA profile');

    const conf = opts.confirmations ?? { accurate: false, labelsMatch: false, agreeTerms: false };
    const confDone = conf.accurate && conf.labelsMatch && conf.agreeTerms;
    checklist.push({
      id: 'confirmations',
      label: 'Order confirmations checked',
      done: confDone,
      blocking: confDone ? undefined : 'Accept all confirmations on the review step',
    });
    if (!confDone) checkoutBlocking.push('Accept all confirmations on the review step');

    const paid = !!opts.paymentPaid;
    checklist.push({
      id: 'payment',
      label: 'Payment authorized',
      done: paid,
      blocking: paid ? undefined : 'Complete payment before submitting',
    });
    if (!paid) checkoutBlocking.push('Complete payment before submitting');
  }

  const checklistDone = checklist.filter(c => c.done).length;
  const checklistTotal = checklist.length;
  const percent = includeCheckout
    ? Math.round((checklistDone / Math.max(1, checklistTotal)) * 100)
    : samplePercent;

  const blocking = includeCheckout
    ? [...sampleBlocking, ...checkoutBlocking]
    : sampleBlocking;

  const hasAnyProgress = samples.some(
    s => s.primary_test_id || s.sample_name.trim() || s.category,
  );

  let state: ReadinessState;
  let stateLabel: string;
  if (!hasAnyProgress || percent < 20) {
    state = 'getting_started';
    stateLabel = 'Getting Started';
  } else if (blocking.length > 0) {
    state = 'information_missing';
    stateLabel = includeCheckout && sampleBlocking.length === 0 ? 'Checkout Incomplete' : 'Information Missing';
  } else if (includeCheckout) {
    state = 'ready_to_submit';
    stateLabel = 'Ready to Submit';
  } else {
    state = 'ready_to_review';
    stateLabel = 'Ready to Review';
  }

  const messages =
    blocking.length > 0
      ? blocking.slice(0, 4)
      : [includeCheckout ? 'Ready to ship — all checkout steps complete' : 'All required sample information is complete'];

  return {
    percent,
    samplePercent,
    state,
    stateLabel,
    messages,
    blocking,
    sampleBlocking,
    checklist,
  };
}

export function sampleCompletionLabel(sample: WizardSample): 'Complete' | 'Incomplete' {
  const { blocking } = sampleChecks(sample, 0);
  return blocking.length ? 'Incomplete' : 'Complete';
}

export function sampleHeaderMeta(sample: WizardSample, index: number) {
  return {
    title: `Sample ${index + 1}`,
    name: sample.sample_name.trim() || 'Untitled sample',
    lot: sample.batch_number.trim() || 'No lot',
    tests: selectedServiceIds(sample).length
      ? `${selectedServiceIds(sample).length} test${selectedServiceIds(sample).length === 1 ? '' : 's'}`
      : 'No tests',
    vials: sampleVialCount(sample),
    category: categoryLabel(sample.category),
    package: isPackageMode(sample.test_mode),
    status: sampleCompletionLabel(sample),
  };
}
