import { describe, it, expect } from 'vitest';
import {
  ADMIN_EMAIL_TEMPLATES,
  buildAttendeeVars,
  buildPortalUserVars,
  composeBodyContent,
  dedupeRecipients,
  defaultTemplateForPortalUser,
  findAlreadySentKeys,
  firstNameOf,
  renderAdminEmailHtml,
  templateOptionsFor,
  type BulkRecipient,
} from '../utils/adminEmailCompose';
import type { PortalUser } from '../services/storageService';
import type { Form } from '../types';

const ORIGIN = 'https://congress.example';

const congress: Form = {
  id: 'congress', title: 'GANSID Congress 2026', description: '', createdAt: '', status: 'active', fields: [],
  settings: { steps: [{}, {}, {}, {}, {}] } as any,
};
const gala: Form = { id: 'gala', title: 'Hope Gala', description: '', createdAt: '', status: 'active', fields: [] };

function user(over: Partial<PortalUser> = {}): PortalUser {
  return {
    userId: 'u1', email: 'Dana@Example.com', fullName: 'Dana Osei', role: 'attendee', signupDate: '',
    hasTicket: false, ticketCount: 0, paidTicketCount: 0, freeTicketCount: 0, hasPendingPayment: false,
    mostRecentTicketFormId: null, mostRecentTicketFormTitle: null, draft: null, lastActivityAt: '',
    ...over,
  };
}

describe('defaultTemplateForPortalUser', () => {
  it('reminds someone with a saved draft', () => {
    expect(defaultTemplateForPortalUser(user({ draft: { formId: 'congress', formTitle: null, currentIndex: 1, totalSteps: null, updatedAt: '' } }))).toBe('reminder');
  });
  it('never invites a registered (paid OR free) person to register', () => {
    expect(defaultTemplateForPortalUser(user({ ticketCount: 1 }))).toBe('blank');
  });
  it('invites someone who has not started', () => {
    expect(defaultTemplateForPortalUser(user())).toBe('invitation');
  });
});

describe('templateOptionsFor', () => {
  it('offers resume/invite templates only to portal signups', () => {
    expect(templateOptionsFor('signups').map(o => o.key)).toEqual(['reminder', 'invitation', 'announcement', 'blank']);
    expect(templateOptionsFor('attendees').map(o => o.key)).toEqual(['announcement', 'blank']);
  });
});

describe('buildPortalUserVars', () => {
  it('resumes the draft form and reports the step out of the form\'s steps', () => {
    const vars = buildPortalUserVars(
      user({ draft: { formId: 'congress', formTitle: null, currentIndex: 1, totalSteps: null, updatedAt: '' } }),
      [gala, congress],
      'congress',
      ORIGIN,
    );
    expect(vars.resume_url).toBe(`${ORIGIN}/#/form/congress`);
    expect(vars.link).toBe(vars.resume_url);
    expect(vars.step).toBe('2');
    expect(vars.total_steps).toBe('5');
    expect(vars.event).toBe('GANSID Congress 2026');
    expect(vars.signup_url).toBe(`${ORIGIN}/#/`);
    expect(vars.first_name).toBe('Dana');
  });

  it('falls back to the chosen event form and a 5-step default without a draft', () => {
    const vars = buildPortalUserVars(user({ fullName: '' }), [gala], 'gala', ORIGIN);
    expect(vars.resume_url).toBe(`${ORIGIN}/#/form/gala`);
    expect(vars.step).toBe('1');
    expect(vars.total_steps).toBe('5');
    // No name on file → the mailbox part of the address, never an empty greeting.
    expect(vars.name).toBe('Dana');
  });
});

