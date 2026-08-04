/**
 * Migrate LIMS IDs (accession_number / COA slug) to YYMM-XXXXXX.
 *
 * Converts:
 *   26-08-K7M4Q9  →  2608-K7M4Q9
 *   26-K7M4Q9     →  2608-K7M4Q9  (month from received_at / created_at / issued_at)
 * Already YYMM-XXXXXX is left alone.
 *
 * Each old code is mapped once, then applied to every sample/COA that uses it
 * (so sample + COA sharing an ID do not collide).
 *
 * Run:     node scripts/migrate-lims-id-yymm.mjs
 * Dry run: node scripts/migrate-lims-id-yymm.mjs --dry-run
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const dryRun = process.argv.includes('--dry-run');
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function loadEnv() {
  const env = { ...process.env };
  for (const file of ['.env', '.env.local']) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (env[m[1]] == null || env[m[1]] === '') env[m[1]] = v;
    }
  }
  return env;
}

function yymmFromDate(iso) {
  const d = iso ? new Date(iso) : new Date();
  const date = Number.isNaN(d.getTime()) ? new Date() : d;
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${yy}${mm}`;
}

/** @returns {{ next: string | null, reason: string }} */
function convertLimsId(code, dateHint) {
  const raw = (code || '').trim().toUpperCase();
  if (!raw) return { next: null, reason: 'empty' };

  if (new RegExp(`^\\d{4}-[${ALPHABET}]{6}$`).test(raw)) {
    return { next: null, reason: 'already-yymm' };
  }

  const dashed = raw.match(new RegExp(`^(\\d{2})-(\\d{2})-([${ALPHABET}]{6})$`));
  if (dashed) {
    return { next: `${dashed[1]}${dashed[2]}-${dashed[3]}`, reason: 'from-yy-mm' };
  }

  const legacy = raw.match(new RegExp(`^(\\d{2})-([${ALPHABET}]{6})$`));
  if (legacy) {
    const prefix = yymmFromDate(dateHint);
    const codeYy = legacy[1];
    const dateMm = prefix.slice(2, 4);
    const yymm = codeYy === prefix.slice(0, 2) ? prefix : `${codeYy}${dateMm}`;
    return { next: `${yymm}-${legacy[2]}`, reason: 'from-yy' };
  }

  return { next: null, reason: 'unrecognized' };
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

/** @type {Map<string, { next: string, reason: string, dateHint: string | null }>} */
const plan = new Map();
/** Codes that already exist and are NOT being migrated away from. */
const stayPut = new Set();

function registerCode(code, dateHint) {
  const from = (code || '').trim().toUpperCase();
  if (!from) return;
  if (plan.has(from)) {
    // Prefer earlier / more specific date if missing
    const prev = plan.get(from);
    if (!prev.dateHint && dateHint) prev.dateHint = dateHint;
    return;
  }
  const { next, reason } = convertLimsId(from, dateHint);
  if (!next) {
    stayPut.add(from);
    return;
  }
  plan.set(from, { next, reason, dateHint: dateHint || null });
}

async function buildPlan() {
  const [{ data: samples, error: sErr }, { data: coas, error: cErr }] = await Promise.all([
    supabase.from('order_samples').select('id, accession_number, received_at, created_at, metadata'),
    supabase.from('coas').select('id, slug, accession_number, issued_at, created_at, result_summary'),
  ]);
  if (sErr) throw new Error(`order_samples fetch: ${sErr.message}`);
  if (cErr) throw new Error(`coas fetch: ${cErr.message}`);

  for (const row of samples || []) {
    registerCode(row.accession_number, row.received_at || row.created_at);
    const meta = row.metadata;
    if (meta && typeof meta.sample_code === 'string') {
      registerCode(meta.sample_code, row.received_at || row.created_at);
    }
  }
  for (const row of coas || []) {
    const hint = row.issued_at || row.created_at;
    registerCode(row.accession_number, hint);
    registerCode(row.slug, hint);
    const summary = row.result_summary;
    if (summary && typeof summary.sample_code === 'string') {
      registerCode(summary.sample_code, hint);
    }
  }

  // Resolve collisions: two different old codes → same new code
  /** @type {Map<string, string>} */
  const nextOwners = new Map();
  const blocked = new Set();
  for (const [from, info] of plan) {
    const owner = nextOwners.get(info.next);
    if (owner && owner !== from) {
      console.warn(`Collision plan: ${from} and ${owner} both → ${info.next} (skip ${from})`);
      blocked.add(from);
    } else {
      nextOwners.set(info.next, from);
    }
  }
  for (const from of blocked) plan.delete(from);

  // Block if new code already exists as a stay-put ID
  for (const [from, info] of [...plan.entries()]) {
    if (stayPut.has(info.next)) {
      console.warn(`Collision with existing ID: ${from} → ${info.next} (skip)`);
      plan.delete(from);
    }
  }

  return { samples: samples || [], coas: coas || [] };
}

async function applySamples(samples) {
  let updated = 0;
  let skipped = 0;
  for (const row of samples) {
    const from = (row.accession_number || '').trim().toUpperCase();
    const mapped = from ? plan.get(from) : null;
    const meta = row.metadata && typeof row.metadata === 'object' ? { ...row.metadata } : {};
    let metaChanged = false;
    if (typeof meta.sample_code === 'string') {
      const mFrom = meta.sample_code.trim().toUpperCase();
      const mMap = plan.get(mFrom);
      if (mMap) {
        meta.sample_code = mMap.next;
        metaChanged = true;
      }
    }

    if (!mapped && !metaChanged) {
      skipped += 1;
      continue;
    }

    const patch = {};
    if (mapped) {
      patch.accession_number = mapped.next;
      console.log(`  sample ${row.id}: ${from} → ${mapped.next} (${mapped.reason})`);
    }
    if (metaChanged) patch.metadata = meta;

    if (!dryRun) {
      const { error } = await supabase.from('order_samples').update(patch).eq('id', row.id);
      if (error) {
        console.error(`  FAIL sample ${row.id}: ${error.message}`);
        continue;
      }
    }
    updated += 1;
  }
  return { total: samples.length, updated, skipped };
}

async function applyCoas(coas) {
  let updated = 0;
  let skipped = 0;
  for (const row of coas) {
    const fromAcc = (row.accession_number || '').trim().toUpperCase();
    const fromSlug = (row.slug || '').trim().toUpperCase();
    const accMap = fromAcc ? plan.get(fromAcc) : null;
    const slugMap = fromSlug ? plan.get(fromSlug) : null;

    const patch = {};
    const notes = [];
    if (accMap) {
      patch.accession_number = accMap.next;
      notes.push(`acc ${fromAcc}→${accMap.next}`);
    }
    if (slugMap) {
      patch.slug = slugMap.next;
      notes.push(`slug ${fromSlug}→${slugMap.next}`);
    } else if (accMap && fromSlug && fromSlug === fromAcc) {
      // Slug matched accession and wasn't separately planned (already yymm?) — keep in sync
      patch.slug = accMap.next;
      notes.push(`slug sync→${accMap.next}`);
    }

    const summary = row.result_summary && typeof row.result_summary === 'object'
      ? { ...row.result_summary }
      : null;
    if (summary && typeof summary.sample_code === 'string') {
      const scFrom = summary.sample_code.trim().toUpperCase();
      const scMap = plan.get(scFrom);
      if (scMap) {
        summary.sample_code = scMap.next;
        patch.result_summary = summary;
        notes.push(`summary→${scMap.next}`);
      }
    }

    if (Object.keys(patch).length === 0) {
      skipped += 1;
      continue;
    }

    console.log(`  coa ${row.id}: ${notes.join('; ')}`);
    if (!dryRun) {
      const { error } = await supabase.from('coas').update(patch).eq('id', row.id);
      if (error) {
        console.error(`  FAIL coa ${row.id}: ${error.message}`);
        continue;
      }
    }
    updated += 1;
  }
  return { total: coas.length, updated, skipped };
}

async function main() {
  console.log(dryRun ? '=== DRY RUN (no writes) ===' : '=== APPLYING LIMS ID MIGRATION ===');
  const { samples, coas } = await buildPlan();
  console.log(`Plan: ${plan.size} code(s) to rewrite.`);
  for (const [from, info] of plan) {
    console.log(`  ${from} → ${info.next} (${info.reason})`);
  }

  console.log('\norder_samples:');
  const s = await applySamples(samples);
  console.log(`  total=${s.total} updated=${s.updated} skipped=${s.skipped}`);

  console.log('\ncoas:');
  const c = await applyCoas(coas);
  console.log(`  total=${c.total} updated=${c.updated} skipped=${c.skipped}`);

  console.log(dryRun ? '\nDry run complete.' : '\nMigration complete.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
