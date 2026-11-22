import type { LotSummary } from '../../../lots/models/lot.model';

/**
 * Schematic layout (PLAN §10, "Vista 3D"): every greenhouse is a tunnel with
 * its lots as equal beds ordered by number. Units are metres-ish; x runs along
 * the greenhouses, z across. Replace this function to use the real layout.
 */
export const BED = { width: 3, depth: 8, gap: 0.8, aisle: 2.4, margin: 1.6 } as const;
const MAX_PER_ROW = 6;
const GREENHOUSE_GAP = 6;

export interface BedPlacement {
  lot: LotSummary;
  /** Centre of the bed. */
  x: number;
  z: number;
}

export interface GreenhousePlacement {
  id: string;
  name: string;
  /** Centre and size of the tunnel. */
  x: number;
  z: number;
  width: number;
  depth: number;
  beds: BedPlacement[];
}

export interface FarmLayout {
  greenhouses: GreenhousePlacement[];
  /** Total size, to frame the camera. */
  width: number;
  depth: number;
}

export function computeLayout(lots: readonly LotSummary[]): FarmLayout {
  const groups = new Map<string, { id: string; name: string; lots: LotSummary[] }>();
  for (const lot of lots) {
    const group = groups.get(lot.greenhouse.id) ?? { ...lot.greenhouse, lots: [] };
    group.lots.push(lot);
    groups.set(lot.greenhouse.id, group);
  }

  const sized = [...groups.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((group) => {
      const sorted = [...group.lots].sort((a, b) => a.number - b.number);
      const rows = Math.max(1, Math.ceil(sorted.length / MAX_PER_ROW));
      const cols = Math.max(1, Math.ceil(sorted.length / rows));
      const width = cols * BED.width + (cols - 1) * BED.gap + 2 * BED.margin;
      const depth = rows * BED.depth + (rows - 1) * BED.aisle + 2 * BED.margin;
      return { ...group, lots: sorted, rows, cols, width, depth };
    });

  const totalWidth =
    sized.reduce((sum, g) => sum + g.width, 0) + Math.max(0, sized.length - 1) * GREENHOUSE_GAP;
  const totalDepth = Math.max(0, ...sized.map((g) => g.depth));

  let left = -totalWidth / 2;
  const greenhouses = sized.map((g) => {
    const x = left + g.width / 2;
    left += g.width + GREENHOUSE_GAP;
    const beds = g.lots.map((lot, i) => {
      const row = Math.floor(i / g.cols);
      const col = i % g.cols;
      return {
        lot,
        x: x - g.width / 2 + BED.margin + BED.width / 2 + col * (BED.width + BED.gap),
        z: -g.depth / 2 + BED.margin + BED.depth / 2 + row * (BED.depth + BED.aisle),
      };
    });
    return { id: g.id, name: g.name, x, z: 0, width: g.width, depth: g.depth, beds };
  });

  return { greenhouses, width: totalWidth, depth: totalDepth };
}
