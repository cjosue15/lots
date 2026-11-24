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
export type FeatureKind = 'pool' | 'plants' | 'hut' | 'shed';

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
  kind: 'column';
  width: number;
  items: ColumnItem[];
}

/**
 * Lots placed freely: each one's centre, with the covered floors and features
 * around them, in any frame (the result is centred).
 */
interface PlacedShape {
  kind: 'placed';
  lots: { lot: number; x: number; z: number }[];
  /** Covered ground; lots outside every floor are open air. */
  floors: Rect[];
  features: Feature[];
}

/** Every shaped lot is the size of El Dorado's. */
const LOT = { width: 6, depth: 8 } as const;

/**
 * Carmen Alto, measured from the centre of the big house: its columns and
 * rows of lots, its edge (0.6 past the lots, like El Dorado's houses) and the
 * line where the side strip and lot 7 start, an aisle away from it.
 */
const CA = (() => {
  const col = (LOT.width + BED.gap) / 2;
  const row = LOT.depth + BED.gap;
  const houseWidth = 2 * LOT.width + BED.gap + 1.2;
  const houseDepth = 3 * LOT.depth + 2 * BED.gap + 1.2;
  const side = houseWidth / 2 + BED.aisle;
  const behind = -houseDepth / 2 - BED.aisle - LOT.depth / 2;
  // Along the side: the back of lot 2, its middle, and an aisle before 7.
  const sideBack = -row - LOT.depth / 2;
  const sideMid = -row;
  const sideEnd = row - LOT.depth / 2 - BED.aisle;
  return { col, row, houseWidth, houseDepth, side, behind, sideBack, sideMid, sideEnd };
})();

/** Arrangements by greenhouse name, from the farm's sketches (not to scale). */
const SHAPES: Record<string, ColumnShape | PlacedShape> = {
  // Three separate houses, 3 at the back and 1 at the front. The guard's hut
  // sits between 2 and 3; the pool and a patch of plants between 1 and 2.
  'El Dorado': {
    kind: 'column',
    width: LOT.width,
    items: [
      { lot: 3, length: LOT.depth },
      { gap: 4.5, features: [{ kind: 'hut', width: 2.6, depth: 2.2, x: 1 }] },
      { lot: 2, length: LOT.depth },
      {
        gap: 9,
        features: [
          { kind: 'pool', width: 3.6, depth: 3.6, z: -2.1 },
          { kind: 'plants', width: 3.6, depth: 3, z: 2.3 },
        ],
      },
      { lot: 1, length: LOT.depth },
    ],
  },
  // One big house with lots 1–6 in two columns (1 and 2 at the back). Beside
  // it, a green-roofed shed against lot 2, a narrow strip of plants with no
  // lot and, in front of that, lot 7 in the open. Lots 8 and 9 lie in the
  // open behind the house, over the column of 2, with the water tank beside 8.
  'Carmen Alto': {
    kind: 'placed',
    lots: [
      { lot: 1, x: -CA.col, z: -CA.row },
      { lot: 2, x: CA.col, z: -CA.row },
      { lot: 3, x: -CA.col, z: 0 },
      { lot: 4, x: CA.col, z: 0 },
      { lot: 5, x: -CA.col, z: CA.row },
      { lot: 6, x: CA.col, z: CA.row },
      { lot: 7, x: CA.side + LOT.width / 2, z: CA.row },
      { lot: 8, x: CA.col, z: CA.behind },
      { lot: 9, x: CA.col, z: CA.behind - CA.row },
    ],
    floors: [{ x: 0, z: 0, width: CA.houseWidth, depth: CA.houseDepth }],
    features: [
      // Against the big house, along the back half of lot 2: a shed with a
      // green roof, filling the aisle up to the strip of plants.
      {
        kind: 'shed',
        x: CA.houseWidth / 2 + BED.aisle / 2,
        z: (CA.sideBack + CA.sideMid) / 2,
        width: BED.aisle,
        depth: CA.sideMid - CA.sideBack,
      },
      // The strip with no lot beside 2 and 4, up to an aisle before 7: plants.
      {
        kind: 'plants',
        x: CA.side + 1.5,
        z: (CA.sideBack + CA.sideEnd) / 2,
        width: 3,
        depth: CA.sideEnd - CA.sideBack,
      },
      // The water tank beside lot 8.
      {
        kind: 'pool',
        x: CA.col + LOT.width / 2 + BED.aisle,
        z: CA.behind,
        width: 1.8,
        depth: LOT.depth - 1,
      },
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

function placed(shape: PlacedShape, lots: LotSummary[]): Local {
  const byNumber = new Map(lots.map((lot) => [lot.number, lot]));
  const beds: BedPlacement[] = shape.lots.flatMap(({ lot, x, z }) => {
    const found = byNumber.get(lot);
    return found ? [{ lot: found, x, z, ...LOT }] : [];
  });
  const rects: Rect[] = [...beds, ...shape.floors, ...shape.features];
  const minX = Math.min(...rects.map((r) => r.x - r.width / 2));
  const maxX = Math.max(...rects.map((r) => r.x + r.width / 2));
  const minZ = Math.min(...rects.map((r) => r.z - r.depth / 2));
  let maxZ = Math.max(...rects.map((r) => r.z + r.depth / 2));

  // Lots added later than the sketch go in a row along the front.
  const listed = new Set(shape.lots.map((item) => item.lot));
  const extra = lots.filter((lot) => !listed.has(lot.number));
  extra.forEach((lot, i) => {
    beds.push({
      lot,
      x: minX + LOT.width / 2 + i * (LOT.width + BED.gap),
      z: maxZ + BED.aisle * 2 + LOT.depth / 2,
      ...LOT,
    });
  });
  if (extra.length) maxZ += BED.aisle * 2 + LOT.depth;
  const extraRight = minX + extra.length * (LOT.width + BED.gap) - BED.gap;

  // Centre everything on the origin.
  const right = Math.max(maxX, extraRight);
  const cx = (minX + right) / 2;
  const cz = (minZ + maxZ) / 2;
  const centre = <T extends Rect>(rect: T): T => ({ ...rect, x: rect.x - cx, z: rect.z - cz });
  return {
    width: right - minX + 2 * BED.margin,
    depth: maxZ - minZ + 2 * BED.margin,
    beds: beds.map(centre),
    floors: shape.floors.map(centre),
    features: shape.features.map(centre),
  };
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
        ...(!shape
          ? schematic(sorted)
          : shape.kind === 'column'
            ? column(shape, sorted)
            : placed(shape, sorted)),
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
