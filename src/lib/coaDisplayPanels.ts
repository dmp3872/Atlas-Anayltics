import { PanelResult } from './types';

function normalizeContent(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  // "20.5mg" / "20 mg" / "20.5" / "20" → "20.5 mg" / "20.0 mg"
  const m = t.match(/^(-?\d+(?:\.\d+)?)\s*(mg)?$/i);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) return `${(Math.round(n * 10) / 10).toFixed(1)} mg`;
  }
  return t.replace(/(\d)\s*mg\b/i, '$1 mg');
}

function normalizePurity(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  const m = t.match(/^(-?\d+(?:\.\d+)?)\s*%?$/);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) return `${(Math.round(n * 10) / 10).toFixed(1)}%`;
  }
  return t.endsWith('%') ? t : t;
}

/** Parse "20mg · 99.8%" / "20.5 mg · 99.9%" style conformity cells. */
export function parseConformityResult(result: string): { content: string; purity: string } {
  const raw = (result || '').trim();
  if (!raw) return { content: '', purity: '' };

  const parts = raw.split(/\s*[·•|/]\s*|\s+and\s+/i).map(p => p.trim()).filter(Boolean);
  let content = '';
  let purity = '';
  for (const part of parts) {
    if (/%/.test(part) || (/^\d+(\.\d+)?$/.test(part) && Number(part) <= 100 && !content)) {
      // Ambiguous bare number: treat as purity only if we already have content, else content.
      if (/%/.test(part)) purity = normalizePurity(part);
      else if (content) purity = normalizePurity(part);
      else content = normalizeContent(part);
    } else if (/mg/i.test(part) || /^\d+(\.\d+)?$/.test(part)) {
      content = normalizeContent(part);
    } else if (!content) {
      content = part;
    } else if (!purity) {
      purity = normalizePurity(part);
    }
  }

  // Single token with both pieces jammed together (rare)
  if (!content && !purity && raw) {
    const combo = raw.match(/(-?\d+(?:\.\d+)?)\s*mg.*?(-?\d+(?:\.\d+)?)\s*%?/i);
    if (combo) {
      content = normalizeContent(`${combo[1]} mg`);
      purity = normalizePurity(combo[2]);
    }
  }

  return { content, purity };
}

function isConformityPanel(name: string): boolean {
  return /^conformity\b/i.test(name.trim());
}

function isNetContentPanel(name: string): boolean {
  if (/^blend content\b/i.test(name.trim())) return false;
  const n = name.toLowerCase();
  return n.includes('net content') || n.includes('peptide content');
}

function isNetPurityPanel(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes('net purity')
    || n.includes('purity (hplc)')
    || n.includes('purity (lcms)')
    || n.includes('purity (lc-ms)')
    || n === 'purity'
    || n.includes('purity hplc');
}

/**
 * Fold multi-vial Conformity rows into Net Content / Net Purity result cells
 * (e.g. "20.5 mg, 20 mg, 20.5 mg" and "99.8%, 99.8%, 99.9%") and drop the extra lines.
 */
export function collapseConformityPanels(panels: PanelResult[]): PanelResult[] {
  if (!Array.isArray(panels) || panels.length === 0) return panels;

  const conformity = panels.filter(p => isConformityPanel(p.panel_name));
  if (conformity.length === 0) return panels;

  const base = panels.filter(p => !isConformityPanel(p.panel_name));
  const netIdx = base.findIndex(p => isNetContentPanel(p.panel_name));
  const purityIdx = base.findIndex(p => isNetPurityPanel(p.panel_name));

  const contents: string[] = [];
  const purities: string[] = [];

  if (netIdx >= 0 && base[netIdx].result?.trim()) {
    contents.push(normalizeContent(base[netIdx].result));
  }
  if (purityIdx >= 0 && base[purityIdx].result?.trim()) {
    purities.push(normalizePurity(base[purityIdx].result));
  }

  for (const row of conformity) {
    const parsed = parseConformityResult(row.result || '');
    if (parsed.content) contents.push(parsed.content);
    if (parsed.purity) purities.push(parsed.purity);
  }

  return base.map((panel, i) => {
    if (i === netIdx && contents.length > 0) {
      return { ...panel, result: contents.join(', '), pass: panel.pass && conformity.every(c => c.pass) };
    }
    if (i === purityIdx && purities.length > 0) {
      return { ...panel, result: purities.join(', '), pass: panel.pass && conformity.every(c => c.pass) };
    }
    return panel;
  });
}

const HEAVY_METAL_MATCH = /lead|arsenic|cadmium|mercury|chromium|\(pb\)|\(as\)|\(cd\)|\(hg\)|\(cr\)/i;

export const HEAVY_METAL_USP_LIMITS: { match: RegExp; name: string; limit: string }[] = [
  { match: /arsenic|\(as\)/i, name: 'Arsenic (As)', limit: 'NMT 1.5 ppm' },
  { match: /cadmium|\(cd\)/i, name: 'Cadmium (Cd)', limit: 'NMT 0.5 ppm' },
  { match: /chromium|\(cr\)/i, name: 'Chromium (Cr)', limit: 'NMT 10 ppm' },
  { match: /mercury|\(hg\)/i, name: 'Mercury (Hg)', limit: 'NMT 1.5 ppm' },
  { match: /lead|\(pb\)/i, name: 'Lead (Pb)', limit: 'NMT 1 ppm' },
];

