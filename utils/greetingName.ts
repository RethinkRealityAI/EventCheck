/**
 * The name the portal header greets someone by: their first name, keeping a
 * leading honorific so "Dr. Adaeze Okafor" reads "Dr. Adaeze", not "Dr.".
 * Falls back to the part of the email before the @ when there is no name.
 */
const HONORIFIC = /^(dr|prof|mr|mrs|ms|mx)\.?$/i;

export function greetingName(fullName?: string | null, email?: string | null): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return (email ?? '').split('@')[0] || 'there';
  if (HONORIFIC.test(parts[0]) && parts.length > 1) return `${parts[0]} ${parts[1]}`;
  return parts[0];
}
