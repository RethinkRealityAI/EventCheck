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
import { TicketsSummaryTile } from './TicketsSummaryTile';
import { RegisterModal } from './RegisterModal';
import TeamTable from '../../SponsorExhibitor/TeamTable';

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
      .filter((a) => a.paymentStatus === 'paid')
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

  const latestPaidAttendee = attendees.find((a) => a.paymentStatus === 'paid') ?? null;
  const latestAttendee = attendees[0] ?? null;

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-8">
        <VerifyEmailBanner />
        <div className="space-y-8">
          <WelcomeBlock profile={profile} latestAttendee={latestAttendee} staffOrg={staffOrg} />
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
          <AnnouncementsFeed />
        </div>
        <aside className="space-y-6">
          <CredentialCard profile={profile} attendee={latestPaidAttendee} />
          <TicketsSummaryTile />
          <QuickLinks />
        </aside>
      </div>
      {registerFormId && (
        <RegisterModal formId={registerFormId} onClose={handleModalClose} onSaveAndClose={handleSaveAndClose} />
      )}
    </>
  );
}
