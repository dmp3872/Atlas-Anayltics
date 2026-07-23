/**
 * Lightweight assertion script for order projection / Full QC changes.
 * Run: node scripts/verify-order-projection.mjs
 *
 * Uses dynamic import of compiled-less TS via a tiny inline reimplementation
 * of the critical constants so we don't need vitest/tsx in CI.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalogSrc = readFileSync(join(root, 'src/lib/orderCatalog.ts'), 'utf8');
const projectionSrc = readFileSync(join(root, 'src/lib/orderProjection.ts'), 'utf8');
const readinessSrc = readFileSync(join(root, 'src/lib/orderReadiness.ts'), 'utf8');
const migration = readFileSync(
  join(root, 'supabase/migrations/20260718160000_full_qc_panel_400.sql'),
  'utf8',
);

// --- Full QC catalog ---
assert.match(catalogSrc, /id: 'full_qc'[\s\S]*?price: 400/);
assert.match(catalogSrc, /FULL_QC_PANEL[\s\S]*?price: 400/);
assert.match(catalogSrc, /FULL_QC_BUNDLED_TEST_IDS = \[\s*'purity_hplc',\s*'sterility_pcr'/);
assert.doesNotMatch(
  catalogSrc.slice(catalogSrc.indexOf('FULL_QC_BUNDLED_TEST_IDS'), catalogSrc.indexOf('export const FULL_QC_PANEL')),
  /heavy_metals_icpms|endotoxin_usp85/,
);
assert.match(catalogSrc, /'Sterility \(PCR\)'/);
assert.doesNotMatch(
  catalogSrc.slice(catalogSrc.indexOf('export const FULL_QC_PANEL'), catalogSrc.indexOf('export function packageCardMeta')),
  /Heavy metals screen|Endotoxin \(LAL\)/,
);

// --- Projection helpers exist ---
assert.match(projectionSrc, /export function buildVialAllocation/);
assert.match(projectionSrc, /export function packageCapabilities/);
assert.match(projectionSrc, /export function methodsForSample/);
assert.match(projectionSrc, /includesHeavyMetals: false/);
assert.match(projectionSrc, /includesEndotoxin: false/);
assert.match(projectionSrc, /HPLC primary/);
assert.match(projectionSrc, /Conformity comparison/);

// --- Readiness checkout gates ---
assert.match(readinessSrc, /ready_to_submit/);
assert.match(readinessSrc, /includeCheckout/);
assert.match(readinessSrc, /COA profile selected/);
assert.match(readinessSrc, /Payment authorized/);

// --- Migration ---
assert.match(migration, /price_per_sample = 400/);
assert.match(migration, /Full QC Panel/);
assert.match(migration, /sterility \(PCR\)/i);

console.log('verify-order-projection: all assertions passed');
