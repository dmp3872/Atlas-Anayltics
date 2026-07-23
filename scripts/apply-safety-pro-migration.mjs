/**
 * Applies supabase/migrations/20260622190300_atlas_safety_pro_package.sql
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env (Dashboard → Settings → API → service_role).
 * If test_panels does not exist yet, run the earlier migrations in Supabase SQL Editor first.
 *
 * Run: node scripts/apply-safety-pro-migration.mjs
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  try {
    const raw = readFileSync('.env', 'utf8');
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
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  console.error('\nAdd your service role key from Supabase Dashboard → Settings → API');
  console.error('Or paste this file in SQL Editor:');
  console.error('  supabase/migrations/20260622190300_atlas_safety_pro_package.sql');
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

const PANEL = {
  name: 'Atlas Safety Pro Package',
  description:
    'Complete safety bundle per sample: HPLC Purity, Net Content, Identity (ID), Heavy Metals, Endotoxin (LAL), Sterility (PCR), Fentanyl Detection, and 3 Conformity Vials included.',
  price_per_sample: 850,
  turnaround_days: 5,
  category: 'package',
  is_active: true,
  sort_order: -1,
};

const { data: existing, error: lookupError } = await supabase
  .from('test_panels')
  .select('id, name')
  .eq('name', PANEL.name)
  .maybeSingle();

if (lookupError) {
  console.error('Lookup failed:', lookupError.message);
  if (lookupError.message.includes('test_panels')) {
    console.error('\ntest_panels table not found. Run earlier migrations in Supabase SQL Editor first.');
  }
  process.exit(1);
}

if (existing) {
  console.log('Atlas Safety Pro Package already exists:', existing.id);
  process.exit(0);
}

const { data, error } = await supabase.from('test_panels').insert(PANEL).select().single();

if (error) {
  console.error('Insert failed:', error.message);
  process.exit(1);
}

console.log('Atlas Safety Pro Package created:', data.id);
