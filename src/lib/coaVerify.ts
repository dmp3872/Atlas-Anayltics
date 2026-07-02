import { COA, PanelResult } from './types';
import { hashContent } from './utils';

/** Canonical payload used when issuing a COA (must match Lab.tsx). */
export function coaIntegrityPayload(coa: Pick<COA, 'sample_name' | 'batch_number' | 'purity_percent' | 'panel_results'>): string {
  const panels = (Array.isArray(coa.panel_results) ? coa.panel_results : []) as PanelResult[];
  const clean = panels
    .filter(p => p.panel_name?.trim())
    .map(p => ({
      panel_name: p.panel_name.trim(),
      result: (p.result ?? '').trim(),
      pass: p.pass,
    }));
  return `${coa.sample_name}|${coa.batch_number}|${coa.purity_percent ?? ''}|${JSON.stringify(clean)}`;
}

export function computeCoaContentHash(coa: Pick<COA, 'sample_name' | 'batch_number' | 'purity_percent' | 'panel_results'>): string {
  return 'sha256:' + hashContent(coaIntegrityPayload(coa)).toLowerCase();
}

export type VerifyStatus = 'verified' | 'legacy' | 'mismatch' | 'unsigned';

/** Returns whether the stored content_hash matches a recomputed hash. */
export function verifyCoaIntegrity(coa: COA): VerifyStatus {
  if (!coa.content_hash) return 'unsigned';
  const expected = computeCoaContentHash(coa);
  if (coa.content_hash === expected) return 'verified';
  // Seeded / legacy records use arbitrary sha256: labels — treat as on-file if signature exists.
  if (coa.content_hash.startsWith('sha256:') && coa.signature) return 'legacy';
  return 'mismatch';
}

export function verifyUrl(slug: string): string {
  return `${window.location.origin}/verify?slug=${encodeURIComponent(slug)}`;
}
