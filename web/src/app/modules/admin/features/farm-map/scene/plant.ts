import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS, type SceneAssets } from './materials';
import { random } from './beds';

/** Different plants per bed, so a row does not look copied. */
export const PLANT_VARIANTS = 3;

/** Vertical gap between leaves along the vine. */
const NODE_GAP = 0.17;

/**
 * Outline of a cucumber leaf: broad, heart-shaped at the petiole, with five
 * shallow pointed lobes. Petiole at the origin, tip at (1, 0).
 */
const LEAF_HALF: [number, number][] = [
  [0.04, 0.1],
  [-0.02, 0.28],
  [0.1, 0.42],
  [0.2, 0.37],
  [0.36, 0.5],
  [0.48, 0.4],
  [0.7, 0.38],
  [0.74, 0.22],
  [1, 0],
];

function leafGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  for (const [u, v] of LEAF_HALF) shape.lineTo(u, v);
  for (const [u, v] of [...LEAF_HALF].reverse().slice(1)) shape.lineTo(u, -v);
  shape.lineTo(0, 0);
  // Lie it flat, along +x.
  return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
}

function coloured(geometry: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  // Merged parts must share attributes: drop uvs, which nothing here uses.
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute('uv');
  const c = new THREE.Color(color);
  const count = g.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

interface PlantLeaf {
  /** Where the petiole leaves the vine. */
  node: THREE.Vector3;
  /** Direction of the petiole. */
  out: THREE.Vector3;
  petiole: number;
  /** Takes the flat leaf (petiole at the origin, along +x) to its place. */
  matrix: THREE.Matrix4;
  flower: boolean;
}

/** Vine and leaves of a plant variant; the same every time for a variant. */
function plantLayout(
  variant: number,
  height: number,
  flowers: number,
  wilt = false,
): { vine: THREE.CatmullRomCurve3; segments: number; leaves: PlantLeaf[] } {
  const rand = random(1000 + variant * 7919);
  // The vine, winding a little around the string.
  const points = Array.from({ length: Math.ceil(height / 0.1) + 1 }, (_, i) => {
    const y = Math.min(height, i * 0.1);
    const a = i * 1.3 + variant;
    return new THREE.Vector3(Math.cos(a) * 0.015, y, Math.sin(a) * 0.015);
  });
  const vine = new THREE.CatmullRomCurve3(points);
  const leaves: PlantLeaf[] = [];
  const nodes = Math.floor((height - 0.1) / NODE_GAP);
  for (let n = 0; n < nodes; n++) {
    const t = (0.1 + n * NODE_GAP) / height;
    const node = vine.getPointAt(Math.min(1, t));
    // Turning around the vine, never two leaves on the same side.
    const angle = n * 2.4 + variant * 1.7 + (rand() - 0.5) * 0.6;
    const out = new THREE.Vector3(Math.cos(angle), 0.75, Math.sin(angle)).normalize();
    const petiole = 0.09 + rand() * 0.03;
    // Leaves get smaller towards the growing tip.
    const size = (0.12 + 0.08 * Math.min(1, (1 - t) * 2.2) + rand() * 0.02) * (wilt ? 0.75 : 1);
    const droop = wilt ? -1.15 - rand() * 0.3 : -0.35 - rand() * 0.3;
    const base = node.clone().addScaledVector(out, petiole);
    const matrix = new THREE.Matrix4()
      .makeTranslation(base.x, base.y, base.z)
      .multiply(new THREE.Matrix4().makeRotationY(-angle))
      .multiply(new THREE.Matrix4().makeRotationZ(droop))
      .multiply(new THREE.Matrix4().makeScale(size, 1, size));
    leaves.push({ node, out, petiole, matrix, flower: rand() < flowers && n > 1 });
  }
  return { vine, segments: points.length * 2, leaves };
}

interface PlantOptions {
  /** Chance of a flower at each node. */
  flowers?: number;
  leafColor?: number;
  /** Leaves (and flowers) below this height have been cut off. */
  bare?: number;
  /** Leaves below this height are old and yellowing. */
  old?: number;
  vineColor?: number;
  /** Dead plant: leaves shrivelled and hanging straight down. */
  wilt?: boolean;
  /** Roots and a clod of soil under the origin (a plant pulled up). */
  roots?: boolean;
}

/**
 * A cucumber plant climbing its string: a thin vine winding slightly up from
 * the origin, a broad leaf on a petiole at every node, turning around the vine,
 * and a few small yellow flowers. One geometry with vertex colours, cached per
 * variant and height, so a row is one instanced mesh per variant.
 */
export function cucumberPlantGeometry(
  assets: SceneAssets,
  variant: number,
  height: number,
  {
    flowers = 0.35,
    leafColor = COLORS.leaf,
    bare = 0,
    old = 0,
    vineColor = COLORS.vine,
    wilt = false,
    roots = false,
  }: PlantOptions = {},
): THREE.BufferGeometry {
  const key = `cucumber-plant-${variant}-${height}-${flowers}-${leafColor}-${bare}-${old}-${vineColor}-${wilt}-${roots}`;
  return assets.geometry(key, () => {
    const { vine, segments, leaves } = plantLayout(variant, height, flowers, wilt);
    const parts = [coloured(new THREE.TubeGeometry(vine, segments, 0.012, 4), vineColor)];
    const leaf = leafGeometry();
    const up = new THREE.Vector3(0, 1, 0);
    for (const l of leaves.filter((l) => l.node.y >= bare)) {
      parts.push(
        coloured(
          new THREE.CylinderGeometry(0.005, 0.006, l.petiole, 3)
            .translate(0, l.petiole / 2, 0)
            .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, l.out))
            .translate(l.node.x, l.node.y, l.node.z),
          vineColor,
        ),
        coloured(leaf.clone().applyMatrix4(l.matrix), l.node.y < old ? COLORS.leafOld : leafColor),
      );
      if (l.flower) {
        // A small yellow flower where the petiole meets the vine.
        const p = l.node.clone().addScaledVector(l.out.clone().setY(0).normalize(), -0.035);
        parts.push(
          coloured(
            new THREE.IcosahedronGeometry(0.028, 0).scale(1, 0.6, 1).translate(p.x, p.y, p.z),
            COLORS.flower,
          ),
        );
      }
    }
    leaf.dispose();
    if (roots) parts.push(...rootParts());
    return mergeGeometries(parts);
  });
}

