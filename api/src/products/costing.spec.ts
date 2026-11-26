import { describe, expect, it } from 'vitest';
import { applicationCost, averageCostOn } from './costing.js';

const entries = [
  { date: '2026-11-01', quantity: 1, unitCost: 120 },
  { date: '2026-11-10', quantity: 1, unitCost: 140 },
];

describe('averageCostOn', () => {
  it('only counts entries up to the day', () => {
    expect(averageCostOn(entries, '2026-11-05')).toBe(120);
    expect(averageCostOn(entries, '2026-11-10')).toBe(130);
  });

  it('is null before the first entry', () => {
    expect(averageCostOn(entries, '2026-10-31')).toBeNull();
  });

  it('averages plainly when the entries have no quantity', () => {
    expect(
      averageCostOn(
        [{ date: '2026-11-01', quantity: 0, unitCost: 80 }],
        '2026-11-02',
      ),
    ).toBe(80);
  });
});

describe('applicationCost', () => {
  it('prices the quantity used at that day and rounds to cents', () => {
    expect(applicationCost(entries, '2026-11-05', 0.25)).toBe(30);
    expect(applicationCost(entries, '2026-11-12', 1 / 3)).toBe(43.33);
  });

  it('uses the first price when it was used before anything came in', () => {
    expect(applicationCost(entries, '2026-10-28', 2)).toBe(240);
  });

  it('is null without entries', () => {
    expect(applicationCost([], '2026-11-05', 1)).toBeNull();
  });
});
