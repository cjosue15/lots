import { describe, expect, it } from 'vitest';
import { averageCost, stockStatus } from './products.service.js';

describe('averageCost', () => {
  it('weights entry prices by quantity and ignores outflows', () => {
    expect(
      averageCost([
        { type: 'INITIAL', quantity: 1, unitCost: 120 },
        { type: 'ENTRY', quantity: 3, unitCost: 140 },
        { type: 'APPLICATION', quantity: -2, unitCost: null },
      ]),
    ).toBe(135);
  });

  it('averages plainly when nothing came in', () => {
    expect(averageCost([{ type: 'INITIAL', quantity: 0, unitCost: 80 }])).toBe(
      80,
    );
  });

  it('is null without prices', () => {
    expect(averageCost([])).toBeNull();
  });
});

describe('stockStatus', () => {
  it('flags zero or negative stock, then stock under the minimum', () => {
    expect(stockStatus(-0.5, 1)).toBe('OUT');
    expect(stockStatus(0, 0)).toBe('OUT');
    expect(stockStatus(0.5, 1)).toBe('LOW');
    expect(stockStatus(1, 1)).toBe('OK');
  });
});
