/**
 * Create or update a staff login (chemist / admin / verifier / client).
 *
 * Usage:
 *   node scripts/create-staff-account.mjs \
 *     --email chemist2@atlaslabs.test \
 *     --password 'ChemistPass123!' \
 *     --name 'Alex Chemist' \
 *     --role chemist
 *
 * Requires in .env:
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const ROLES = new Set(['chemist', 'admin', 'verifier', 'client', 'reviewer']);

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
      /* missing ok */
    }
  }
  return out;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    out[key] = val;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const email = (args.email || '').trim().toLowerCase();
const password = args.password || '';
const full_name = (args.name || args.full_name || '').trim();
const role = (args.role || 'chemist').trim().toLowerCase();

if (!email || !password || !full_name) {
  console.error('Required: --email --password --name [--role chemist]');
  process.exit(1);
}
if (!ROLES.has(role)) {
  console.error(`Invalid role "${role}". Use one of: ${[...ROLES].join(', ')}`);
  process.exit(1);
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const list = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
if (list.error) {
  console.error(list.error.message);
  process.exit(1);
}

let user = list.data.users.find(u => u.email?.toLowerCase() === email);
if (!user) {
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (created.error) {
    console.error('create failed:', created.error.message);
    process.exit(1);
  }
  user = created.data.user;
  console.log(`created  ${email}`);
} else {
  const updated = await admin.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (updated.error) {
    console.error('update failed:', updated.error.message);
    process.exit(1);
  }
  console.log(`updated  ${email}`);
}

const { error: profileError } = await admin.from('user_profiles').upsert(
  { id: user.id, full_name, role },
  { onConflict: 'id' },
);
if (profileError) {
  console.error('profile upsert failed:', profileError.message);
  process.exit(1);
}

const probe = createClient(url, env.VITE_SUPABASE_ANON_KEY || serviceKey);
const { error: signInError } = await probe.auth.signInWithPassword({ email, password });
if (signInError) {
  console.warn(`warn: sign-in probe failed: ${signInError.message}`);
  process.exitCode = 1;
} else {
  console.log(`ok: sign-in works (${role})`);
  await probe.auth.signOut();
}

console.log(`\n${role}: ${email} / ${password} (${full_name})`);
