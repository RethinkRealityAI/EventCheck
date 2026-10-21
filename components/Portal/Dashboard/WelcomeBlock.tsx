import type { Profile, Attendee } from '../../../types';
import { usePortalContent } from '../content/ContentProvider';
import { sanitizeHtml } from '../../../utils/sanitizeHtml';
import { isCompletedPaymentStatus } from '../../../utils/portalUserStatus';

interface Props {
  profile: Profile;
  latestAttendee: Attendee | null;
  /** Derived org name when the user is staff of a sponsor/exhibitor org —
   *  triggers the "Staff — {OrgName}" pill + "Attending with …" sub-line. */
  staffOrg?: string | null;
}

/**
 * Status line under the header on the portal home. The greeting itself lives
 * in the blue header (PortalLayout) and the old "Up Next" countdown tile was
 * replaced by the live Programme card (HomeTiles), so this renders only what a
 * delegate still needs to know: the CMS subheading if an admin set one, an
 * unfinished registration or payment, or the org they attend with. Renders
 * nothing for a fully registered delegate.
 */
export function WelcomeBlock({ latestAttendee, staffOrg }: Props) {
  const { intro } = usePortalContent();
  const customSubHtml = intro?.subheadingHtml?.trim();
  const statusLine = !latestAttendee
    ? 'Complete your Congress registration to receive your credential.'
    // Free registrations are complete registrations — telling a comped or
    // invited delegate we're "awaiting payment" is both wrong and alarming.
    : isCompletedPaymentStatus((latestAttendee as any).paymentStatus)
    ? null
    : 'Awaiting payment confirmation for your Congress registration.';

  if (!customSubHtml && !statusLine && !staffOrg) return null;

  return (
    <div className="space-y-2">
      {staffOrg && (
        <span className="inline-flex items-center gap-2 rounded-full bg-gansid-secondary/10 px-3 py-1 text-xs font-semibold text-gansid-secondary">
          Staff &mdash; {staffOrg}
        </span>
      )}
      {(customSubHtml || statusLine) && (
        <p className="font-body text-[15px] text-gansid-on-surface/70">
          {customSubHtml ? (
            <span
              className="[&_p]:inline [&_a]:text-gansid-secondary [&_a]:underline"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(customSubHtml) }}
            />
          ) : (
            statusLine
          )}
        </p>
      )}
      {staffOrg && (
        <p className="font-body text-sm text-gansid-on-surface/70">
          Attending with <strong>{staffOrg}</strong>
        </p>
      )}
    </div>
  );
}
