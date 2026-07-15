/**
 * Verifies coas.vial_image / chromatogram_image columns, or prints SQL to run manually.
 *
 * With SUPABASE_SERVICE_ROLE_KEY: probes columns (select). DDL still requires SQL Editor
 * unless you paste the migration there — Supabase JS cannot run arbitrary ALTER TABLE.
 *
 * Run: node scripts/apply-coa-pdf-images-migration.mjs
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const sqlPath = resolve(root, 'supabase/migrations/20260715000000_coa_pdf_images.sql');
const sql = readFileSync(sqlPath, 'utf8');

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

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL (and a key) in .env');
  console.error('\nRun this in Supabase SQL Editor:\n');
  console.log(sql);
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { error } = await supabase.from('coas').select('id, vial_image, chromatogram_image').limit(1);

if (!error) {
  console.log('Columns vial_image and chromatogram_image are present on coas.');
  process.exit(0);
}

if (/vial_image|chromatogram_image|column/i.test(error.message)) {
  console.error('Columns missing. Run this in Supabase SQL Editor:\n');
  console.log(sql);
  process.exit(2);
}

console.error('Could not verify columns:', error.message);
console.error('\nIf unsure, run this in Supabase SQL Editor:\n');
console.log(sql);
process.exit(1);
