import { describe, expect, it } from 'vitest';
import {
  isPlaceholderGuestName,
  resolveAttendeeDisplayName,
  resolveNameFromFormFields,
} from '../utils/resolveAttendeeDisplayName';
import type { Attendee, Form } from '../types';

describe('resolveAttendeeDisplayName', () => {
  const form: Form = {
    id: 'f1',
    title: 'Test Event',
    description: '',
    formType: 'event',
    status: 'active',
    showInPortal: false,
    createdAt: '',
    fields: [
      { id: 'f_fname', type: 'text', label: 'First Name', required: true },
      { id: 'f_lname', type: 'text', label: 'Last Name', required: true },
      { id: 'f_email', type: 'email', label: 'Email', required: true },
    ],
    settings: {},
  };

  it('prefers split first/last name from form answers over top-level name', () => {
    const attendee: Attendee = {
      id: 'a1',
      formId: 'f1',
      formTitle: 'Test Event',
      name: 'Old Dashboard Name',
      email: 'x@example.com',
      ticketType: 'General',
      registeredAt: '2026-01-01',
      checkedInAt: null,
      qrPayload: '{}',
      answers: { f_fname: 'Jane', f_lname: 'Doe' },
    };
    expect(resolveAttendeeDisplayName(attendee, form)).toBe('Jane Doe');
  });

  it('falls back to attendee.name when answers are empty', () => {
    const attendee: Attendee = {
      id: 'a2',
      formId: 'f1',
      formTitle: 'Test Event',
      name: 'Stored Name',
      email: 'x@example.com',
      ticketType: 'General',
      registeredAt: '2026-01-01',
      checkedInAt: null,
      qrPayload: '{}',
      answers: {},
    };
    expect(resolveAttendeeDisplayName(attendee, form)).toBe('Stored Name');
  });

  it('uses _guest_name metadata when top-level name is a placeholder', () => {
    const attendee: Attendee = {
      id: 'a3',
      formId: 'f1',
      formTitle: 'Test Event',
      name: 'Guest Ticket #2',
      email: 'x@example.com',
      ticketType: 'Guest',
      registeredAt: '2026-01-01',
      checkedInAt: null,
      qrPayload: '{}',
      answers: { _guest_name: 'Sam Smith' },
    };
    expect(resolveAttendeeDisplayName(attendee, form)).toBe('Sam Smith');
  });

  it('detects placeholder guest names', () => {
    expect(isPlaceholderGuestName('Guest Ticket #3')).toBe(true);
    expect(isPlaceholderGuestName('Jane Doe')).toBe(false);
  });
});

describe('resolveNameFromFormFields', () => {
  it('concatenates first and last name fields', () => {
    const fields = [
      { id: 'fn', type: 'text' as const, label: 'First Name', required: true },
      { id: 'ln', type: 'text' as const, label: 'Last Name', required: true },
    ];
    expect(resolveNameFromFormFields(fields, { fn: 'A', ln: 'B' })).toBe('A B');
  });
});
