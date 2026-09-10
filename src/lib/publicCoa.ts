import { supabase } from "./supabase";
import {
  COA_DETAIL_COLUMNS,
  fetchCoaImageRow,
  type CoaImageRow,
} from "./coaSelect";
import type { COA } from "./types";
export function normalizeCoaCode(code: string) {
  const trimmed = code.trim();
  return /^\d{4}-[a-z0-9]{6}$/i.test(trimmed) ? trimmed.toUpperCase() : trimmed;
}
export async function fetchPublicCoa(code: string, images = false) {
  return supabase.rpc("verify_public_coa", {
    p_code: normalizeCoaCode(code),
    p_images: images,
  });
}
export async function fetchCoaByCode(code: string, authenticated: boolean) {
  if (authenticated) {
    const result = await supabase
      .from("coas")
      .select(COA_DETAIL_COLUMNS)
      .eq("slug", normalizeCoaCode(code))
      .maybeSingle();
    if (result.data) return result;
  }
  return fetchPublicCoa(code);
}
export async function fetchImagesByCode(coa: COA): Promise<CoaImageRow | null> {
  if (coa.user_id) {
    const row = await fetchCoaImageRow(coa.id);
    if (row) return row;
  }
  const { data, error } = await fetchPublicCoa(coa.slug, true);
  if (error) throw error;
  return data as CoaImageRow | null;
}
