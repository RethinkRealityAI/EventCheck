import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../AuthContext';
import {
  getAttendeesForUser,
  getPortalForms,
  getStaffForPrimary,
  getAttendeesByIds,
  getAttendee,
  updateAttendeeFields,
} from '../../../services/storageService';
import { supabase } from '../../../services/supabaseClient';
import { CURRENT_SITE } from '../../../config/sites';
import type { Attendee, Form } from '../../../types';
import { useNotifications } from '../../NotificationSystem';
import { WelcomeBlock } from './WelcomeBlock';
import { VerifyEmailBanner } from './VerifyEmailBanner';
import { AvailableFormsGrid } from './AvailableFormsGrid';
import { CredentialCard } from './CredentialCard';
import { AnnouncementsFeed } from './AnnouncementsFeed';
import { QuickLinks } from './QuickLinks';
import { PortalQuickNav } from './PortalQuickNav';
import { TicketsSummaryTile } from './TicketsSummaryTile';
import { RegisterModal } from './RegisterModal';
import TeamTable from '../../SponsorExhibitor/TeamTable';
import { isCompletedPaymentStatus } from '../../../utils/portalUserStatus';

export function PortalDashboard() {
  const { profile, user } = useAuth();
  const { showNotification } = useNotifications();
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [forms, setForms] = useState<Form[]>([]);
  const [staffRows, setStaffRows] = useState<Attendee[]>([]);
  const [primariesById, setPrimariesById] = useState<Record<string, Attendee>>({});
  const [registerFormId, setRegisterFormId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!user || !profile || !user.email) return;
    getAttendeesForUser(user.id, user.email).then(setAttendees);
    getPortalForms().then(setForms);
  }, [user, profile, refreshKey]);

  // Identify the user's primary submission for a sponsor/exhibitor org —
  // drives the TeamTable. We look only at rows the user themselves owns as
  // `isPrimary` that carry a sponsor or exhibitor flag.
  const userPrimary = useMemo(
    () =>
      attendees.find(
        (a) => a.isPrimary && (a.sponsorTier || a.exhibitorBoothType)
      ) ?? null,
    [attendees]
  );

  useEffect(() => {
    if (!userPrimary) {
      setStaffRows([]);
      return;
    }
    getStaffForPrimary(userPrimary.id).then(setStaffRows);
  }, [userPrimary, refreshKey]);

  // Resolve primaries referenced by any of the user's attendee rows. This
  // powers the derived "Staff — {OrgName}" badge when the user is a staff
  // member of a sponsor/exhibitor org (not a primary themselves).
  useEffect(() => {
    const ids = Array.from(
      new Set(
        attendees
          .map((a) => a.primaryAttendeeId)
          .filter((v): v is string => !!v)
      )
    );
    if (!ids.length) {
      setPrimariesById({});
      return;
    }
    getAttendeesByIds(ids).then((list) => {
      setPrimariesById(
        Object.fromEntries(list.map((p) => [p.id, p]))
      );
    });
  }, [attendees]);

  const staffOrg = useMemo<string | null>(() => {
    if (userPrimary) return null; // user IS a primary, not staff
    const paid = attendees
      .filter((a) => isCompletedPaymentStatus(a.paymentStatus))
      .slice()
      .sort((a, b) =>
        (b.registeredAt || '').localeCompare(a.registeredAt || '')
      )[0];
    if (!paid?.primaryAttendeeId) return null;
    const p = primariesById[paid.primaryAttendeeId];
    if (!p) return null;
    if (p.sponsorTier || p.exhibitorBoothType) {
      return p.companyInfo?.orgName || null;
    }
    return null;
  }, [attendees, primariesById, userPrimary]);

  const handleFillIn = async (
    id: string,
    patch: { name: string; email: string; category: string }
  ) => {
    // Merge `staffCategory` into the existing `answers` blob — the storage
    // mapper overwrites the column as a whole, so read-modify-write.
    const existing = await getAttendee(id);
    const mergedAnswers = {
      ...(existing?.answers || {}),
      staffCategory: patch.category,
    };
    await updateAttendeeFields(id, {
      name: patch.name,
      email: patch.email,
      answers: mergedAnswers,
    });

    // Fire a fresh staff-invite email (bypasses `sendTicketEmail` because
    // that helper's argument shape doesn't cover the multi-mode body).
    const categoryLabel =
      patch.category === 'hall_only'
        ? 'Hall-Only'
        : patch.category === 'full_access'
        ? 'Full-Access'
        : 'Sponsor Seat';
    // The completeUrl MUST point at the public registration form so the staff
    // member lands on PublicRegistration's pending-claim flow with their info
    // pre-filled. Pointing at `/` would land them on the GANSID portal
    // Landing/signup page (the bug we're fixing). The signupUrl (still `/`)
    // is intentionally a separate optional "create a portal account" link.
    const staffFormId = existing?.formId;
    if (!staffFormId) {
      console.warn('handleFillIn: staff attendee has no formId; cannot construct completeUrl', { id });
      if (userPrimary) {
        setStaffRows(await getStaffForPrimary(userPrimary.id));
      }
      return;
    }
    await supabase.functions.invoke('send-ticket-email', {
      body: {
        mode: 'staff-invite',
        to: patch.email,
        name: patch.name,
        purchaser: userPrimary?.companyInfo?.contactName || '',
        orgName: userPrimary?.companyInfo?.orgName || '',
        category: categoryLabel,
        completeUrl: `${window.location.origin}/#/form/${staffFormId}?ref=${id}`,
        signupUrl: `${window.location.origin}/#/`,
        eventName: CURRENT_SITE.displayName || 'the Congress',
      },
    });

    if (userPrimary) {
      setStaffRows(await getStaffForPrimary(userPrimary.id));
    }
  };

  const handleModalClose = () => {
    setRegisterFormId(null);
    setRefreshKey((k) => k + 1);
  };

  const handleSaveAndClose = () => {
    setRegisterFormId(null);
    setRefreshKey((k) => k + 1);
    showNotification('Progress saved — resume anytime from your portal.', 'success');
  };

  if (!profile || !user) return null;

  // Completed means paid OR free. Matching only 'paid' left invited contacts,
  // BOGO guests and comped speakers looking at an empty CredentialCard — no QR,
  // no ticket — despite holding a valid registration.
  const latestPaidAttendee = attendees.find((a) => isCompletedPaymentStatus(a.paymentStatus)) ?? null;
  const latestAttendee = attendees[0] ?? null;

  return (
    <>
      {/* pb on mobile keeps content clear of the floating Quick Access bar */}
      <div className="pb-24 lg:pb-0">
        <VerifyEmailBanner />
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1.7fr_1fr] xl:gap-10">
          <div className="space-y-8 min-w-0">
            {/* Greeting stays at the very top as the first thing. */}
            <WelcomeBlock profile={profile} latestAttendee={latestAttendee} staffOrg={staffOrg} />
            {/* Announcements right after the greeting — prominent, above the forms. */}
            <AnnouncementsFeed />
            {userPrimary && (
              <TeamTable
                primary={userPrimary}
                staff={staffRows}
                onFillIn={handleFillIn}
              />
            )}
            <AvailableFormsGrid
              forms={forms}
              userAttendees={attendees}
              role={profile.role}
              userId={user.id}
              onStartRegistration={(id, _opts) => setRegisterFormId(id)}
            />
          </div>
          <aside className="space-y-6 lg:sticky lg:top-24">
            {/* Credential card is desktop-only — on mobile the header credential
                pill (PortalLayout) carries the standing, and the card would push
                the important content down. */}
            <div className="hidden lg:block">
              <CredentialCard profile={profile} attendee={latestPaidAttendee} />
            </div>
            <TicketsSummaryTile />
            {/* Desktop sidebar Quick Access; on mobile the floating nav takes over */}
            <div className="hidden lg:block">
              <QuickLinks />
            </div>
          </aside>
        </div>
      </div>
      <PortalQuickNav />
      {registerFormId && (
        <RegisterModal formId={registerFormId} onClose={handleModalClose} onSaveAndClose={handleSaveAndClose} />
      )}
    </>
  );
}
