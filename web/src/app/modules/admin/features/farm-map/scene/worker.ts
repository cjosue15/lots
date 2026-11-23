import * as THREE from 'three';
import type { PropKind, WorkerAction } from '../worker-actions';
import { random, SOIL_HEIGHT } from './beds';
import { COLORS, type SceneAssets } from './materials';

/** Limb lengths (metres): about a 1.65 m worker. */
const THIGH = 0.46;
const SHIN = 0.46;
const FOOT = 0.05;
const UPPER_ARM = 0.29;
const FOREARM = 0.27;
const SHOULDER_Y = 0.5;
const STRIDE = 1.1;
/** From this phase on (trellised plants) the worker stays in the aisle. */
const TALL_PHASE = 6;

const SHIRTS = [0x6f9fc8, 0xe7e2d6, 0x8a9a55, 0xc0603f, 0xd9b04a];

interface Limb {
  upper: THREE.Group;
  lower: THREE.Group;
  end: THREE.Group;
}

/** Slots where props hang, so they follow the body. */
type Slot = 'handR' | 'handL' | 'back' | 'shoulderL' | 'front' | 'ground';

const PROP_SLOT: Record<PropKind, Slot> = {
  'mulch-roll': 'handL',
  'tape-coil': 'handL',
  'dry-plant': 'handR',
  machete: 'handR',
  bucket: 'handL',
  shovel: 'handR',
  broza: 'ground',
  sack: 'shoulderL',
  'tape-spool': 'front',
  'mulch-spool': 'front',
  sprayer: 'back',
  hose: 'handR',
  jug: 'ground',
  clipboard: 'handL',
  seedling: 'handR',
  tray: 'front',
  'string-spool': 'handL',
  scissors: 'handR',
  basket: 'handL',
  magnifier: 'handR',
  wrench: 'handR',
};

/**
 * A low-poly farm worker doing one action on one bed (PLAN §10, "Vista 3D").
 * Built from primitives; `update(t)` poses it for time t (seconds), moving
 * along the path between the first two ridges.
 */
export class Worker {
  readonly root = new THREE.Group();
  private readonly figure = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly arms: [Limb, Limb];
  private readonly legs: [Limb, Limb];
  private readonly slots: Record<Slot, THREE.Group>;
  private readonly trail: THREE.Mesh | null = null;
  private readonly halfLength: number;
  private readonly offset: number;

