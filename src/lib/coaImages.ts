import { supabase } from './supabase';
import { COA, PanelResult } from './types';
import {
  ENDOTOXIN_SPEC_EU_ML,
  computeAssayAveragesFromPanels,
  formatEndotoxinResult,
  SterilityMethod,
  STERILITY_METHOD_LABELS,
  sterilitySpecLabel,
} from './labCoaForm';
import { compressImageDataUrl } from './imageCompress';

export type FentanylDetectionMark = '' | 'none_detected' | 'detected';

export interface CoaPdfStats {
  /** Shown under Average Net Peptide Content (e.g. "12.4 mg"). */
  avg_net_peptide_content: string;
  /** Number for "Mean of _ vials tested". */
  mean_of_vials_tested: string;
  /** Optional Average Purity value (e.g. "99.1%"). */
  avg_purity?: string;
  /** Fentanyl Detection result on the certificate. */
  fentanyl_detection: FentanylDetectionMark;
  include_molecular_weight: boolean;
  molecular_weight: string;
  sterility_method: SterilityMethod;
  sterility_pass: boolean;
  endotoxin_eu_ml: string;
  endotoxin_pass: boolean;
}

function deriveFentanylFromPanels(coa: COA): FentanylDetectionMark {
  const panels = Array.isArray(coa.panel_results) ? coa.panel_results : [];
  const fen = panels.find(p => p.panel_name.toLowerCase().includes('fentanyl'));
  if (!fen) return '';
  const result = (fen.result || '').toLowerCase();
  if (/none|not\s*detect|nd\b|pass/.test(result) || fen.pass) return 'none_detected';
  if (/detect|fail|positive/.test(result) || !fen.pass) return 'detected';
  return '';
}

function findPanel(panels: PanelResult[], ...keywords: string[]): PanelResult | undefined {
  const lowered = keywords.map(k => k.toLowerCase());
  return panels.find(p => {
    const name = p.panel_name.toLowerCase();
    return lowered.some(k => name.includes(k));
  });
}

function parseSterilityMethod(raw: unknown, panel?: PanelResult): SterilityMethod {
  if (raw === 'pcr' || raw === 'culture_14_day') return raw;
  const blob = `${panel?.specification ?? ''} ${panel?.result ?? ''}`.toLowerCase();
  if (/14[- ]?day|culture|usp\s*<.?71/.test(blob)) return 'culture_14_day';
  return 'pcr';
}

function parseEndotoxinValue(raw: string): string {
  const m = raw.replace(/eu\/m[lg]/gi, '').replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? m[0] : raw.trim();
}

export function fentanylDetectionLabel(mark: FentanylDetectionMark): string {
  if (mark === 'none_detected') return 'Not Detected';
  if (mark === 'detected') return 'Detected';
  return '';
}

export function readCoaPdfStats(coa: COA): CoaPdfStats {
  const summary = (coa.result_summary ?? {}) as Record<string, unknown>;
  const panels = Array.isArray(coa.panel_results) ? coa.panel_results : [];
  const sterilityPanel = findPanel(panels, 'steril');
  const endotoxinPanel = findPanel(panels, 'endotoxin', 'lal');
  const mwPanel = findPanel(panels, 'molecular weight', 'molecular');

  const fromAssay = computeAssayAveragesFromPanels(panels, coa.purity_percent);
  const content =
    (typeof summary.avg_net_peptide_content === 'string' && summary.avg_net_peptide_content.trim())
    || fromAssay.avg_net_peptide_content
    || '';
  const mean =
    (typeof summary.mean_of_vials_tested === 'string' && summary.mean_of_vials_tested.trim())
    || (typeof summary.vial_count === 'number' && String(summary.vial_count))
    || (typeof summary.vials_tested === 'string' && summary.vials_tested.trim())
    || fromAssay.mean_of_vials_tested
    || '';
  const purity =
    (typeof summary.avg_purity === 'string' && summary.avg_purity.trim())
    || fromAssay.avg_purity
    || (coa.purity_percent != null ? `${coa.purity_percent}%` : '');

  const fenRaw = typeof summary.fentanyl_detection === 'string' ? summary.fentanyl_detection : '';
  const fentanyl_detection: FentanylDetectionMark =
    fenRaw === 'none_detected' || fenRaw === 'detected'
      ? fenRaw
      : deriveFentanylFromPanels(coa);

  const mwFromSummary =
    typeof summary.molecular_weight === 'string'
      ? summary.molecular_weight
      : typeof summary.molecular_weight === 'number'
        ? String(summary.molecular_weight)
        : '';
  const mwFromCoa = coa.molecular_weight != null ? String(coa.molecular_weight) : '';
  const molecular_weight =
    mwFromSummary ||
    (mwPanel?.result ?? '').replace(/\s*da\s*$/i, '').trim() ||
    mwFromCoa;

  const includeFromSummary =
    typeof summary.include_molecular_weight === 'boolean'
      ? summary.include_molecular_weight
      : undefined;
  const include_molecular_weight =
    includeFromSummary ?? (!!mwPanel || (coa.molecular_weight != null && !!molecular_weight));

  const sterility_method = parseSterilityMethod(summary.sterility_method, sterilityPanel);
  const sterility_pass =
    typeof summary.sterility_pass === 'boolean'
      ? summary.sterility_pass
      : sterilityPanel
        ? !!sterilityPanel.pass
        : true;

  const endotoxinFromSummary =
    typeof summary.endotoxin_eu_ml === 'string' ? summary.endotoxin_eu_ml : '';
  const endotoxin_eu_ml =
    endotoxinFromSummary ||
    parseEndotoxinValue(endotoxinPanel?.result ?? '');

  const endotoxin_pass =
    typeof summary.endotoxin_pass === 'boolean'
      ? summary.endotoxin_pass
      : endotoxinPanel
        ? !!endotoxinPanel.pass
        : true;

  return {
    avg_net_peptide_content: content,
    mean_of_vials_tested: mean,
    avg_purity: purity,
    fentanyl_detection,
    include_molecular_weight,
    molecular_weight,
    sterility_method,
    sterility_pass,
    endotoxin_eu_ml,
    endotoxin_pass,
  };
}

