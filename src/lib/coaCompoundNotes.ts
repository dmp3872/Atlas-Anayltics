/** Compound-specific chromatogram / assay notes shown on digital + PDF COAs. */

export const HCG_CHROMATOGRAM_NOTE =
  'Note: Chorionic gonadotropin contains a number of glycosylated isoforms, which results in the clustering of peaks. Protein content based on area count of primary isoforms in comparison to certified reference standard. Per USP-NF a bioassay is required to accurately determine IU, HPLC-UV-Vis can be used to estimate HCG protein content';

/** True when any sample/display/peptide label identifies HCG / chorionic gonadotropin. */
export function isHcgSample(...labels: Array<string | null | undefined>): boolean {
  const blob = labels.filter(Boolean).join(' ').toLowerCase();
  if (!blob) return false;
  return /\bhcg\b/.test(blob) || /chorionic\s+gonadotropin/.test(blob);
}

export function chromatogramNoteForSample(
  ...labels: Array<string | null | undefined>
): string | null {
  if (isHcgSample(...labels)) return HCG_CHROMATOGRAM_NOTE;
  return null;
}