  constructor(
    private readonly assets: SceneAssets,
    private readonly action: WorkerAction,
    bed: { width: number; depth: number; phase: number | null },
    seed: number,
  ) {
    const rand = random(seed);
    this.offset = rand() * 20;
    this.halfLength = Math.max(0.5, bed.depth / 2 - 0.9);
    const ridges = Math.max(1, Math.round(bed.width));
    if ((bed.phase ?? 0) >= TALL_PHASE) {
      // Plants hide anyone between the rows: work from the aisle beside the bed.
      this.figure.position.x = -bed.width / 2 - 0.4;
    } else {
      // Walks on the soil, between the first two ridges.
      this.root.position.y = SOIL_HEIGHT;
      this.figure.position.x = ridges > 1 ? -bed.width / 2 + bed.width / ridges : -bed.width / 4;
    }

    const shirt = this.material(SHIRTS[Math.floor(rand() * SHIRTS.length)]);
    const pants = this.material(COLORS.pants);
    const skin = this.material(COLORS.skin);
    const boots = this.material(COLORS.boots);

    // Torso, head and hat.
    this.torso.add(this.mesh(this.capsule(0.15, 0.28), shirt, [0, 0.3, 0], [1.15, 1, 0.75]));
    this.head.position.y = SHOULDER_Y + 0.08;
    this.head.add(this.mesh(this.sphere(0.1), skin, [0, 0.11, 0]));
    const hat = this.material(COLORS.hat);
    this.head.add(this.mesh(this.cylinder(0.21, 0.21, 0.02), hat, [0, 0.19, 0]));
    this.head.add(this.mesh(this.cylinder(0.09, 0.11, 0.1), hat, [0, 0.25, 0]));
    this.torso.add(this.head);

    this.arms = [-1, 1].map((side) => {
      const arm = this.limb(UPPER_ARM, FOREARM, 0.045, shirt, skin);
      arm.upper.position.set(side * 0.21, SHOULDER_Y, 0);
      this.torso.add(arm.upper);
      return arm;
    }) as [Limb, Limb];
    this.legs = [-1, 1].map((side) => {
      const leg = this.limb(THIGH, SHIN, 0.065, pants, pants);
      leg.upper.position.set(side * 0.1, 0, 0);
      leg.end.add(this.mesh(this.box(), boots, [0, -0.01, 0.04], [0.11, FOOT, 0.22]));
      this.body.add(leg.upper);
      return leg;
    }) as [Limb, Limb];

    const back = new THREE.Group();
    back.position.set(0, 0.32, -0.17);
    const shoulderL = new THREE.Group();
    shoulderL.position.set(0.17, SHOULDER_Y + 0.06, -0.02);
    const front = new THREE.Group();
    front.position.set(0, 0.12, 0.3);
    this.torso.add(back, shoulderL, front);
    const ground = new THREE.Group();
    this.slots = {
      handR: this.arms[0].end,
      handL: this.arms[1].end,
      back,
      shoulderL,
      front,
      ground,
    };

    this.body.add(this.torso);
    this.figure.add(this.body, ground);
    this.root.add(this.figure);

    for (const kind of action.props) this.slots[PROP_SLOT[kind]].add(this.prop(kind));
    // Ground props stay beside the worker's path.
    ground.position.set(0.45, 0, 0);

    if (action.trail) {
      this.trail = this.mesh(this.box(), this.material(action.trail.color), [0, 0.01, 0]);
      this.trail.castShadow = false;
      this.trail.scale.set(action.trail.width, 0.02, 0.01);
      this.root.add(this.trail);
    }

    this.root.traverse((object) => {
      if (object instanceof THREE.Mesh) object.castShadow = true;
    });
  }

  update(seconds: number): void {
    const t = seconds + this.offset;
    this.resetPose();
    switch (this.action.motion) {
      case 'pick':
        this.pick(t);
        break;
      case 'shovel':
        this.shovel(t);
        break;
      case 'sack':
        this.sack(t);
        break;
      case 'lay':
        this.lay(t);
        break;
      case 'spray':
        this.spray(t);
        break;
      case 'water':
        this.water(t);
        break;
      case 'kneel':
        this.kneel(t);
        break;
      case 'carry':
        this.carry(t);
        break;
      case 'reach':
        this.reach(t);
        break;
      case 'harvest':
        this.harvest(t);
        break;
      case 'inspect':
        this.inspect(t);
        break;
    }
    this.plantFeet();
  }

  // Motions -------------------------------------------------------------

  private pick(t: number): void {
    const distance = this.walkTo(t * 0.22);
    this.walkLegs(distance, 0.25);
    this.squat(0.55, 0.95);
    this.torso.rotation.x = 1.0;
    this.head.rotation.x = -0.5;
    const reach = Math.max(0, Math.sin(t * 2.8));
    // Right hand picks from the ground; the left holds what was collected.
    this.pose(this.arms[0], -1.15 - 0.35 * reach, -0.1 - 0.4 * (1 - reach), -0.1);
    this.pose(this.arms[1], -1.7, -1.0, 0.15);
  }

  private shovel(t: number): void {
    const style = this.action.style ?? 'turn';
    this.walkTo(Math.floor(t / 2.6) * 0.5);
    this.legs[0].upper.rotation.set(-0.25, 0, -0.12);
    this.legs[1].upper.rotation.set(0.15, 0, 0.12);
    this.legs[0].lower.rotation.x = 0.35;
    const k = (t % 2.6) / 2.6;
    // Push in (0–0.35), lever up (0.35–0.65), throw or sweep (0.65–1).
    const push = smooth(k / 0.35);
    const lift = smooth((k - 0.35) / 0.3);
    const toss = Math.sin(Math.PI * clamp01((k - 0.65) / 0.35));
    const depth = style === 'dig' ? 0.25 : 0;
    this.torso.rotation.x = 0.35 + 0.35 * push - 0.3 * lift + depth;
    if (style === 'turn') this.torso.rotation.y = -0.7 * toss;
    if (style === 'push') this.torso.rotation.y = 0.5 * Math.sin(t * 2.4);
    const arms = -0.9 - 0.35 * lift + 0.25 * push;
    this.pose(this.arms[0], arms, -0.5, -0.05);
    this.pose(this.arms[1], arms + 0.35, -0.9, 0.25);
    const shovel = this.slots.handR.children[0];
    if (shovel) shovel.rotation.x = 0.6 + 0.3 * lift - 0.2 * push;
  }

