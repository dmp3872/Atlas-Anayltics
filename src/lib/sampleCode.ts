import { supabase } from './supabase';

/**
 * Unambiguous alphabet — no I/O/0/1 (easy to confuse when read aloud or handwritten).
 * 32 chars → 32^6 ≈ 1.07e9 codes per day.
 */
export const SAMPLE_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const RANDOM_LEN = 6;
const MAX_ALLOC_ATTEMPTS = 12;

function parseDate(createdAt: Date | string | number = new Date()): Date {
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

/**
 * Lab-local YYMMDD (America/New_York).
 * e.g. Sep 17, 2026 → 260917
 */
function yearMonthDayPrefix(createdAt: Date | string | number = new Date()): string {
  const d = parseDate(createdAt);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const yy = parts.find(p => p.type === 'year')?.value ?? String(d.getFullYear()).slice(-2);
  const mm = parts.find(p => p.type === 'month')?.value ?? String(d.getMonth() + 1).padStart(2, '0');
  const dd = parts.find(p => p.type === 'day')?.value ?? String(d.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

function randomToken(length = RANDOM_LEN): string {
  const alphabet = SAMPLE_CODE_ALPHABET;
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i]! % alphabet.length]!;
  }
  return out;
}

/**
 * Current format: YYMMDD-XXXXXX (e.g. 260917-K7M4Q9 = Sep 17, 2026).
 * Year, month, and day come from intake / sample created date.
 */
export function generateSampleCode(createdAt: Date | string | number = new Date()): string {
  return `${yearMonthDayPrefix(createdAt)}-${randomToken(RANDOM_LEN)}`;
}

/** Human-readable example for placeholders / help text. */
export function sampleCodeExample(createdAt: Date | string | number = new Date()): string {
  return `${yearMonthDayPrefix(createdAt)}-K7M4Q9`;
}

/**
 * Accepts:
 * - current YYMMDD-XXXXXX (260917-K7M4Q9)
 * - prior YYMM-XXXXXX (2608-K7M4Q9)
 * - brief YY-MM-XXXXXX (26-08-K7M4Q9) from the intermediate format
 * - legacy YY-XXXXXX (26-K7M4Q9)
 */
export function isValidSampleCode(code: string): boolean {
  const normalized = (code || '').trim().toUpperCase();
  const alpha = SAMPLE_CODE_ALPHABET;
  const withDay = new RegExp(`^\\d{6}-[${alpha}]{${RANDOM_LEN}}$`);
  const monthOnly = new RegExp(`^\\d{4}-[${alpha}]{${RANDOM_LEN}}$`);
  const dashedYm = new RegExp(`^\\d{2}-\\d{2}-[${alpha}]{${RANDOM_LEN}}$`);
  const legacy = new RegExp(`^\\d{2}-[${alpha}]{${RANDOM_LEN}}$`);
  return withDay.test(normalized)
    || monthOnly.test(normalized)
    || dashedYm.test(normalized)
    || legacy.test(normalized);
}

async function codeIsTaken(code: string): Promise<boolean> {
  const [{ data: coa }, { data: sample }] = await Promise.all([
    supabase.from('coas').select('id').eq('slug', code).maybeSingle(),
    supabase.from('order_samples').select('id').eq('accession_number', code).maybeSingle(),
  ]);
  return Boolean(coa || sample);
}

/**
 * Allocate a unique LIMS ID unused as a COA slug or sample accession_number.
 * Used at receiving and at Issue (sample code) so both can share one ID.
 */
export async function allocateUniqueSampleCode(
  createdAt: Date | string | number = new Date(),
): Promise<string> {
  for (let attempt = 0; attempt < MAX_ALLOC_ATTEMPTS; attempt++) {
    const code = generateSampleCode(createdAt);
    try {
      if (!(await codeIsTaken(code))) return code;
    } catch {
      // If lookup fails, still return a code — insert uniqueness will catch collisions.
      return code;
    }
  }
  throw new Error('Could not allocate a unique sample code. Try again.');
}

/** Alias — LIMS IDs use the same YYMMDD-XXXXXX system as COA sample codes. */
export const allocateUniqueAccessionNumber = allocateUniqueSampleCode;