export function isHeavyMetalPanel(name: string): boolean {
  return HEAVY_METAL_MATCH.test(name);
}

/** Assays that may legitimately sit in Pending until lab results return. */
export function isDeferredAssayPanel(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes('sterility')
    || n.includes('endotoxin')
    || n.includes('lal')
    || isHeavyMetalPanel(name);
}

/**
 * Resolve Pass / Fail / Pending for a panel row.
 * null = Pending. Empty / "Pending" results never count as Pass or Fail.
 */
export function resolvePanelPass(panel: PanelResult): boolean | null {
  if (panel.pass === null) return null;
  const result = (panel.result || '').trim();
  if (!result || /^pending\b/i.test(result)) return null;
  return panel.pass;
}

export type DigitalChipStatus = 'pending' | 'queued' | 'pass' | 'fail';

/** Per-assay chip statuses for the Atlas digital COA card. */
export type DigitalAssayChipStatuses = {
  identity?: DigitalChipStatus;
  purity?: DigitalChipStatus;
  quantity?: DigitalChipStatus;
  heavyMetals?: DigitalChipStatus;
  endotoxin?: DigitalChipStatus;
  sterility?: DigitalChipStatus;
  fentanyl?: DigitalChipStatus;
};

function chipFromPass(pass: boolean | null): DigitalChipStatus {
  if (pass === true) return 'pass';
  if (pass === false) return 'fail';
  return 'pending';
}

/** Derive digital-card chip statuses from COA panel rows (Pending stays Pending). */
export function assayChipStatusesFromPanels(
  panels: PanelResult[] | null | undefined,
): DigitalAssayChipStatuses {
  const list = Array.isArray(panels) ? panels : [];
  if (list.length === 0) return {};

  const find = (pred: (name: string) => boolean) => list.find(p => pred(p.panel_name));
  const statusOf = (panel: PanelResult | undefined): DigitalChipStatus | undefined => (
    panel ? chipFromPass(resolvePanelPass(panel)) : undefined
  );

  const metals = list.filter(p => isHeavyMetalPanel(p.panel_name));
  let heavyMetals: DigitalChipStatus | undefined;
  if (metals.length > 0) {
    const resolved = metals.map(resolvePanelPass);
    if (resolved.some(p => p === false)) heavyMetals = 'fail';
    else if (resolved.some(p => p === null)) heavyMetals = 'pending';
    else heavyMetals = 'pass';
  }

  return {
    identity: statusOf(find(n => /identity|identification/i.test(n))),
    purity: statusOf(find(isNetPurityPanel)),
    quantity: statusOf(find(isNetContentPanel)),
    heavyMetals,
    endotoxin: statusOf(find(n => /endotoxin|lal/i.test(n))),
    sterility: statusOf(find(n => /sterility/i.test(n))),
    fentanyl: statusOf(find(n => /fentanyl/i.test(n))),
  };
}

export function panelStatusLabel(pass: boolean | null): 'Pass' | 'Fail' | 'Pending' {
  if (pass === true) return 'Pass';
  if (pass === false) return 'Fail';
  return 'Pending';
}

export function panelStatusToneClass(pass: boolean | null): string {
  if (pass === true) return 'text-atlas-success';
  if (pass === false) return 'text-red-600';
  return 'text-neutral-500';
}

/** Ensure mg / % tokens on COA result strings include a decimal (10 mg → 10.0 mg).
 *  Max reportable purity (99.8%) is shown as "99.8% + 0.18%" in Results.
 */
export function formatCoaResultDisplay(raw: string): string {
  if (!raw?.trim()) return raw;
  return raw
    .split(/\s*,\s*/)
    .map(part => {
      const t = part.trim();
      const mg = t.match(/^(-?\d+(?:\.\d+)?)\s*mg$/i);
      if (mg) {
        const n = Number(mg[1]);
        if (Number.isFinite(n)) return `${(Math.round(n * 10) / 10).toFixed(1)} mg`;
      }
      // Purity with optional uncertainty already attached.
      const pctUnc = t.match(/^(-?\d+(?:\.\d+)?)\s*%\s*([+±]\s*0\.?18\s*%)$/i);
      if (pctUnc) {
        const n = Number(pctUnc[1]);
        if (Number.isFinite(n) && Math.round(n * 10) / 10 === 99.8) {
          return `${(Math.round(n * 10) / 10).toFixed(1)}% + 0.18%`;
        }
      }
      const pct = t.match(/^(-?\d+(?:\.\d+)?)\s*%$/);
      if (pct) {
        const n = Number(pct[1]);
        if (Number.isFinite(n)) {
          const rounded = Math.round(n * 10) / 10;
          const base = `${rounded.toFixed(1)}%`;
          if (rounded === 99.8) return `${base} + 0.18%`;
          return base;
        }
      }
      const bare = t.match(/^(-?\d+(?:\.\d+)?)$/);
      if (bare) {
        const n = Number(bare[1]);
        if (Number.isFinite(n)) {
          const rounded = Math.round(n * 10) / 10;
          // Bare purity-looking values (≤100) at ceiling get uncertainty only when
          // already in a purity context — leave bare numbers alone here.
          return rounded.toFixed(1);
        }
      }
      return t;
    })
    .join(', ');
}