  private sack(t: number): void {
    const distance = this.walkTo(t * 0.35);
    this.walkLegs(distance, 0.8);
    this.torso.rotation.x = 0.12;
    this.pose(this.arms[1], -2.7, -1.3, 0.2);
    const swing = Math.sin(t * 4);
    this.pose(this.arms[0], -0.5 - 0.6 * Math.max(0, swing), -0.4, -0.35 * Math.max(0, swing));
  }

  private lay(t: number): void {
    const { z, dir, from } = this.path(t * 0.4);
    this.figure.position.z = z;
    // Walks backwards, unrolling towards where it started.
    this.figure.rotation.y = dir > 0 ? Math.PI : 0;
    this.walkLegs(t * 0.4, 0.6);
    this.torso.rotation.x = 0.4;
    this.pose(this.arms[0], -0.8, -0.7, 0.15);
    this.pose(this.arms[1], -0.8, -0.7, -0.15);
    if (this.trail) {
      const length = Math.abs(z - from);
      this.trail.scale.z = Math.max(0.01, length);
      this.trail.position.set(this.figure.position.x, 0.01, (z + from) / 2);
    }
  }

  private spray(t: number): void {
    const distance = this.walkTo(t * 0.3);
    this.walkLegs(distance, 0.6);
    this.torso.rotation.x = 0.15;
    const sweep = Math.sin(t * 1.8);
    this.pose(this.arms[0], -1.0, -0.3, -0.25 * sweep - 0.1);
    this.torso.rotation.y = 0.25 * sweep;
    // Left hand works the pump lever.
    this.pose(this.arms[1], -0.3 + 0.25 * Math.sin(t * 5), -1.3, 0.1);
  }

  private water(t: number): void {
    this.walkTo(Math.floor(t / 6) * 1.2);
    this.torso.rotation.y = 0.45 * Math.sin(t * 0.8);
    this.torso.rotation.x = 0.1;
    this.pose(this.arms[0], -1.1, -0.35, -0.1);
    this.pose(this.arms[1], -0.6, -1.2, 0.1);
    this.head.rotation.x = 0.25;
  }

  private kneel(t: number): void {
    this.walkTo(Math.floor(t / 2.4) * 0.45);
    // Right knee on the ground, left foot forward.
    this.legs[0].upper.rotation.x = 0.1;
    this.legs[0].lower.rotation.x = 1.5;
    this.legs[1].upper.rotation.x = -1.35;
    this.legs[1].lower.rotation.x = 1.35;
    const k = (t % 2.4) / 2.4;
    const set = Math.sin(Math.PI * k);
    this.torso.rotation.x = 0.45 + 0.35 * set;
    this.head.rotation.x = -0.2;
    this.pose(this.arms[0], -0.7 - 0.6 * set, -0.2, -0.05);
    this.pose(this.arms[1], -0.3, -0.4, 0.2);
  }

  private carry(t: number): void {
    const distance = this.walkTo(t * 0.5);
    this.walkLegs(distance, 0.9);
    this.torso.rotation.x = -0.05;
    this.pose(this.arms[0], -0.55, -1.0, 0.25);
    this.pose(this.arms[1], -0.55, -1.0, -0.25);
  }

  private reach(t: number): void {
    this.walkTo(Math.floor(t / 3.2) * 0.45);
    this.torso.rotation.x = -0.05;
    this.head.rotation.x = -0.45;
    const a = Math.sin(t * 2.2);
    this.pose(this.arms[0], -2.5 - 0.25 * a, -0.3, -0.15);
    this.pose(this.arms[1], -2.3 + 0.25 * a, -0.5, 0.15);
  }