/**
 * Where the leaves below `bare` sit on a plant variant (see
 * `cucumberPlantGeometry`), lowest first: the ones a worker cuts off.
 */
export function cutLeaves(variant: number, height: number, bare: number): THREE.Matrix4[] {
  return plantLayout(variant, height, 0)
    .leaves.filter((l) => l.node.y < bare)
    .map((l) => l.matrix);
}

/** One loose old leaf, as on the plant (petiole at the origin, along +x). */
export function cucumberLeafGeometry(assets: SceneAssets): THREE.BufferGeometry {
  return assets.geometry('cucumber-leaf-old', () => coloured(leafGeometry(), COLORS.leafOld));
}

export function plantMaterial(assets: SceneAssets): THREE.Material {
  return assets.material(0xffffff, {
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.75,
  });
}

/** Clod of soil with roots spreading down from it, under the origin. */
function rootParts(): THREE.BufferGeometry[] {
  const parts = [
    coloured(
      new THREE.IcosahedronGeometry(0.075, 0).scale(1, 0.7, 1).translate(0, -0.05, 0),
      COLORS.soilDark,
    ),
  ];
  for (let r = 0; r < 8; r++) {
    const length = 0.14 + (r % 3) * 0.05;
    const out = new THREE.Vector3(Math.cos(r * 0.8), -1.4, Math.sin(r * 0.8)).normalize();
    parts.push(
      coloured(
        new THREE.CylinderGeometry(0.005, 0.011, length, 4)
          .translate(0, -length / 2, 0)
          .applyQuaternion(
            new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), out),
          )
          .translate(0, -0.07, 0),
        COLORS.root,
      ),
    );
  }
  return parts;
}

/** A plant's roots on their own, origin where the stem was (cut off). */
export function rootsGeometry(assets: SceneAssets): THREE.BufferGeometry {
  return assets.geometry('roots', () => mergeGeometries(rootParts()));
}
