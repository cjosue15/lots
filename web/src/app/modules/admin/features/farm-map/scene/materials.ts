import * as THREE from 'three';

/** Colours of the field, picked to sit on the arena theme. */
export const COLORS = {
  ground: 0xcbc2a8,
  floor: 0xe4dac6,
  soil: 0x7d5a3c,
  soilDark: 0x5e432c,
  soilWet: 0x3f2f23,
  guano: 0x5a4128,
  /** Soil with the guano turned in. */
  soilMixed: 0x4a3524,
  /** Open trench down a ridge. */
  trench: 0x24180f,
  mush: 0x23211f,
  tape: 0x2b4f73,
  /** Emitters (goteros) on the drip tape, and the main line feeding it. */
  emitter: 0xf2c230,
  mainLine: 0x222426,
  valve: 0xc23b22,
  drop: 0x8fd0f2,
  wet: 0x4f8fb8,
  /** Drops and wet patches of water mixed with a product: milky white. */
  dropProduct: 0xeeeee6,
  wetProduct: 0xb8b8ae,
  /** Backpack sprayer's hose, straps and nozzle. */
  sprayerHose: 0x2e3133,
  plasticScrap: 0x3a3836,
  stem: 0x4d7a35,
  /** Cucumber vine and petioles: light, almost yellowish green. */
  vine: 0x8fb862,
  leaf: 0x5f9a42,
  leafYoung: 0x7fb85a,
  /** Old lower leaves, yellowing: the ones cut off when cleaning the plant. */
  leafOld: 0xc2b64a,
  /** Seedlings (plantines): light stems and seed leaves, substrate plug. */
  seedlingStem: 0x9cc76e,
  seedLeaf: 0xa9d47a,
  substrate: 0x5a3d26,
  /** Roots of a pulled-up plant. */
  root: 0xa88a62,
  cucumber: 0x2f5a24,
  /** Overripe cucumbers left on the dead plants, gone yellow. */
  cucumberYellow: 0xd9b23a,
  flower: 0xe8c547,
  dried: 0xb39a62,
  driedDark: 0x8c7448,
  string: 0xe8e2d4,
  frame: 0x9aa3a0,
  concrete: 0xb9b5ab,
  water: 0x3f7f8a,
  shrub: 0x3f6f32,
  adobe: 0xc8ad86,
  door: 0x5a4632,
  tin: 0xa7adaf,
  /** Shed roof: green sheeting. */
  shedRoof: 0x3f7a45,
  // Worker and the things it carries.
  skin: 0x8d5a3b,
  pants: 0x3b4a5e,
  boots: 0x2e2620,
  hat: 0xd8c58a,
  wood: 0x9a7548,
  metal: 0x9ea3a6,
  bucket: 0xd8d4c8,
  sack: 0xc9b48a,
  trayBlack: 0x2a2a28,
  box: 0xf4f2ec,
  basket: 0xb08a52,
  today: 0xe0a526,
  hover: 0xffffff,
} as const;

/**
 * Geometries and materials shared by every bed, created once per scene and
 * disposed with it.
 */
export class SceneAssets {
  private readonly materials = new Map<string, THREE.Material>();
  private readonly geometries = new Map<string, THREE.BufferGeometry>();

  material(color: number, options: THREE.MeshStandardMaterialParameters = {}): THREE.Material {
    const key = `${color}-${JSON.stringify(options)}`;
    let material = this.materials.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...options });
      this.materials.set(key, material);
    }
    return material;
  }

  geometry(key: string, create: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let geometry = this.geometries.get(key);
    if (!geometry) {
      geometry = create();
      this.geometries.set(key, geometry);
    }
    return geometry;
  }

  /** Whether a geometry or material is shared (freed only in `dispose`). */
  owns(item: THREE.BufferGeometry | THREE.Material): boolean {
    return item instanceof THREE.BufferGeometry
      ? [...this.geometries.values()].includes(item)
      : [...this.materials.values()].includes(item);
  }

  dispose(): void {
    this.materials.forEach((material) => material.dispose());
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.clear();
    this.geometries.clear();
  }
}