  private harvest(t: number): void {
    this.walkTo(Math.floor(t / 3) * 0.45);
    this.torso.rotation.x = 0.25;
    const k = Math.sin(t * 2.1);
    // Reaches into the plants on its right, then drops into the basket.
    this.torso.rotation.y = -0.4 * Math.max(0, k);
    this.pose(this.arms[0], -1.3 - 0.2 * k, -0.5 + 0.3 * k, -0.5 * Math.max(0, k));
    this.pose(this.arms[1], -0.35, -1.45, 0.1);
  }

  private inspect(t: number): void {
    // Walks a few steps, stops to look, and goes on.
    const cycle = 5;
    const k = (t % cycle) / cycle;
    const walking = k < 0.4;
    const distance = Math.floor(t / cycle) * 1.2 + (walking ? (k / 0.4) * 1.2 : 1.2);
    this.walkTo(distance);
    if (walking) this.walkLegs(distance, 0.8);
    this.torso.rotation.x = walking ? 0.05 : 0.35;
    this.head.rotation.y = walking ? 0 : 0.5 * Math.sin(t * 1.5);
    this.pose(this.arms[1], -0.5, -1.3, 0.1);
    const hasTool = this.action.props.some((p) => p === 'magnifier' || p === 'wrench');
    this.pose(this.arms[0], walking ? -0.2 : hasTool ? -1.3 : -0.4, walking ? -0.2 : -0.9, -0.05);
  }

  // Helpers ---------------------------------------------------------------

  /** Moves along the path; returns the distance walked (for the legs). */
  private walkTo(distance: number): number {
    const { z, dir } = this.path(distance);
    this.figure.position.z = z;
    this.figure.rotation.y = dir > 0 ? 0 : Math.PI;
    return distance;
  }

  /** Back and forth along the bed. */
  private path(distance: number): { z: number; dir: number; from: number } {
    const length = this.halfLength * 2;
    const cycle = distance % (2 * length);
    const forward = cycle < length;
    const along = forward ? cycle : 2 * length - cycle;
    return {
      z: -this.halfLength + along,
      dir: forward ? 1 : -1,
      from: forward ? -this.halfLength : this.halfLength,
    };
  }

  private walkLegs(distance: number, amount: number): void {
    const phase = (distance / STRIDE) * Math.PI * 2;
    this.legs.forEach((leg, i) => {
      const s = Math.sin(phase + i * Math.PI);
      leg.upper.rotation.x += -0.45 * amount * s;
      leg.lower.rotation.x += 0.55 * amount * Math.max(0, Math.sin(phase + i * Math.PI - 1.2));
    });
    this.body.position.y += 0.02 * amount * Math.abs(Math.cos(phase));
  }

  private squat(thigh: number, knee: number): void {
    for (const leg of this.legs) {
      leg.upper.rotation.x += -thigh;
      leg.lower.rotation.x += knee;
    }
  }

  private pose(arm: Limb, upper: number, lower: number, out: number): void {
    arm.upper.rotation.set(upper, 0, out);
    arm.lower.rotation.x = lower;
  }

  /** Puts the hips at the height where the lowest foot touches the ground. */
  private plantFeet(): void {
    const height = Math.max(
      ...this.legs.map(
        ({ upper, lower }) =>
          THIGH * Math.cos(upper.rotation.x) + SHIN * Math.cos(upper.rotation.x + lower.rotation.x),
      ),
    );
    this.body.position.y = height + FOOT + this.body.position.y;
  }

  private resetPose(): void {
    this.body.position.y = 0;
    this.torso.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
    for (const limb of [...this.arms, ...this.legs]) {
      limb.upper.rotation.set(0, 0, 0);
      limb.lower.rotation.set(0, 0, 0);
    }
  }

  // Building --------------------------------------------------------------

