import type { LotSummary } from '../../../lots/models/lot.model';
import { activityOf } from './activity';
import { BED, computeLayout, type Rect } from './layout';

const lot = (gh: string, number: number, cycle: LotSummary['cycle'] = null): LotSummary => ({
  id: `${gh}-${number}`,
  number,
  greenhouse: { id: gh, name: gh },
  cycle,
});

const overlaps = (a: Rect, b: Rect) =>
  Math.abs(a.x - b.x) < (a.width + b.width) / 2 && Math.abs(a.z - b.z) < (a.depth + b.depth) / 2;

describe('computeLayout', () => {
  it('orders greenhouses by name and lots by number, max 6 per row', () => {
    const lots = [
      ...Array.from({ length: 12 }, (_, i) => lot('Nuevo', 12 - i)),
      lot('Alto', 2),
      lot('Alto', 1),
    ];
    const layout = computeLayout(lots);
    expect(layout.greenhouses.map((g) => g.name)).toEqual(['Alto', 'Nuevo']);

    const [alto, nuevo] = layout.greenhouses;
    expect(alto.beds.map((b) => b.lot.number)).toEqual([1, 2]);
    expect(new Set(nuevo.beds.map((b) => b.z)).size).toBe(2);
    expect(nuevo.beds[1].x - nuevo.beds[0].x).toBeCloseTo(BED.width + BED.gap);
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

describe('Carmen Alto shape', () => {
  const [carmen] = computeLayout(
    Array.from({ length: 9 }, (_, i) => lot('Carmen Alto', 9 - i)),
  ).greenhouses;
  const bed = (n: number) => carmen.beds.find((b) => b.lot.number === n)!;

  it('places 1–6 in two columns with 7 beside 6 and 8, 9 behind 2', () => {
    expect(bed(1).x).toBeLessThan(bed(2).x);
    expect(bed(1).z).toBeLessThan(bed(3).z);
    expect(bed(3).z).toBeLessThan(bed(5).z);
    expect(bed(7).x).toBeGreaterThan(bed(6).x);
    expect(bed(7).z).toBeCloseTo(bed(6).z);
    expect(bed(8).x).toBeCloseTo(bed(2).x);
    expect(bed(9).z).toBeLessThan(bed(8).z);
    expect(bed(8).z).toBeLessThan(bed(2).z);
  });

  it('keeps lots apart and inside the greenhouse', () => {
    for (const a of carmen.beds) {
      expect(Math.abs(a.x - carmen.x) + a.width / 2).toBeLessThanOrEqual(carmen.width / 2);
      expect(Math.abs(a.z - carmen.z) + a.depth / 2).toBeLessThanOrEqual(carmen.depth / 2);
      for (const b of carmen.beds) if (a !== b) expect(overlaps(a, b)).toBe(false);
    }
  });
});

describe('Bungalows shape', () => {
  const [bungalows] = computeLayout(
    Array.from({ length: 12 }, (_, i) => lot('Bungalows', i + 1)),
  ).greenhouses;
  const bed = (n: number) => bungalows.beds.find((b) => b.lot.number === n)!;

  it('puts 12–8 at the back, 7–4 in the middle and 3, 2, 1 in front of 4', () => {
    const xs = (ns: number[]) => ns.map((n) => bed(n).x);
    expect(xs([12, 11, 10, 9, 8])).toEqual([...xs([12, 11, 10, 9, 8])].sort((a, b) => a - b));
    expect(xs([7, 6, 5, 4])).toEqual([...xs([7, 6, 5, 4])].sort((a, b) => a - b));
    expect(bed(8).z).toBeLessThan(bed(4).z);
    expect(bed(4).z).toBeLessThan(bed(3).z);
    expect(bed(3).z).toBeLessThan(bed(2).z);
    expect(bed(2).z).toBeLessThan(bed(1).z);
    for (const n of [3, 2, 1]) expect(bed(n).x).toBeCloseTo(bed(4).x);
  });

  it('gives every lot its own floor and keeps lots apart', () => {
    expect(bungalows.floors).toHaveLength(12);
    for (const a of bungalows.beds) {
      for (const b of bungalows.beds) if (a !== b) expect(overlaps(a, b)).toBe(false);
    }
  });
});

describe('activityOf', () => {
  const cycle = (startDate: string, lastLog: string | null) => ({
    id: 'c',
    number: 1,
    startDate,
    days: 0,
    phase: null,
    lastLog: lastLog ? { name: 'Riego', date: lastLog, code: null } : null,
    todayGeneral: [],
    lastPhaseLog: null,
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
