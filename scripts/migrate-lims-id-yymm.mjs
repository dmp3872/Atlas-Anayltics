/**
 * Migrate LIMS IDs (accession_number / COA slug) to YYMM-XXXXXX.
 *
 * Converts:
 *   26-08-K7M4Q9  →  2608-K7M4Q9
 *   26-K7M4Q9     →  2608-K7M4Q9  (month from received_at / created_at / issued_at)
 * Already YYMM-XXXXXX is left alone.
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

  // Already YYMM-XXXXXX
  if (new RegExp(`^\\d{4}-[${ALPHABET}]{6}$`).test(raw)) {
    return { next: null, reason: 'already-yymm' };
  }

  // Intermediate YY-MM-XXXXXX → YYMM-XXXXXX
  const dashed = raw.match(new RegExp(`^(\\d{2})-(\\d{2})-([${ALPHABET}]{6})$`));
  if (dashed) {
    return { next: `${dashed[1]}${dashed[2]}-${dashed[3]}`, reason: 'from-yy-mm' };
  }

  // Legacy YY-XXXXXX → YYMM-XXXXXX using date hint
  const legacy = raw.match(new RegExp(`^(\\d{2})-([${ALPHABET}]{6})$`));
  if (legacy) {
    const prefix = yymmFromDate(dateHint);
    // Prefer date's year month; if date year doesn't match code year, still use date month with code year
    const codeYy = legacy[1];
    const dateYy = prefix.slice(0, 2);
    const dateMm = prefix.slice(2, 4);
    const yymm = codeYy === dateYy ? prefix : `${codeYy}${dateMm}`;
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

const reserved = new Set();

async function loadExistingCodes() {
  const [{ data: samples }, { data: coas }] = await Promise.all([
    supabase.from('order_samples').select('accession_number'),
    supabase.from('coas').select('slug, accession_number'),
  ]);
  for (const s of samples || []) {
    if (s.accession_number) reserved.add(String(s.accession_number).trim().toUpperCase());
  }
  for (const c of coas || []) {
    if (c.slug) reserved.add(String(c.slug).trim().toUpperCase());
    if (c.accession_number) reserved.add(String(c.accession_number).trim().toUpperCase());
  }
}

function claimOrSkip(from, to) {
  if (!to || from === to) return null;
  // Free the old code first so re-using the same target across sample+coa of one ID works.
  reserved.delete(from);
  if (reserved.has(to)) {
    reserved.add(from);
    return null;
  }
  reserved.add(to);
  return to;
}

async function migrateSamples() {
  const { data, error } = await supabase
    .from('order_samples')
    .select('id, accession_number, received_at, created_at, metadata');
  if (error) throw new Error(`order_samples fetch: ${error.message}`);

  let updated = 0;
  let skipped = 0;
  const rows = data || [];

  for (const row of rows) {
    const from = (row.accession_number || '').trim().toUpperCase();
    if (!from) {
      skipped += 1;
      continue;
    }
    const { next, reason } = convertLimsId(from, row.received_at || row.created_at);
    if (!next) {
      skipped += 1;
      continue;
    }
    const claimed = claimOrSkip(from, next);
    if (!claimed) {
      console.warn(`  skip sample ${row.id}: ${from} → ${next} (collision)`);
      skipped += 1;
      continue;
    }

    const meta = row.metadata && typeof row.metadata === 'object' ? { ...row.metadata } : {};
    if (typeof meta.sample_code === 'string' && meta.sample_code.trim()) {
      meta.sample_code = claimed;
    }

    console.log(`  sample ${row.id}: ${from} → ${claimed} (${reason})`);
    if (!dryRun) {
      const { error: upErr } = await supabase
        .from('order_samples')
        .update({ accession_number: claimed, metadata: meta })
        .eq('id', row.id);
      if (upErr) {
        console.error(`  FAIL sample ${row.id}: ${upErr.message}`);
        continue;
      }
    }
    updated += 1;
  }

  return { total: rows.length, updated, skipped };
}

async function migrateCoas() {
  const { data, error } = await supabase
    .from('coas')
    .select('id, slug, accession_number, issued_at, created_at, result_summary');
  if (error) throw new Error(`coas fetch: ${error.message}`);

  let updated = 0;
  let skipped = 0;
  const rows = data || [];

  for (const row of rows) {
    const dateHint = row.issued_at || row.created_at;
    const fromAcc = (row.accession_number || '').trim().toUpperCase();
    const fromSlug = (row.slug || '').trim().toUpperCase();

    const accConv = convertLimsId(fromAcc, dateHint);
    const slugConv = convertLimsId(fromSlug, dateHint);

    const patch = {};
    let reasonParts = [];

    if (accConv.next) {
      const claimed = claimOrSkip(fromAcc, accConv.next);
      if (claimed) {
        patch.accession_number = claimed;
        reasonParts.push(`acc ${fromAcc}→${claimed}`);
      } else if (accConv.next) {
        console.warn(`  skip coa acc ${row.id}: ${fromAcc} → ${accConv.next} (collision)`);
      }
    }

    if (slugConv.next) {
      const claimed = claimOrSkip(fromSlug, slugConv.next);
      if (claimed) {
        patch.slug = claimed;
        reasonParts.push(`slug ${fromSlug}→${claimed}`);
      } else if (slugConv.next) {
        console.warn(`  skip coa slug ${row.id}: ${fromSlug} → ${slugConv.next} (collision)`);
      }
    }

    // Keep accession aligned with slug when both convert or one is blank
    if (patch.slug && !patch.accession_number && (!fromAcc || fromAcc === fromSlug)) {
      patch.accession_number = patch.slug;
    }
    if (patch.accession_number && !patch.slug && fromSlug && fromSlug === fromAcc) {
      // slug already handled or same; if slug didn't need convert but matched old acc, update slug too
      if (!slugConv.next && fromSlug === fromAcc) {
        const claimed = claimOrSkip(fromSlug, patch.accession_number);
        if (claimed) patch.slug = claimed;
      }
    }

    const summary = row.result_summary && typeof row.result_summary === 'object'
      ? { ...row.result_summary }
      : null;
    if (summary && typeof summary.sample_code === 'string') {
      const sc = convertLimsId(summary.sample_code, dateHint);
      if (sc.next) {
        summary.sample_code = sc.next;
        patch.result_summary = summary;
        reasonParts.push(`summary.sample_code→${sc.next}`);
      }
    }

    if (Object.keys(patch).length === 0) {
      skipped += 1;
      continue;
    }

    console.log(`  coa ${row.id}: ${reasonParts.join('; ')}`);
    if (!dryRun) {
      const { error: upErr } = await supabase.from('coas').update(patch).eq('id', row.id);
      if (upErr) {
        console.error(`  FAIL coa ${row.id}: ${upErr.message}`);
        continue;
      }
    }
    updated += 1;
  }

  return { total: rows.length, updated, skipped };
}

async function main() {
  console.log(dryRun ? '=== DRY RUN (no writes) ===' : '=== APPLYING LIMS ID MIGRATION ===');
  await loadExistingCodes();
  console.log(`Loaded ${reserved.size} existing codes for collision checks.`);

  console.log('\norder_samples:');
  const samples = await migrateSamples();
  console.log(`  total=${samples.total} updated=${samples.updated} skipped=${samples.skipped}`);

  console.log('\ncoas:');
  const coas = await migrateCoas();
  console.log(`  total=${coas.total} updated=${coas.updated} skipped=${coas.skipped}`);

  console.log(dryRun ? '\nDry run complete.' : '\nMigration complete.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
