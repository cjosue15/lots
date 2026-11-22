import * as THREE from 'three';
import { COLORS, type SceneAssets } from './materials';

const ARCH_HEIGHT = 4.6;
const RIB_SPACING = 4;

/**
 * A tunnel greenhouse: light floor, translucent arched roof along x and a few
 * metal ribs. Local origin is the floor centre.
 */
export function buildGreenhouse(assets: SceneAssets, width: number, depth: number): THREE.Group {
  const group = new THREE.Group();
  const radius = depth / 2;
  const squash = ARCH_HEIGHT / radius;

  const floor = new THREE.Mesh(
    assets.geometry('unit-plane', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
    assets.material(COLORS.floor, { roughness: 1 }),
  );
  floor.scale.set(width, 1, depth);
  floor.position.y = 0.005;
  floor.receiveShadow = true;
  group.add(floor);

  const roofMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.roof,
    transparent: true,
    opacity: 0.16,
    roughness: 0.3,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  // Half cylinder (upper half once rotated) along x, squashed to the arch height.
  const roof = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, width, 40, 1, true, 0, Math.PI),
    roofMaterial,
  );
  roof.rotation.z = Math.PI / 2;
  roof.scale.x = squash;
  roof.renderOrder = 2;
  group.add(roof);

  // End walls.
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.CircleGeometry(radius, 40, 0, Math.PI), roofMaterial);
    wall.rotation.y = Math.PI / 2;
    wall.scale.y = squash;
    wall.position.x = (side * width) / 2;
    wall.renderOrder = 2;
    group.add(wall);
  }

  // Ribs.
  const ribGeometry = new THREE.TorusGeometry(radius, 0.05, 5, 40, Math.PI);
  const ribMaterial = assets.material(COLORS.frame, { metalness: 0.5, roughness: 0.4 });
  const ribs = Math.max(2, Math.round(width / RIB_SPACING) + 1);
  for (let i = 0; i < ribs; i++) {
    const rib = new THREE.Mesh(ribGeometry, ribMaterial);
    rib.rotation.y = Math.PI / 2;
    rib.scale.y = squash;
    rib.position.x = -width / 2 + (i * width) / (ribs - 1);
    rib.castShadow = true;
    group.add(rib);
  }

  return group;
}
