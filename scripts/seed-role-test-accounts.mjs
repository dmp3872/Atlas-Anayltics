/**
 * Creates role test logins in Supabase Auth + user_profiles.
 * Run: node scripts/seed-role-test-accounts.mjs
 *
 * Requires in .env:
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (Dashboard → Settings → API → service_role)
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnv() {
  const out = {};
  for (const name of ['.env', '.env.local']) {
    try {
      const raw = readFileSync(resolve(root, name), 'utf8');
      for (const line of raw.split('\n')) {
        if (!line || line.startsWith('#')) continue;
        const i = line.indexOf('=');
        if (i < 0) continue;
        const k = line.slice(0, i).trim();
        const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
        if (!(k in out)) out[k] = v;
      }
    } catch {
      /* missing file ok */
    }
  }
  return out;
}

const ACCOUNTS = [
  { email: 'admin@atlaslabs.test', password: 'AdminPass123!', full_name: 'Atlas Admin', role: 'admin' },
  { email: 'chemist@atlaslabs.test', password: 'ChemistPass123!', full_name: 'Casey Chemist', role: 'chemist' },
  { email: 'verifier@atlaslabs.test', password: 'VerifierPass123!', full_name: 'Val Verifier', role: 'verifier' },
  { email: 'client@atlaslabs.test', password: 'ClientPass123!', full_name: 'Chris Client', role: 'client' },
];

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  console.error('Get the service_role key from Supabase Dashboard → Project Settings → API');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureUser({ email, password, full_name, role }) {
  const list = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (list.error) throw list.error;

  let user = list.data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

  if (!user) {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (created.error) throw created.error;
    user = created.data.user;
    console.log(`created  ${email}`);
  } else {
    const updated = await admin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (updated.error) throw updated.error;
    console.log(`updated  ${email}`);
  }

  const { error: profileError } = await admin.from('user_profiles').upsert(
    { id: user.id, full_name, role },
    { onConflict: 'id' },
  );
  if (profileError) {
    throw new Error(`profile upsert failed for ${email}: ${profileError.message}`);
  }

  const probe = createClient(url, env.VITE_SUPABASE_ANON_KEY || serviceKey);
  const { error: signInError } = await probe.auth.signInWithPassword({ email, password });
  if (signInError) {
    console.warn(`  warn: sign-in probe failed: ${signInError.message}`);
  } else {
    console.log(`  ok: sign-in works (${role})`);
    await probe.auth.signOut();
  }
}

console.log(`Seeding against ${url.replace(/^https?:\/\//, '').split('/')[0]} …\n`);

for (const account of ACCOUNTS) {
  try {
    await ensureUser(account);
  } catch (err) {
    console.error(`FAIL ${account.email}:`, err.message || err);
    process.exitCode = 1;
  }
}

console.log('\nLogins:');
for (const a of ACCOUNTS) {
  console.log(`  ${a.role.padEnd(8)} ${a.email} / ${a.password}`);
}
