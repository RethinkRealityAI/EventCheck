import { describe, expect, it } from 'vitest';
import {
  formatMeetingId,
  isPresenterIn,
  isVirtualPerson,
  mapVirtualSessionRow,
  virtualPresenterLine,
  type VirtualSession,
} from '../utils/virtualSessions';

const vs: VirtualSession = {
  sessionId: 'd3-pkd',
  zoomUrl: 'https://us06web.zoom.us/j/82633989463',
  meetingId: '82633989463',
  presenters: [
    { key: 'carl-lander', name: 'Mr. Carl Lander', role: 'Speaker' },
    { key: 'prabhat-sinha', name: 'Mr. Prabhat Sinha', role: 'Moderator' },
  ],
};

describe('mapVirtualSessionRow', () => {
  it('maps a well-formed row', () => {
    expect(
      mapVirtualSessionRow({
        session_id: 'd3-pkd',
        zoom_url: vs.zoomUrl,
        meeting_id: '82633989463',
        presenters: [{ key: 'carl-lander', name: ' Mr. Carl Lander ', role: 'Speaker' }],
      }),
    ).toEqual({ ...vs, presenters: [vs.presenters[0]] });
  });

  it('tolerates a malformed presenters column and defaults the role', () => {
    const out = mapVirtualSessionRow({
      session_id: 'x',
      zoom_url: 'https://z',
      meeting_id: '',
      presenters: [null, { name: '' }, { name: 'Dr. A B' }, 'nope'],
    });
    expect(out).toEqual({ sessionId: 'x', zoomUrl: 'https://z', meetingId: null, presenters: [{ key: '', name: 'Dr. A B', role: 'Speaker' }] });
    expect(mapVirtualSessionRow({ session_id: 'x', zoom_url: 'u', presenters: 'bad' })?.presenters).toEqual([]);
  });

  it('rejects rows missing the id or link', () => {
    expect(mapVirtualSessionRow(null)).toBeNull();
    expect(mapVirtualSessionRow({ session_id: 'x' })).toBeNull();
    expect(mapVirtualSessionRow({ zoom_url: 'u' })).toBeNull();
  });
});

describe('formatMeetingId', () => {
  it('groups like Zoom does', () => {
    expect(formatMeetingId('86701701992')).toBe('867 0170 1992');
    expect(formatMeetingId('867 0170 1992')).toBe('867 0170 1992');
  });
  it('leaves short or empty ids alone', () => {
    expect(formatMeetingId('12345')).toBe('12345');
    expect(formatMeetingId(null)).toBe('');
  });
});

describe('isPresenterIn', () => {
  it('matches on presenter key only', () => {
    expect(isPresenterIn(vs, 'carl-lander')).toBe(true);
    expect(isPresenterIn(vs, 'varun-bafna')).toBe(false);
    expect(isPresenterIn(vs, null)).toBe(false);
    expect(isPresenterIn(vs, '')).toBe(false);
  });
});

describe('isVirtualPerson', () => {
  it('matches programme names regardless of honorific or country', () => {
    expect(isVirtualPerson(vs, 'Mr. Carl Lander (UK)')).toBe(true);
    expect(isVirtualPerson(vs, 'Dr. Carl Lander')).toBe(true);
    expect(isVirtualPerson(vs, 'Dr. Yaddanapudi Ravindranath (USA)')).toBe(false);
    expect(isVirtualPerson(undefined, 'Mr. Carl Lander (UK)')).toBe(false);
  });
});

describe('virtualPresenterLine', () => {
  it('names the role only when it is not Speaker', () => {
    expect(virtualPresenterLine(vs)).toBe('Mr. Carl Lander · Mr. Prabhat Sinha (Moderator)');
  });
});
