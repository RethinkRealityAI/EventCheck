// utils/resolveAttendeeCountry.ts
import { Attendee, Form } from '../types';

/**
 * Resolve an attendee's country code for dashboard display. Checks the
 * synthetic `_guest_country` answer key first (set only on BOGO free-guest
 * rows — documentation-only, never tied to a form field), then falls back
 * to the form's `country`-type field answer, if any. Returns the raw ISO
 * code (resolve to a display name with `getCountryName`); null when no
 * country is on file.
 */
export function resolveAttendeeCountryCode(
  attendee: Pick<Attendee, 'answers'>,
  form: Form | undefined,
): string | null {
  const answers = attendee.answers as Record<string, unknown> | undefined;

  const guestCountry = answers?.['_guest_country'];
  if (typeof guestCountry === 'string' && guestCountry) return guestCountry;

  if (!form) return null;
  const countryField = form.fields.find(f => f.type === 'country');
  if (!countryField) return null;

  const val = answers?.[countryField.id];
  return typeof val === 'string' && val ? val : null;
}
