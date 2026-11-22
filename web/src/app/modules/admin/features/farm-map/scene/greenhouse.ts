import * as THREE from 'three';
import type { Feature, GreenhousePlacement, Rect } from '../layout';
import { random } from './beds';
import { COLORS, type SceneAssets } from './materials';

/**
 * A greenhouse's ground: its covered floors and the things between lots
 * (pool, plants, hut). Roofs and mesh are left out so the lots stay visible.
 * Positions are in world coordinates.
 */
export function buildGreenhouse(assets: SceneAssets, gh: GreenhousePlacement): THREE.Group {
  const group = new THREE.Group();
  for (const floor of gh.floors) group.add(buildFloor(assets, floor));
  gh.features.forEach((feature, i) => group.add(buildFeature(assets, feature, i + 1)));
  return group;
}

function buildFloor(assets: SceneAssets, rect: Rect): THREE.Mesh {
  const floor = new THREE.Mesh(
    assets.geometry('unit-plane', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
    assets.material(COLORS.floor, { roughness: 1 }),
  );
  floor.scale.set(rect.width, 1, rect.depth);
  floor.position.set(rect.x, 0.005, rect.z);
  floor.receiveShadow = true;
  return floor;
}

function buildFeature(assets: SceneAssets, feature: Feature, seed: number): THREE.Group {
  const group = new THREE.Group();
  const { width: w, depth: d } = feature;
  if (feature.kind === 'pool') {
    // Concrete tank, its water seen from above inside the rim.
    group.add(block(assets, [w, 0.4, d], [0, 0.2, 0], COLORS.concrete));
    group.add(
      block(assets, [w - 0.6, 0.02, d - 0.6], [0, 0.41, 0], COLORS.water, {
        roughness: 0.15,
        metalness: 0.1,
      }),
    );
  } else if (feature.kind === 'plants') {
    group.add(block(assets, [w, 0.08, d], [0, 0.04, 0], COLORS.soil));
    const rand = random(seed);
    const shrub = assets.geometry('shrub', () => new THREE.IcosahedronGeometry(1, 1));
    const greens = [COLORS.shrub, COLORS.leaf, COLORS.stem];
    for (let i = 0; i < 14; i++) {
      const size = 0.45 + rand() * 0.55;
      const bush = new THREE.Mesh(shrub, assets.material(greens[i % greens.length]));
      bush.scale.set(size, size * (0.8 + rand() * 0.5), size);
      bush.position.set((rand() - 0.5) * (w - 1), size * 0.7, (rand() - 0.5) * (d - 1));
      bush.castShadow = true;
      group.add(bush);
    }
  } else {
    // Guard's hut: adobe walls, a door and a sloped tin roof.
    const height = 2.2;
    group.add(block(assets, [w, height, d], [0, height / 2, 0], COLORS.adobe));
    group.add(block(assets, [0.9, 1.8, 0.05], [-w / 4, 0.9, d / 2 + 0.03], COLORS.door));
    const roof = block(assets, [w + 0.5, 0.08, d + 0.6], [0, height + 0.2, 0], COLORS.tin, {
      metalness: 0.35,
      roughness: 0.5,
    });
    roof.rotation.x = 0.13;
    group.add(roof);
  }
  group.position.set(feature.x, 0, feature.z);
  return group;
}

function block(
  assets: SceneAssets,
  size: [number, number, number],
  position: [number, number, number],
  color: number,
  options: THREE.MeshStandardMaterialParameters = {},
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    assets.geometry('unit-box', () => new THREE.BoxGeometry(1, 1, 1)),
    assets.material(color, options),
  );
  mesh.scale.set(...size);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
