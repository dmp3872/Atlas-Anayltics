import { supabase } from './supabase';

/**
 * Unambiguous alphabet — no I/O/0/1 (easy to confuse when read aloud or handwritten).
 * 32 chars → 32^6 ≈ 1.07e9 codes per month.
 */
export const SAMPLE_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const RANDOM_LEN = 6;
const MAX_ALLOC_ATTEMPTS = 12;

function parseDate(createdAt: Date | string | number = new Date()): Date {
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function yearSuffix(createdAt: Date | string | number = new Date()): string {
  return String(parseDate(createdAt).getFullYear()).slice(-2);
}

/** Two-digit month (01–12) for the intake / COA date. */
function monthSuffix(createdAt: Date | string | number = new Date()): string {
  return String(parseDate(createdAt).getMonth() + 1).padStart(2, '0');
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
 * Current format: YY-MM-XXXXXX (e.g. 26-08-K7M4Q9 = Aug 2026).
 * Year and month come from intake / sample created date.
 */
export function generateSampleCode(createdAt: Date | string | number = new Date()): string {
  return `${yearSuffix(createdAt)}-${monthSuffix(createdAt)}-${randomToken(RANDOM_LEN)}`;
}

/** Human-readable example for placeholders / help text. */
export function sampleCodeExample(createdAt: Date | string | number = new Date()): string {
  return `${yearSuffix(createdAt)}-${monthSuffix(createdAt)}-K7M4Q9`;
}

/**
 * Accepts current YY-MM-XXXXXX and legacy YY-XXXXXX so older certificates stay valid.
 */
export function isValidSampleCode(code: string): boolean {
  const normalized = (code || '').trim().toUpperCase();
  const alpha = SAMPLE_CODE_ALPHABET;
  const current = new RegExp(`^\\d{2}-\\d{2}-[${alpha}]{${RANDOM_LEN}}$`);
  const legacy = new RegExp(`^\\d{2}-[${alpha}]{${RANDOM_LEN}}$`);
  return current.test(normalized) || legacy.test(normalized);
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

/** Alias — LIMS IDs use the same YY-MM-XXXXXX system as COA sample codes. */
export const allocateUniqueAccessionNumber = allocateUniqueSampleCode;
