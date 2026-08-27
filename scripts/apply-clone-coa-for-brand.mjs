/**
 * Applies supabase/migrations/20260814120000_clone_coa_for_brand.sql
 *
 * Prefers DATABASE_URL / SUPABASE_DB_URL (Postgres connection string).
 * Without a DB URL, prints the SQL for the Supabase SQL Editor.
 *
 * Run: node scripts/apply-clone-coa-for-brand.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const sqlPath = resolve(root, 'supabase/migrations/20260814120000_clone_coa_for_brand.sql');
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
const dbUrl = env.DATABASE_URL || env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  console.error('No DATABASE_URL / SUPABASE_DB_URL in .env');
  console.error('\nPaste this into Supabase Dashboard → SQL Editor → Run:\n');
  console.log(sql);
  process.exit(2);
}

const { default: pg } = await import('pg').catch(() => ({ default: null }));
if (!pg) {
  console.error('Install pg first: npm install pg');
  console.error('\nOr paste this into Supabase SQL Editor:\n');
  console.log(sql);
  process.exit(2);
}

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(sql);
  console.log('Applied clone_coa_for_brand migration.');
} finally {
  await client.end();
}