/** Prefer dedicated columns; fall back to result_summary until migration is applied. */
export function hydrateCoaImages(coa: COA): COA {
  const summary = (coa.result_summary ?? {}) as Record<string, unknown>;
  const vialFromSummary = typeof summary.vial_image === 'string' ? summary.vial_image : '';
  const chromFromSummary = typeof summary.chromatogram_image === 'string' ? summary.chromatogram_image : '';
  const hplcFromSummary = typeof summary.hplc_image === 'string' ? summary.hplc_image : '';
  const logoFromSummary = typeof summary.company_logo === 'string' ? summary.company_logo : '';
  return {
    ...coa,
    vial_image: coa.vial_image || vialFromSummary || '',
    chromatogram_image: coa.chromatogram_image || chromFromSummary || '',
    hplc_image: coa.hplc_image || hplcFromSummary || '',
    company_logo: coa.company_logo || logoFromSummary || '',
  };
}

/** Normalize any image src (data URL, http(s), or site path) into a JPEG data URL for storage. */
export async function resolveImageAsDataUrl(src: string): Promise<string> {
  const value = (src || '').trim();
  if (!value) return '';

  // Already a compact data URL — only re-encode when over the size cap.
  if (/^data:image\/(png|jpeg|jpg);base64,/i.test(value)) {
    return compressImageDataUrl(value);
  }

  try {
    let blob: Blob;
    if (value.startsWith('data:image/')) {
      const res = await fetch(value);
      blob = await res.blob();
    } else {
      const url = value.startsWith('/') ? `${window.location.origin}${value}` : value;
      const res = await fetch(url);
      if (!res.ok) return '';
      blob = await res.blob();
    }
    // Scale while decoding — never build a full-resolution PNG data URL first
    // (that freezes Issue COA on large logos / chromatographs).
    const bitmap = await createImageBitmap(blob);
    const maxEdge = 900;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return '';
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const draft = canvas.toDataURL('image/jpeg', 0.85);
    return compressImageDataUrl(draft);
  } catch {
    return '';
  }
}

/**
 * Crop near-white / empty margins so a vial photo shows just the vial
 * (Vanguard-style product shot), with a small padding margin.
 */
export async function trimImageWhitespace(
  src: string,
  opts?: { threshold?: number; padRatio?: number },
): Promise<string> {
  const dataUrl = await resolveImageAsDataUrl(src);
  if (!dataUrl) return '';

  const threshold = opts?.threshold ?? 242;
  const padRatio = opts?.padRatio ?? 0.06;

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('image load failed'));
      el.src = dataUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    if (canvas.width < 8 || canvas.height < 8) return dataUrl;

    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const a = data[i + 3];
        if (a < 12) continue;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (r >= threshold && g >= threshold && b >= threshold) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }

    if (maxX <= minX || maxY <= minY) return dataUrl;

    const pad = Math.round(Math.max(width, height) * padRatio);
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width - 1, maxX + pad);
    maxY = Math.min(height - 1, maxY + pad);

    const tw = maxX - minX + 1;
    const th = maxY - minY + 1;
    // If trim barely changes anything, keep original.
    if (tw * th > width * height * 0.92) return dataUrl;

    const out = document.createElement('canvas');
    out.width = tw;
    out.height = th;
    const outCtx = out.getContext('2d');
    if (!outCtx) return dataUrl;
    outCtx.fillStyle = '#ffffff';
    outCtx.fillRect(0, 0, tw, th);
    outCtx.drawImage(canvas, minX, minY, tw, th, 0, 0, tw, th);
    return out.toDataURL('image/png');
  } catch {
    return dataUrl;
  }
}

