import { supabase } from './supabaseClient';

/**
 * Server-side draft of an in-progress stepped registration, so users can
 * Save & Close on one device and resume on another.
 *
 * Distinct from the localStorage version in `utils/registrationProgress.ts`:
 *  - localStorage = implicit, per-browser, updated on every keystroke
 *  - DB draft     = explicit, cross-device, updated only when the user
 *                   clicks "Save & Close" or advances steps
 */

export interface DraftState {
  answers: Record<string, any>;
  currentIndex: number;
  registrationMode?: 'individual' | 'group' | null;
  groupSize?: number;
  groupHasAllInfo?: boolean;
  groupMembers?: any[];
  savedAt: number;
}

export async function loadDraft(formId: string): Promise<DraftState | null> {
  const { data, error } = await supabase
    .from('registration_drafts')
    .select('state, updated_at')
    .eq('form_id', formId)
    .maybeSingle();
  if (error) {
    console.warn('loadDraft failed', error);
    return null;
  }
  if (!data) return null;
  const state = data.state as DraftState;
  // If the row's state didn't carry savedAt, trust the row's updated_at instead.
  if (!state.savedAt && data.updated_at) {
    state.savedAt = new Date(data.updated_at).getTime();
  }
  return state;
}

export async function saveDraft(userId: string, formId: string, state: DraftState): Promise<void> {
  const { error } = await supabase
    .from('registration_drafts')
    .upsert(
      { user_id: userId, form_id: formId, state: state as any },
      { onConflict: 'user_id,form_id' },
    );
  if (error) console.warn('saveDraft failed', error);
}

export async function clearDraft(formId: string): Promise<void> {
  const { error } = await supabase
    .from('registration_drafts')
    .delete()
    .eq('form_id', formId);
  if (error) console.warn('clearDraft failed', error);
}

/** Returns a map of formId -> draft metadata for every draft owned by the current user. */
export async function listDraftSummaries(): Promise<Record<string, { currentIndex: number; savedAt: number }>> {
  const { data, error } = await supabase
    .from('registration_drafts')
    .select('form_id, state, updated_at');
  if (error || !data) {
    if (error) console.warn('listDraftSummaries failed', error);
    return {};
  }
  const out: Record<string, { currentIndex: number; savedAt: number }> = {};
  for (const row of data) {
    const s = (row as any).state as DraftState | null;
    out[(row as any).form_id] = {
      currentIndex: s?.currentIndex ?? 0,
      savedAt: s?.savedAt ?? new Date((row as any).updated_at).getTime(),
    };
  }
  return out;
}
