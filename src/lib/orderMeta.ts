/** Structured JSON stuffed into orders.notes after a `---` separator (or as the whole notes body). */

export type OrderNotesMeta = {
  prepaid_label?: boolean;
  promo_code?: string | null;
  coa_profile_id?: string | null;
  coa_profile_name?: string | null;
  samples_detail?: Record<string, unknown>[];
  payment_simulation?: boolean;
  payment_provider?: string;
  [key: string]: unknown;
};

const META_SEP = '\n\n---\n';

export function parseOrderNotes(notes: string | null | undefined): {
  freeText: string;
  meta: OrderNotesMeta;
} {
  const raw = (notes || '').trim();
  if (!raw) return { freeText: '', meta: {} };

  const sepIdx = raw.lastIndexOf('---');
  if (sepIdx >= 0) {
    const maybeJson = raw.slice(sepIdx + 3).trim();
    try {
      const parsed = JSON.parse(maybeJson);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const freeText = raw.slice(0, sepIdx).replace(/\n+$/, '').trim();
        return { freeText, meta: parsed as OrderNotesMeta };
      }
    } catch {
      /* fall through */
    }
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { freeText: '', meta: parsed as OrderNotesMeta };
    }
  } catch {
    /* plain notes */
  }

  return { freeText: raw, meta: {} };
}

export function serializeOrderNotes(freeText: string, meta: OrderNotesMeta): string {
  const json = JSON.stringify(meta);
  const text = (freeText || '').trim();
  return text ? `${text}${META_SEP}${json}` : json;
}

export function mergeOrderNotesMeta(
  notes: string | null | undefined,
  patch: Partial<OrderNotesMeta>,
): string {
  const { freeText, meta } = parseOrderNotes(notes);
  return serializeOrderNotes(freeText, { ...meta, ...patch });
}
