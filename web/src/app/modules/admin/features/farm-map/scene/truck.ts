import * as THREE from 'three';
import { COLORS, type SceneAssets } from './materials';

/** The farm's two trucks, parked facing the front (+z). */
export type TruckModel = 'h100' | 'df815';

interface TruckSpec {
  cab: number;
  /** Cab length, front to back. */
  cabLength: number;
  cabHeight: number;
  /** Height of the bed's floor. */
  deck: number;
  /** Height of the bed's sides above the deck. */
  sides: number;
  /** Sides made of planks with gaps (stake sides) instead of solid panels. */
  stakes: boolean;
  wheel: number;
  /** Twin rear wheels on each side. */
  twinRear: boolean;
}

const SPECS: Record<TruckModel, TruckSpec> = {
  // Hyundai H100: small white cab-over pickup with a flat bed and low
  // drop sides, single wheels all round.
  h100: {
    cab: COLORS.truckWhite,
    cabLength: 0.95,
    cabHeight: 1.45,
    deck: 0.72,
    sides: 0.32,
    stakes: false,
    wheel: 0.28,
    twinRear: false,
  },
  // Dongfeng DF-815: a bigger blue cab-over truck with tall wooden stake
  // sides and twin rear wheels.
  df815: {
    cab: COLORS.truckBlue,
    cabLength: 1.1,
    cabHeight: 1.7,
    deck: 0.85,
    sides: 0.95,
    stakes: true,
    wheel: 0.34,
    twinRear: true,
  },
};

/** A low-poly truck filling a width × depth footprint, centred on the origin. */
export function buildTruck(
  assets: SceneAssets,
  model: TruckModel,
  width: number,
  depth: number,
): THREE.Group {
  const spec = SPECS[model];
  const group = new THREE.Group();
  const box = (
    size: [number, number, number],
    at: [number, number, number],
    color: number,
    options: THREE.MeshStandardMaterialParameters = {},
  ) => {
    const mesh = new THREE.Mesh(
      assets.geometry('unit-box', () => new THREE.BoxGeometry(1, 1, 1)),
      assets.material(color, options),
    );
    mesh.scale.set(...size);
    mesh.position.set(...at);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  const front = depth / 2;
  const cabBack = front - spec.cabLength;
  const bedLength = depth - spec.cabLength - 0.08;
  const bedCentre = -depth / 2 + bedLength / 2;
  const groundUp = spec.wheel * 0.9;

  // Chassis rails under everything.
  box([width * 0.7, 0.18, depth * 0.92], [0, groundUp, 0], COLORS.tyre);

  // Cab-over: a tall box at the front, glass on the top half of its face.
  const cabBase = groundUp + 0.1;
  const cabTop = cabBase + spec.cabHeight;
  box(
    [width, spec.cabHeight, spec.cabLength],
    [0, cabBase + spec.cabHeight / 2, front - spec.cabLength / 2],
    spec.cab,
    { roughness: 0.45 },
  );
  box(
    [width * 0.88, spec.cabHeight * 0.4, 0.03],
    [0, cabTop - spec.cabHeight * 0.27, front + 0.005],
    COLORS.glass,
    { roughness: 0.1, metalness: 0.3 },
  );
  // Side windows.
  for (const sx of [-1, 1]) {
    box(
      [0.03, spec.cabHeight * 0.36, spec.cabLength * 0.6],
      [(sx * width) / 2 + sx * 0.005, cabTop - spec.cabHeight * 0.27, front - spec.cabLength * 0.4],
      COLORS.glass,
      { roughness: 0.1, metalness: 0.3 },
    );
  }
  // Bumper, grille and headlights.
  box([width * 1.02, 0.16, 0.12], [0, cabBase + 0.06, front + 0.04], COLORS.tyre);
  box([width * 0.5, 0.18, 0.02], [0, cabBase + 0.32, front + 0.01], COLORS.tyre);
  for (const sx of [-1, 1]) {
    box([0.2, 0.12, 0.03], [(sx * width) / 2.9, cabBase + 0.32, front + 0.012], COLORS.headlight, {
      emissive: COLORS.headlight,
      emissiveIntensity: 0.25,
    });
  }

  // Bed: deck and its sides.
  const deckY = spec.deck;
  box([width, 0.08, bedLength], [0, deckY, bedCentre], COLORS.metal);
  const sideY = deckY + 0.04 + spec.sides / 2;
  const sideColor = spec.stakes ? COLORS.wood : spec.cab;
  const wall = (size: [number, number, number], at: [number, number, number]) => {
    if (!spec.stakes) {
      box(size, at, sideColor, { roughness: 0.5 });
      return;
    }
    // Stake sides: three planks with gaps, held by posts at the ends.
    const planks = 3;
    const plank = spec.sides / (planks * 1.6);
    for (let i = 0; i < planks; i++) {
      const y = at[1] - spec.sides / 2 + plank / 2 + (i * (spec.sides - plank)) / (planks - 1);
      box([size[0], plank, size[2]], [at[0], y, at[2]], sideColor);
    }
  };
  for (const sx of [-1, 1]) {
    wall([0.05, spec.sides, bedLength], [(sx * (width - 0.05)) / 2, sideY, bedCentre]);
  }
  wall([width, spec.sides, 0.05], [0, sideY, -depth / 2 + 0.025]);
  wall([width, spec.sides, 0.05], [0, sideY, cabBack - 0.06]);
  if (spec.stakes) {
    // Corner posts.
    for (const sx of [-1, 1]) {
      for (const z of [-depth / 2 + 0.04, cabBack - 0.06]) {
        box(
          [0.07, spec.sides + 0.06, 0.07],
          [(sx * (width - 0.07)) / 2, sideY, z],
          COLORS.woodDark,
        );
      }
    }
  }

  // Wheels: front under the cab, rear under the bed (twinned on the DF-815).
  const wheelGeometry = assets.geometry('truck-wheel', () =>
    new THREE.CylinderGeometry(1, 1, 1, 14).rotateZ(Math.PI / 2),
  );
  const tyre = assets.material(COLORS.tyre, { roughness: 0.9 });
  const hub = assets.material(COLORS.metal, { metalness: 0.4, roughness: 0.4 });
  const wheel = (x: number, z: number) => {
    const t = new THREE.Mesh(wheelGeometry, tyre);
    t.scale.set(0.2, spec.wheel, spec.wheel);
    t.position.set(x, spec.wheel, z);
    t.castShadow = true;
    const h = new THREE.Mesh(wheelGeometry, hub);
    h.scale.set(0.21, spec.wheel * 0.5, spec.wheel * 0.5);
    h.position.copy(t.position);
    group.add(t, h);
  };
  const frontZ = front - spec.cabLength * 0.55;
  const rearZ = -depth / 2 + bedLength * 0.3;
  for (const sx of [-1, 1]) {
    const x = (sx * (width - 0.16)) / 2;
    wheel(x, frontZ);
    wheel(x, rearZ);
    if (spec.twinRear) wheel(x - sx * 0.21, rearZ);
  }
  return group;
}
