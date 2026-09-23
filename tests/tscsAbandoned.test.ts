import { describe, it, expect } from 'vitest';
import { abandonedValueInr, findAbandonedCheckouts, type TscsAbandonedInput } from '../utils/tscsAbandoned';

const pending = (ref: string, email: string, at: string, extra: Record<string, any> = {}): TscsAbandonedInput => ({
  subject: `⏳ [PENDING] Incomplete Registration: ${ref}`,
  parsed: { name: extra.name ?? 'A Person', email, category: extra.category ?? 'Physicians / Researchers', total_inr: 'total_inr' in extra ? extra.total_inr : 7200 },
  receivedAt: at,
  status: 'ignored',
});

const success = (ref: string, email: string, at: string): TscsAbandonedInput => ({
  subject: `✅ [SUCCESS] Registration Confirmed: ${ref}`,
  parsed: { name: 'A Person', email, category: 'Physicians / Researchers', payment_id: 'pay_X', total_inr: 7200 },
  receivedAt: at,
  status: 'ingested',
});

describe('findAbandonedCheckouts', () => {
  it('lists someone who only ever started', () => {
    const out = findAbandonedCheckouts([pending('REG-00047', 'buyer-a@example.com', '2026-09-17T14:37:02Z')]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ ref: 'REG-00047', email: 'buyer-a@example.com', attempts: 1, amountInr: 7200 });
  });

  it('drops the reference that later succeeded, even though the pending mail arrived AFTER it', () => {
    // Seven of sixteen live pairs land in this order, which is exactly why
    // "the newest mail was a pending one" cannot be the test.
    const out = findAbandonedCheckouts([
      success('REG-00062', 'buyer-b@example.com', '2026-09-21T13:13:19Z'),
      pending('REG-00062', 'buyer-b@example.com', '2026-09-21T13:14:16Z'),
    ]);
    expect(out).toEqual([]);
  });

  it('drops a person who abandoned twice and then paid on a third reference', () => {
    // One person: REG-00052 and REG-00053 abandoned, REG-00054 paid.
    const out = findAbandonedCheckouts([
      pending('REG-00052', 'buyer-c@example.com', '2026-09-20T00:39:45Z'),
      pending('REG-00053', 'buyer-c@example.com', '2026-09-20T00:42:49Z'),
      success('REG-00054', 'buyer-c@example.com', '2026-09-20T00:46:34Z'),
    ]);
    expect(out).toEqual([]);
  });

  it('counts repeat attempts by the same person as one lead', () => {
    const out = findAbandonedCheckouts([
      pending('REG-00059', 'buyer-d@example.com', '2026-09-21T01:53:06Z'),
      pending('REG-00060', 'buyer-d@example.com', '2026-09-21T01:57:25Z'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].attempts).toBe(2);
    // Newest attempt wins the reference, so following up quotes what they last saw.
    expect(out[0].ref).toBe('REG-00060');
  });

  it('takes the freshest details, since a retry often fixes what made them abandon', () => {
    const out = findAbandonedCheckouts([
      pending('REG-00059', 'j@example.com', '2026-09-21T01:53:06Z', { name: 'J', category: 'Patients or Family Members', total_inr: 2400 }),
      pending('REG-00060', 'j@example.com', '2026-09-21T01:57:25Z', { name: 'A Example Speaker', category: 'Physicians / Researchers', total_inr: 7200 }),
    ]);
    expect(out[0]).toMatchObject({ name: 'A Example Speaker', category: 'Physicians / Researchers', amountInr: 7200 });
  });

  it('treats an ingested row as completed even if its subject is unusual', () => {
    const out = findAbandonedCheckouts([
      { subject: 'Registration: REG-00020', parsed: { email: 'x@example.com', name: 'X' }, receivedAt: '2026-08-27T00:00:00Z', status: 'ingested' },
    ]);
    expect(out).toEqual([]);
  });

  it('never trusts a [PENDING] subject that also says Confirmed', () => {
    const out = findAbandonedCheckouts([{
      subject: '⏳ [PENDING] Incomplete Registration: REG-00070 — Registration Confirmed',
      parsed: { email: 'y@example.com', name: 'Y', total_inr: 4800 },
      receivedAt: '2026-09-21T00:00:00Z',
      status: 'ignored',
    }]);
    expect(out).toHaveLength(1);
  });

  it('skips rows with no address — there is no way to follow up', () => {
    const out = findAbandonedCheckouts([
      { subject: '⏳ [PENDING] Incomplete Registration: REG-00099', parsed: null, receivedAt: '2026-09-01T00:00:00Z', status: 'ignored' },
    ]);
    expect(out).toEqual([]);
  });

  it('ignores unrelated mail the poller recorded', () => {
    const out = findAbandonedCheckouts([
      { subject: 'New appointment: SUMMIT DEBRIEF', parsed: null, receivedAt: '2026-09-03T19:11:28Z', status: 'ignored' },
    ]);
    expect(out).toEqual([]);
  });

  it('returns newest first, so the list reads as a follow-up queue', () => {
    const out = findAbandonedCheckouts([
      pending('REG-00047', 'older@example.com', '2026-09-17T14:37:02Z'),
      pending('REG-00056', 'newer@example.com', '2026-09-20T04:43:41Z'),
    ]);
    expect(out.map(r => r.email)).toEqual(['newer@example.com', 'older@example.com']);
  });
});

describe('abandonedValueInr', () => {
  it('sums what is uncollected and tolerates missing amounts', () => {
    const list = findAbandonedCheckouts([
      pending('REG-00047', 'a@example.com', '2026-09-17T00:00:00Z', { total_inr: 7200 }),
      pending('REG-00055', 'b@example.com', '2026-09-20T00:00:00Z', { total_inr: null }),
    ]);
    expect(abandonedValueInr(list)).toBe(7200);
  });
});
