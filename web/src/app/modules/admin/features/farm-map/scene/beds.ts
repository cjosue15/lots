import * as THREE from 'three';
import { COLORS, type SceneAssets } from './materials';

/** Ridges (camellones) per bed and their spacing. */
const RIDGES = 3;
const RIDGE_WIDTH = 0.6;
const RIDGE_HEIGHT = 0.22;
const SOIL_HEIGHT = 0.12;
const PLANT_SPACING = 0.45;

/** Small deterministic PRNG, so a bed looks the same on every render. */
function random(seed: number): () => number {
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

/** x of each ridge centre inside a bed of the given width. */
function ridgeXs(width: number): number[] {
  const step = width / RIDGES;
  return Array.from({ length: RIDGES }, (_, i) => -width / 2 + step / 2 + i * step);
}

/** Plant positions along every ridge. */
function plantSpots(width: number, depth: number): { x: number; z: number }[] {
  const length = depth - 0.8;
  const count = Math.floor(length / PLANT_SPACING);
  const start = -((count - 1) * PLANT_SPACING) / 2;
  return ridgeXs(width).flatMap((x) =>
    Array.from({ length: count }, (_, i) => ({ x, z: start + i * PLANT_SPACING })),
  );
}

export interface BedOptions {
  width: number;
  depth: number;
  /** Phase order 1–8, or null for bare soil. */
  phase: number | null;
  seed: number;
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
  const ridgeLength = depth - 0.5;
  let height = ridgeTop;

  const soilColor =
    phase === 4 ? COLORS.soilWet : phase && phase >= 2 ? COLORS.soilDark : COLORS.soil;
  group.add(box(assets, [width, SOIL_HEIGHT, depth], soilColor, [0, SOIL_HEIGHT / 2, 0]));

  if (!phase) return { group, height };

  // 1. Clearing: bare soil with leftover mulch scraps and drip tape.
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
    const tape = assets.geometry('tape-piece', () => new THREE.BoxGeometry(0.04, 0.02, 1));
    const tapes: Placement[] = Array.from({ length: 6 }, () => ({
      x: (rand() - 0.5) * (width - 0.6),
      y: top + 0.015,
      z: (rand() - 0.5) * (depth - 2),
      ry: (rand() - 0.5) * 0.8,
      sz: 1 + rand() * 2,
    }));
    group.add(instanced(tape, assets.material(COLORS.tape, { roughness: 0.6 }), tapes));
    return { group, height: top + 0.05 };
  }

  // 2+. Ridges: bare soil (2), then covered with mulch (3 onwards).
  const covered = phase >= 3;
  for (const x of ridgeXs(width)) {
    group.add(
      box(
        assets,
        [RIDGE_WIDTH + (covered ? 0.06 : 0), RIDGE_HEIGHT, ridgeLength],
        covered ? COLORS.mulch : COLORS.soil,
        [x, top + RIDGE_HEIGHT / 2, 0],
        covered ? { roughness: 0.45 } : {},
      ),
    );
  }

  if (phase === 2) {
    const mound = assets.geometry('mound', () => new THREE.SphereGeometry(0.17, 8, 6));
    const mounds = plantSpots(width, depth)
      .filter((_, i) => i % 2 === 0)
      .map((s) => ({ x: s.x + (rand() - 0.5) * 0.1, y: ridgeTop, z: s.z, sy: 0.55 }));
    group.add(instanced(mound, assets.material(COLORS.guano), mounds));
    return { group, height: ridgeTop + 0.1 };
  }

  // Drip tape on top of every covered ridge.
  const tape = assets.geometry('tape', () =>
    new THREE.CylinderGeometry(0.025, 0.025, 1, 6).rotateX(Math.PI / 2),
  );
  group.add(
    instanced(
      tape,
      assets.material(COLORS.tape, { roughness: 0.6 }),
      ridgeXs(width).map((x) => ({ x: x + 0.12, y: ridgeTop + 0.02, z: 0, sz: ridgeLength })),
    ),
  );

  if (phase <= 4) return { group, height: ridgeTop + 0.05 };

  const spots = plantSpots(width, depth);

  // 5. Seedlings.
  if (phase === 5) {
    const leaf = assets.geometry('seedling', () => new THREE.IcosahedronGeometry(0.09, 0));
    const stem = assets.geometry('stem', () =>
      new THREE.CylinderGeometry(0.02, 0.025, 1, 5).translate(0, 0.5, 0),
    );
    group.add(
      instanced(
        stem,
        assets.material(COLORS.stem),
        spots.map((s) => ({ x: s.x, y: ridgeTop, z: s.z, sy: 0.18 })),
      ),
    );
    group.add(
      instanced(
        leaf,
        assets.material(COLORS.leafYoung),
        spots.map((s) => ({ x: s.x, y: ridgeTop + 0.2, z: s.z, sy: 0.6, ry: rand() * Math.PI })),
      ),
    );
    return { group, height: ridgeTop + 0.3 };
  }

  const stem = assets.geometry('stem', () =>
    new THREE.CylinderGeometry(0.02, 0.025, 1, 5).translate(0, 0.5, 0),
  );
  const leaf = assets.geometry('leaf', () => new THREE.IcosahedronGeometry(0.2, 0));

  // 8. Closing: dried plants, tilted or lying on the ridge.
  if (phase === 8) {
    const plants = spots.map((s) => {
      const lying = rand() < 0.45;
      return {
        s,
        h: 0.7 + rand() * 0.6,
        tiltX: lying ? (rand() < 0.5 ? -1 : 1) * (1.2 + rand() * 0.3) : (rand() - 0.5) * 0.7,
        tiltZ: (rand() - 0.5) * 0.5,
      };
    });
    group.add(
      instanced(
        stem,
        assets.material(COLORS.driedDark),
        plants.map((p) => ({ x: p.s.x, y: ridgeTop, z: p.s.z, sy: p.h, rx: p.tiltX, rz: p.tiltZ })),
      ),
    );
    const leaves: Placement[] = [];
    for (const p of plants) {
      for (let k = 0; k < 2; k++) {
        const t = 0.35 + k * 0.4;
        // Point along the tilted stem.
        const dir = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(p.tiltX, 0, p.tiltZ));
        leaves.push({
          x: p.s.x + dir.x * p.h * t,
          y: ridgeTop + dir.y * p.h * t,
          z: p.s.z + dir.z * p.h * t,
          sx: 0.7,
          sy: 0.45,
          sz: 0.7,
          ry: rand() * Math.PI,
        });
      }
    }
    group.add(instanced(leaf, assets.material(COLORS.dried), leaves));
    return { group, height: ridgeTop + 1.1 };
  }

  // 6–7. Trellised plants; production adds fruit and flowers.
  const producing = phase === 7;
  const plantHeight = producing ? 1.9 : 1.2;
  const wireHeight = 2.3;

  group.add(
    instanced(
      stem,
      assets.material(COLORS.stem),
      spots.map((s) => ({ x: s.x, y: ridgeTop, z: s.z, sy: plantHeight * (0.9 + rand() * 0.2) })),
    ),
  );

  const leaves: Placement[] = [];
  const fruits: Placement[] = [];
  const flowers: Placement[] = [];
  const layers = producing ? 5 : 3;
  for (const s of spots) {
    for (let k = 0; k < layers; k++) {
      const y = ridgeTop + ((k + 0.6) / layers) * plantHeight;
      const side = k % 2 === 0 ? 1 : -1;
      const size = 0.8 + rand() * 0.4;
      leaves.push({
        x: s.x + side * 0.1,
        y,
        z: s.z + (rand() - 0.5) * 0.12,
        sx: size,
        sy: size * 0.7,
        sz: size,
        ry: rand() * Math.PI,
      });
    }
    if (producing) {
      const count = 1 + Math.floor(rand() * 3);
      for (let k = 0; k < count; k++) {
        fruits.push({
          x: s.x + (rand() - 0.5) * 0.3,
          y: ridgeTop + 0.4 + rand() * (plantHeight - 0.7),
          z: s.z + (rand() - 0.5) * 0.3,
          rz: (rand() - 0.5) * 0.4,
        });
      }
      if (rand() < 0.5) {
        flowers.push({
          x: s.x + (rand() - 0.5) * 0.3,
          y: ridgeTop + plantHeight * (0.5 + rand() * 0.4),
          z: s.z + (rand() - 0.5) * 0.3,
        });
      }
    }
  }
  group.add(instanced(leaf, assets.material(producing ? COLORS.leaf : COLORS.leafYoung), leaves));

  if (producing) {
    const fruit = assets.geometry('cucumber', () => new THREE.CapsuleGeometry(0.04, 0.22, 3, 6));
    group.add(instanced(fruit, assets.material(COLORS.cucumber, { roughness: 0.6 }), fruits));
    const flower = assets.geometry('flower', () => new THREE.IcosahedronGeometry(0.045, 0));
    group.add(
      instanced(
        flower,
        assets.material(COLORS.flower, { emissive: COLORS.flower, emissiveIntensity: 0.15 }),
        flowers,
      ),
    );
  }

  // Trellis: a wire over each ridge and a string down to every plant.
  const wire = assets.geometry('wire', () =>
    new THREE.CylinderGeometry(0.012, 0.012, 1, 4).rotateX(Math.PI / 2),
  );
  const string = assets.geometry('string', () =>
    new THREE.CylinderGeometry(0.006, 0.006, 1, 3).translate(0, 0.5, 0),
  );
  const stringMaterial = assets.material(COLORS.string, { roughness: 1 });
  group.add(
    instanced(
      wire,
      assets.material(COLORS.frame, { metalness: 0.4, roughness: 0.5 }),
      ridgeXs(width).map((x) => ({ x, y: wireHeight, z: 0, sz: ridgeLength })),
    ),
  );
  const strings = instanced(
    string,
    stringMaterial,
    spots.map((s) => ({ x: s.x, y: ridgeTop, z: s.z, sy: wireHeight - ridgeTop })),
  );
  strings.castShadow = false;
  group.add(strings);
  height = wireHeight + 0.05;

  return { group, height };
}
