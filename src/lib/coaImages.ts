import { supabase } from './supabase';
import { COA, PanelResult } from './types';
import {
  ENDOTOXIN_SPEC_EU_ML,
  SterilityMethod,
  STERILITY_METHOD_LABELS,
  sterilitySpecLabel,
} from './labCoaForm';

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
  if (mark === 'none_detected') return 'None Detected';
  if (mark === 'detected') return 'Detected';
  return '';
}

export function readCoaPdfStats(coa: COA): CoaPdfStats {
  const summary = (coa.result_summary ?? {}) as Record<string, unknown>;
  const panels = Array.isArray(coa.panel_results) ? coa.panel_results : [];
  const sterilityPanel = findPanel(panels, 'steril');
  const endotoxinPanel = findPanel(panels, 'endotoxin', 'lal');
  const mwPanel = findPanel(panels, 'molecular weight', 'molecular');

  const content =
    (typeof summary.avg_net_peptide_content === 'string' && summary.avg_net_peptide_content) ||
    '';
  const mean =
    (typeof summary.mean_of_vials_tested === 'string' && summary.mean_of_vials_tested) ||
    (typeof summary.vial_count === 'number' && String(summary.vial_count)) ||
    (typeof summary.vials_tested === 'string' && summary.vials_tested) ||
    '';
  const purity =
    (typeof summary.avg_purity === 'string' && summary.avg_purity) ||
    (coa.purity_percent != null ? `${coa.purity_percent}%` : '');

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
  const logoFromSummary = typeof summary.company_logo === 'string' ? summary.company_logo : '';
  return {
    ...coa,
    vial_image: coa.vial_image || vialFromSummary || '',
    chromatogram_image: coa.chromatogram_image || chromFromSummary || '',
    company_logo: coa.company_logo || logoFromSummary || '',
  };
}

/** Normalize any image src (data URL, http(s), or site path) into a PNG/JPEG data URL for PDF embed. */
export async function resolveImageAsDataUrl(src: string): Promise<string> {
  const value = (src || '').trim();
  if (!value) return '';

  if (/^data:image\/(png|jpeg|jpg);base64,/i.test(value)) return value;

  if (value.startsWith('data:image/')) {
    try {
      const res = await fetch(value);
      const blob = await res.blob();
      return await blobToPngDataUrl(blob);
    } catch {
      return '';
    }
  }

  try {
    const url = value.startsWith('/') ? `${window.location.origin}${value}` : value;
    const res = await fetch(url);
    if (!res.ok) return '';
    const blob = await res.blob();
    if (/^image\/(png|jpeg|jpg)$/i.test(blob.type)) {
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(blob);
      });
    }
    return await blobToPngDataUrl(blob);
  } catch {
    return '';
  }
}

async function blobToPngDataUrl(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.toDataURL('image/png');
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
  return /vial_image|chromatogram_image|schema cache/i.test(message);
}

/** Strip image columns and stash them on result_summary for legacy schemas. */
export function payloadWithoutImageColumns(payload: Record<string, unknown>): Record<string, unknown> {
  const vial_image = typeof payload.vial_image === 'string' ? payload.vial_image : '';
  const chromatogram_image = typeof payload.chromatogram_image === 'string' ? payload.chromatogram_image : '';
  const { vial_image: _v, chromatogram_image: _c, result_summary, ...rest } = payload;
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
    },
  };
}

export type CoaPdfPrepPayload = {
  vial_image: string;
  chromatogram_image: string;
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

  const endoVal = prep.endotoxin_eu_ml.trim();
  panels = upsertNamedPanel(
    panels,
    name => name.includes('endotoxin') || name.includes('lal'),
    {
      panel_name: 'Endotoxin',
      specification: ENDOTOXIN_SPEC_EU_ML,
      result: endoVal ? `${endoVal} EU/mL` : '',
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
          specification: 'None Detected',
          result: prep.fentanyl_detection === 'none_detected' ? 'None Detected' : 'Detected',
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
  const companyLogo = await resolveCoaLogoWatermark({ ...hydrated, vial_image: prep.vial_image });

  const baseSummary = {
    ...((coa.result_summary && typeof coa.result_summary === 'object' ? coa.result_summary : {}) as Record<string, unknown>),
    vial_image: prep.vial_image || '',
    chromatogram_image: prep.chromatogram_image || '',
    company_logo: companyLogo || hydrated.company_logo || '',
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

  const next: COA = {
    ...hydrated,
    vial_image: prep.vial_image,
    chromatogram_image: prep.chromatogram_image,
    company_logo: companyLogo || hydrated.company_logo || '',
    result_summary: baseSummary,
    panel_results,
    molecular_weight,
  };

  const direct = {
    vial_image: prep.vial_image || '',
    chromatogram_image: prep.chromatogram_image || '',
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

  const fallback = await supabase
    .from('coas')
    .update({
      result_summary: baseSummary,
      panel_results,
      molecular_weight,
    })
    .eq('id', coa.id);
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

/** Company / profile logo used as chromatogram watermark on the PDF / web COA. */
export async function resolveCoaLogoWatermark(coa: COA): Promise<string> {
  const candidates: string[] = [];
  if (coa.company_logo) candidates.push(coa.company_logo);

  const { data: company } = await supabase
    .from('companies')
    .select('logo')
    .eq('user_id', coa.user_id)
    .eq('is_default', true)
    .maybeSingle();

  if (typeof company?.logo === 'string' && company.logo) candidates.push(company.logo);

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('company_logo')
    .eq('id', coa.user_id)
    .maybeSingle();

  if (typeof profile?.company_logo === 'string' && profile.company_logo) {
    candidates.push(profile.company_logo);
  }

  for (const candidate of candidates) {
    const dataUrl = await resolveImageAsDataUrl(candidate);
    if (dataUrl) return dataUrl;
  }

  return '';
}

export { sterilitySpecLabel };