  private limb(
    upperLength: number,
    lowerLength: number,
    radius: number,
    upperMaterial: THREE.Material,
    lowerMaterial: THREE.Material,
  ): Limb {
    const upper = new THREE.Group();
    const lower = new THREE.Group();
    const end = new THREE.Group();
    upper.add(
      this.mesh(this.capsule(radius, upperLength - radius * 2), upperMaterial, [
        0,
        -upperLength / 2,
        0,
      ]),
    );
    lower.position.y = -upperLength;
    lower.add(
      this.mesh(this.capsule(radius * 0.9, lowerLength - radius * 2), lowerMaterial, [
        0,
        -lowerLength / 2,
        0,
      ]),
    );
    end.position.y = -lowerLength;
    lower.add(end);
    upper.add(lower);
    return { upper, lower, end };
  }

  private prop(kind: PropKind): THREE.Group {
    const g = new THREE.Group();
    const tint = this.material(this.action.tint ?? COLORS.tape);
    const wood = this.material(COLORS.wood);
    const metal = this.material(COLORS.metal, { metalness: 0.6, roughness: 0.4 });
    const add = (
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      position: [number, number, number],
      scale?: [number, number, number],
      rotation?: [number, number, number],
    ) => {
      const mesh = this.mesh(geometry, material, position, scale);
      if (rotation) mesh.rotation.set(...rotation);
      g.add(mesh);
      return mesh;
    };
    const cyl = this.cylinder(1, 1, 1);
    switch (kind) {
      case 'mulch-roll':
        add(
          cyl,
          this.material(COLORS.plasticScrap),
          [0, -0.05, 0.05],
          [0.13, 0.45, 0.13],
          [0, 0, Math.PI / 2],
        );
        break;
      case 'tape-coil':
        add(
          this.torus(),
          this.material(COLORS.tape),
          [0, -0.08, 0.05],
          [0.16, 0.16, 0.16],
          [Math.PI / 2, 0, 0],
        );
        break;
      case 'dry-plant':
        add(cyl, this.material(COLORS.dried), [0, -0.4, 0], [0.025, 0.8, 0.025]);
        add(this.sphere(1), this.material(COLORS.driedDark), [0, -0.85, 0], [0.18, 0.12, 0.18]);
        break;
      case 'machete':
        add(cyl, wood, [0, -0.04, 0], [0.025, 0.12, 0.025]);
        add(this.box(), metal, [0, -0.3, 0.02], [0.015, 0.42, 0.06]);
        break;
      case 'bucket':
        add(this.cylinder(0.16, 0.12, 0.26), this.material(COLORS.bucket), [0, -0.2, 0]);
        add(this.sphere(1), this.material(COLORS.flower), [0, -0.06, 0], [0.12, 0.05, 0.12]);
        break;
      case 'shovel':
        add(cyl, wood, [0, -0.5, 0], [0.022, 1.1, 0.022]);
        add(this.box(), metal, [0, -1.1, 0.02], [0.2, 0.26, 0.02]);
        break;
      case 'broza':
        for (let i = 0; i < 5; i++) {
          add(
            this.sphere(1),
            this.material(i % 2 ? COLORS.dried : COLORS.guano),
            [(i % 3) * 0.12 - 0.12, 0.06, Math.floor(i / 3) * 0.14 - 0.07],
            [0.12, 0.07, 0.1],
          );
        }
        break;
      case 'sack':
        add(
          this.capsule(0.13, 0.25),
          this.material(COLORS.sack),
          [0, 0.05, 0],
          [1, 1, 0.8],
          [0, 0, Math.PI / 2.4],
        );
        break;
      case 'tape-spool':
        add(cyl, this.material(COLORS.tape), [0, 0, 0], [0.14, 0.12, 0.14], [0, 0, Math.PI / 2]);
        add(cyl, wood, [0, 0, 0], [0.02, 0.4, 0.02], [0, 0, Math.PI / 2]);
        break;
      case 'mulch-spool':
        add(cyl, this.material(COLORS.mulch), [0, 0, 0], [0.12, 0.7, 0.12], [0, 0, Math.PI / 2]);
        break;
      case 'sprayer':
        add(cyl, tint, [0, 0, -0.04], [0.15, 0.48, 0.12]);
        break;
      case 'hose':
        add(cyl, metal, [0, -0.05, 0.12], [0.015, 0.3, 0.015], [Math.PI / 2.2, 0, 0]);
        add(
          this.torus(),
          this.material(COLORS.hose),
          [0, -0.5, -0.15],
          [0.3, 0.3, 0.3],
          [Math.PI / 2, 0, 0],
        );
        break;
      case 'jug':
        add(this.box(), tint, [0, 0.16, 0], [0.2, 0.32, 0.14]);
        add(cyl, this.material(COLORS.string), [0, 0.35, 0], [0.04, 0.06, 0.04]);
        break;
      case 'clipboard':
        add(this.box(), wood, [0, -0.04, 0.06], [0.2, 0.015, 0.28], [0.5, 0, 0]);
        add(
          this.box(),
          this.material(COLORS.string),
          [0, -0.03, 0.06],
          [0.17, 0.016, 0.22],
          [0.5, 0, 0],
        );
        break;
      case 'seedling':
        add(this.sphere(1), this.material(COLORS.leafYoung), [0, -0.08, 0], [0.06, 0.08, 0.06]);
        add(this.box(), this.material(COLORS.soilDark), [0, -0.02, 0], [0.05, 0.05, 0.05]);
        break;
      case 'tray':
        add(this.box(), this.material(COLORS.trayBlack), [0, 0, 0], [0.42, 0.06, 0.3]);
        for (let i = 0; i < 6; i++) {
          add(
            this.sphere(1),
            this.material(COLORS.leafYoung),
            [(i % 3) * 0.13 - 0.13, 0.06, Math.floor(i / 3) * 0.14 - 0.07],
            [0.05, 0.05, 0.05],
          );
        }
        break;
      case 'string-spool':
        add(cyl, this.material(COLORS.string), [0, -0.06, 0.04], [0.06, 0.1, 0.06]);
        break;
      case 'scissors':
        add(this.box(), metal, [0, -0.1, 0.02], [0.03, 0.16, 0.02], [0, 0, 0.25]);
        add(this.box(), metal, [0, -0.1, 0.02], [0.03, 0.16, 0.02], [0, 0, -0.25]);
        break;
      case 'basket':
        add(this.cylinder(0.2, 0.15, 0.2), this.material(COLORS.basket), [0, -0.12, 0.08]);
        for (let i = 0; i < 3; i++) {
          add(
            this.capsule(0.03, 0.14),
            this.material(COLORS.cucumber),
            [i * 0.08 - 0.08, 0.0, 0.08],
            undefined,
            [Math.PI / 2, 0, 0.3 * i],
          );
        }
        break;
      case 'magnifier':
        add(cyl, wood, [0, -0.05, 0], [0.018, 0.12, 0.018]);
        add(this.torus(), metal, [0, -0.17, 0], [0.06, 0.06, 0.06], [0, Math.PI / 2, 0]);
        break;
      case 'wrench':
        add(this.box(), metal, [0, -0.1, 0.02], [0.03, 0.22, 0.02]);
        add(this.box(), metal, [0, -0.22, 0.02], [0.07, 0.04, 0.02]);
        break;
    }
    return g;
  }

  private mesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: [number, number, number],
    scale?: [number, number, number],
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    if (scale) mesh.scale.set(...scale);
    return mesh;
  }

  private material(color: number, options: THREE.MeshStandardMaterialParameters = {}) {
    return this.assets.material(color, options);
  }

  private box() {
    return this.assets.geometry('unit-box', () => new THREE.BoxGeometry(1, 1, 1));
  }

  private sphere(radius: number) {
    return this.assets.geometry(
      `w-sphere-${radius}`,
      () => new THREE.SphereGeometry(radius, 12, 8),
    );
  }

  private capsule(radius: number, length: number) {
    return this.assets.geometry(
      `w-capsule-${radius}-${length}`,
      () => new THREE.CapsuleGeometry(radius, Math.max(0.01, length), 4, 8),
    );
  }

  private cylinder(top: number, bottom: number, height: number) {
    return this.assets.geometry(
      `w-cyl-${top}-${bottom}-${height}`,
      () => new THREE.CylinderGeometry(top, bottom, height, 12),
    );
  }

  private torus() {
    return this.assets.geometry('w-torus', () => new THREE.TorusGeometry(1, 0.3, 6, 16));
  }
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};
