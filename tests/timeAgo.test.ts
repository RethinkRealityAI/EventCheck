import { describe, it, expect, vi, afterEach } from 'vitest';
import { timeAgo } from '../utils/timeAgo';

const NOW = new Date('2026-09-02T12:00:00.000Z').getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('timeAgo', () => {
  afterEach(() => vi.useRealTimers());
  const freeze = () => { vi.useFakeTimers(); vi.setSystemTime(NOW); };

  it('walks the whole ladder', () => {
    freeze();
    expect(timeAgo(ago(5_000))).toBe('just now');
    expect(timeAgo(ago(3 * 60_000))).toBe('3m ago');
    expect(timeAgo(ago(5 * 3_600_000))).toBe('5h ago');
    expect(timeAgo(ago(3 * 86_400_000))).toBe('3d ago');
    expect(timeAgo(ago(60 * 86_400_000))).toBe('2mo ago');
    // The arm one existing copy had drifted and lost.
    expect(timeAgo(ago(400 * 86_400_000))).toBe('1y ago');
  });

  it('returns empty string for missing or unparseable input', () => {
    expect(timeAgo(undefined)).toBe('');
    expect(timeAgo(null)).toBe('');
    expect(timeAgo('')).toBe('');
    expect(timeAgo('not a date')).toBe('');
  });
});
