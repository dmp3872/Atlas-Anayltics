/**
 * Creates the demo customer account in Supabase.
 * Run: node scripts/create-demo-customer.mjs
 *
 * Requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  try {
    const raw = readFileSync('.env', 'utf8');
    return Object.fromEntries(
      raw.split('\n')
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => line.split('=').map((s) => s.trim()))
        .filter(([k]) => k?.startsWith('VITE_'))
        .map(([k, ...v]) => [k, v.join('=')]),
    );
  } catch {
    return {};
  }
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const EMAIL = 'demo.customer@atlas-analytics.test';
const PASSWORD = 'DemoCustomer123!';

const supabase = createClient(url, key);

const { data, error } = await supabase.auth.signUp({
  email: EMAIL,
  password: PASSWORD,
  options: { data: { full_name: 'Demo Customer' } },
});

if (error) {
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  if (signInError) {
    console.error('Sign up failed:', error.message);
    console.error('Sign in failed:', signInError.message);
    console.error('\nIf email confirmation is required, create the user in Supabase Dashboard → Authentication → Users (auto-confirm), then run:');
    console.error('  supabase/migrations/20260622190200_seed_demo_customer_profile.sql');
    process.exit(1);
  }
  console.log('Demo customer already exists and sign-in works.');
  process.exit(0);
}

if (data.user) {
  await supabase.from('user_profiles').upsert({
    id: data.user.id,
    full_name: 'Demo Customer',
    company_name: 'Summit Peptide Labs',
    phone: '303-555-0142',
    role: 'client',
  });
}

console.log('\nDemo customer ready:');
console.log('  Email:   ', EMAIL);
console.log('  Password:', PASSWORD);
if (!data.user?.email_confirmed_at) {
  console.log('\nNote: Confirm email in Supabase Dashboard if sign-in fails.');
}
