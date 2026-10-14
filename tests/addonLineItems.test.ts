import { describe, expect, it } from 'vitest';
import { matchAddonLineItems } from '../supabase/functions/_shared/addonLineItems';

const ADDONS = [{ id: 'networking', name: 'Networking Reception' }];

describe('matchAddonLineItems', () => {
  it('gives a solo order’s add-on to the registrant', () => {
    const r = matchAddonLineItems(
      ['GANSID Congress 2026 — Physicians (Tier 1, Regular)', 'GANSID Congress 2026 — Networking Reception'],
      ADDONS,
      [{ id: 'a', name: 'Jane Doe', isPrimary: true }],
    );
    expect(r.byAttendee).toEqual({ a: ['networking'] });
    expect(r.unmatched).toEqual([]);
  });

  it('gives each group member their own add-on by name', () => {
    const r = matchAddonLineItems(
      [
        'GANSID — Physicians (Tier 1, Regular) — Jane Doe',
        'GANSID — Networking Reception — Jane Doe',
        'GANSID — Nurses (Tier 1, Regular) — Dr. Sam Ode',
        'GANSID — Networking Reception — Sam Ode',
      ],
      ADDONS,
      [
        { id: 'a', name: 'Jane Doe', isPrimary: true },
        { id: 'b', name: 'Dr. Sam Ode', isPrimary: false },
        { id: 'c', name: 'Kim Lee', isPrimary: false },
      ],
    );
    expect(r.byAttendee).toEqual({ a: ['networking'], b: ['networking'] });
  });

  it('maps the "Registrant 1" placeholder to the purchaser and reports anyone it cannot place', () => {
    const r = matchAddonLineItems(
      ['GANSID — Networking Reception — Registrant 1', 'GANSID — Networking Reception — Registrant 2'],
      ADDONS,
      [{ id: 'a', name: 'Jane Doe', isPrimary: true }, { id: 'b', name: 'Guest Ticket #2', isPrimary: false }],
    );
    expect(r.byAttendee).toEqual({ a: ['networking'] });
    expect(r.unmatched).toEqual(['GANSID — Networking Reception — Registrant 2']);
  });

  it('ignores orders with no add-on lines', () => {
    const r = matchAddonLineItems(['GANSID — Physicians (Tier 1, Regular)'], ADDONS, [{ id: 'a', name: 'X', isPrimary: true }]);
    expect(r.byAttendee).toEqual({});
  });
});
