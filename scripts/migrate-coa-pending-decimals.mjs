/**
 * Migrate existing COAs to the new pending + decimal format.
 *
 * - Sterility / endotoxin / heavy metals left empty or pass:false → Pending (pass:null)
 * - Numeric mg / % results get at least one decimal (10 → 10.0)
 * - Averages in result_summary normalized the same way
 * - content_hash recomputed when panels change
 *
 * Run: node scripts/migrate-coa-pending-decimals.mjs
 * Dry run: node scripts/migrate-coa-pending-decimals.mjs --dry-run
 */
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');

function loadEnv() {
  try {
    const raw = readFileSync(resolve(root, '.env'), 'utf8');
    return Object.fromEntries(
      raw
        .split('\n')
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => {
          const i = line.indexOf('=');
          return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
        }),
    );
  } catch {
    return {};
  }
}

const HEAVY_METAL_MATCH = /lead|arsenic|cadmium|mercury|chromium|\(pb\)|\(as\)|\(cd\)|\(hg\)|\(cr\)/i;

function isDeferredAssay(name) {
  const n = String(name || '').toLowerCase();
  return n.includes('sterility')
    || n.includes('endotoxin')
    || n.includes('lal')
    || HEAVY_METAL_MATCH.test(n);
}

function formatCoaDecimal(raw) {
  if (raw === '' || raw == null) return '';
  const n = typeof raw === 'number'
    ? raw
    : Number(String(raw).trim().replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)?.[0] ?? NaN);
  if (!Number.isFinite(n)) return '';
  return (Math.round(n * 10) / 10).toFixed(1);
}

function formatResultTokens(raw) {
  if (!raw?.trim()) return raw || '';
  return String(raw)
    .split(/\s*,\s*/)
    .map((part) => {
      const t = part.trim();
      const mg = t.match(/^(-?\d+(?:\.\d+)?)\s*mg$/i);
      if (mg) {
        const d = formatCoaDecimal(mg[1]);
        return d ? `${d} mg` : t;
      }
      const pct = t.match(/^(-?\d+(?:\.\d+)?)\s*%$/);
      if (pct) {
        const d = formatCoaDecimal(pct[1]);
        return d ? `${d}%` : t;
      }
      // Bare number in content/purity-ish cells (no unit)
      const bare = t.match(/^(-?\d+(?:\.\d+)?)$/);
      if (bare) {
        const d = formatCoaDecimal(bare[1]);
        return d || t;
      }
      return t;
    })
    .join(', ');
}

function migratePanel(panel) {
  const name = String(panel?.panel_name || '');
  let result = String(panel?.result ?? panel?.value ?? '');
  let pass = panel?.pass;
  let changed = false;

  const trimmed = result.trim();
  const deferred = isDeferredAssay(name);

  // Legacy pending: empty / "Pending" with pass false or missing → explicit Pending
  if (deferred && (pass === false || pass == null) && (!trimmed || /^pending$/i.test(trimmed))) {
    if (result !== 'Pending' || pass !== null) {
      result = 'Pending';
      pass = null;
      changed = true;
    }
  } else if (trimmed && !/^pending$/i.test(trimmed) && !deferred) {
    const next = formatResultTokens(trimmed);
    if (next !== trimmed) {
      result = next;
      changed = true;
    }
  } else if (trimmed && !/^pending$/i.test(trimmed)) {
    // Deferred with a real value — still normalize decimals if any mg/% sneaks in
    const next = formatResultTokens(trimmed);
    if (next !== trimmed) {
      result = next;
      changed = true;
    }
  }

  // Net content / purity / blend content / identity quantity-style rows
  if (!deferred && /content|purity|peptide|quantit|blend content/i.test(name) && trimmed && !/^pending$/i.test(trimmed)) {
    const next = formatResultTokens(trimmed);
    if (next !== result.trim()) {
      result = next;
      changed = true;
    }
  }

  if (!changed && result === (panel?.result ?? '') && pass === panel?.pass) {
    return { panel, changed: false };
  }

  const nextPanel = { ...panel, result, pass };
  if ('value' in nextPanel && typeof nextPanel.value === 'string' && nextPanel.value.trim()) {
    nextPanel.value = formatResultTokens(nextPanel.value);
  }
  return { panel: nextPanel, changed: true };
}

