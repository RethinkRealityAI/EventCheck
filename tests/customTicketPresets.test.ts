import { describe, it, expect } from 'vitest';
import { CUSTOM_TICKET_PRESETS } from '../utils/customTicketPresets';
import {
  renderConditionals,
  strayConditionalTokens,
  CUSTOM_TICKET_FLAGS,
  CUSTOM_TICKET_PLACEHOLDERS,
} from '../supabase/functions/_shared/customTicket';

// Every combination of the three server flags.
const combos = Array.from({ length: 1 << CUSTOM_TICKET_FLAGS.length }, (_, n) =>
  Object.fromEntries(CUSTOM_TICKET_FLAGS.map((f, i) => [f, !!(n & (1 << i))])));

describe.each(CUSTOM_TICKET_PRESETS)('preset "$label"', (preset) => {
  it.each(combos)('renders cleanly for %o', (flags) => {
    const out = renderConditionals(preset.body, flags);
    expect(strayConditionalTokens(out)).toEqual([]);
    // Only placeholders the server fills — anything else would reach the inbox blank.
    const tokens = [...out.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)].map(m => m[1]);
    for (const t of tokens) expect(CUSTOM_TICKET_PLACEHOLDERS).toContain(t);
    for (const t of [...preset.subject.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)].map(m => m[1])) {
      expect(CUSTOM_TICKET_PLACEHOLDERS).toContain(t);
    }
  });
});

describe('TSCS India preset', () => {
  const tscs = CUSTOM_TICKET_PRESETS.find(p => p.id === 'tscs-india')!;

  it('offers the create-account link only to people without an account', () => {
    expect(renderConditionals(tscs.body, { has_account: false })).toContain('{{account_url}}');
    expect(renderConditionals(tscs.body, { has_account: true })).not.toContain('{{account_url}}');
    expect(renderConditionals(tscs.body, { has_account: true })).toContain('{{portal_url}}');
  });

  it('says an account is optional and the ticket alone is enough', () => {
    const out = renderConditionals(tscs.body, { has_account: false });
    expect(out).toMatch(/do not need an account to attend/i);
    expect(out).toMatch(/optional/i);
  });

  it('lists companions only for people who booked for others', () => {
    expect(renderConditionals(tscs.body, { has_companions: true })).toContain('{{companions}}');
    expect(renderConditionals(tscs.body, { has_companions: false })).not.toContain('{{companions}}');
  });
});
