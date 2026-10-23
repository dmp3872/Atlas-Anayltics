import { supabase } from './supabase';
import type { LabRdSheet } from './types';
import { defaultSheetHtml } from './labRdSheetContent';

export async function fetchLabRdSheets(): Promise<LabRdSheet[]> {
  const { data, error } = await supabase
    .from('lab_rd_sheets')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as LabRdSheet[];
}

export async function createLabRdSheet(input: {
  userId: string;
  title?: string;
  content_md?: string;
}): Promise<LabRdSheet> {
  const { data, error } = await supabase
    .from('lab_rd_sheets')
    .insert({
      title: input.title?.trim() || 'Untitled sheet',
      content_md: input.content_md ?? defaultSheetTemplate(),
      created_by: input.userId,
      updated_by: input.userId,
    })
    .select()
    .single();
  if (error) throw error;
  return data as LabRdSheet;
}

export async function updateLabRdSheet(
  id: string,
  userId: string,
  patch: { title?: string; content_md?: string },
): Promise<LabRdSheet> {
  const row: Record<string, unknown> = { updated_by: userId };
  if (patch.title !== undefined) row.title = patch.title.trim() || 'Untitled sheet';
  if (patch.content_md !== undefined) row.content_md = patch.content_md;
  const { data, error } = await supabase
    .from('lab_rd_sheets')
    .update(row)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as LabRdSheet;
}

export async function deleteLabRdSheet(id: string): Promise<void> {
  const { error } = await supabase.from('lab_rd_sheets').delete().eq('id', id);
  if (error) throw error;
}

export function defaultSheetTemplate(): string {
  return defaultSheetHtml();
}
