import { describe, expect, it } from 'vitest';
import { daysBetween, fromDbDate, todayInPeru, toDbDate } from './peru-date.js';

describe('peru-date', () => {
  it('uses the Peru day, not the UTC day', () => {
    // 2026-11-22 03:00 UTC is still 2026-11-21 22:00 in Lima.
    expect(todayInPeru(new Date('2026-11-22T03:00:00Z'))).toBe('2026-11-21');
    expect(todayInPeru(new Date('2026-11-22T05:00:00Z'))).toBe('2026-11-22');
  });

  it('round-trips db dates and counts days', () => {
    expect(fromDbDate(toDbDate('2026-03-01'))).toBe('2026-03-01');
    expect(daysBetween('2026-02-27', '2026-03-02')).toBe(3);
  });
});
