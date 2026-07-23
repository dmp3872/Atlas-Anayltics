import { TestPanel } from './types';
import { ATLAS_SAFETY_PRO_PRICE } from './submissionUtils';

/** Stable fallback ID when the DB row is not available yet. */
export const ATLAS_SAFETY_PRO_PANEL_ID = 'a0000000-0000-4000-8000-000000000001';

export const ATLAS_SAFETY_PRO_PANEL: TestPanel = {
  id: ATLAS_SAFETY_PRO_PANEL_ID,
  name: 'Atlas Safety Pro Package',
  description:
    'Complete safety bundle per sample: HPLC Purity, Net Content, Identity (ID), Heavy Metals, Endotoxin (LAL), Sterility (PCR), and Conformity Vials included. Fentanyl Detection available as an optional add-on.',
  price_per_sample: ATLAS_SAFETY_PRO_PRICE,
  turnaround_days: 5,
  category: 'package',
  is_active: true,
  sort_order: -1,
  created_at: '2026-06-22T00:00:00.000Z',
};

export function withAtlasSafetyProPanel(panels: TestPanel[]): TestPanel[] {
  // Keep package TAT + Safety Pro price aligned with app constants even if DB lags.
  const normalized = panels.map((p) => {
    let next = p;
    if (
      p.category === 'package'
      || /safety\s*pro/i.test(p.name)
      || /full\s*qc/i.test(p.name)
    ) {
      next = { ...next, turnaround_days: 5 };
    }
    if (/safety\s*pro/i.test(p.name)) {
      next = { ...next, price_per_sample: ATLAS_SAFETY_PRO_PRICE };
    }
    return next;
  });

  const hasPackage = normalized.some(
    (p) => p.category === 'package' && p.name.includes('Safety Pro'),
  );
  if (hasPackage) return normalized;
  return [ATLAS_SAFETY_PRO_PANEL, ...normalized];
}