/** Split main assay rows from heavy-metal rows for the two-table COA layout. */
export function partitionCoaPanels(panels: PanelResult[]): {
  main: PanelResult[];
  metals: PanelResult[];
} {
  const collapsed = collapseConformityPanels(panels);
  const main: PanelResult[] = [];
  const metals: PanelResult[] = [];
  for (const p of collapsed) {
    if (isHeavyMetalPanel(p.panel_name)) metals.push(p);
    else main.push(formatEndotoxinPanel(p));
  }

  // Only synthesize the full USP metal set when the COA already includes metal panels.
  // Revised Full QC (no heavy metals ordered) must not invent blank metal rows.
  if (metals.length === 0) {
    return { main, metals: [] };
  }

  const orderedMetals = HEAVY_METAL_USP_LIMITS.map(({ match, name, limit }) => {
    const found = metals.find(m => match.test(m.panel_name));
    const pass = found ? resolvePanelPass(found) : null;
    const rawResult = (found?.result ?? '').trim();
    const result = pass === null && (!rawResult || /^pending\b/i.test(rawResult))
      ? 'Pending'
      : (found?.result ?? '');
    return {
      panel_name: found?.panel_name || name,
      specification: found?.specification?.includes('NMT') ? found.specification : limit,
      result,
      unit: found?.unit,
      pass,
    } satisfies PanelResult;
  });

  return { main, metals: orderedMetals };
}

/** Ensure endotoxin results read like sterility: "0.25 EU/mL (LAL)". */
function formatEndotoxinPanel(panel: PanelResult): PanelResult {
  if (!/endotoxin|lal/i.test(panel.panel_name)) return panel;
  const raw = (panel.result || '').trim();
  if (!raw || /^pending\b/i.test(raw) || /\(\s*lal\s*\)/i.test(raw)) return panel;
  return { ...panel, result: `${raw} (LAL)` };
}

function splitResultList(raw: string): string[] {
  return (raw || '')
    .split(/\s*,\s*/)
    .map(part => part.trim())
    .filter(Boolean);
}

function parseNumericToken(raw: string): number | null {
  const m = raw.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function isIdentityPanel(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes('identity') || n.includes('identification');
}

/**
 * Extract per-vial purity / quantity / identity readings for the digital COA card.
 * Supports comma-separated Net Purity / Net Content cells produced by multi-vial testing.
 */
export function assayResultsFromPanels(
  panels: PanelResult[] | null | undefined,
  opts?: { vialCount?: number; quantityUnit?: string },
): {
  purity?: number[];
  quantity?: number[];
  identity?: boolean[];
  quantityUnit?: string;
} | null {
  if (!Array.isArray(panels) || panels.length === 0) return null;
  const collapsed = collapseConformityPanels(panels);
  const purityPanel = collapsed.find(p => isNetPurityPanel(p.panel_name));
  const quantityPanel = collapsed.find(p => isNetContentPanel(p.panel_name));
  const identityPanel = collapsed.find(p => isIdentityPanel(p.panel_name));

  const purity = splitResultList(purityPanel?.result || '')
    .map(parseNumericToken)
    .filter((n): n is number => n != null);
  const quantity = splitResultList(quantityPanel?.result || '')
    .map(parseNumericToken)
    .filter((n): n is number => n != null);

  let identity: boolean[] | undefined;
  if (identityPanel) {
    const tokens = splitResultList(identityPanel.result || '');
    if (tokens.length > 0) {
      identity = tokens.map(token => {
        const t = token.toLowerCase();
        if (/fail|negative|not\s*detected|absent/.test(t) && !/pass/.test(t)) return false;
        if (/pass|confirm|match|positive|detected|present/.test(t)) return true;
        return identityPanel.pass;
      });
    } else {
      identity = [identityPanel.pass];
    }
  }

  if (!purity.length && !quantity.length && !identity?.length) return null;

  const vialCount = Math.max(
    opts?.vialCount || 0,
    purity.length,
    quantity.length,
    identity?.length || 0,
    1,
  );

  const padBool = (values: boolean[] | undefined): boolean[] | undefined => {
    if (!values?.length) return undefined;
    return Array.from({ length: vialCount }, (_, i) => values[i] ?? values[values.length - 1]!);
  };
  const padNum = (values: number[]): number[] | undefined => {
    if (!values.length) return undefined;
    return Array.from({ length: vialCount }, (_, i) => values[i] ?? values[values.length - 1]!);
  };

  return {
    purity: padNum(purity),
    quantity: padNum(quantity),
    identity: padBool(identity),
    quantityUnit: opts?.quantityUnit || 'mg',
  };
}
