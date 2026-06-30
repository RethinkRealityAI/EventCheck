// Shared client-side form validation helpers (server still re-validates).

/** RFC-lite email check — good enough for client-side UX gating. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());
}

/**
 * Returns the ids of required fields that are missing/blank in `answers`.
 * A field counts as missing when its answer is undefined/null, an empty or
 * whitespace-only string, an empty array, or literal `false` (an unchecked
 * required consent toggle).
 */
export function validateRequiredAnswers(
  fields: { id: string; required?: boolean }[],
  answers: Record<string, any>,
): string[] {
  return fields
    .filter((f) => f.required)
    .filter((f) => {
      const v = answers[f.id];
      return (
        v === undefined ||
        v === null ||
        (typeof v === 'string' && v.trim() === '') ||
        (Array.isArray(v) && v.length === 0) ||
        v === false
      );
    })
    .map((f) => f.id);
}
