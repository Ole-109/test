import { describe, expect, it } from 'vitest';
import { formatDuration, isTaskDone, lastDailyReset, lastMonthlyReset, lastWeeklyReset, nextDailyReset } from './time';
import type { Task } from './types';

const utc = (s: string) => Date.parse(s);

describe('server resets', () => {
  it('Europe (UTC+1) resets at 03:00 UTC', () => {
    expect(lastDailyReset(utc('2026-10-09T03:30:00Z'), 'europe')).toBe(utc('2026-10-09T03:00:00Z'));
    expect(lastDailyReset(utc('2026-10-09T02:59:00Z'), 'europe')).toBe(utc('2026-10-08T03:00:00Z'));
  });

  it('America (UTC-5) resets at 09:00 UTC', () => {
    expect(lastDailyReset(utc('2026-10-09T08:00:00Z'), 'america')).toBe(utc('2026-10-08T09:00:00Z'));
    expect(nextDailyReset(utc('2026-10-09T08:00:00Z'), 'america')).toBe(utc('2026-10-09T09:00:00Z'));
  });

  it('Asia (UTC+8) resets at 20:00 UTC the previous day', () => {
    expect(lastDailyReset(utc('2026-10-09T21:00:00Z'), 'asia')).toBe(utc('2026-10-09T20:00:00Z'));
    expect(lastDailyReset(utc('2026-10-09T10:00:00Z'), 'asia')).toBe(utc('2026-10-08T20:00:00Z'));
  });

  it('weekly reset is Monday 04:00 server time', () => {
    // 2026-10-09 is a Friday; the previous Monday is 2026-10-05.
    expect(lastWeeklyReset(utc('2026-10-09T12:00:00Z'), 'europe')).toBe(utc('2026-10-05T03:00:00Z'));
    // Monday before the reset still belongs to the previous week.
    expect(lastWeeklyReset(utc('2026-10-12T02:00:00Z'), 'europe')).toBe(utc('2026-10-05T03:00:00Z'));
    expect(lastWeeklyReset(utc('2026-10-12T03:00:00Z'), 'europe')).toBe(utc('2026-10-12T03:00:00Z'));
  });

  it('monthly reset handles the year boundary', () => {
    expect(lastMonthlyReset(utc('2026-01-10T00:00:00Z'), 'europe', 16)).toBe(utc('2025-12-16T03:00:00Z'));
    expect(lastMonthlyReset(utc('2026-01-16T03:00:00Z'), 'europe', 16)).toBe(utc('2026-01-16T03:00:00Z'));
  });
});

describe('tasks', () => {
  const daily: Task = { id: 'x', label: 'x', period: 'daily' };
  it('a daily task completed before reset is open again after it', () => {
    const done = { ...daily, doneAt: utc('2026-10-09T02:00:00Z') };
    expect(isTaskDone(done, utc('2026-10-09T02:30:00Z'), 'europe')).toBe(true);
    expect(isTaskDone(done, utc('2026-10-09T03:00:00Z'), 'europe')).toBe(false);
  });

  it('cooldown tasks stay done for their duration', () => {
    const t: Task = { id: 'p', label: 'p', period: 'cooldown', cooldownHours: 166, doneAt: 0 };
    expect(isTaskDone(t, 165 * 3_600_000, 'europe')).toBe(true);
    expect(isTaskDone(t, 167 * 3_600_000, 'europe')).toBe(false);
  });
});

describe('formatDuration', () => {
  it('formats compactly', () => {
    expect(formatDuration(90 * 60_000)).toBe('1h 30m');
    expect(formatDuration(26 * 3_600_000)).toBe('1d 2h');
    expect(formatDuration(75_000, { seconds: true })).toBe('1m 15s');
    expect(formatDuration(-5)).toBe('0m');
  });
});
