import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS, type SceneAssets } from './materials';

/**
 * A seedling (plantín) as it comes from the nursery: a cube of substrate with
 * two thin stems, small seed leaves and two broad leaves. Origin at the base
 * of the stems, where it meets the ground; the plug sits mostly below.
 * One geometry with vertex colours, so a whole row is a single instanced mesh.
 */
export function seedlingGeometry(assets: SceneAssets): THREE.BufferGeometry {
  return assets.geometry('seedling-plant', () => {
    const part = (geometry: THREE.BufferGeometry, color: number, matrix: THREE.Matrix4) => {
      geometry.applyMatrix4(matrix);
      const c = new THREE.Color(color);
      const count = geometry.getAttribute('position').count;
      geometry.setAttribute(
        'color',
        new THREE.Float32BufferAttribute(
          Array.from({ length: count }, () => [c.r, c.g, c.b]).flat(),
          3,
        ),
      );
      return geometry;
    };
    const at = (
      position: [number, number, number],
      rotation: [number, number, number] = [0, 0, 0],
      scale: [number, number, number] = [1, 1, 1],
    ) =>
      new THREE.Matrix4().compose(
        new THREE.Vector3(...position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
        new THREE.Vector3(...scale),
      );
    const stem = (height: number, lean: number) =>
      part(
        new THREE.CylinderGeometry(0.006, 0.009, height, 5).translate(0, height / 2, 0),
        COLORS.seedlingStem,
        at([0, 0, 0], [0, 0, lean]),
      );
    // Tip of a stem of this height leaning by this angle (rotation about z).
    const tip = (height: number, lean: number): [number, number, number] => [
      -Math.sin(lean) * height,
      Math.cos(lean) * height,
      0,
    ];
    const leaf = (centre: [number, number, number], tilt: number, size: number) =>
      part(
        new THREE.SphereGeometry(1, 7, 4),
        COLORS.leafYoung,
        at(centre, [0.25, 0, tilt], [size, 0.008, size * 0.9]),
      );
    const [tall, short] = [0.13, 0.09];
    const [leanTall, leanShort] = [0.18, -0.35];
    const tallTip = tip(tall, leanTall);
    const shortTip = tip(short, leanShort);
    const seedLeaf = (side: number) =>
      part(
        new THREE.SphereGeometry(1, 6, 3),
        COLORS.seedLeaf,
        at([side * 0.025, 0.06, 0], [0, 0, side * 0.5], [0.03, 0.006, 0.012]),
      );
    return mergeGeometries([
      part(new THREE.BoxGeometry(0.055, 0.05, 0.055), COLORS.substrate, at([0, -0.012, 0])),
      stem(tall, leanTall),
      stem(short, leanShort),
      seedLeaf(-1),
      seedLeaf(1),
      // Broad leaves at the top of each stem, hanging off to its side.
      leaf([tallTip[0] - 0.035, tallTip[1] + 0.005, 0], 0.35, 0.055),
      leaf([shortTip[0] + 0.03, shortTip[1] + 0.005, 0.01], -0.35, 0.045),
    ]);
  });
}

export function seedlingMaterial(assets: SceneAssets): THREE.Material {
  return assets.material(0xffffff, { vertexColors: true, roughness: 0.8 });
}