export function isMissingCoaImageColumnError(message: string): boolean {
  return /vial_image|chromatogram_image|hplc_image|schema cache/i.test(message);
}

/** Strip image columns and stash them on result_summary for legacy schemas. */
export function payloadWithoutImageColumns(payload: Record<string, unknown>): Record<string, unknown> {
  const vial_image = typeof payload.vial_image === 'string' ? payload.vial_image : '';
  const chromatogram_image = typeof payload.chromatogram_image === 'string' ? payload.chromatogram_image : '';
  const hplc_image = typeof payload.hplc_image === 'string' ? payload.hplc_image : '';
  const { vial_image: _v, chromatogram_image: _c, hplc_image: _h, result_summary, ...rest } = payload;
  const summary =
    result_summary && typeof result_summary === 'object' && !Array.isArray(result_summary)
      ? (result_summary as Record<string, unknown>)
      : {};
  return {
    ...rest,
    result_summary: {
      ...summary,
      vial_image,
      chromatogram_image,
      hplc_image,
    },
  };
}

export type CoaPdfPrepPayload = {
  vial_image: string;
  chromatogram_image: string;
  /** Unique HPLC / chromatograph photo for this run. */
  hplc_image?: string;
  /** Brand logo for HPLC watermark; snapshotted onto coa.company_logo. */
  company_logo?: string;
  avg_net_peptide_content: string;
  mean_of_vials_tested: string;
  avg_purity?: string;
  fentanyl_detection: FentanylDetectionMark;
  include_molecular_weight: boolean;
  molecular_weight: string;
  sterility_method: SterilityMethod;
  sterility_pass: boolean;
  endotoxin_eu_ml: string;
  endotoxin_pass: boolean;
};

function upsertNamedPanel(
  panels: PanelResult[],
  match: (name: string) => boolean,
  next: PanelResult | null,
): PanelResult[] {
  const idx = panels.findIndex(p => match(p.panel_name.toLowerCase()));
  if (!next) {
    if (idx < 0) return panels;
    return panels.filter((_, i) => i !== idx);
  }
  if (idx < 0) return [...panels, next];
  const copy = [...panels];
  copy[idx] = next;
  return copy;
}

/** Sync panel_results + molecular_weight from prep controls. */
export function applyPrepToCoaPanels(coa: COA, prep: CoaPdfPrepPayload): {
  panel_results: PanelResult[];
  molecular_weight: number | null;
} {
  let panels = Array.isArray(coa.panel_results) ? [...coa.panel_results] : [];

  panels = upsertNamedPanel(
    panels,
    name => name.includes('steril'),
    {
      panel_name: 'Sterility',
      specification: 'Not Detected',
      result: prep.sterility_pass
        ? `Not Detected (${STERILITY_METHOD_LABELS[prep.sterility_method]})`
        : `Detected (${STERILITY_METHOD_LABELS[prep.sterility_method]})`,
      pass: prep.sterility_pass,
    },
  );

  panels = upsertNamedPanel(
    panels,
    name => name.includes('endotoxin') || name.includes('lal'),
    {
      panel_name: 'Endotoxin',
      specification: ENDOTOXIN_SPEC_EU_ML,
      result: formatEndotoxinResult(prep.endotoxin_eu_ml),
      pass: prep.endotoxin_pass,
    },
  );

  const mwTrim = prep.molecular_weight.trim();
  const mwNum = parseFloat(mwTrim);
  const includeMw = prep.include_molecular_weight && mwTrim.length > 0 && Number.isFinite(mwNum);

  panels = upsertNamedPanel(
    panels,
    name => name.includes('molecular'),
    includeMw
      ? {
          panel_name: 'Molecular Weight (Da)',
          specification: '+/- 2 Da',
          result: mwTrim,
          pass: true,
        }
      : null,
  );

  panels = upsertNamedPanel(
    panels,
    name => name.includes('fentanyl'),
    prep.fentanyl_detection === 'none_detected' || prep.fentanyl_detection === 'detected'
      ? {
          panel_name: 'Fentanyl Detection',
          specification: 'Not Detected',
          result: prep.fentanyl_detection === 'none_detected' ? 'Not Detected' : 'Detected',
          pass: prep.fentanyl_detection === 'none_detected',
        }
      : null,
  );

  return {
    panel_results: panels,
    molecular_weight: includeMw ? mwNum : null,
  };
}