function migrateSummary(summary, panels) {
  if (!summary || typeof summary !== 'object') {
    summary = {};
  }
  const next = { ...summary };
  let changed = false;

  for (const key of ['avg_net_peptide_content', 'avg_purity']) {
    if (typeof next[key] === 'string' && next[key].trim()) {
      const formatted = formatResultTokens(next[key].trim());
      if (formatted !== next[key]) {
        next[key] = formatted;
        changed = true;
      }
    }
  }

  const sterility = panels.find((p) => /sterility/i.test(p.panel_name || ''));
  const endotoxin = panels.find((p) => /endotoxin|lal/i.test(p.panel_name || ''));
  const metals = panels.filter((p) => HEAVY_METAL_MATCH.test(p.panel_name || ''));

  if (sterility && sterility.pass === null && next.sterility_pass !== null) {
    next.sterility_pass = null;
    changed = true;
  }
  if (endotoxin && endotoxin.pass === null && next.endotoxin_pass !== null) {
    next.endotoxin_pass = null;
    changed = true;
  }
  if (metals.length > 0 && metals.every((p) => p.pass === null) && next.heavy_metals_pass !== null) {
    next.heavy_metals_pass = null;
    changed = true;
  }

  return { summary: next, changed };
}

/** Same payload shape Lab uses for content_hash (utils.hashContent is a simple string hash). */
function hashContent(content) {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0').toUpperCase();
}

function computeCoaContentHash(coa) {
  const panels = Array.isArray(coa.panel_results) ? coa.panel_results : [];
  const clean = panels
    .filter((p) => p.panel_name?.trim())
    .map((p) => ({
      panel_name: p.panel_name.trim(),
      result: (p.result ?? '').trim(),
      pass: p.pass,
    }));
  const payload = `${coa.sample_name}|${coa.batch_number}|${coa.purity_percent ?? ''}|${JSON.stringify(clean)}`;
  return `sha256:${hashContent(payload).toLowerCase()}`;
}

function migrateCoa(coa) {
  const panels = Array.isArray(coa.panel_results) ? coa.panel_results : [];
  let panelsChanged = false;
  const nextPanels = panels.map((p) => {
    const { panel, changed } = migratePanel(p);
    if (changed) panelsChanged = true;
    return panel;
  });

  const { summary, changed: summaryChanged } = migrateSummary(coa.result_summary, nextPanels);
  if (!panelsChanged && !summaryChanged) {
    return { coa, changed: false };
  }

  const next = {
    ...coa,
    panel_results: nextPanels,
    result_summary: summary,
  };
  if (coa.content_hash) {
    next.content_hash = computeCoaContentHash(next);
  }
  return { coa: next, changed: true };
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL and a Supabase key in .env');
  process.exit(1);
}

if (!env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('Warning: SUPABASE_SERVICE_ROLE_KEY not set — anon key may fail RLS updates.');
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const pageSize = 200;
let offset = 0;
let scanned = 0;
let updated = 0;
let failed = 0;

console.log(dryRun ? 'Dry run — no writes.' : 'Migrating COAs…');

while (true) {
  const { data, error } = await supabase
    .from('coas')
    .select('id, slug, sample_name, batch_number, purity_percent, panel_results, result_summary, content_hash')
    .order('created_at', { ascending: true })
    .range(offset, offset + pageSize - 1);

  if (error) {
    console.error('Fetch failed:', error.message);
    process.exit(1);
  }

  if (!data?.length) break;

  for (const row of data) {
    scanned += 1;
    const { coa, changed } = migrateCoa(row);
    if (!changed) continue;

    if (dryRun) {
      updated += 1;
      console.log(`[dry-run] ${row.slug || row.id}`);
      continue;
    }

    const { error: upErr } = await supabase
      .from('coas')
      .update({
        panel_results: coa.panel_results,
        result_summary: coa.result_summary,
        content_hash: coa.content_hash ?? row.content_hash,
      })
      .eq('id', row.id);

    if (upErr) {
      failed += 1;
      console.error(`Failed ${row.slug || row.id}:`, upErr.message);
    } else {
      updated += 1;
      console.log(`Updated ${row.slug || row.id}`);
    }
  }

  if (data.length < pageSize) break;
  offset += pageSize;
}

console.log(`Done. scanned=${scanned} updated=${updated} failed=${failed}${dryRun ? ' (dry-run)' : ''}`);
if (failed) process.exit(2);
