import * as THREE from 'three';

/** Colours of the field, picked to sit on the arena theme. */
export const COLORS = {
  ground: 0xcbc2a8,
  floor: 0xe4dac6,
  soil: 0x7d5a3c,
  soilDark: 0x5e432c,
  soilWet: 0x3f2f23,
  guano: 0x5a4128,
  mulch: 0x23211f,
  tape: 0x2b4f73,
  plasticScrap: 0x3a3836,
  stem: 0x4d7a35,
  leaf: 0x5f9a42,
  leafYoung: 0x7fb85a,
  cucumber: 0x2f5a24,
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