describe('buildAttendeeVars', () => {
  it('names the event from the form and carries the org for delegates', () => {
    const vars = buildAttendeeVars(
      { name: 'Amara Bello', email: 'amara@pfizer.com', formId: 'congress', formTitle: 'stale title' },
      [congress],
      { orgName: 'Pfizer, Inc', origin: ORIGIN },
    );
    expect(vars.event).toBe('GANSID Congress 2026');
    expect(vars.org_name).toBe('Pfizer, Inc');
    expect(vars.first_name).toBe('Amara');
    expect(vars.link).toMatch(new RegExp(`^${ORIGIN}/#/`));
  });

  it('uses the snapshot title when the form is gone', () => {
    const vars = buildAttendeeVars({ name: '', email: 'x@y.com', formId: 'missing', formTitle: 'Old Event' }, [], { origin: ORIGIN });
    expect(vars.event).toBe('Old Event');
    expect(vars.name).toBe('x');
    expect(vars.org_name).toBe('');
  });
});

describe('rendering', () => {
  const fields = { ...ADMIN_EMAIL_TEMPLATES.reminder.fields };
  const vars = { name: 'Dana <Osei>', event: 'GANSID', step: '2', total_steps: '5', resume_url: 'https://x.test/#/form/congress' };

  it('merges placeholders and escapes text that lands in markup', () => {
    const body = composeBodyContent(fields, vars, { previewMode: true });
    expect(body).toContain('Hi Dana &lt;Osei&gt;');
    expect(body).toContain('step 2 of 5');
    expect(body).toContain('href="https://x.test/#/form/congress"');
  });

  it('omits the button when either CTA field is empty', () => {
    expect(composeBodyContent({ ...fields, ctaLabel: '' }, vars, { previewMode: true })).not.toContain('class="button"');
    expect(composeBodyContent({ ...fields, ctaUrl: '' }, vars, { previewMode: true })).not.toContain('class="button"');
  });

  it('adds a tracked click-through and open pixel only for real sends', () => {
    const preview = renderAdminEmailHtml(fields, vars, { previewMode: true, trackingId: 'abc' });
    expect(preview).not.toContain('track-email');
    const send = renderAdminEmailHtml(fields, vars, { trackingId: 'abc' });
    expect(send).toContain('type=click');
    expect(send).toContain('type=open');
    expect(send).toContain('id=abc');
  });
});

describe('dedupeRecipients', () => {
  const r = (key: string, email: string): BulkRecipient => ({ key, email, name: key, vars: {} });

  it('keeps one row per inbox, first occurrence wins, case- and space-insensitive', () => {
    const out = dedupeRecipients([r('a', 'Dana@Example.com'), r('b', ' dana@example.com '), r('c', 'other@example.com')]);
    expect(out.recipients.map(x => x.key)).toEqual(['a', 'c']);
    expect(out.duplicates.map(x => x.key)).toEqual(['b']);
    expect(out.invalid).toEqual([]);
  });

  it('sets aside rows with no usable address instead of failing the run', () => {
    const out = dedupeRecipients([r('slot', ''), r('bad', 'not-an-email'), r('ok', 'ok@example.com')]);
    expect(out.invalid.map(x => x.key)).toEqual(['slot', 'bad']);
    expect(out.recipients.map(x => x.key)).toEqual(['ok']);
  });

  it('trims the address it keeps', () => {
    const out = dedupeRecipients([r('a', '  a@b.co ')]);
    expect(out.recipients[0].email).toBe('a@b.co');
  });

  it('gives a shared inbox to its owner, whichever row was listed first', () => {
    // A TSCS purchaser and their free companion are inserted in one statement
    // with the same registered_at, so list order was effectively arbitrary —
    // which is how a booking could go out addressed "Hello - -".
    const companion: BulkRecipient = { key: 'companion', email: 'buyer@example.com', name: '- -', vars: {}, priority: 2 };
    const buyer: BulkRecipient = { key: 'buyer', email: 'buyer@example.com', name: 'Karan Mehta', vars: {}, priority: 1 };
    for (const order of [[companion, buyer], [buyer, companion]]) {
      const out = dedupeRecipients(order);
      expect(out.recipients.map(x => x.key)).toEqual(['buyer']);
      expect(out.duplicates.map(x => x.key)).toEqual(['companion']);
    }
  });

  it('still falls back to arrival order when nobody claims the inbox', () => {
    const out = dedupeRecipients([r('a', 'x@example.com'), r('b', 'x@example.com')]);
    expect(out.recipients.map(x => x.key)).toEqual(['a']);
  });

  it('preserves the order recipients were given in', () => {
    const out = dedupeRecipients([r('a', 'a@x.com'), r('b', 'b@x.com'), r('c', 'c@x.com')]);
    expect(out.recipients.map(x => x.key)).toEqual(['a', 'b', 'c']);
  });

  it('never spends a send on an unclaimed seat placeholder', () => {
    // `guest-…@placeholder.invalid` passes every syntax check and reaches
    // nobody — it marks a seat, not a person.
    const out = dedupeRecipients([r('seat', 'guest-abc@placeholder.invalid'), r('ok', 'ok@example.com')]);
    expect(out.invalid.map(x => x.key)).toEqual(['seat']);
    expect(out.recipients.map(x => x.key)).toEqual(['ok']);
  });
});

