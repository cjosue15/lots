import type { LotSummary } from '../../../lots/models/lot.model';

/**
 * Layout (PLAN §10, "Vista 3D"). Units are metres-ish; x runs across the
 * screen, z towards the viewer (the front). Greenhouses with a known shape
 * (SHAPES) follow it; the rest are a schematic floor with equal beds ordered
 * by number.
 */
export const BED = { width: 3, depth: 8, gap: 0.8, aisle: 2.4, margin: 1.6 } as const;
const MAX_PER_ROW = 6;
const GREENHOUSE_GAP = 6;

/** Things on the land that are not lots. */
export type FeatureKind = 'pool' | 'plants' | 'hut';

export interface Rect {
  /** Centre and size. */
  x: number;
  z: number;
  width: number;
  depth: number;
}

export interface Feature extends Rect {
  kind: FeatureKind;
}

export interface BedPlacement extends Rect {
  lot: LotSummary;
}

export interface GreenhousePlacement extends Rect {
  id: string;
  name: string;
  beds: BedPlacement[];
  /** Covered ground drawn under the beds. */
  floors: Rect[];
  features: Feature[];
}

export interface FarmLayout {
  greenhouses: GreenhousePlacement[];
  /** Total size, to frame the camera. */
  width: number;
  depth: number;
}

type FeatureSpec = Omit<Feature, 'x' | 'z'> & { x?: number; z?: number };
type ColumnItem = { lot: number; length: number } | { gap: number; features?: FeatureSpec[] };

/**
 * A row of separate lots one behind the other, listed from the back, with
 * what lies between them. Features are placed relative to their gap's centre.
 */
interface ColumnShape {
  width: number;
  items: ColumnItem[];
}

/** Arrangements by greenhouse name, from the farm's sketches (not to scale). */
const SHAPES: Record<string, ColumnShape> = {
  // Three separate houses, 3 at the back and 1 at the front. The guard's hut
  // sits between 2 and 3; the pool and a patch of plants between 1 and 2.
  'El Dorado': {
    width: 6,
    items: [
      { lot: 3, length: 8 },
      { gap: 4.5, features: [{ kind: 'hut', width: 2.6, depth: 2.2, x: 1 }] },
      { lot: 2, length: 8 },
      {
        gap: 9,
        features: [
          { kind: 'pool', width: 3.6, depth: 3.6, z: -2.1 },
          { kind: 'plants', width: 3.6, depth: 3, z: 2.3 },
        ],
      },
      { lot: 1, length: 8 },
    ],
  },
};

/** Local layout of one greenhouse, centred on the origin. */
type Local = Omit<GreenhousePlacement, 'id' | 'name' | 'x' | 'z'>;

function schematic(lots: LotSummary[]): Local {
  const rows = Math.max(1, Math.ceil(lots.length / MAX_PER_ROW));
  const cols = Math.max(1, Math.ceil(lots.length / rows));
  const width = cols * BED.width + (cols - 1) * BED.gap + 2 * BED.margin;
  const depth = rows * BED.depth + (rows - 1) * BED.aisle + 2 * BED.margin;
  const beds = lots.map((lot, i) => ({
    lot,
    x: -width / 2 + BED.margin + BED.width / 2 + (i % cols) * (BED.width + BED.gap),
    z: -depth / 2 + BED.margin + BED.depth / 2 + Math.floor(i / cols) * (BED.depth + BED.aisle),
    width: BED.width,
    depth: BED.depth,
  }));
  return { width, depth, beds, floors: [{ x: 0, z: 0, width, depth }], features: [] };
}

function column(shape: ColumnShape, lots: LotSummary[]): Local {
  const byNumber = new Map(lots.map((lot) => [lot.number, lot]));
  const listed = new Set(shape.items.flatMap((item) => ('lot' in item ? [item.lot] : [])));
  // Lots added later than the sketch go at the front, as long as the last one.
  const lastLength = shape.items.reduce((last, item) => ('lot' in item ? item.length : last), 20);
  const extra = lots
    .filter((lot) => !listed.has(lot.number))
    .flatMap((lot): ColumnItem[] => [
      { gap: BED.aisle * 2 },
      { lot: lot.number, length: lastLength },
    ]);
  const items: ColumnItem[] = [...shape.items, ...extra];

  const length = (item: ColumnItem) => ('lot' in item ? item.length : item.gap);
  const depth = items.reduce((sum, item) => sum + length(item), 0) + 2 * BED.margin;
  const width = shape.width + 2 * BED.margin;
  const beds: BedPlacement[] = [];
  const features: Feature[] = [];
  let back = -depth / 2 + BED.margin;
  for (const item of items) {
    const z = back + length(item) / 2;
    if ('lot' in item) {
      const lot = byNumber.get(item.lot);
      if (lot) beds.push({ lot, x: 0, z, width: shape.width, depth: item.length });
    } else {
      for (const f of item.features ?? []) {
        features.push({ ...f, x: f.x ?? 0, z: z + (f.z ?? 0) });
      }
    }
    back += length(item);
  }
  // Each lot is its own covered house.
  const floors = beds.map((bed) => ({ ...bed, width: bed.width + 1.2, depth: bed.depth + 1.2 }));
  return { width, depth, beds, floors, features };
}

export function computeLayout(lots: readonly LotSummary[]): FarmLayout {
  const groups = new Map<string, { id: string; name: string; lots: LotSummary[] }>();
  for (const lot of lots) {
    const group = groups.get(lot.greenhouse.id) ?? { ...lot.greenhouse, lots: [] };
    group.lots.push(lot);
    groups.set(lot.greenhouse.id, group);
  }

  const local = [...groups.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((group) => {
      const sorted = [...group.lots].sort((a, b) => a.number - b.number);
      const shape = SHAPES[group.name];
      return {
        id: group.id,
        name: group.name,
        ...(shape ? column(shape, sorted) : schematic(sorted)),
      };
    });

  const totalWidth =
    local.reduce((sum, g) => sum + g.width, 0) + Math.max(0, local.length - 1) * GREENHOUSE_GAP;
  const totalDepth = Math.max(0, ...local.map((g) => g.depth));

  let left = -totalWidth / 2;
  const greenhouses = local.map((g) => {
    const x = left + g.width / 2;
    left += g.width + GREENHOUSE_GAP;
    const shift = <T extends Rect>(rect: T): T => ({ ...rect, x: rect.x + x });
    return {
      ...g,
      x,
      z: 0,
      beds: g.beds.map(shift),
      floors: g.floors.map(shift),
      features: g.features.map(shift),
    };
  });

  return { greenhouses, width: totalWidth, depth: totalDepth };
}
