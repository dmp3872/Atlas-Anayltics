/**
 * Remap existing YYMM LIMS IDs to a target month (default: current Eastern month).
 * Keeps the 6-char token; only rewrites the YYMM prefix.
 *
 * Example: 2607-K7M4Q9 → 2608-K7M4Q9
 *
 * Run:     node scripts/remap-lims-id-month.mjs
 * Dry run: node scripts/remap-lims-id-month.mjs --dry-run
 * Force:   node scripts/remap-lims-id-month.mjs --yymm=2608
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const dryRun = process.argv.includes('--dry-run');
const yymmArg = process.argv.find(a => a.startsWith('--yymm='))?.slice('--yymm='.length);

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

/** Eastern (lab) calendar YYMM — August = 08. */
function easternYymm(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: '2-digit',
    month: '2-digit',
  }).formatToParts(date);
  const yy = parts.find(p => p.type === 'year')?.value ?? '26';
  const mm = parts.find(p => p.type === 'month')?.value ?? '08';
  return `${yy}${mm}`;
}

const TARGET = (yymmArg && /^\d{4}$/.test(yymmArg)) ? yymmArg : easternYymm();
const TOKEN_RE = /^(\d{4})-([23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6})$/i;

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL and a Supabase key in .env');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function remap(code) {
  const raw = (code || '').trim().toUpperCase();
  const m = raw.match(TOKEN_RE);
  if (!m) return null;
  if (m[1] === TARGET) return null;
  return `${TARGET}-${m[2]}`;
}

async function main() {
  console.log(dryRun ? '=== DRY RUN ===' : '=== APPLY ===');
  console.log(`Target YYMM (August=08): ${TARGET}`);

  const [{ data: samples, error: sErr }, { data: coas, error: cErr }] = await Promise.all([
    supabase.from('order_samples').select('id, accession_number, metadata'),
    supabase.from('coas').select('id, slug, accession_number, result_summary'),
  ]);
  if (sErr) throw new Error(sErr.message);
  if (cErr) throw new Error(cErr.message);

  let sampleUpdates = 0;
  for (const row of samples || []) {
    const from = (row.accession_number || '').trim().toUpperCase();
    const next = remap(from);
    const meta = row.metadata && typeof row.metadata === 'object' ? { ...row.metadata } : {};
    let metaChanged = false;
    if (typeof meta.sample_code === 'string') {
      const mNext = remap(meta.sample_code);
      if (mNext) {
        meta.sample_code = mNext;
        metaChanged = true;
      }
    }
    if (!next && !metaChanged) continue;
    const patch = {};
    if (next) {
      patch.accession_number = next;
      console.log(`  sample ${row.id}: ${from} → ${next}`);
    }
    if (metaChanged) patch.metadata = meta;
    if (!dryRun) {
      const { error } = await supabase.from('order_samples').update(patch).eq('id', row.id);
      if (error) {
        console.error(`  FAIL sample ${row.id}: ${error.message}`);
        continue;
      }
    }
    sampleUpdates += 1;
  }

  let coaUpdates = 0;
  for (const row of coas || []) {
    const fromAcc = (row.accession_number || '').trim().toUpperCase();
    const fromSlug = (row.slug || '').trim().toUpperCase();
    const nextAcc = remap(fromAcc);
    const nextSlug = remap(fromSlug);
    const patch = {};
    const notes = [];
    if (nextAcc) {
      patch.accession_number = nextAcc;
      notes.push(`acc ${fromAcc}→${nextAcc}`);
    }
    if (nextSlug) {
      patch.slug = nextSlug;
      notes.push(`slug ${fromSlug}→${nextSlug}`);
    } else if (nextAcc && fromSlug === fromAcc) {
      patch.slug = nextAcc;
      notes.push(`slug sync→${nextAcc}`);
    }
    const summary = row.result_summary && typeof row.result_summary === 'object'
      ? { ...row.result_summary }
      : null;
    if (summary && typeof summary.sample_code === 'string') {
      const scNext = remap(summary.sample_code);
      if (scNext) {
        summary.sample_code = scNext;
        patch.result_summary = summary;
        notes.push(`summary→${scNext}`);
      }
    }
    if (Object.keys(patch).length === 0) continue;
    console.log(`  coa ${row.id}: ${notes.join('; ')}`);
    if (!dryRun) {
      const { error } = await supabase.from('coas').update(patch).eq('id', row.id);
      if (error) {
        console.error(`  FAIL coa ${row.id}: ${error.message}`);
        continue;
      }
    }
    coaUpdates += 1;
  }

  console.log(`\nSamples updated: ${sampleUpdates}`);
  console.log(`COAs updated: ${coaUpdates}`);
  console.log(dryRun ? 'Dry run complete.' : 'Remap complete.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
