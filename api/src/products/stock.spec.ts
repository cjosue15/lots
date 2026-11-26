import { describe, expect, it } from 'vitest';
import {
  averageCost,
  greenhouseStocks,
  stockKey,
  stockStatus,
  usesStock,
} from './products.service.js';

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

describe('usesStock', () => {
  it('takes nothing before the initial count, which already has that use', () => {
    expect(usesStock('2026-12-01', '2026-12-01')).toBe(true);
    expect(usesStock('2026-12-05', '2026-12-01')).toBe(true);
    expect(usesStock('2026-11-28', '2026-12-01')).toBe(false);
  });

  it('always takes stock where the product was not counted, even before it came in', () => {
    expect(usesStock('2026-12-05', undefined)).toBe(true);
  });
});

describe('greenhouseStocks', () => {
  const a = { id: 'a', name: 'Bungalows' };
  const b = { id: 'b', name: 'Carmen Alto' };

  it('keeps each greenhouse apart, with its own minimum and start', () => {
    const figures = {
      stock: new Map([
        [stockKey('p', 'a'), 1],
        [stockKey('p', 'b'), 8],
        [stockKey('other', 'a'), 50],
      ]),
      minimums: new Map([
        [stockKey('p', 'a'), 2],
        [stockKey('p', 'b'), 2],
      ]),
      starts: new Map([[stockKey('p', 'a'), '2026-12-01']]),
      initials: new Map([[stockKey('p', 'a'), '2026-12-01']]),
    };
    expect(greenhouseStocks('p', [a, b], figures)).toEqual([
      {
        greenhouse: a,
        stock: 1,
        minStock: 2,
        status: 'LOW',
        startDate: '2026-12-01',
        initialDate: '2026-12-01',
      },
      {
        greenhouse: b,
        stock: 8,
        minStock: 2,
        status: 'OK',
        startDate: null,
        initialDate: null,
      },
    ]);
  });

  it('lists greenhouses without movements or minimum as empty', () => {
    const empty = {
      stock: new Map(),
      minimums: new Map(),
      starts: new Map(),
      initials: new Map(),
    };
    expect(greenhouseStocks('p', [a], empty)).toEqual([
      {
        greenhouse: a,
        stock: 0,
        minStock: 0,
        status: 'OUT',
        startDate: null,
        initialDate: null,
      },
    ]);
  });
});