/** Persist PDF images + Average Net Peptide Content stats for generation. */
export async function saveCoaPdfPrep(
  coa: COA,
  prep: CoaPdfPrepPayload,
): Promise<{ coa: COA; error: string | null }> {
  const hydrated = hydrateCoaImages(coa);
  const { panel_results, molecular_weight } = applyPrepToCoaPanels(coa, prep);
  // Keep snapshotted header logo / watermark from issue time unless prep replaces HPLC photo.
  // Trim empty studio margins so the vial fills the certificate frame, then compress.
  const trimmedVial = prep.vial_image
    ? (await trimImageWhitespace(prep.vial_image, { padRatio: 0.04 })) || prep.vial_image
    : '';
  const nextHplc = prep.hplc_image !== undefined ? prep.hplc_image : (hydrated.hplc_image || '');
  const [vialImage, companyLogo, watermark, hplcImage] = await Promise.all([
    compressImageDataUrl(trimmedVial),
    compressImageDataUrl(hydrated.company_logo || ''),
    compressImageDataUrl(hydrated.chromatogram_image || ''),
    compressImageDataUrl(nextHplc || ''),
  ]);

  const baseSummary = {
    ...((coa.result_summary && typeof coa.result_summary === 'object' ? coa.result_summary : {}) as Record<string, unknown>),
    avg_net_peptide_content: prep.avg_net_peptide_content.trim(),
    mean_of_vials_tested: prep.mean_of_vials_tested.trim(),
    avg_purity: (prep.avg_purity ?? '').trim(),
    vials_tested: prep.mean_of_vials_tested.trim(),
    fentanyl_detection: prep.fentanyl_detection || '',
    include_molecular_weight: prep.include_molecular_weight,
    molecular_weight: prep.include_molecular_weight ? prep.molecular_weight.trim() : '',
    sterility_method: prep.sterility_method,
    sterility_pass: prep.sterility_pass,
    endotoxin_eu_ml: prep.endotoxin_eu_ml.trim(),
    endotoxin_pass: prep.endotoxin_pass,
    sterility_method_label: STERILITY_METHOD_LABELS[prep.sterility_method],
    sterility_specification: 'Not Detected',
  };
  // Never embed base64 images in result_summary — that freezes COA pages (multi‑MB JSON).
  delete baseSummary.vial_image;
  delete baseSummary.chromatogram_image;
  delete baseSummary.hplc_image;
  delete baseSummary.company_logo;

  const next: COA = {
    ...hydrated,
    vial_image: vialImage,
    chromatogram_image: watermark,
    hplc_image: hplcImage,
    company_logo: companyLogo || hydrated.company_logo || '',
    result_summary: baseSummary,
    panel_results,
    molecular_weight,
  };

  const direct = {
    vial_image: vialImage || '',
    chromatogram_image: watermark,
    hplc_image: hplcImage || '',
    company_logo: companyLogo || hydrated.company_logo || '',
    result_summary: baseSummary,
    panel_results,
    molecular_weight,
  };

  const { error } = await supabase.from('coas').update(direct).eq('id', coa.id);
  if (!error) return { coa: next, error: null };

  if (!isMissingCoaImageColumnError(error.message)) {
    return { coa: hydrated, error: error.message };
  }

  // Prefer keeping vial/watermark columns when only `hplc_image` is missing.
  if (/hplc_image/i.test(error.message || '')) {
    const { hplc_image: _h, ...restDirect } = direct;
    const summaryWithHplc = {
      ...baseSummary,
      ...(hplcImage ? { hplc_image: hplcImage } : {}),
    };
    const retry = await supabase
      .from('coas')
      .update({ ...restDirect, result_summary: summaryWithHplc })
      .eq('id', coa.id);
    if (!retry.error) {
      return {
        coa: { ...next, hplc_image: hplcImage, result_summary: summaryWithHplc },
        error: null,
      };
    }
    if (!isMissingCoaImageColumnError(retry.error.message)) {
      return { coa: hydrated, error: retry.error.message };
    }
  }

  const fallbackPayload = payloadWithoutImageColumns({
    ...direct,
    result_summary: baseSummary,
  });
  const fallback = await supabase.from('coas').update(fallbackPayload).eq('id', coa.id);
  if (fallback.error) return { coa: hydrated, error: fallback.error.message };

  return { coa: next, error: null };
}