describe('firstNameOf', () => {
  it('takes the first word, or the mailbox when there is no name', () => {
    expect(firstNameOf('Dana Osei', 'd@x.com')).toBe('Dana');
    expect(firstNameOf('', 'dana.osei@x.com')).toBe('dana.osei');
  });
});

describe('findAlreadySentKeys', () => {
  const prior = new Map([
    ['sent@x.co', { subject: 'Finish your registration', sentAt: '2026-09-15T10:00:00Z' }],
    ['other@x.co', { subject: 'A different campaign', sentAt: '2026-09-15T10:00:00Z' }],
  ]);

  it('flags an inbox that already got this exact subject', () => {
    const hit = findAlreadySentKeys(
      [{ key: 'a', email: 'sent@x.co', subject: 'Finish your registration' }],
      prior,
    );
    expect([...hit]).toEqual(['a']);
  });

  it('leaves an inbox whose last email was a different campaign', () => {
    const hit = findAlreadySentKeys(
      [{ key: 'b', email: 'other@x.co', subject: 'Finish your registration' }],
      prior,
    );
    expect(hit.size).toBe(0);
  });

  it('matches regardless of address case, padding, and subject whitespace', () => {
    const hit = findAlreadySentKeys(
      [{ key: 'c', email: '  SENT@X.co ', subject: 'Finish   your\nregistration  ' }],
      prior,
    );
    expect([...hit]).toEqual(['c']);
  });

  it('compares the MERGED subject, so two recipients of one placeholder subject can differ', () => {
    // `Hi {{name}}, finish up` renders per person; only the one who was
    // actually sent that exact line is flagged.
    const withNames = new Map([
      ['ada@x.co', { subject: 'Hi Ada, finish up', sentAt: '2026-09-15T10:00:00Z' }],
    ]);
    const hit = findAlreadySentKeys(
      [
        { key: 'ada', email: 'ada@x.co', subject: 'Hi Ada, finish up' },
        { key: 'bo', email: 'bo@x.co', subject: 'Hi Bo, finish up' },
      ],
      withNames,
    );
    expect([...hit]).toEqual(['ada']);
  });

  it('is inert when no prior sends could be loaded', () => {
    const entries = [{ key: 'a', email: 'sent@x.co', subject: 'Finish your registration' }];
    expect(findAlreadySentKeys(entries, undefined).size).toBe(0);
    expect(findAlreadySentKeys(entries, null).size).toBe(0);
    expect(findAlreadySentKeys(entries, new Map()).size).toBe(0);
  });

  it('never flags someone with no logged send at all', () => {
    const hit = findAlreadySentKeys(
      [{ key: 'new', email: 'never@x.co', subject: 'Finish your registration' }],
      prior,
    );
    expect(hit.size).toBe(0);
  });
});
