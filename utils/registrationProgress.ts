// Helpers for the stepped-registration localStorage persistence written by
// SteppedFormShell. The storage key pattern is the source of truth; keep it in
// sync with SteppedFormShell.storageKey.

export const PROGRESS_KEY_PREFIX = 'gansid-portal-stepper';

export function progressKey(formId: string, userId: string | null | undefined): string {
  return `${PROGRESS_KEY_PREFIX}:${formId}:${userId ?? 'anon'}`;
}

export interface SavedProgress {
  currentIndex: number;
  totalSteps: number;
  /** Timestamp of the most recent save (epoch ms), null if the payload doesn't carry one. */
  savedAt: number | null;
}

/**
 * Returns a lightweight summary of saved progress for a given form+user, or null
 * if there's nothing saved. Purely a read — never mutates.
 */
export function readSavedProgress(formId: string, userId: string | null | undefined): SavedProgress | null {
  try {
    const raw = localStorage.getItem(progressKey(formId, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed == null) return null;
    const currentIndex = typeof parsed.currentIndex === 'number' ? parsed.currentIndex : 0;
    // totalSteps isn't serialized today — SteppedFormShell just tracks the index.
    // Callers that know the form's step count compare currentIndex against it.
    return {
      currentIndex,
      totalSteps: 0,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : null,
    };
  } catch {
    return null;
  }
}

export function hasSavedProgress(formId: string, userId: string | null | undefined): boolean {
  return readSavedProgress(formId, userId) != null;
}

export function clearSavedProgress(formId: string, userId: string | null | undefined): void {
  try {
    localStorage.removeItem(progressKey(formId, userId));
  } catch {
    /* quota or privacy-mode errors — safe to ignore */
  }
}
