import { useEffect, useState } from 'react';
import { useAuth } from '../../AuthContext';
import { getAttendeesForUser, getPortalForms } from '../../../services/storageService';
import type { Attendee, Form } from '../../../types';
import { WelcomeBlock } from './WelcomeBlock';
import { AvailableFormsGrid } from './AvailableFormsGrid';
import { CredentialCard } from './CredentialCard';
import { AnnouncementsFeed } from './AnnouncementsFeed';
import { QuickLinks } from './QuickLinks';

export function PortalDashboard() {
  const { profile, user } = useAuth();
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [forms, setForms] = useState<Form[]>([]);

  useEffect(() => {
    if (!user || !profile || !user.email) return;
    getAttendeesForUser(user.id, user.email).then(setAttendees);
    getPortalForms().then(setForms);
  }, [user, profile]);

  if (!profile || !user) return null;

  const latestPaidAttendee = attendees.find((a) => a.paymentStatus === 'paid') ?? null;
  const latestAttendee = attendees[0] ?? null;
  const roleOrder = profile.role === 'admin' ? 'attendee' : (profile.role as 'attendee' | 'exhibitor' | 'sponsor');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-8">
      <div className="space-y-8">
        <WelcomeBlock profile={profile} latestAttendee={latestAttendee} />
        <AvailableFormsGrid forms={forms} userAttendees={attendees} roleOrder={roleOrder} />
        <AnnouncementsFeed />
      </div>
      <aside className="space-y-6">
        <CredentialCard profile={profile} attendee={latestPaidAttendee} />
        <QuickLinks />
      </aside>
    </div>
  );
}
