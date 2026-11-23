import * as THREE from 'three';
import type { RidgeWork } from '../worker-actions';
import { COLORS, type SceneAssets } from './materials';
import {
  cucumberLeafGeometry,
  cucumberPlantGeometry,
  PLANT_VARIANTS,
  plantMaterial,
  rootsGeometry,
} from './plant';
import { seedlingGeometry, seedlingMaterial } from './seedling';

/** Ridges are about a metre apart: 3 in a schematic bed, more in wider fields. */
const RIDGE_SPACING = 1;
export const RIDGE_WIDTH = 0.6;
export const RIDGE_HEIGHT = 0.22;
/** Extra width of the plastic over a ridge. */
export const COVER_EXTRA = 0.06;
export const SOIL_HEIGHT = 0.12;
const PLANT_SPACING = 0.45;

/** Small deterministic PRNG, so a bed looks the same on every render. */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Placement {
  x: number;
  y: number;
  z: number;
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
}

const dummy = new THREE.Object3D();

function instanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  placements: Placement[],
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  placements.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0);
    dummy.scale.set(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function box(
  assets: SceneAssets,
  size: [number, number, number],
  color: number,
  position: [number, number, number],
  options: THREE.MeshStandardMaterialParameters = {},
): THREE.Mesh {
  const geometry = assets.geometry('unit-box', () => new THREE.BoxGeometry(1, 1, 1));
  const mesh = new THREE.Mesh(geometry, assets.material(color, options));
  mesh.scale.set(...size);
  mesh.position.set(...position);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

export const ridgeLength = (depth: number) => depth - 0.5;
/** Drip tape runs along each ridge, off its centre line. */
export const TAPE_OFFSET = 0.12;

/** Drip tape along z, one unit long. */
export function tapeGeometry(assets: SceneAssets): THREE.BufferGeometry {
  return assets.geometry('tape', () =>
    new THREE.CylinderGeometry(0.025, 0.025, 1, 6).rotateX(Math.PI / 2),
  );
}

/** x of each ridge centre inside a bed of the given width. */
export function ridgeXs(width: number): number[] {
  const ridges = Math.max(1, Math.round(width / RIDGE_SPACING));
  const step = width / ridges;
  return Array.from({ length: ridges }, (_, i) => -width / 2 + step / 2 + i * step);
}

/** Plant positions along every ridge. */
function plantSpots(width: number, depth: number): { x: number; z: number }[] {
  return ridgeXs(width).flatMap((x) => spotsAlong(depth).map((z) => ({ x, z })));
}

/** z of each plant spot along a ridge, from the back. */
function spotsAlong(depth: number): number[] {
  const count = Math.floor((depth - 0.8) / PLANT_SPACING);
  const start = -((count - 1) * PLANT_SPACING) / 2;
  return Array.from({ length: count }, (_, i) => start + i * PLANT_SPACING);
}

/** z of each guano heap along a ridge (every other plant spot), from the back. */
export function guanoAlong(depth: number): number[] {
  return spotsAlong(depth).filter((_, i) => i % 2 === 0);
}

export function guanoGeometry(assets: SceneAssets): THREE.BufferGeometry {
  return assets.geometry('mound', () => new THREE.SphereGeometry(0.17, 8, 6));
}

/** Heaps are flattened spheres: scale y. */
export const GUANO_FLATTEN = 0.55;

/** Emitters (goteros) on the tape, one per plant spot. */
export const EMITTER = { radius: 0.02, height: 0.06 } as const;
/** Height of an emitter's centre above the ridge top (on the tape). */
export const EMITTER_Y = 0.02 + EMITTER.height / 2;

export function emittersAlong(depth: number): number[] {
  return spotsAlong(depth);
}

export function emitterGeometry(assets: SceneAssets): THREE.BufferGeometry {
  return assets.geometry(
    'emitter',
    () => new THREE.CylinderGeometry(EMITTER.radius, EMITTER.radius, EMITTER.height, 6),
  );
}

/** Between the first two ridges: where a worker walks, and where the valve is. */
export function laneX(width: number): number {
  const ridges = ridgeXs(width).length;
  return ridges > 1 ? -width / 2 + width / ridges : -width / 4;
}

/** Trellis wire height, from the ground. */
export const WIRE_HEIGHT = 2.3;
/** Height of the young plants when they are first tied to their strings. */
export const TIED_PLANT_HEIGHT = 0.7;

/** Height of the plants in production (phase 7). */
export const PRODUCING_PLANT_HEIGHT = 1.9;

export function cucumberGeometry(assets: SceneAssets): THREE.BufferGeometry {
  return assets.geometry('cucumber', () => new THREE.CapsuleGeometry(0.04, 0.22, 3, 6));
}

export function cucumberMaterial(assets: SceneAssets): THREE.Material {
  return assets.material(COLORS.cucumber, { roughness: 0.6 });
}

/**
 * Ripe cucumbers hanging on the i-th plant of a ridge, on its path side (+x):
 * offsets from the plant's base on the ridge.
 */
export function ripeCucumbers(i: number): { dx: number; dy: number; dz: number; rz: number }[] {
  const r = random(500 + i * 31);
  return [0, 1].map((k) => ({
    dx: 0.1 + r() * 0.05,
    dy: 0.55 + k * 0.45 + r() * 0.2,
    dz: (r() - 0.5) * 0.2,
    rz: -0.15 + (r() - 0.5) * 0.3,
  }));
}

/** Height of the dead plants at the end of the cycle (phase 8), before they sag. */
export const DRIED_PLANT_HEIGHT = 1.3;
/** Dry leaf colours of the dead plants, one per plant variant. */
export const DRY_LEAVES = [COLORS.dried, COLORS.leafOld, COLORS.driedDark];

/** A dead plant (variant `v`), as drawn at the end of the cycle. */
export function deadPlantGeometry(assets: SceneAssets, v: number, roots = false) {
  return cucumberPlantGeometry(assets, v, DRIED_PLANT_HEIGHT, {
    flowers: 0,
    leafColor: DRY_LEAVES[v],
    vineColor: COLORS.driedDark,
    wilt: true,
    roots,
  });
}

/**
 * How far a pulled-up plant rises: it still hangs from its string, with its
 * roots out of the ridge.
 */
export const UPROOT_LIFT = 0.26;

/**
 * A dead plant hanging from its string at the end of the cycle, a little
 * askew: the i-th plant of a ridge. `lift` raises it out of the ridge.
 */
export function hangingPlant(x: number, z: number, i: number, lift = 0) {
  const r = random(900 + i * 17);
  return {
    x,
    y: SOIL_HEIGHT + RIDGE_HEIGHT + lift,
    z,
    rx: (r() - 0.5) * 0.25,
    ry: r() * Math.PI * 2,
    rz: (r() - 0.5) * 0.25,
    sy: 0.85 + r() * 0.2,
  };
}

/** Where the i-th cut root of the first ridge lands: on the floor outside the bed. */
export function thrownRoot(width: number, z: number, i: number) {
  const r = random(300 + i * 23);
  return {
    x: -width / 2 - 0.35 - r() * 0.35,
    y: 0.07,
    z: z - 0.3 + (r() - 0.5) * 0.3,
    rx: Math.PI / 2 + (r() - 0.5) * 0.6,
    ry: r() * Math.PI * 2,
  };
}

/** Where the i-th plant taken out of a bed lands: lying on the floor beside it. */
export function discardedPlant(width: number, z: number, i: number) {
  const r = random(700 + i * 13);
  return {
    x: -width / 2 - 0.95 - r() * 0.4,
    y: 0.1,
    z: z - 0.5 + (r() - 0.5) * 0.3,
    // Laid along the bed, its leaves flattened under it.
    rx: Math.PI / 2,
    rz: (r() - 0.5) * 0.6,
    sy: 0.85 + r() * 0.2,
  };
}

/** Yellow fruit on the i-th dead plant of a ridge, on the bed's outer side (-x). */
export function yellowCucumbers(i: number): { dx: number; dy: number; dz: number; rz: number }[] {
  return ripeCucumbers(i).map((c, k) => ({ ...c, dx: -c.dx, dy: 0.45 + k * 0.35, rz: -c.rz }));
}

/** Where the k-th yellow fruit of the i-th plant lands: on the floor beside the bed. */
export function discardedCucumber(width: number, z: number, i: number, k: number) {
  const r = random(1300 + i * 29 + k * 7);
  return {
    x: -width / 2 - 0.4 - r() * 0.3,
    y: 0.045,
    z: z + (r() - 0.5) * 0.4,
    rx: Math.PI / 2,
    rz: r() * Math.PI * 2,
  };
}

/** Height of the plants while growing (phase 6). */
export const GROWING_PLANT_HEIGHT = 1.2;
/** Leaves below this height are cut off when cleaning the plants. */
export const PRUNE_HEIGHT = 0.5;
/** Leaves cut from each plant (the nodes below PRUNE_HEIGHT). */
export const CUT_LEAVES = 3;
/** Size of a cut leaf lying on the plastic. */
export const FALLEN_LEAF_SIZE = 0.17;

/**
 * Where the k-th leaf cut from the i-th plant of a ridge lands: flat on the
 * plastic, on the path side of the plant.
 */
export function fallenLeaf(x: number, z: number, i: number, k: number) {
  return { x: x + 0.1 + 0.05 * k, z: z + [-0.12, 0.1, -0.02][k % 3], ry: i * 1.7 + k * 2.3 };
}

/** Height of a seedling above the ridge. */
export const SEEDLING_HEIGHT = 0.15;

/** Seedling (plantín) positions along a ridge: one per plant spot. */
export function seedlingsAlong(depth: number): number[] {
  return spotsAlong(depth);
}

/** Trench down the middle of a ridge, and the broza laid in it. */
export const TRENCH_WIDTH = 0.24;
export const BROZA = { width: 0.2, height: 0.03 } as const;
/** Soil laid over the broza (15 cm in the field), a low mound on the ridge. */
export const SOIL_CAP = { width: 0.5, height: 0.08 } as const;

export interface BedOptions {
  width: number;
  depth: number;
  /** Phase order 1–8, or null for bare soil. */
  phase: number | null;
  seed: number;
  /**
   * Drawn for this work instead of by phase. The first ridge is left as it
   * was before the work, since the worker draws the change.
   */
  ridgeWork?: RidgeWork;
  /** Whether producing plants (phase 7) carry fruit; true when left out. */
  fruit?: boolean;
}

/**
 * A bed (lote) dressed for its phase (PLAN §10, "Vista 3D"). Local origin is
 * the bed centre at ground level. Returns the group and the height of its
 * tallest element, used to size the fade overlay.
 */
export function buildBed(
  assets: SceneAssets,
  options: BedOptions,
): { group: THREE.Group; height: number } {
  const { width, depth, phase } = options;
  const rand = random(options.seed);
  const group = new THREE.Group();
  const top = SOIL_HEIGHT;
  const ridgeTop = top + RIDGE_HEIGHT;
  const length = ridgeLength(depth);
  let height = ridgeTop;

  const soilColor =
    phase === 4 ? COLORS.soilWet : phase && phase >= 2 ? COLORS.soilDark : COLORS.soil;
  group.add(box(assets, [width, SOIL_HEIGHT, depth], soilColor, [0, SOIL_HEIGHT / 2, 0]));

  const tapeMaterial = assets.material(COLORS.tape, { roughness: 0.6 });
  // Drip tape with its emitters on the given ridges, fed by a main line
  // across the front end of the bed, with its valve.
  const tapes = (xs: number[]) => {
    const irrigation = new THREE.Group();
    irrigation.add(
      instanced(
        tapeGeometry(assets),
        tapeMaterial,
        xs.map((x) => ({ x: x + TAPE_OFFSET, y: ridgeTop + 0.02, z: 0, sz: length })),
      ),
      instanced(
        emitterGeometry(assets),
        assets.material(COLORS.emitter, { roughness: 0.5 }),
        xs.flatMap((x) =>
          emittersAlong(depth).map((z) => ({ x: x + TAPE_OFFSET, y: ridgeTop + EMITTER_Y, z })),
        ),
      ),
    );
    const mainZ = length / 2 + 0.15;
    const valveX = laneX(width);
    irrigation.add(
      box(assets, [width, 0.07, 0.07], COLORS.mainLine, [0, top + 0.035, mainZ]),
      box(assets, [0.06, 0.16, 0.06], COLORS.metal, [valveX, top + 0.11, mainZ]),
      box(assets, [0.2, 0.03, 0.05], COLORS.valve, [valveX, top + 0.2, mainZ]),
    );
    return irrigation;
  };
  const ridges = (covered: (i: number) => boolean, soil: number = COLORS.soil) => {
    for (const [i, x] of ridgeXs(width).entries()) {
      const plastic = covered(i);
      group.add(
        box(
          assets,
          [RIDGE_WIDTH + (plastic ? COVER_EXTRA : 0), RIDGE_HEIGHT, length],
          plastic ? COLORS.mush : soil,
          [x, top + RIDGE_HEIGHT / 2, 0],
          plastic ? { roughness: 0.45 } : {},
        ),
      );
    }
  };

  const guano = (xs: number[]) =>
    instanced(
      guanoGeometry(assets),
      assets.material(COLORS.guano),
      xs.flatMap((x) =>
        guanoAlong(depth).map((z) => ({
          x: x + (rand() - 0.5) * 0.1,
          y: ridgeTop,
          z,
          sy: GUANO_FLATTEN,
        })),
      ),
    );

  const seedlings = (xs: number[]) =>
    instanced(
      seedlingGeometry(assets),
      seedlingMaterial(assets),
      xs.flatMap((x) =>
        spotsAlong(depth).map((z) => ({ x, y: ridgeTop, z, ry: rand() * Math.PI * 2 })),
      ),
    );

  // Cucumber plants standing at these spots, each variant one instanced mesh.
  const cucumberPlants = (
    at: { x: number; z: number }[],
    plantHeight: number,
    options: { flowers?: number; bare?: number } = {},
  ) =>
    Array.from({ length: PLANT_VARIANTS }, (_, v) =>
      instanced(
        cucumberPlantGeometry(assets, v, plantHeight, options),
        plantMaterial(assets),
        at
          .filter((_, i) => i % PLANT_VARIANTS === v)
          .map((s) => ({ x: s.x, y: ridgeTop, z: s.z, ry: rand() * Math.PI * 2 })),
      ),
    );

  // Trellis: a wire over each ridge and a string down to every plant spot.
  const trellis = (xs: number[]) => {
    const wire = assets.geometry('wire', () =>
      new THREE.CylinderGeometry(0.012, 0.012, 1, 4).rotateX(Math.PI / 2),
    );
    const string = assets.geometry('string', () =>
      new THREE.CylinderGeometry(0.006, 0.006, 1, 3).translate(0, 0.5, 0),
    );
    const strings = instanced(
      string,
      assets.material(COLORS.string, { roughness: 1 }),
      xs.flatMap((x) =>
        spotsAlong(depth).map((z) => ({ x, y: ridgeTop, z, sy: WIRE_HEIGHT - ridgeTop })),
      ),
    );
    strings.castShadow = false;
    return [
      instanced(
        wire,
        assets.material(COLORS.frame, { metalness: 0.4, roughness: 0.5 }),
        xs.map((x) => ({ x, y: WIRE_HEIGHT, z: 0, sz: length })),
      ),
      strings,
    ];
  };

  const work = options.ridgeWork;
  if (work) {
    const others = ridgeXs(width).slice(1);
    if (work === 'pull-plastic' || work === 'lay-plastic') {
      ridges((i) => i > 0);
      // When laying, the first ridge has nothing yet.
      group.add(tapes(work === 'pull-plastic' ? ridgeXs(width) : others));
    } else if (
      work === 'uproot' ||
      work === 'cut-root' ||
      work === 'dry-plants' ||
      work === 'clear-plants'
    ) {
      // Dead plants still hanging from their strings. Pulling: the others
      // already out, roots in the air. Cutting: every plant out (the first
      // ridge's roots are the worker's), the others' roots thrown outside.
      // Drying: every root outside; the plants are the worker's, as they
      // change while drying. Clearing: the other ridges' plants and yellow
      // fruit already out beside the bed, only their strings left; the
      // first ridge's are the worker's.
      ridges(() => true);
      group.add(tapes(ridgeXs(width)), ...trellis(ridgeXs(width)));
      const hanging = (xs: number[], lift: number, roots: boolean) =>
        Array.from({ length: PLANT_VARIANTS }, (_, v) =>
          instanced(
            deadPlantGeometry(assets, v, roots),
            plantMaterial(assets),
            xs.flatMap((x) =>
              spotsAlong(depth)
                .map((z, i) => ({ i, p: hangingPlant(x, z, i, lift) }))
                .filter(({ i }) => i % PLANT_VARIANTS === v)
                .map(({ p }) => p),
            ),
          ),
        );
      if (work === 'uproot') {
        group.add(...hanging(others, UPROOT_LIFT, true));
      } else {
        if (work === 'cut-root') group.add(...hanging(ridgeXs(width), UPROOT_LIFT, false));
        if (work === 'clear-plants') {
          const out = others.flatMap((_, k) =>
            spotsAlong(depth).map((z, i) => ({ z, i: i + (k + 1) * 1000 })),
          );
          group.add(
            ...Array.from({ length: PLANT_VARIANTS }, (_, v) =>
              instanced(
                deadPlantGeometry(assets, v),
                plantMaterial(assets),
                out
                  .filter(({ i }) => i % PLANT_VARIANTS === v)
                  .map(({ z, i }) => discardedPlant(width, z, i)),
              ),
            ),
            instanced(
              cucumberGeometry(assets),
              assets.material(COLORS.cucumberYellow, { roughness: 0.6 }),
              out.flatMap(({ z, i }) => [0, 1].map((k) => discardedCucumber(width, z, i, k))),
            ),
          );
        }
        // Roots already cut, thrown out beside the bed.
        group.add(
          instanced(
            rootsGeometry(assets),
            plantMaterial(assets),
            (work === 'cut-root' ? others : ridgeXs(width)).flatMap((_, k) =>
              spotsAlong(depth).map((z) => ({
                x: -width / 2 - 0.3 - rand() * 0.5,
                y: 0.07,
                z: z + (rand() - 0.5) * 0.4 + k * 0.05,
                rx: Math.PI / 2 + (rand() - 0.5) * 0.6,
                ry: rand() * Math.PI * 2,
              })),
            ),
          ),
        );
      }
      return { group, height: WIRE_HEIGHT + 0.05 };
    } else if (work === 'harvest-fruit') {
      // Producing plants on every ridge; the others already picked, with only
      // young fruit left for the next harvest.
      ridges(() => true);
      group.add(tapes(ridgeXs(width)), ...trellis(ridgeXs(width)));
      const all = plantSpots(width, depth);
      group.add(...cucumberPlants(all, PRODUCING_PLANT_HEIGHT, { flowers: 0.45 }));
      group.add(
        instanced(
          cucumberGeometry(assets),
          cucumberMaterial(assets),
          all.flatMap((s) =>
            [0, 1].map(() => ({
              x: s.x + (rand() - 0.5) * 0.24,
              y: ridgeTop + 1.25 + rand() * 0.4,
              z: s.z + (rand() - 0.5) * 0.2,
              rz: (rand() - 0.5) * 0.4,
              sx: 0.5,
              sy: 0.45,
              sz: 0.5,
            })),
          ),
        ),
      );
      return { group, height: WIRE_HEIGHT + 0.05 };
    } else if (work === 'prune-leaves') {
      // Growing plants; the others already cleaned, their leaves on the plastic.
      ridges(() => true);
      group.add(tapes(ridgeXs(width)), ...trellis(ridgeXs(width)));
      group.add(
        ...cucumberPlants(
          others.flatMap((x) => spotsAlong(depth).map((z) => ({ x, z }))),
          GROWING_PLANT_HEIGHT,
          { flowers: 0.2, bare: PRUNE_HEIGHT },
        ),
      );
      group.add(
        instanced(
          cucumberLeafGeometry(assets),
          plantMaterial(assets),
          others.flatMap((x) =>
            spotsAlong(depth).flatMap((z, i) =>
              Array.from({ length: CUT_LEAVES }, (_, k) => {
                const leaf = fallenLeaf(x, z, i, k);
                const size = FALLEN_LEAF_SIZE;
                return { ...leaf, y: ridgeTop + 0.004, sx: size, sz: size };
              }),
            ),
          ),
        ),
      );
      return { group, height: WIRE_HEIGHT + 0.05 };
    } else if (work === 'tie-plants') {
      // Young plants, strings already hung; the others already tied up.
      ridges(() => true);
      group.add(tapes(ridgeXs(width)), ...trellis(ridgeXs(width)));
      group.add(
        ...cucumberPlants(
          others.flatMap((x) => spotsAlong(depth).map((z) => ({ x, z }))),
          TIED_PLANT_HEIGHT,
          { flowers: 0.15 },
        ),
      );
      return { group, height: WIRE_HEIGHT + 0.05 };
    } else if (work === 'plant-seedlings') {
      // Ready for planting; the others already have their seedlings.
      ridges(() => true);
      group.add(tapes(ridgeXs(width)), seedlings(others));
      return { group, height: ridgeTop + SEEDLING_HEIGHT };
    } else if (work === 'pull-tape' || work === 'lay-tape') {
      ridges(() => false);
      group.add(tapes(others));
    } else if (work === 'fill-broza' || work === 'cover-broza') {
      // Guano already mixed in, and a trench down every ridge.
      ridges(() => false, COLORS.soilMixed);
      const strip = (xs: number[], color: number, [w, h]: [number, number]) =>
        instanced(
          assets.geometry('unit-box', () => new THREE.BoxGeometry(1, 1, 1)),
          assets.material(color, { roughness: 1 }),
          xs.map((x) => ({ x, y: ridgeTop + h / 2, z: 0, sx: w, sy: h, sz: length })),
        );
      group.add(strip(ridgeXs(width), COLORS.trench, [TRENCH_WIDTH, 0.006]));
      if (work === 'fill-broza') {
        // The others already filled with broza.
        group.add(strip(others, COLORS.dried, [BROZA.width, BROZA.height]));
      } else {
        // Every trench has its broza; the others already covered with soil.
        group.add(strip(ridgeXs(width), COLORS.dried, [BROZA.width, BROZA.height]));
        group.add(strip(others, COLORS.soil, [SOIL_CAP.width, SOIL_CAP.height]));
      }
    } else {
      // drop-guano and mix-guano: guano still on top of the other ridges.
      ridges(() => false);
      group.add(guano(others));
    }
    return { group, height: ridgeTop + 0.1 };
  }

  if (!phase) return { group, height };

  // 1. Clearing: bare soil with leftover mush scraps and drip tape.
  if (phase === 1) {
    const scrap = assets.geometry('scrap', () => new THREE.BoxGeometry(1, 0.02, 1));
    const scraps: Placement[] = Array.from({ length: 14 }, () => ({
      x: (rand() - 0.5) * (width - 0.6),
      y: top + 0.01,
      z: (rand() - 0.5) * (depth - 0.6),
      ry: rand() * Math.PI,
      sx: 0.3 + rand() * 0.5,
      sz: 0.2 + rand() * 0.35,
    }));
    group.add(instanced(scrap, assets.material(COLORS.plasticScrap, { roughness: 0.5 }), scraps));
    const piece = assets.geometry('tape-piece', () => new THREE.BoxGeometry(0.04, 0.02, 1));
    const pieces: Placement[] = Array.from({ length: 6 }, () => ({
      x: (rand() - 0.5) * (width - 0.6),
      y: top + 0.015,
      z: (rand() - 0.5) * (depth - 2),
      ry: (rand() - 0.5) * 0.8,
      sz: 1 + rand() * 2,
    }));
    group.add(instanced(piece, tapeMaterial, pieces));
    return { group, height: top + 0.05 };
  }

  // 2+. Ridges: bare soil (2), then covered with mush (3 onwards).
  ridges(() => phase >= 3);

  if (phase === 2) {
    group.add(guano(ridgeXs(width)));
    return { group, height: ridgeTop + 0.1 };
  }

  // Drip tape on top of every covered ridge.
  group.add(tapes(ridgeXs(width)));

  if (phase <= 4) return { group, height: ridgeTop + 0.05 };

  const spots = plantSpots(width, depth);

  // 5. Seedlings.
  if (phase === 5) {
    group.add(seedlings(ridgeXs(width)));
    return { group, height: ridgeTop + SEEDLING_HEIGHT };
  }

  // 8. Closing: dead plants, dry and yellow, some still standing (tilted) and
  // some fallen on the ridge.
  if (phase === 8) {
    group.add(
      ...Array.from({ length: PLANT_VARIANTS }, (_, v) =>
        instanced(
          deadPlantGeometry(assets, v),
          plantMaterial(assets),
          spots
            .filter((_, i) => i % PLANT_VARIANTS === v)
            .map((s) => {
              const lying = rand() < 0.45;
              return {
                x: s.x,
                y: ridgeTop,
                z: s.z,
                rx: lying ? (rand() < 0.5 ? -1 : 1) * (1.2 + rand() * 0.3) : (rand() - 0.5) * 0.7,
                ry: rand() * Math.PI * 2,
                rz: (rand() - 0.5) * 0.5,
                sy: 0.75 + rand() * 0.35,
              };
            }),
        ),
      ),
    );
    return { group, height: ridgeTop + DRIED_PLANT_HEIGHT };
  }

  // 6–7. Trellised plants; production is taller, with more flowers and fruit.
  const producing = phase === 7;
  const plantHeight = producing ? PRODUCING_PLANT_HEIGHT : GROWING_PLANT_HEIGHT;
  group.add(...cucumberPlants(spots, plantHeight, { flowers: producing ? 0.45 : 0.2 }));

  if (producing && options.fruit !== false) {
    const fruits: Placement[] = [];
    for (const s of spots) {
      const count = 1 + Math.floor(rand() * 3);
      for (let k = 0; k < count; k++) {
        fruits.push({
          x: s.x + (rand() - 0.5) * 0.25,
          y: ridgeTop + 0.4 + rand() * (plantHeight - 0.7),
          z: s.z + (rand() - 0.5) * 0.25,
          rz: (rand() - 0.5) * 0.4,
        });
      }
    }
    group.add(instanced(cucumberGeometry(assets), cucumberMaterial(assets), fruits));
  }

  group.add(...trellis(ridgeXs(width)));
  height = WIRE_HEIGHT + 0.05;

  return { group, height };
}
