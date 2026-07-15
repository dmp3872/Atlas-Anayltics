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

export type ReadinessState = 'getting_started' | 'information_missing' | 'ready_to_review';

export interface ReadinessReport {
  percent: number;
  state: ReadinessState;
  stateLabel: string;
  messages: string[];
  blocking: string[];
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

export function computeOrderReadiness(samples: WizardSample[]): ReadinessReport {
  if (!samples.length) {
    return {
      percent: 0,
      state: 'getting_started',
      stateLabel: 'Getting Started',
      messages: ['Add a sample and choose a primary test to begin.'],
      blocking: ['Add at least one sample'],
    };
  }

  let done = 0;
  let total = 0;
  const blocking: string[] = [];

  for (let i = 0; i < samples.length; i++) {
    const check = sampleChecks(samples[i], i);
    done += check.done;
    total += check.total;
    blocking.push(...check.blocking);
  }

  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
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
    stateLabel = 'Information Missing';
  } else {
    state = 'ready_to_review';
    stateLabel = 'Ready to Review';
  }

  const messages =
    blocking.length > 0
      ? blocking.slice(0, 4)
      : ['All required information is complete'];

  return { percent, state, stateLabel, messages, blocking };
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
