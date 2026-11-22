import { formatDay, relativeDay, todayInPeru } from './peru-date';

describe('peru-date', () => {
  it('uses the Lima calendar day', () => {
    expect(todayInPeru(new Date('2026-11-22T03:00:00Z'))).toBe('2026-11-21');
  });

  it('formats days and recent days', () => {
    expect(formatDay('2026-09-05')).toBe('5 set 2026');
    expect(relativeDay('2026-11-22', '2026-11-22')).toBe('Hoy');
    expect(relativeDay('2026-11-21', '2026-11-22')).toBe('Ayer');
    expect(relativeDay('2026-11-01', '2026-11-22')).toBe('1 nov 2026');
  });
});
