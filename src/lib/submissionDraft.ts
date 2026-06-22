import { SubmissionDraft } from './services/submissions';

const STORAGE_KEY = 'atlas_submission_form_draft';

export interface LocalSubmissionDraft extends SubmissionDraft {
  savedAt: string;
}

export function saveLocalSubmissionDraft(userId: string, draft: SubmissionDraft): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ userId, draft: { ...draft, savedAt: new Date().toISOString() } }),
    );
  } catch {
    // ignore quota errors
  }
}

export function loadLocalSubmissionDraft(userId: string): LocalSubmissionDraft | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId: string; draft: LocalSubmissionDraft };
    if (parsed.userId !== userId) return null;
    return parsed.draft;
  } catch {
    return null;
  }
}

export function clearLocalSubmissionDraft(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
