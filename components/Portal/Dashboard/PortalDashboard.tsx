import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../AuthContext';
import { StaffCompletionCard } from './StaffCompletionCard';
import {
  getAttendeesForUser,
  getPortalForms,
  getStaffForPrimary,
  getAttendeesByIds,
  getAttendee,
  updateAttendeeFields,
  removeStaffMember,
  relinkAttendeeToAccountByEmail,
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
import { canAssignCategory, isPendingStaff, staffCategoryLabel, type StaffCategory } from '../../../utils/teamTickets';

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

  // A staff member who signs up instead of clicking their invite link had NO
  // route into the claim form: their row is payment_status='paid', so
  // AvailableFormsGrid treats that form as already completed and the dashboard
  // told them "You're all registered — nothing left on your list" while their
  // details were never collected. Surface their own pending row instead.
  //
  // Deliberately guest_type-based, unlike the ?ref= claim path which is
  // structural. The two answer different questions: the claim path must ACCEPT
  // anyone arriving with a link (including rows written with guest_type=NULL),
  // whereas this CTA should only prompt people who genuinely still owe us
  // details. A NULL row means the organisation already supplied everything, so
  // nagging them to "finish" would be wrong.
  const pendingStaffRow = useMemo(
    () =>
      attendees.find(
        (a) =>
          !a.isPrimary &&
          (a.guestType === 'staff-pending' || a.guestType === 'exhibitor-staff-pending'),
      ) ?? null,
    [attendees],
  );

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

  /**
   * Save an edit to one staff seat, then tell that person about it.
   *
   * Three things were wrong here and each had a visible consequence:
   *
   *  1. It always sent a "complete your registration" invite, even to someone
   *     already registered — whose claim link then dead-ends on the
   *     already-completed panel. A registered person gets their TICKET.
   *  2. Changing the email left `user_id` pointing at the previous account, so
   *     the ticket stayed in the old person's portal and never reached the new
   *     one. The signup trigger cannot fix that after the fact.
   *  3. A category change was written with no reference to the booking's seat
   *     quota, so a gold sponsor (8 Hall-Only + 4 Full Congress) could put all
   *     twelve of their people on Full Congress.
   *
   * Throws on refusal or failure so the caller can show it; the roster is
   * refreshed on every exit path that changed something.
   */
  const handleFillIn = async (
    id: string,
    patch: { name: string; email: string; category: string }
  ) => {
    const existing = await getAttendee(id);
    if (!existing) throw new Error('That person is no longer on your roster.');

    const nextCategory = patch.category as StaffCategory;
    const previousCategory = (existing.answers as any)?.staffCategory;
    if (nextCategory !== previousCategory && (nextCategory === 'hall_only' || nextCategory === 'full_access')) {
      const verdict = canAssignCategory(userPrimary, staffRows, id, nextCategory);
      if (!verdict.ok) throw new Error(verdict.reason || 'That seat type is full on your booking.');
    }

    // Merge `staffCategory` into the existing `answers` blob — the storage
    // mapper overwrites the column as a whole, so read-modify-write.
    const mergedAnswers = {
      ...(existing?.answers || {}),
      staffCategory: patch.category,
    };
    await updateAttendeeFields(id, {
      name: patch.name,
      email: patch.email,
      answers: mergedAnswers,
    });

    // Declared before anything else that can fail: the row has already been
    // written, so every remaining exit path — success, refusal or thrown
    // error — has to leave the roster on screen matching the database, or the
    // next edit is made against stale seat counts.
    const refresh = async () => {
      if (userPrimary) setStaffRows(await getStaffForPrimary(userPrimary.id));
    };

    const emailChanged =
      (patch.email || '').trim().toLowerCase() !== (existing.email || '').trim().toLowerCase();
    if (emailChanged) {
      try {
        await relinkAttendeeToAccountByEmail(id, patch.email);
      } catch (err) {
        await refresh();
        throw err;
      }
    }

    const staffFormId = existing?.formId;
    if (!staffFormId) {
      console.warn('handleFillIn: staff attendee has no formId; cannot construct completeUrl', { id });
      await refresh();
      return;
    }

    const categoryLabel = staffCategoryLabel(patch.category);

    // supabase.functions.invoke RESOLVES on a failed send, returning { error }
    // — so an unchecked call reports success to the sponsor for mail that never
    // left. Every other caller in this codebase destructures and checks it.
    const send = async (body: Record<string, unknown>) => {
      const { error } = await supabase.functions.invoke('send-ticket-email', { body });
      if (error) throw new Error('Saved, but the email could not be sent. Try again, or send them the ticket yourself.');
    };

    try {
      if (isPendingStaff(existing)) {
        // Still owes us their own details — invite them to finish. The
        // completeUrl MUST point at the public registration form so they land
        // on PublicRegistration's pending-claim flow with their info
        // pre-filled; `/` would drop them on the portal signup page instead.
        await send({
          mode: 'staff-invite',
          to: patch.email,
          name: patch.name,
          purchaser: userPrimary?.companyInfo?.contactName || '',
          orgName: userPrimary?.companyInfo?.orgName || '',
          category: categoryLabel,
          completeUrl: `${window.location.origin}/#/form/${staffFormId}?ref=${id}`,
          signupUrl: `${window.location.origin}/#/`,
          eventName: CURRENT_SITE.displayName || 'the Congress',
        });
      } else {
        // Already registered: send the ticket that now carries the corrected
        // details, not an invitation to do something they have done.
        await send({
          mode: 'staff-claim-completed',
          to: patch.email,
          name: patch.name,
          orgName: userPrimary?.companyInfo?.orgName || '',
          eventName: CURRENT_SITE.displayName || 'the Congress',
          origin: window.location.origin,
          attendeeId: id,
        });
      }
    } finally {
      // The save already happened. Whatever the mail did, the roster on screen
      // must match the database, or the next edit is made against stale data.
      await refresh();
    }
  };

  /** Free a seat. The only way to go over quota is to remove someone first. */
  const handleRemoveStaff = async (id: string) => {
    await removeStaffMember(id);
    if (userPrimary) setStaffRows(await getStaffForPrimary(userPrimary.id));
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
                onRemove={handleRemoveStaff}
              />
            )}
            {pendingStaffRow && (
              <StaffCompletionCard
                row={pendingStaffRow}
                orgName={
                  (primariesById[pendingStaffRow.primaryAttendeeId ?? '']?.companyInfo as any)?.orgName
                  || primariesById[pendingStaffRow.primaryAttendeeId ?? '']?.name
                  || undefined
                }
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
