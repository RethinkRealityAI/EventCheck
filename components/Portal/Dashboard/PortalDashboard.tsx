import { useEffect, useState } from 'react';
import { useAuth } from '../../AuthContext';
import { getAttendeesForUser, getPortalForms } from '../../../services/storageService';
import type { Attendee, Form } from '../../../types';
import { WelcomeBlock } from './WelcomeBlock';
import { VerifyEmailBanner } from './VerifyEmailBanner';
import { AvailableFormsGrid } from './AvailableFormsGrid';
import { CredentialCard } from './CredentialCard';
import { AnnouncementsFeed } from './AnnouncementsFeed';
import { QuickLinks } from './QuickLinks';
import { RegisterModal } from './RegisterModal';

export function PortalDashboard() {
  const { profile, user } = useAuth();
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [forms, setForms] = useState<Form[]>([]);
  const [registerFormId, setRegisterFormId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!user || !profile || !user.email) return;
    getAttendeesForUser(user.id, user.email).then(setAttendees);
    getPortalForms().then(setForms);
  }, [user, profile, refreshKey]);

  const handleModalClose = () => {
    setRegisterFormId(null);
    setRefreshKey((k) => k + 1);
  };

  if (!profile || !user) return null;

  const latestPaidAttendee = attendees.find((a) => a.paymentStatus === 'paid') ?? null;
  const latestAttendee = attendees[0] ?? null;

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-8">
        <VerifyEmailBanner />
        <div className="space-y-8">
          <WelcomeBlock profile={profile} latestAttendee={latestAttendee} />
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
          <QuickLinks />
        </aside>
      </div>
      {registerFormId && (
        <RegisterModal formId={registerFormId} onClose={handleModalClose} />
      )}
    </>
  );
}
