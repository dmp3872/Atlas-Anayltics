import { supabase } from './supabase';

/**
 * Unambiguous alphabet — no I/O/0/1 (easy to confuse when read aloud or handwritten).
 * 32 chars → 32^6 ≈ 1.07e9 codes per year.
 */
export const SAMPLE_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const RANDOM_LEN = 6;
const MAX_ALLOC_ATTEMPTS = 12;

function yearSuffix(createdAt: Date | string | number = new Date()): string {
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const year = Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear();
  return String(year).slice(-2);
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

/** Format: YY-XXXXXX (e.g. 26-K7M4Q9). */
export function generateSampleCode(createdAt: Date | string | number = new Date()): string {
  return `${yearSuffix(createdAt)}-${randomToken(RANDOM_LEN)}`;
}

export function isValidSampleCode(code: string): boolean {
  return new RegExp(
    `^\\d{2}-[${SAMPLE_CODE_ALPHABET}]{${RANDOM_LEN}}$`,
  ).test((code || '').trim().toUpperCase());
}

async function codeIsTaken(code: string): Promise<boolean> {
  const [{ data: coa }, { data: sample }] = await Promise.all([
    supabase.from('coas').select('id').eq('slug', code).maybeSingle(),
    supabase.from('order_samples').select('id').eq('accession_number', code).maybeSingle(),
  ]);
  return Boolean(coa || sample);
}

/**
 * Allocate a unique YY-XXXXXX code unused as a COA slug or sample accession.
 * Used at receiving (accession) and at Issue (sample code) so both can share one ID.
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

/** Alias — accession numbers use the same YY-XXXXXX system as COA sample codes. */
export const allocateUniqueAccessionNumber = allocateUniqueSampleCode;