/** @deprecated use saveCoaPdfPrep */
export async function saveCoaPdfImages(
  coa: COA,
  images: { vial_image: string; chromatogram_image: string },
): Promise<{ coa: COA; error: string | null }> {
  const stats = readCoaPdfStats(coa);
  return saveCoaPdfPrep(coa, {
    ...images,
    avg_net_peptide_content: stats.avg_net_peptide_content,
    mean_of_vials_tested: stats.mean_of_vials_tested,
    avg_purity: stats.avg_purity,
    fentanyl_detection: stats.fentanyl_detection,
    include_molecular_weight: stats.include_molecular_weight,
    molecular_weight: stats.molecular_weight,
    sterility_method: stats.sterility_method,
    sterility_pass: stats.sterility_pass,
    endotoxin_eu_ml: stats.endotoxin_eu_ml,
    endotoxin_pass: stats.endotoxin_pass,
  });
}

/** Header logo snapshotted on the COA (left of company name). Returns a displayable src (no canvas convert). */
export async function resolveCoaHeaderLogo(coa: COA): Promise<string> {
  const hydrated = hydrateCoaImages(coa);
  const summary = (hydrated.result_summary && typeof hydrated.result_summary === 'object'
    ? hydrated.result_summary
    : {}) as Record<string, unknown>;
  // When the chemist opted out, only show a snapshotted column/summary logo.
  const applyLogo = summary.apply_company_logo !== false;
  const candidates: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) candidates.push(value.trim());
  };

  push(hydrated.company_logo);
  push(summary.company_logo);

  if (applyLogo) {
    const companyName = (hydrated.company_name || '').trim().toLowerCase();
    const { data: companies } = await supabase
      .from('companies')
      .select('name, logo, is_default')
      .eq('user_id', hydrated.user_id);

    if (Array.isArray(companies)) {
      const named = companyName
        ? companies.find(c => (c.name || '').trim().toLowerCase() === companyName && c.logo)
        : undefined;
      const partial = companyName
        ? companies.find(c => {
            const n = (c.name || '').trim().toLowerCase();
            return !!c.logo && (n.includes(companyName) || companyName.includes(n));
          })
        : undefined;
      const def = companies.find(c => c.is_default && c.logo);
      const any = companies.find(c => c.logo);
      push(named?.logo);
      push(partial?.logo);
      push(def?.logo);
      push(any?.logo);
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('company_logo')
      .eq('id', hydrated.user_id)
      .maybeSingle();
    push(profile?.company_logo);
  }

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    // Prefer the original src for web display — converting large logos to PNG data URLs
    // freezes / crashes the tab. PDF download now uses print of this page.
    if (
      candidate.startsWith('data:image/')
      || candidate.startsWith('http://')
      || candidate.startsWith('https://')
      || candidate.startsWith('blob:')
      || candidate.startsWith('/')
    ) {
      return candidate;
    }
  }
  // Last resort: unknown but non-empty src (e.g. storage key that <img> can still load).
  return candidates[0] || '';
}

/**
 * HPLC watermark from the client's COA profile (`chromatograph_background`),
 * snapshotted onto the COA as `chromatogram_image` when the chemist applies it.
 */
export async function resolveCoaWatermark(coa: COA): Promise<string> {
  const hydrated = hydrateCoaImages(coa);
  const candidates: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) candidates.push(value.trim());
  };

  // Snapshotted watermark (chemist applied at issue time).
  push(hydrated.chromatogram_image);

  const companyName = (hydrated.company_name || '').trim().toLowerCase();
  const { data: companies } = await supabase
    .from('companies')
    .select('name, chromatograph_background, is_default')
    .eq('user_id', hydrated.user_id);

  if (Array.isArray(companies)) {
    const named = companyName
      ? companies.find(c => (c.name || '').trim().toLowerCase() === companyName && c.chromatograph_background)
      : undefined;
    const def = companies.find(c => c.is_default && c.chromatograph_background);
    const any = companies.find(c => c.chromatograph_background);
    push(named?.chromatograph_background);
    push(def?.chromatograph_background);
    push(any?.chromatograph_background);
  }

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    if (candidate.startsWith('data:image/') || candidate.startsWith('http') || candidate.startsWith('/')) {
      return candidate;
    }
  }
  return '';
}

/** @deprecated use resolveCoaWatermark */
export async function resolveCoaLogoWatermark(coa: COA): Promise<string> {
  return resolveCoaWatermark(coa);
}

export { sterilitySpecLabel };
