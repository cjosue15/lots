import type { LotSummary } from '../../../lots/models/lot.model';
import { activityOf } from './activity';
import { BED, computeLayout } from './layout';

const lot = (gh: string, number: number, cycle: LotSummary['cycle'] = null): LotSummary => ({
  id: `${gh}-${number}`,
  number,
  greenhouse: { id: gh, name: gh },
  cycle,
});

describe('computeLayout', () => {
  it('orders greenhouses by name and lots by number, max 6 per row', () => {
    const lots = [
      ...Array.from({ length: 12 }, (_, i) => lot('Bungalows', 12 - i)),
      lot('Alto', 2),
      lot('Alto', 1),
    ];
    const layout = computeLayout(lots);
    expect(layout.greenhouses.map((g) => g.name)).toEqual(['Alto', 'Bungalows']);

    const [alto, bungalows] = layout.greenhouses;
    expect(alto.beds.map((b) => b.lot.number)).toEqual([1, 2]);
    expect(new Set(bungalows.beds.map((b) => b.z)).size).toBe(2);
    expect(bungalows.beds[1].x - bungalows.beds[0].x).toBeCloseTo(BED.width + BED.gap);
  });

  it('keeps every bed inside its greenhouse and greenhouses apart', () => {
    const layout = computeLayout([lot('A', 1), lot('A', 2), lot('B', 1)]);
    for (const g of layout.greenhouses) {
      for (const bed of g.beds) {
        expect(Math.abs(bed.x - g.x) + BED.width / 2).toBeLessThanOrEqual(g.width / 2);
        expect(Math.abs(bed.z - g.z) + BED.depth / 2).toBeLessThanOrEqual(g.depth / 2);
      }
    }
    const [a, b] = layout.greenhouses;
    expect(a.x + a.width / 2).toBeLessThan(b.x - b.width / 2);
  });
});

describe('El Dorado shape', () => {
  it('stacks its lots in one column, lot 1 at the front', () => {
    const [dorado] = computeLayout([
      lot('El Dorado', 2),
      lot('El Dorado', 1),
      lot('El Dorado', 3),
    ]).greenhouses;
    expect(new Set(dorado.beds.map((b) => b.x)).size).toBe(1);
    const backToFront = [...dorado.beds].sort((a, b) => a.z - b.z).map((b) => b.lot.number);
    expect(backToFront).toEqual([3, 2, 1]);
    expect(dorado.depth).toBeGreaterThan(dorado.width);
  });
});

describe('activityOf', () => {
  const cycle = (startDate: string, lastLog: string | null) => ({
    id: 'c',
    number: 1,
    startDate,
    days: 0,
    phase: null,
    lastLog: lastLog ? { name: 'Riego', date: lastLog } : null,
  });

  it('classifies lots by their last log', () => {
    const today = '2026-11-22';
    expect(activityOf(lot('A', 1), today)).toBe('idle');
    expect(activityOf(lot('A', 1, cycle('2026-11-01', '2026-11-22')), today)).toBe('today');
    expect(activityOf(lot('A', 1, cycle('2026-11-01', '2026-11-20')), today)).toBe('recent');
    expect(activityOf(lot('A', 1, cycle('2026-11-01', '2026-11-19')), today)).toBe('stale');
    expect(activityOf(lot('A', 1, cycle('2026-11-21', null)), today)).toBe('recent');
  });
});
