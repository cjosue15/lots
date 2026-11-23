import * as THREE from 'three';
import type { PropKind, RidgeWork, WorkerAction } from '../worker-actions';
import {
  BROZA,
  COVER_EXTRA,
  EMITTER,
  EMITTER_Y,
  emitterGeometry,
  emittersAlong,
  laneX,
  GUANO_FLATTEN,
  guanoAlong,
  guanoGeometry,
  RIDGE_HEIGHT,
  RIDGE_WIDTH,
  random,
  SOIL_CAP,
  ridgeLength,
  ridgeXs,
  SOIL_HEIGHT,
  seedlingsAlong,
  TAPE_OFFSET,
  tapeGeometry,
  TIED_PLANT_HEIGHT,
  fallenLeaf,
  FALLEN_LEAF_SIZE,
  GROWING_PLANT_HEIGHT,
  PRUNE_HEIGHT,
  CUT_LEAVES,
  cucumberGeometry,
  cucumberMaterial,
  ripeCucumbers,
  deadPlantGeometry,
  hangingPlant,
  thrownRoot,
  UPROOT_LIFT,
  discardedCucumber,
  discardedPlant,
  yellowCucumbers,
  COVER_TOP,
  DRENCH_RADIUS,
  drenchGeometry,
  drenchMaterial,
} from './beds';
import { COLORS, type SceneAssets } from './materials';
import {
  cucumberLeafGeometry,
  cucumberPlantGeometry,
  cutLeaves,
  PLANT_VARIANTS,
  plantMaterial,
  rootsGeometry,
} from './plant';
import { seedlingGeometry, seedlingMaterial } from './seedling';

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
/** The drip tape is on the ridges from this phase on (installed in phase 3). */
const TAPE_PHASE = 3;

const SHIRTS = [0x6f9fc8, 0xe7e2d6, 0x8a9a55, 0xc0603f, 0xd9b04a];

/** The first ridge's changing part: `update` gets where the hands are along it. */
interface RidgeProgress {
  length: number;
  depth: number;
  update(edge: number): void;
  /** Runs once the pose is final, for things that follow the hands. */
  afterPose?(): void;
  /** Runs every frame, for things that change with time rather than the hands. */
  tick?(t: number): void;
}

/** Seconds for the hanging plants to dry (3 to 5 days in the field), then start over. */
const DRY_CYCLE = 16;
/** Tint over the plants' colours once fully dried: dull brown. */
const DRIED_TINT = new THREE.Color(0x8a6a4a);
/** Dry leaves each plant sheds while drying. */
const SHED_LEAVES = 3;
/** Seconds for the worker to check one plant. */
const FEEL_CYCLE = 3.4;

/** Seconds to pick one plant's cucumbers. */
const PICK_CYCLE = 3.6;
/** When, in a plant's cycle, each cucumber comes off the plant. */
const PICKS = [0.35, 0.75];
/** Scratch rotations for keepUpright. */
const UPRIGHT = { hand: new THREE.Quaternion(), heading: new THREE.Quaternion() };

/** Seconds to pull up one plant. */
const UPROOT_CYCLE = 3;
/** When, in a plant's cycle, it starts coming out, and for how long. */
const UPROOT = { pull: 0.3, span: 0.3 };
/** Seconds to cut one plant's root and throw it. */
const CUT_CYCLE = 3.6;
/** When, in a plant's cycle: the two chops, the grab, the throw and the landing. */
const CUT = { chops: [0.3, 0.42], grab: 0.5, throw: 0.65, land: 0.82 };
/** Seconds to clear one plant: its two yellow fruit, then the plant itself. */
const CLEAR_CYCLE = 6;
/** When, in a plant's cycle, each yellow fruit and then the plant is reached, grabbed, thrown and lands. */
const CLEAR = {
  fruits: [
    { reach: 0.1, grab: 0.2, throw: 0.27, land: 0.36 },
    { reach: 0.34, grab: 0.44, throw: 0.51, land: 0.6 },
  ],
  plant: { reach: 0.6, grab: 0.68, down: 0.78, throw: 0.84, land: 0.95 },
  /** How long the hand keeps hold once the throw starts. */
  release: 0.05,
};

/** Seconds to spray one seedling's base. */
const DRENCH_CYCLE = 2.6;
/** When, in a seedling's cycle, the step to it ends, and the spray starts and stops. */
const DRENCH = { step: 0.22, spray: 0.36, stop: 0.8 };
/** How far short of the seedling the worker stands, so the lance reaches forward. */
const DRENCH_STANDOFF = 0.12;
/** Mist particles coming out of the sprayer's nozzle. */
const MIST = 36;

/** Most cucumbers drawn in a basket. */
const BASKET_FRUIT = 9;

/** A placement (as in beds.ts) as a matrix. */
function placed(p: {
  x: number;
  y: number;
  z: number;
  rx?: number;
  ry?: number;
  rz?: number;
  sy?: number;
}): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(p.x, p.y, p.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0)),
    new THREE.Vector3(1, p.sy ?? 1, 1),
  );
}

interface Limb {
  upper: THREE.Group;
  lower: THREE.Group;
  end: THREE.Group;
}

/** Slots where props hang, so they follow the body. */
type Slot = 'handR' | 'handL' | 'back' | 'shoulderL' | 'front' | 'ground';

const PROP_SLOT: Record<PropKind, Slot> = {
  'mush-roll': 'handL',
  'tape-coil': 'handL',
  machete: 'handR',
  bucket: 'handL',
  shovel: 'handR',
  broza: 'ground',
  sack: 'shoulderL',
  'tape-spool': 'front',
  'mush-spool': 'front',
  sprayer: 'back',
  jug: 'ground',
  clipboard: 'handL',
  pencil: 'handR',
  seedling: 'handR',
  tray: 'front',
  'seedling-box': 'front',
  'string-spool': 'handL',
  scissors: 'handR',
  basket: 'handL',
  magnifier: 'handR',
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
  /** The first ridge's changing part (see RidgeWork), set from the hands' z. */
  private readonly ridgeWork: RidgeProgress | null = null;
  /** Drops under every emitter, with where each one forms. */
  private readonly drops: Drops | null = null;
  private readonly halfLength: number;
  private readonly depth: number;
  /** A prop hanging from the hand by its handle, kept upright (the basket). */
  private hanging: THREE.Group | null = null;
  /** Cucumbers in the basket, if the worker carries one. */
  private basketFruit: THREE.InstancedMesh | null = null;
  /** Lance, hose and mist of the backpack sprayer, if the worker carries one. */
  private readonly sprayer: Sprayer | null = null;
  /** Where the mist goes while drenching (a seedling's base); null = along the lance. */
  private sprayTarget: THREE.Vector3 | null = null;
  /** Whether the sprayer is spraying this frame. */
  private spraying = false;
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
    this.depth = bed.depth;
    if (action.motion === 'valve') {
      // Just off the front end of the bed, facing the valve on the main line.
      this.figure.position.set(laneX(bed.width), 0, bed.depth / 2 + 0.35);
      this.figure.rotation.y = Math.PI;
    } else if (
      action.motion === 'uproot' ||
      action.motion === 'cut' ||
      action.motion === 'feel' ||
      action.motion === 'clear' ||
      action.ridge === 'drench-seedlings'
    ) {
      // On the bed's outer edge beside the first ridge, facing it (and the
      // camera), so the plant coming out is in view; pulled plants go outside.
      this.figure.position.set(-bed.width / 2 + 0.02, SOIL_HEIGHT, 0);
    } else if ((bed.phase ?? 0) >= TALL_PHASE && !action.ridge) {
      // Plants hide anyone between the rows: work from the aisle beside the bed.
      this.figure.position.x = -bed.width / 2 - 0.4;
    } else {
      // Walks on the soil, between the first two ridges.
      this.figure.position.y = SOIL_HEIGHT;
      this.figure.position.x = laneX(bed.width);
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

    for (const kind of action.props) {
      const prop = this.prop(kind);
      if (kind === 'seedling-box' && action.motion !== 'carry') {
        // Set down in the path just behind the worker, its floor on the soil.
        ground.add(prop);
        prop.position.set(-0.45, 0.08, -0.55);
        prop.rotation.y = Math.PI / 2;
      } else {
        this.slots[PROP_SLOT[kind]].add(prop);
      }
      if (kind === 'basket') this.hanging = prop;
    }
    // Ground props stay beside the worker's path.
    ground.position.set(0.45, 0, 0);

    if (action.ridge) this.ridgeWork = this.buildRidgeWork(action.ridge, bed);
    // No drops before the tape is laid: they would fall from thin air.
    if (action.drip && (bed.phase ?? 0) >= TAPE_PHASE) this.drops = this.buildDrops(bed);
    if (action.props.includes('sprayer')) this.sprayer = this.buildSprayer();

    this.root.traverse((object) => {
      // Water, mist and wet patches cast no shadow.
      if (object instanceof THREE.Mesh && !(object.material as THREE.Material).transparent) {
        object.castShadow = true;
      }
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
      case 'valve':
        this.valve(t);
        break;
      case 'note':
        this.note(t);
        break;
      case 'lift':
        this.lift(t);
        break;
      case 'prune':
        this.prune(t);
        break;
      case 'uproot':
        this.uproot(t);
        break;
      case 'cut':
        this.cutRoot(t);
        break;
      case 'feel':
        this.feel(t);
        break;
      case 'clear':
        this.clear(t);
        break;
    }
    this.ridgeWork?.tick?.(t);
    this.plantFeet();
    this.keepUpright();
    this.ridgeWork?.afterPose?.();
    if (this.drops) this.drip(t, this.drops);
    if (this.sprayer) this.updateSprayer(t, this.sprayer);
  }

  // Motions -------------------------------------------------------------

  private pick(t: number): void {
    const distance = this.ridgeWork
      ? this.alongRidge(t * 0.22, this.ridgeWork)
      : this.walkTo(t * 0.22);
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
    // A step forward after each shovelful.
    const step = Math.floor(t / 2.6) * 0.5;
    if (this.ridgeWork) this.alongRidge(step, this.ridgeWork);
    else this.walkTo(step);
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
    const distance = this.ridgeWork
      ? this.alongRidge(t * 0.35, this.ridgeWork)
      : this.walkTo(t * 0.35);
    this.walkLegs(distance, 0.8);
    this.torso.rotation.x = 0.12;
    this.pose(this.arms[1], -2.7, -1.3, 0.2);
    const swing = Math.sin(t * 4);
    this.pose(this.arms[0], -0.5 - 0.6 * Math.max(0, swing), -0.4, -0.35 * Math.max(0, swing));
  }

  private lay(t: number): void {
    // Walks backwards, unrolling towards where it started.
    if (this.ridgeWork) {
      this.alongRidge(t * 0.4, this.ridgeWork, 'backwards');
    } else {
      const { z, dir } = this.path(t * 0.4);
      this.figure.position.z = z;
      this.figure.rotation.y = dir > 0 ? Math.PI : 0;
    }
    this.walkLegs(t * 0.4, 0.6);
    this.torso.rotation.x = 0.4;
    this.pose(this.arms[0], -0.8, -0.7, 0.15);
    this.pose(this.arms[1], -0.8, -0.7, -0.15);
  }

  private spray(t: number): void {
    if (this.ridgeWork) {
      this.drench(t, this.ridgeWork);
      return;
    }
    // Sweeping the lance over the plants while walking, spraying all along.
    this.spraying = true;
    const distance = this.walkTo(t * 0.3);
    this.walkLegs(distance, 0.6);
    this.torso.rotation.x = 0.15;
    const sweep = Math.sin(t * 1.8);
    this.pose(this.arms[0], -1.0, -0.3, -0.25 * sweep - 0.1);
    this.torso.rotation.y = 0.25 * sweep;
    // Left hand works the pump lever.
    this.pose(this.arms[1], -0.3 + 0.25 * Math.sin(t * 5), -1.3, 0.1);
  }

  /**
   * Seedling by seedling along the first ridge, from the bed's outer edge and
   * walking towards -z so the ridge (and the camera) is on the right: steps up
   * to it, turns and points the lance at its base, sprays until the plastic
   * around it is wet, and goes on to the next one, pumping all the while.
   */
  private drench(t: number, work: RidgeProgress): void {
    const k = (t % DRENCH_CYCLE) / DRENCH_CYCLE;
    const spots = seedlingsAlong(work.depth).reverse();
    const i = Math.floor(t / DRENCH_CYCLE) % spots.length;
    const previous = spots[Math.max(0, i - 1)];
    const step = smooth(k / DRENCH.step);
    this.figure.position.z = previous + (spots[i] - previous) * step + DRENCH_STANDOFF;
    this.figure.rotation.y = Math.PI;
    if (k < DRENCH.step && i > 0) this.walkLegs(step * 0.45, 0.6);

    // Turned to the ridge on the right (+x) and bent a little over the lance.
    const aim = smooth((k - DRENCH.step) / 0.1) - smooth((k - DRENCH.stop) / 0.12);
    this.torso.rotation.x = 0.1 + 0.3 * aim;
    this.torso.rotation.y = -0.45 * aim;
    this.head.rotation.x = 0.1 + 0.35 * aim;
    this.pose(this.arms[0], -0.35 - 0.15 * aim, -0.3 + 0.1 * aim, -0.1 - 0.05 * aim);
    // Left hand works the pump lever.
    this.pose(this.arms[1], -0.3 + 0.25 * Math.sin(t * 5), -1.3, 0.1);

    this.spraying = k > DRENCH.spray && k < DRENCH.stop;
    if (this.sprayTarget) this.sprayTarget.z = spots[i];
    // The patch spreads while the spray lasts (the edge moves towards -z).
    const wet = clamp01((k - DRENCH.spray) / (DRENCH.stop - DRENCH.spray));
    work.update(spots[i] + 0.2 - 0.001 - 0.398 * wet);
  }

  private kneel(t: number): void {
    const k = (t % 2.4) / 2.4;
    if (this.ridgeWork) {
      // Kneels beside each spot of the first ridge in turn and plants it
      // halfway through the reach.
      const spots = seedlingsAlong(this.ridgeWork.depth);
      const spot = spots[Math.floor(t / 2.4) % spots.length];
      this.figure.position.z = spot - 0.1;
      this.figure.rotation.y = 0;
      this.ridgeWork.update(k < 0.5 ? spot - 0.01 : spot + 0.01);
    } else {
      this.walkTo(Math.floor(t / 2.4) * 0.45);
    }
    // Right knee on the ground, left foot forward.
    this.legs[0].upper.rotation.x = 0.1;
    this.legs[0].lower.rotation.x = 1.5;
    this.legs[1].upper.rotation.x = -1.35;
    this.legs[1].lower.rotation.x = 1.35;
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
    if (this.ridgeWork) {
      this.pickRidge(t, this.ridgeWork);
      return;
    }
    this.walkTo(Math.floor(t / 3) * 0.45);
    this.torso.rotation.x = 0.25;
    const k = Math.sin(t * 2.1);
    // Reaches into the plants on its right, then drops into the basket.
    this.torso.rotation.y = -0.4 * Math.max(0, k);
    this.pose(this.arms[0], -1.3 - 0.2 * k, -0.5 + 0.3 * k, -0.5 * Math.max(0, k));
    this.pose(this.arms[1], -0.35, -1.45, 0.1);
  }

  /**
   * Plant by plant along the first ridge, facing it: reaches up to each ripe
   * cucumber, pulls it off and puts it in the basket (see harvestWork).
   */
  private pickRidge(t: number, work: RidgeProgress): void {
    const k = (t % PICK_CYCLE) / PICK_CYCLE;
    const ease = (x: number) => {
      const c = Math.min(1, Math.max(0, x));
      return c * c * (3 - 2 * c);
    };
    const spots = seedlingsAlong(work.depth);
    const i = Math.floor(t / PICK_CYCLE) % spots.length;
    const previous = spots[Math.max(0, i - 1)];
    const step = ease(k / 0.12);
    this.figure.position.z = previous + (spots[i] - previous) * step;
    this.figure.rotation.y = -Math.PI / 2;
    if (k < 0.12 && i > 0) this.walkLegs(step * 0.45, 0.5);

    // Up to each cucumber as it is picked, then down to the basket.
    const fruits = ripeCucumbers(i);
    const up = (dy: number) => -0.9 - 1.3 * Math.min(1, Math.max(0, (dy - 0.3) / 1.1));
    let arm = -0.35;
    let look = 0;
    PICKS.forEach((at, f) => {
      const reach = ease((k - at + 0.2) / 0.2) - ease((k - at) / 0.15);
      arm += (up(fruits[f].dy) + 0.35) * reach;
      look = Math.max(look, reach * (0.2 + 0.25 * f));
    });
    this.pose(this.arms[0], arm, -0.25, -0.15);
    // Basket held at the side.
    this.pose(this.arms[1], -0.35, -1.45, 0.1);
    this.torso.rotation.x = 0.08;
    this.head.rotation.x = -look;
    work.update(spots[i] - 0.2 + 0.001 + 0.398 * k);
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
    const hasTool = this.action.props.some((p) => p === 'magnifier');
    this.pose(this.arms[0], walking ? -0.2 : hasTool ? -1.3 : -0.4, walking ? -0.2 : -0.9, -0.05);
  }

  /**
   * Plant by plant along the first ridge: steps to it, turns to face it and
   * looks it over from bottom to top, touching a leaf, then writes on the
   * clipboard and turns back to walk on.
   */
  private note(t: number): void {
    const cycle = 4.2;
    const k = (t % cycle) / cycle;
    const ease = (x: number) => {
      const c = Math.min(1, Math.max(0, x));
      return c * c * (3 - 2 * c);
    };
    const spots = seedlingsAlong(this.depth);
    const i = Math.floor(t / cycle) % spots.length;
    const previous = spots[Math.max(0, i - 1)];
    const step = ease(k / 0.15);
    this.figure.position.z = previous + (spots[i] - previous) * step;
    if (k < 0.15 && i > 0) this.walkLegs(step * 0.45, 0.8);
    // The plants are on the side of the first ridge: +x from the aisle or path.
    const turn = ease((k - 0.15) / 0.1) - ease((k - 0.92) / 0.08);
    this.figure.rotation.y = (Math.PI / 2) * turn;

    const looking = k > 0.25 && k < 0.6;
    const writing = k >= 0.6 && k < 0.92;
    this.torso.rotation.x = looking ? 0.2 : writing ? 0.15 : 0.05;
    // Eyes run up and down the plant, then down at the clipboard.
    this.head.rotation.x = looking
      ? -0.35 * Math.cos(((k - 0.25) / 0.35) * Math.PI * 2)
      : writing
        ? 0.55
        : 0;
    // Clipboard held up in the left hand.
    this.pose(this.arms[1], -0.6, -1.25, 0.15);
    if (looking) {
      // Lifts a leaf to see it.
      const reach = Math.sin(((k - 0.25) / 0.35) * Math.PI);
      this.pose(this.arms[0], -0.4 - 0.9 * reach, -0.3 - 0.4 * reach, -0.1);
    } else if (writing) {
      // Pencil on the clipboard, scribbling.
      const scribble = 0.06 * Math.sin(t * 14);
      this.pose(this.arms[0], -0.7, -1.2 + scribble, -0.45 + scribble);
    } else {
      this.pose(this.arms[0], -0.15, -0.2, -0.05);
    }
  }

  private valve(t: number): void {
    // Crouched over the main line, turning the valve with both hands.
    this.squat(0.9, 1.5);
    this.torso.rotation.x = 0.75;
    this.head.rotation.x = -0.35;
    const turn = 0.25 * Math.sin(t * 1.6);
    this.pose(this.arms[0], -1.25, -0.35, -0.1 + turn);
    this.pose(this.arms[1], -1.25, -0.35, 0.1 + turn);
  }

  /**
   * Plant by plant along the first ridge, facing it from the bed's edge:
   * bends down to the base and pulls the plant up, leaving it hanging from
   * its string with the roots out (see uprootWork).
   */
  private uproot(t: number): void {
    const k = this.stepAlongRidge(t, UPROOT_CYCLE);
    const ease = smooth;
    const bend = ease((k - 0.12) / 0.18) - ease((k - UPROOT.pull - UPROOT.span) / 0.2);
    // Pulls up: leans back a little as the plant gives.
    const pull = ease((k - UPROOT.pull) / UPROOT.span) * (1 - ease((k - 0.7) / 0.15));
    this.squat(0.8 * bend, 1.4 * bend);
    this.torso.rotation.x = 0.2 + 0.8 * bend - 0.35 * pull;
    this.head.rotation.x = -0.2 * bend;
    const arm = -1.0 - 0.35 * pull;
    this.pose(this.arms[0], arm, -0.3 - 0.5 * pull, -0.1);
    this.pose(this.arms[1], arm, -0.3 - 0.5 * pull, 0.1);
  }

  /**
   * Plant by plant along the first ridge, facing it from the bed's edge:
   * crouches, chops the root off with the machete, picks it up and throws it
   * over the shoulder out of the bed (see cutRootWork).
   */
  private cutRoot(t: number): void {
    const k = this.stepAlongRidge(t, CUT_CYCLE);
    const ease = smooth;
    const crouch = ease((k - 0.12) / 0.13) - ease((k - CUT.grab) / 0.12);
    this.squat(0.9 * crouch, 1.6 * crouch);
    this.torso.rotation.x = 0.15 + 0.6 * crouch;
    this.head.rotation.x = -0.3 * crouch;
    // Machete up and down at each chop.
    const chop = Math.max(...CUT.chops.map((at) => Math.max(0, 1 - Math.abs(k - at) / 0.06)));
    this.pose(this.arms[0], -1.0 - 0.9 * chop * crouch, -0.4, -0.15);
    // Left hand: down to the root, up with it, then a throw back over the shoulder.
    const hold = ease((k - CUT.grab) / 0.1) * (1 - ease((k - CUT.throw - 0.08) / 0.1));
    const swing = ease((k - CUT.throw) / 0.08) - ease((k - CUT.land) / 0.15);
    this.torso.rotation.y = 0.7 * swing;
    this.pose(this.arms[1], -1.1 * crouch - 1.2 * hold - 2.2 * swing, -0.3, 0.15);
  }

  /**
   * Plant by plant along the first ridge, facing it from the bed's edge:
   * reaches up to a hanging leaf, rubs it between the fingers to feel whether
   * it has dried, and looks the plant up and down (see dryWork).
   */
  private feel(t: number): void {
    const k = this.stepAlongRidge(t, FEEL_CYCLE);
    const reach = smooth((k - 0.15) / 0.12) - smooth((k - 0.7) / 0.12);
    this.torso.rotation.x = 0.05 + 0.1 * reach;
    // Eyes on the leaf, then up the plant to the wire and back.
    this.head.rotation.x =
      -0.25 * reach - 0.35 * Math.sin(Math.PI * Math.min(1, Math.max(0, (k - 0.72) / 0.25)));
    const rub = reach * 0.12 * Math.sin(t * 16);
    this.pose(this.arms[0], -0.3 - 1.4 * reach, -0.2 - 0.9 * reach + rub, -0.1 + rub);
    this.pose(this.arms[1], -0.15, -0.25, 0.05);
  }

  /**
   * Plant by plant along the first ridge, facing it from the bed's edge:
   * picks each yellow fruit and throws it back over the shoulder out of the
   * bed, then, the plant clean, pulls it down off its string and throws it
   * out too (see clearWork).
   */
  private clear(t: number): void {
    const k = this.stepAlongRidge(t, CLEAR_CYCLE);
    const ease = smooth;
    if (k < CLEAR.plant.reach) {
      // Right hand up to the fruit, then back over the shoulder.
      let reach = 0;
      let swing = 0;
      for (const f of CLEAR.fruits) {
        reach = Math.max(
          reach,
          ease((k - f.reach) / (f.grab - f.reach)) * (1 - ease((k - f.throw) / 0.04)),
        );
        swing = Math.max(
          swing,
          ease((k - f.throw) / 0.04) * (1 - ease((k - f.throw - 0.06) / 0.05)),
        );
      }
      this.torso.rotation.x = 0.05 + 0.1 * reach;
      this.torso.rotation.y = 0.6 * swing;
      this.head.rotation.x = -0.3 * reach;
      this.pose(this.arms[0], -0.2 - 1.3 * reach - 2.3 * swing, -0.2 - 0.4 * reach, -0.1);
      this.pose(this.arms[1], -0.15, -0.25, 0.05);
      return;
    }
    // Both hands up the plant, pull it down off the string, throw it out.
    const p = CLEAR.plant;
    const up = ease((k - p.reach) / (p.grab - p.reach));
    const down = ease((k - p.grab) / (p.down - p.grab));
    const relax = ease((k - p.land + 0.03) / 0.06);
    const swing = ease((k - p.throw) / 0.05) * (1 - relax);
    const arm = (-0.2 - 1.6 * up + 0.9 * down - 1.6 * swing) * (1 - relax) - 0.2 * relax;
    this.torso.rotation.x = 0.05 + 0.4 * down * (1 - swing) * (1 - relax);
    this.torso.rotation.y = 0.7 * swing;
    this.head.rotation.x = -0.4 * up * (1 - down);
    this.pose(this.arms[0], arm, -0.3 * (1 - relax), -0.15);
    this.pose(this.arms[1], arm, -0.3 * (1 - relax), 0.15);
  }

  /** Steps from plant to plant of the first ridge, facing it; returns this plant's 0–1. */
  private stepAlongRidge(t: number, cycle: number): number {
    const k = (t % cycle) / cycle;
    if (!this.ridgeWork) return k;
    const spots = seedlingsAlong(this.ridgeWork.depth);
    const i = Math.floor(t / cycle) % spots.length;
    const previous = spots[Math.max(0, i - 1)];
    const step = smooth(k / 0.12);
    this.figure.position.z = previous + (spots[i] - previous) * step;
    // Facing +x: the first ridge, from the bed's outer edge.
    this.figure.rotation.y = Math.PI / 2;
    if (k < 0.12 && i > 0) this.walkLegs(step * 0.45, 0.6);
    this.ridgeWork.update(spots[i] - 0.2 + 0.001 + 0.398 * k);
    return k;
  }

  /**
   * Plant by plant along the first ridge, facing it: steps over, crouches and
   * snips off the lower leaves one at a time (see the prune-leaves work).
   */
  private prune(t: number): void {
    const cycle = 3.6;
    const k = (t % cycle) / cycle;
    if (this.ridgeWork) {
      const spots = seedlingsAlong(this.ridgeWork.depth);
      const i = Math.floor(t / cycle) % spots.length;
      const previous = spots[Math.max(0, i - 1)];
      const step = Math.min(1, k / 0.15);
      this.figure.position.z = previous + (spots[i] - previous) * step;
      this.figure.rotation.y = -Math.PI / 2;
      if (k < 0.15 && i > 0) this.walkLegs(step * 0.45, 0.6);
      this.ridgeWork.update(spots[i] - 0.2 + 0.4 * Math.min(1, Math.max(0, (k - 0.15) / 0.8)));
    }
    const crouch = Math.min(1, k / 0.15);
    this.squat(0.85 * crouch, 1.5 * crouch);
    this.torso.rotation.x = 0.55 * crouch;
    this.head.rotation.x = -0.3;
    // Scissors close at each cut (when a leaf starts to fall).
    const snip = (at: number) => Math.max(0, 1 - Math.abs(k - at) / 0.05);
    const cut = snip(0.27) + snip(0.47) + snip(0.67);
    this.pose(this.arms[0], -1.25 - 0.15 * cut, -0.35, -0.15 + 0.2 * cut);
    this.pose(this.arms[1], -1.1, -0.5, 0.2);
  }

  /**
   * Plant by plant along the first ridge, facing it: steps over, bends down
   * to the plant lying on the plastic, lifts it up and ties it to its string.
   */
  private lift(t: number): void {
    const cycle = 3.4;
    const k = (t % cycle) / cycle;
    const ease = (x: number) => {
      const c = Math.min(1, Math.max(0, x));
      return c * c * (3 - 2 * c);
    };
    if (this.ridgeWork) {
      const spots = seedlingsAlong(this.ridgeWork.depth);
      const i = Math.floor(t / cycle) % spots.length;
      const previous = spots[Math.max(0, i - 1)];
      const step = ease(k / 0.15);
      // Stands a little before the plant, so it lies in front of the feet.
      this.figure.position.z = previous + (spots[i] - previous) * step - 0.15;
      this.figure.rotation.y = -Math.PI / 2;
      if (k < 0.15 && i > 0) this.walkLegs(step * 0.45, 0.6);
      // Lifted while the worker straightens up.
      this.ridgeWork.update(spots[i] - 0.2 + 0.4 * ease((k - 0.4) / 0.35));
    }
    const bend = k < 0.4 ? ease((k - 0.15) / 0.25) : 1 - ease((k - 0.4) / 0.35);
    const up = ease((k - 0.4) / 0.35);
    this.squat(0.6 * bend, 1.1 * bend);
    this.torso.rotation.x = 0.1 + 0.9 * bend;
    // Looks down at the plant, then up at the string while tying.
    this.head.rotation.x = -0.35 * bend + (k > 0.75 ? -0.35 : 0);
    const tie = k > 0.75 ? 0.15 * Math.sin(t * 9) : 0;
    this.pose(this.arms[0], -0.9 - 1.7 * up, -0.3, -0.1 + tie);
    this.pose(this.arms[1], -0.9 - 1.7 * up, -0.3, 0.1 - tie);
  }

  /**
   * Every emitter, on its own beat: a drop swells at its tip, stretches as it
   * falls onto the ridge beside the tape, and a ripple spreads where it lands.
   */
  private drip(t: number, drops: Drops): void {
    const dummy = DROP_DUMMY;
    drops.spots.forEach((spot, i) => {
      const k = (t * 0.75 + i * 0.37) % 1;
      // Drop: swells (0–0.5), falls (0.5–0.7), then gone.
      const fall = clamp01((k - 0.5) / 0.2);
      const falling = k >= 0.5 && k < 0.7;
      const size = k < 0.5 ? 0.35 + 0.65 * smooth(k / 0.5) : falling ? 1 : 0.0001;
      dummy.position.set(
        spot.x + DROP_SIDE * fall,
        spot.y + (drops.ground - spot.y) * fall * fall,
        spot.z,
      );
      dummy.rotation.set(0, 0, 0);
      // Round while it hangs, longer while it falls.
      dummy.scale.set(size * (falling ? 0.75 : 1), size * (falling ? 1.5 : 1.1), size);
      dummy.updateMatrix();
      drops.drop.setMatrixAt(i, dummy.matrix);

      // Ripple: spreads and thins out (0.7–1).
      const r = clamp01((k - 0.7) / 0.3);
      dummy.position.set(spot.x + DROP_SIDE, drops.ground + 0.006, spot.z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.setScalar(r > 0 ? 0.03 + 0.11 * r : 0.0001);
      dummy.updateMatrix();
      drops.ripple.setMatrixAt(i, dummy.matrix);
    });
    drops.drop.instanceMatrix.needsUpdate = true;
    drops.ripple.instanceMatrix.needsUpdate = true;
  }

  private buildDrops(bed: { width: number; depth: number }): Drops {
    const ground = SOIL_HEIGHT + RIDGE_HEIGHT;
    // At the tip of each emitter, on its outer side.
    const tip = ground + EMITTER_Y + EMITTER.height / 2 - 0.01;
    const spots = ridgeXs(bed.width).flatMap((x) =>
      emittersAlong(bed.depth).map(
        (z) => new THREE.Vector3(x + TAPE_OFFSET + EMITTER.radius + 0.01, tip, z),
      ),
    );
    const water = { transparent: true, depthWrite: false } as const;
    // Plain water is light blue; with a product (the action has a tint) the
    // mix is milky white.
    const [dropColor, wetColor] = this.action.tint
      ? [COLORS.dropProduct, COLORS.wetProduct]
      : [COLORS.drop, COLORS.wet];
    const drop = new THREE.InstancedMesh(
      this.assets.geometry('drop', () => new THREE.SphereGeometry(0.028, 10, 8)),
      this.material(dropColor, {
        roughness: 0.05,
        metalness: 0.1,
        emissive: dropColor,
        emissiveIntensity: 0.4,
        opacity: 0.9,
        ...water,
      }),
      spots.length,
    );
    const ripple = new THREE.InstancedMesh(
      this.assets.geometry('ripple', () => new THREE.RingGeometry(0.75, 1, 20)),
      this.material(dropColor, {
        emissive: dropColor,
        emissiveIntensity: 0.5,
        opacity: 0.7,
        side: THREE.DoubleSide,
        ...water,
      }),
      spots.length,
    );
    // The wet patch each emitter leaves on the ridge.
    const patch = new THREE.InstancedMesh(
      this.assets.geometry('wet-patch', () => new THREE.CircleGeometry(1, 20)),
      this.material(wetColor, { roughness: 0.2, opacity: 0.55, ...water }),
      spots.length,
    );
    const dummy = DROP_DUMMY;
    spots.forEach((spot, i) => {
      dummy.position.set(spot.x + DROP_SIDE, ground + 0.003, spot.z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.set(0.1, 0.14, 1);
      dummy.updateMatrix();
      patch.setMatrixAt(i, dummy.matrix);
    });
    for (const mesh of [drop, ripple, patch]) {
      mesh.castShadow = false;
      // Drops move every frame, so bounds worked out once would go stale.
      mesh.frustumCulled = false;
      this.root.add(mesh);
    }
    return { drop, ripple, spots, ground };
  }

  // Helpers ---------------------------------------------------------------

  /** Moves along the path; returns the distance walked (for the legs). */
  private walkTo(distance: number): number {
    const { z, dir } = this.path(distance);
    this.figure.position.z = z;
    this.figure.rotation.y = dir > 0 ? 0 : Math.PI;
    return distance;
  }

  /**
   * One way along the first ridge, working just ahead of the hands; at the
   * end it starts over on an untouched ridge.
   */
  private alongRidge(
    distance: number,
    work: RidgeProgress,
    facing: 'forwards' | 'backwards' = 'forwards',
  ): number {
    const reach = 0.3;
    const edge = -work.length / 2 + (distance % work.length);
    // The hands are at the edge, in front of the body either way.
    const forwards = facing === 'forwards';
    this.figure.position.z = forwards ? edge - reach : edge + reach;
    this.figure.rotation.y = forwards ? 0 : Math.PI;
    work.update(edge);
    return distance;
  }

  /** What changes on the first ridge; matches what buildBed draws on the others. */
  private buildRidgeWork(work: RidgeWork, bed: { width: number; depth: number }): RidgeProgress {
    const length = ridgeLength(bed.depth);
    const depth = bed.depth;
    const x = ridgeXs(bed.width)[0];
    const ground = this.figure.position.y;

    if (work === 'uproot') return this.uprootWork(x, length, depth);
    if (work === 'cut-root') return this.cutRootWork(x, length, bed);
    if (work === 'dry-plants') return this.dryWork(length, bed);
    if (work === 'clear-plants') return this.clearWork(x, length, bed);

    if (work === 'harvest-fruit') {
      return this.harvestWork(x, ground + RIDGE_HEIGHT, length, depth);
    }

    if (work === 'drench-seedlings') {
      return this.drenchWork(x, ground + RIDGE_HEIGHT, length, depth);
    }

    if (work === 'prune-leaves') {
      return this.pruneWork(x, ground + RIDGE_HEIGHT, length, depth);
    }

    if (work === 'tie-plants') {
      // Lying on the plastic towards the path until lifted (see `lift`).
      const spots = seedlingsAlong(depth);
      const plants = new THREE.InstancedMesh(
        cucumberPlantGeometry(this.assets, 0, TIED_PLANT_HEIGHT, { flowers: 0.15 }),
        plantMaterial(this.assets),
        spots.length,
      );
      // Matrices change as plants are lifted: bounds worked out once go stale.
      plants.frustumCulled = false;
      plants.castShadow = true;
      this.root.add(plants);
      const dummy = new THREE.Object3D();
      const lifts = spots.map(() => -1);
      return {
        length,
        depth,
        update: (edge) => {
          spots.forEach((z, i) => {
            const lift = Math.min(1, Math.max(0, (edge - z) / 0.4 + 0.5));
            if (lift === lifts[i]) return;
            lifts[i] = lift;
            dummy.position.set(x, ground + RIDGE_HEIGHT, z);
            // Turned about its stem, then tipped over towards +x (the path).
            dummy.rotation.set(0, i * 2.1, -1.15 * (1 - lift), 'ZYX');
            dummy.updateMatrix();
            plants.setMatrixAt(i, dummy.matrix);
          });
          plants.instanceMatrix.needsUpdate = true;
        },
      };
    }

    if (work === 'plant-seedlings') {
      // Seedlings appear once planted, from the back of the ridge forwards.
      const spots = seedlingsAlong(depth);
      const plants = new THREE.InstancedMesh(
        seedlingGeometry(this.assets),
        seedlingMaterial(this.assets),
        spots.length,
      );
      const dummy = new THREE.Object3D();
      spots.forEach((z, i) => {
        dummy.position.set(x, ground + RIDGE_HEIGHT, z);
        dummy.rotation.y = i * 2.1;
        dummy.updateMatrix();
        plants.setMatrixAt(i, dummy.matrix);
      });
      // Bounds of every instance, worked out now while all are counted: three
      // keeps them, and bounds of only the first few would cull the whole
      // row once the camera zooms in past them.
      plants.computeBoundingSphere();
      plants.castShadow = true;
      this.root.add(plants);
      return {
        length,
        depth,
        update: (edge) => (plants.count = spots.filter((z) => z < edge).length),
      };
    }

    if (work === 'drop-guano' || work === 'mix-guano') {
      const mixing = work === 'mix-guano';
      // When mixing, heaps are left only ahead: list them from the front so
      // that `count` keeps those.
      const spots = mixing ? guanoAlong(bed.depth).reverse() : guanoAlong(bed.depth);
      const heaps = new THREE.InstancedMesh(
        guanoGeometry(this.assets),
        this.material(COLORS.guano),
        spots.length,
      );
      const dummy = new THREE.Object3D();
      spots.forEach((z, i) => {
        dummy.position.set(x, ground + RIDGE_HEIGHT, z);
        dummy.scale.set(1, GUANO_FLATTEN, 1);
        dummy.updateMatrix();
        heaps.setMatrixAt(i, dummy.matrix);
      });
      heaps.computeBoundingSphere(); // Every heap, as for the seedlings.
      heaps.receiveShadow = true;
      this.root.add(heaps);
      if (!mixing) {
        // Heaps appear once the worker has passed them.
        return {
          length,
          depth,
          update: (edge) => (heaps.count = spots.filter((z) => z < edge - 0.3).length),
        };
      }
      // Behind the shovel the ridge is turned soil, darker with the guano in.
      const mixed = this.mesh(
        this.box(),
        this.material(COLORS.soilMixed, { roughness: 1 }),
        [x, ground + RIDGE_HEIGHT / 2 + 0.005, 0],
        [RIDGE_WIDTH + 0.04, RIDGE_HEIGHT + 0.01, 1],
      );
      this.root.add(mixed);
      return {
        length,
        depth,
        update: (edge) => {
          heaps.count = spots.filter((z) => z > edge).length;
          const done = edge + length / 2;
          mixed.visible = done > 0.01;
          mixed.scale.z = Math.max(0.001, done);
          mixed.position.z = -length / 2 + done / 2;
        },
      };
    }

    if (work === 'fill-broza' || work === 'cover-broza') {
      // Broza laid in the trench, or soil over it, behind the worker.
      const [color, size] = work === 'fill-broza' ? [COLORS.dried, BROZA] : [COLORS.soil, SOIL_CAP];
      const layer = this.mesh(
        this.box(),
        this.material(color, { roughness: 1 }),
        [x, ground + RIDGE_HEIGHT + size.height / 2 + 0.001, 0],
        [size.width, size.height, 1],
      );
      this.root.add(layer);
      return {
        length,
        depth,
        update: (edge) => {
          const done = edge + length / 2;
          layer.visible = done > 0.01;
          layer.scale.z = Math.max(0.001, done);
          layer.position.z = -length / 2 + done / 2;
        },
      };
    }

    // What is pulled off is left only ahead of the hands; what is laid, only
    // behind them. The plastic is slightly bigger than the ridge so it hides
    // the bare soil under it.
    const strip =
      work === 'pull-plastic' || work === 'lay-plastic'
        ? this.mesh(
            this.box(),
            this.material(COLORS.mush, { roughness: 0.45 }),
            [x, ground + RIDGE_HEIGHT / 2 + 0.005, 0],
            [RIDGE_WIDTH + COVER_EXTRA + 0.01, RIDGE_HEIGHT + 0.01, 1],
          )
        : this.mesh(tapeGeometry(this.assets), this.material(COLORS.tape, { roughness: 0.6 }), [
            x + TAPE_OFFSET,
            ground + RIDGE_HEIGHT + 0.02,
            0,
          ]);
    this.root.add(strip);
    const laying = work === 'lay-tape' || work === 'lay-plastic';
    let emitters: { mesh: THREE.InstancedMesh; spots: number[] } | null = null;
    if (work === 'pull-tape' || work === 'lay-tape') {
      // Listed so that `count` keeps the emitters on the tape that is there.
      const spots = laying ? emittersAlong(bed.depth) : emittersAlong(bed.depth).reverse();
      const mesh = new THREE.InstancedMesh(
        emitterGeometry(this.assets),
        this.material(COLORS.emitter, { roughness: 0.5 }),
        spots.length,
      );
      const dummy = new THREE.Object3D();
      spots.forEach((z, i) => {
        dummy.position.set(x + TAPE_OFFSET, ground + RIDGE_HEIGHT + EMITTER_Y, z);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.computeBoundingSphere(); // Every emitter, as for the seedlings.
      this.root.add(mesh);
      emitters = { mesh, spots };
    }
    return {
      length,
      depth,
      update: (edge) => {
        const from = laying ? -length / 2 : edge;
        const to = laying ? edge : length / 2;
        strip.visible = to - from > 0.01;
        strip.scale.z = Math.max(0.001, to - from);
        strip.position.z = (from + to) / 2;
        if (emitters) emitters.mesh.count = emitters.spots.filter((z) => z > from && z < to).length;
      },
    };
  }

  /**
   * A wet patch at the base of each seedling of the first ridge, spreading
   * while it is sprayed. The worker goes towards -z, so the progress is
   * (z - edge) / 0.4 + 0.5, clamped.
   */
  private drenchWork(x: number, top: number, length: number, depth: number): RidgeProgress {
    const spots = seedlingsAlong(depth);
    const patches = new THREE.InstancedMesh(
      drenchGeometry(this.assets),
      drenchMaterial(this.assets),
      spots.length,
    );
    // Patches change size: bounds worked out once would go stale.
    patches.frustumCulled = false;
    this.root.add(patches);
    // Just above the plastic at the seedling's base.
    this.sprayTarget = new THREE.Vector3(x, top + 0.03, 0);
    const dummy = new THREE.Object3D();
    const shown = spots.map(() => -1);
    return {
      length,
      depth,
      update: (edge) => {
        spots.forEach((z, i) => {
          const wet = clamp01((z - edge) / 0.4 + 0.5);
          if (wet === shown[i]) return;
          shown[i] = wet;
          dummy.position.set(x, top + COVER_TOP, z);
          dummy.scale.setScalar(wet > 0 ? DRENCH_RADIUS * (0.25 + 0.75 * smooth(wet)) : 0.0001);
          dummy.updateMatrix();
          patches.setMatrixAt(i, dummy.matrix);
        });
        patches.instanceMatrix.needsUpdate = true;
      },
    };
  }

  /**
   * The lance in the right hand (the tank is the 'sprayer' prop on the back),
   * the hose from the tank to it, and the mist out of its nozzle.
   */
  private buildSprayer(): Sprayer {
    const dark = this.material(COLORS.sprayerHose, { roughness: 0.6 });
    const metal = this.material(COLORS.metal, { metalness: 0.6, roughness: 0.4 });
    // On from the forearm, bent down (hand -z is down while the arm points forward).
    const tip = new THREE.Vector3(0, -0.45, -0.18);
    const lance = new THREE.Group();
    const rod = this.mesh(this.cylinder(1, 1, 1), metal, [0, 0, 0], [0.012, tip.length(), 0.012]);
    rod.position.copy(tip).multiplyScalar(0.5);
    rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tip.clone().normalize());
    // Handle with the trigger, in the hand.
    const grip = this.mesh(this.cylinder(1, 1, 1), dark, [0, -0.04, 0.016], [0.022, 0.12, 0.022]);
    grip.quaternion.copy(rod.quaternion);
    const nozzle = this.mesh(this.cylinder(0.6, 1, 1), dark, [0, 0, 0], [0.025, 0.05, 0.025]);
    nozzle.position.copy(tip);
    nozzle.quaternion.copy(rod.quaternion);
    const end = new THREE.Object3D();
    end.position.copy(tip).multiplyScalar(1.06);
    lance.add(rod, grip, nozzle, end);
    this.slots.handR.add(lance);

    // The hose leaves the tank at its bottom, on the right.
    const outlet = new THREE.Object3D();
    outlet.position.set(-0.08, -0.22, 0);
    this.slots.back.add(outlet);
    const hose = Array.from({ length: 5 }, () => {
      const piece = this.mesh(this.cylinder(1, 1, 1), dark, [0, 0, 0]);
      this.root.add(piece);
      return piece;
    });

    const tint = new THREE.Color(this.action.tint ?? 0xffffff).lerp(
      new THREE.Color(0xffffff),
      0.55,
    );
    const mist = new THREE.InstancedMesh(
      this.assets.geometry('mist', () => new THREE.IcosahedronGeometry(1, 1)),
      this.material(tint.getHex(), {
        roughness: 1,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
      MIST,
    );
    // Particles move every frame, so bounds worked out once would go stale.
    mist.frustumCulled = false;
    this.root.add(mist);
    const rand = random(17);
    const spread = Array.from({ length: MIST }, () =>
      new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5)
        .normalize()
        .multiplyScalar(rand()),
    );
    return { grip: lance, end, outlet, hose, mist, spread };
  }

  /**
   * The hose sags from the tank to the hand, and while spraying the mist
   * streams from the nozzle to where it is aimed, spreading as it goes.
   */
  private updateSprayer(t: number, sprayer: Sprayer): void {
    const { a, b, c, d, from, to } = SPRAY_SCRATCH;
    this.root.updateMatrixWorld(true);
    this.root.worldToLocal(sprayer.outlet.getWorldPosition(a));
    this.root.worldToLocal(sprayer.grip.getWorldPosition(b));
    // Sags below both ends.
    c.addVectors(a, b).multiplyScalar(0.5);
    c.y = Math.min(a.y, b.y) - 0.18;
    const n = sprayer.hose.length;
    const bezier = (u: number, out: THREE.Vector3) =>
      out
        .copy(a)
        .multiplyScalar((1 - u) * (1 - u))
        .addScaledVector(c, 2 * u * (1 - u))
        .addScaledVector(b, u * u);
    sprayer.hose.forEach((piece, i) => {
      bezier(i / n, from);
      bezier((i + 1) / n, to);
      d.subVectors(to, from);
      const length = d.length();
      piece.position.addVectors(from, to).multiplyScalar(0.5);
      piece.quaternion.setFromUnitVectors(UP, d.divideScalar(length || 1));
      piece.scale.set(0.011, length + 0.01, 0.011);
    });

    // Nozzle, and where the mist goes: the target, or on along the lance.
    this.root.worldToLocal(sprayer.end.getWorldPosition(from));
    if (this.sprayTarget) {
      to.copy(this.sprayTarget);
    } else {
      d.subVectors(from, b).normalize();
      to.copy(from).addScaledVector(d, 0.7);
    }
    const dummy = DROP_DUMMY;
    dummy.rotation.set(0, 0, 0);
    for (let i = 0; i < MIST; i++) {
      const u = (t * 2.4 + i / MIST) % 1;
      const size = this.spraying ? (0.016 + 0.045 * u) * (1 - smooth((u - 0.75) / 0.25)) : 0;
      dummy.position.lerpVectors(from, to, u).addScaledVector(sprayer.spread[i], 0.14 * u);
      dummy.scale.setScalar(Math.max(0.0001, size));
      dummy.updateMatrix();
      sprayer.mist.setMatrixAt(i, dummy.matrix);
    }
    sprayer.mist.instanceMatrix.needsUpdate = true;
    this.spraying = false;
  }

  /**
   * Each plant's progress is (edge - z) / 0.4 + 0.5, clamped: 0 while still
   * uncut, 1 once its old leaves lie on the plastic. The plant being cleaned is
   * drawn already cut, with its lower leaves as loose meshes falling off.
   */
  private pruneWork(x: number, top: number, length: number, depth: number): RidgeProgress {
    const spots = seedlingsAlong(depth);
    const n = spots.length;
    const material = plantMaterial(this.assets);
    const plantAt = (i: number) =>
      new THREE.Matrix4()
        .makeTranslation(x, top, spots[i])
        .multiply(new THREE.Matrix4().makeRotationY(i * 2.1));
    const options = { flowers: 0.2 };
    // Uncut plants are ahead, so listed from the front: `count` keeps them.
    const uncut = new THREE.InstancedMesh(
      cucumberPlantGeometry(this.assets, 0, GROWING_PLANT_HEIGHT, {
        ...options,
        old: PRUNE_HEIGHT,
      }),
      material,
      n,
    );
    const cleaned = new THREE.InstancedMesh(
      cucumberPlantGeometry(this.assets, 0, GROWING_PLANT_HEIGHT, {
        ...options,
        bare: PRUNE_HEIGHT,
      }),
      material,
      n,
    );
    const leafGeometry = cucumberLeafGeometry(this.assets);
    const fallen = new THREE.InstancedMesh(leafGeometry, material, n * CUT_LEAVES);
    const landed = (i: number, k: number) => {
      const leaf = fallenLeaf(x, spots[i], i, k);
      return new THREE.Matrix4().compose(
        new THREE.Vector3(leaf.x, top + 0.004, leaf.z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), leaf.ry),
        new THREE.Vector3(FALLEN_LEAF_SIZE, 1, FALLEN_LEAF_SIZE),
      );
    };
    spots.forEach((_, i) => {
      uncut.setMatrixAt(i, plantAt(n - 1 - i));
      cleaned.setMatrixAt(i, plantAt(i));
      for (let k = 0; k < CUT_LEAVES; k++) fallen.setMatrixAt(CUT_LEAVES * i + k, landed(i, k));
    });
    for (const mesh of [uncut, cleaned, fallen]) {
      mesh.computeBoundingSphere(); // Every instance, as for the seedlings.
      mesh.castShadow = true;
      this.root.add(mesh);
    }

    // The old leaves of the plant being cleaned, from the plant to the plastic.
    const onPlant = cutLeaves(0, GROWING_PLANT_HEIGHT, PRUNE_HEIGHT).slice(0, CUT_LEAVES);
    const loose = onPlant.map(() => {
      const mesh = new THREE.Mesh(leafGeometry, material);
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = true;
      this.root.add(mesh);
      return mesh;
    });
    const from = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() };
    const to = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() };
    // When each leaf is cut, as plant progress.
    const cuts = [0.15, 0.4, 0.65];

    return {
      length,
      depth,
      update: (edge) => {
        const progress = spots.map((z) => Math.min(1, Math.max(0, (edge - z) / 0.4 + 0.5)));
        uncut.count = progress.filter((p) => p === 0).length;
        cleaned.count = n - uncut.count;
        fallen.count = CUT_LEAVES * progress.filter((p) => p === 1).length;
        const current = progress.findIndex((p) => p > 0 && p < 1);
        loose.forEach((mesh, k) => {
          mesh.visible = current >= 0;
          if (current < 0) return;
          const fall = Math.min(1, Math.max(0, (progress[current] - cuts[k]) / 0.2));
          plantAt(current).multiply(onPlant[k]).decompose(from.p, from.q, from.s);
          landed(current, k).decompose(to.p, to.q, to.s);
          // Drops faster as it goes, turning flat on the way down.
          const drop = fall * fall;
          from.p.lerp(to.p, drop);
          from.q.slerp(to.q, fall);
          from.s.lerp(to.s, fall);
          mesh.matrix.compose(from.p, from.q, from.s);
          // Set by hand (matrixAutoUpdate off): three must be told.
          mesh.matrixWorldNeedsUpdate = true;
        });
      },
    };
  }

  /**
   * Ripe cucumbers on the first ridge. Plants ahead keep theirs; the plant
   * being picked has them as loose meshes that go from the plant to the hand
   * (once it closes on them) and on into the basket, which fills up.
   */
  private harvestWork(x: number, top: number, length: number, depth: number): RidgeProgress {
    const spots = seedlingsAlong(depth);
    const n = spots.length;
    const geometry = cucumberGeometry(this.assets);
    const material = cucumberMaterial(this.assets);
    const hanging = (i: number, k: number) => {
      const c = ripeCucumbers(i)[k];
      return {
        position: new THREE.Vector3(x + c.dx, top + c.dy, spots[i] + c.dz),
        rz: c.rz,
      };
    };
    // Plants ahead are listed from the front, so `count` keeps theirs.
    const ripe = new THREE.InstancedMesh(geometry, material, n * 2);
    const dummy = new THREE.Object3D();
    for (let j = 0; j < n; j++) {
      const i = n - 1 - j;
      for (let k = 0; k < 2; k++) {
        const { position, rz } = hanging(i, k);
        dummy.position.copy(position);
        dummy.rotation.set(0, 0, rz);
        dummy.updateMatrix();
        ripe.setMatrixAt(2 * j + k, dummy.matrix);
      }
    }
    ripe.computeBoundingSphere(); // Every cucumber, as for the seedlings.
    ripe.castShadow = true;
    this.root.add(ripe);

    const loose = [0, 1].map(() => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      this.root.add(mesh);
      return mesh;
    });
    let current = -1;
    let progress = 0;
    const hand = new THREE.Vector3();

    return {
      length,
      depth,
      update: (edge) => {
        const all = spots.map((z) => Math.min(1, Math.max(0, (edge - z) / 0.4 + 0.5)));
        current = all.findIndex((p) => p > 0 && p < 1);
        progress = current >= 0 ? all[current] : 0;
        ripe.count = 2 * all.filter((p) => p === 0).length;
      },
      afterPose: () => {
        // The hand where this frame's pose puts it.
        this.root.updateMatrixWorld(true);
        this.root.worldToLocal(this.arms[0].end.getWorldPosition(hand));
        let picked = 2 * Math.max(0, current);
        loose.forEach((mesh, k) => {
          mesh.visible = current >= 0;
          if (current < 0) return;
          const off = progress - PICKS[k];
          if (off < 0) {
            // Still hanging on the plant.
            const { position, rz } = hanging(current, k);
            mesh.position.copy(position);
            mesh.rotation.set(0, 0, rz);
          } else if (off < 0.15) {
            // In the hand, on its way down to the basket.
            mesh.position.copy(hand);
            mesh.rotation.set(0.6, 0, 0.4);
          } else {
            // In the basket.
            mesh.visible = false;
            picked++;
          }
        });
        if (this.basketFruit) this.basketFruit.count = Math.min(BASKET_FRUIT, picked);
      },
    };
  }

  /**
   * Dead plants of the first ridge, hanging from their strings: rooted ahead,
   * raised with their roots out once pulled. The plant being pulled rises as
   * the worker straightens up.
   */
  private uprootWork(x: number, length: number, depth: number): RidgeProgress {
    const spots = seedlingsAlong(depth);
    const plants = new THREE.InstancedMesh(
      deadPlantGeometry(this.assets, 0, true),
      plantMaterial(this.assets),
      spots.length,
    );
    // Raised as plants are pulled: bounds worked out once would go stale.
    plants.frustumCulled = false;
    plants.castShadow = true;
    this.root.add(plants);
    const lifts = spots.map(() => -1);
    return {
      length,
      depth,
      update: (edge) => {
        spots.forEach((z, i) => {
          const p = Math.min(1, Math.max(0, (edge - z) / 0.4 + 0.5));
          const lift = p === 1 ? 1 : smooth((p - UPROOT.pull) / UPROOT.span);
          if (lift === lifts[i]) return;
          lifts[i] = lift;
          plants.setMatrixAt(i, placed(hangingPlant(x, z, i, UPROOT_LIFT * lift)));
        });
        plants.instanceMatrix.needsUpdate = true;
      },
    };
  }

  /**
   * Roots of the first ridge's pulled plants: under each plant ahead, thrown
   * outside the bed once cut. The one being cut goes from the plant up to
   * the worker's hand and is thrown in an arc onto the floor.
   */
  private cutRootWork(
    x: number,
    length: number,
    bed: { width: number; depth: number },
  ): RidgeProgress {
    const spots = seedlingsAlong(bed.depth);
    const n = spots.length;
    const geometry = rootsGeometry(this.assets);
    const material = plantMaterial(this.assets);
    const top = SOIL_HEIGHT + RIDGE_HEIGHT;
    const onPlant = (i: number) => {
      const plant = hangingPlant(x, spots[i], i, UPROOT_LIFT);
      return placed({ ...plant, sy: 1 });
    };
    const held = (i: number) => placed({ x: x - 0.3, y: top + 0.55, z: spots[i], ry: i });
    const thrown = (i: number) => placed(thrownRoot(bed.width, spots[i], i));
    // Roots ahead are listed from the front, so `count` keeps them; thrown
    // ones from the back.
    const ahead = new THREE.InstancedMesh(geometry, material, n);
    const out = new THREE.InstancedMesh(geometry, material, n);
    for (let i = 0; i < n; i++) {
      ahead.setMatrixAt(i, onPlant(n - 1 - i));
      out.setMatrixAt(i, thrown(i));
    }
    for (const mesh of [ahead, out]) {
      mesh.computeBoundingSphere(); // Every root, as for the seedlings.
      mesh.castShadow = true;
      this.root.add(mesh);
    }
    const loose = new THREE.Mesh(geometry, material);
    loose.matrixAutoUpdate = false;
    loose.castShadow = true;
    this.root.add(loose);
    const a = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() };
    const b = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() };
    const blend = (from: THREE.Matrix4, to: THREE.Matrix4, f: number, arc = 0) => {
      from.decompose(a.p, a.q, a.s);
      to.decompose(b.p, b.q, b.s);
      a.p.lerp(b.p, f);
      a.p.y += arc * Math.sin(Math.PI * f);
      loose.matrix.compose(a.p, a.q.slerp(b.q, f), a.s.lerp(b.s, f));
      // Set by hand (matrixAutoUpdate off): three must be told.
      loose.matrixWorldNeedsUpdate = true;
    };
    return {
      length,
      depth: bed.depth,
      update: (edge) => {
        const all = spots.map((z) => Math.min(1, Math.max(0, (edge - z) / 0.4 + 0.5)));
        ahead.count = all.filter((p) => p === 0).length;
        out.count = all.filter((p) => p === 1).length;
        const i = all.findIndex((p) => p > 0 && p < 1);
        loose.visible = i >= 0;
        if (i < 0) return;
        const p = all[i];
        if (p < CUT.throw) {
          blend(onPlant(i), held(i), smooth((p - CUT.grab) / 0.1));
        } else {
          blend(held(i), thrown(i), Math.min(1, (p - CUT.throw) / (CUT.land - CUT.throw)), 0.5);
        }
      },
    };
  }

  /**
   * Every plant of the bed, pulled and with its root cut, hanging from its
   * string to dry: over DRY_CYCLE the plants turn from yellow to brown and
   * shed dry leaves, which fall onto the plastic; then it starts over.
   */
  private dryWork(length: number, bed: { width: number; depth: number }): RidgeProgress {
    // Its own material, as the tint changes: freed with the scene's other
    // unshared materials.
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.85,
    });
    const spots = seedlingsAlong(bed.depth);
    const xs = ridgeXs(bed.width);
    const plants = xs.flatMap((x) => spots.map((z, i) => ({ x, z, i })));
    for (let v = 0; v < PLANT_VARIANTS; v++) {
      const mine = plants.filter(({ i }) => i % PLANT_VARIANTS === v);
      const mesh = new THREE.InstancedMesh(
        deadPlantGeometry(this.assets, v),
        material,
        mine.length,
      );
      mine.forEach(({ x, z, i }, n) =>
        mesh.setMatrixAt(n, placed(hangingPlant(x, z, i, UPROOT_LIFT))),
      );
      mesh.castShadow = true;
      this.root.add(mesh);
    }

    // Shed leaves: each falls from the plant at its own moment of the drying.
    const rand = random(77);
    const top = SOIL_HEIGHT + RIDGE_HEIGHT;
    const leaves = plants
      .flatMap(({ x, z, i }) =>
        Array.from({ length: SHED_LEAVES }, (_, k) => ({
          x: x + (rand() - 0.5) * 0.3,
          z: z + (rand() - 0.5) * 0.3,
          from: top + 0.5 + rand() * 0.8,
          ry: i * 1.7 + k * 2.3 + rand(),
          at: 0.1 + rand() * 0.75,
        })),
      )
      .sort((a, b) => a.at - b.at);
    const fallen = new THREE.InstancedMesh(
      cucumberLeafGeometry(this.assets),
      material,
      leaves.length,
    );
    // Leaves move as they fall: bounds worked out once would go stale.
    fallen.frustumCulled = false;
    fallen.castShadow = true;
    this.root.add(fallen);
    const leafAt = (leaf: (typeof leaves)[number], fall: number) => {
      // Flutters down, turning, and lands flat on the plastic.
      const y = top + 0.004 + (leaf.from - top) * (1 - fall * fall);
      const sway = (1 - fall) * 0.6 * Math.sin(fall * 9);
      return new THREE.Matrix4().compose(
        new THREE.Vector3(leaf.x + 0.08 * sway, y, leaf.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(sway, leaf.ry + fall * 3, sway * 0.5)),
        new THREE.Vector3(FALLEN_LEAF_SIZE, 1, FALLEN_LEAF_SIZE),
      );
    };
    const fall = 0.04;
    // Leaves already on the plastic: set once, not every frame.
    const landed = leaves.map(() => false);
    return {
      length,
      depth: bed.depth,
      update: () => undefined,
      tick: (t) => {
        const k = (t % DRY_CYCLE) / DRY_CYCLE;
        // Dries for most of the cycle, stays dry a while, then starts over.
        const dry = smooth(k / 0.8) * (1 - smooth((k - 0.96) / 0.04));
        material.color.setRGB(1, 1, 1).lerp(DRIED_TINT, dry);
        const progress = k < 0.96 ? k : 0;
        const count = leaves.findIndex((l) => l.at > progress);
        fallen.count = count < 0 ? leaves.length : count;
        leaves.forEach((leaf, n) => {
          if (n >= fallen.count) {
            landed[n] = false;
            return;
          }
          if (landed[n]) return;
          const f = Math.min(1, (progress - leaf.at) / fall);
          fallen.setMatrixAt(n, leafAt(leaf, f));
          landed[n] = f === 1;
        });
        fallen.instanceMatrix.needsUpdate = true;
      },
    };
  }

  /**
   * The first ridge's dry plants, hanging with their yellow fruit ahead and
   * lying outside the bed once cleared. The fruit and plant being cleared go
   * from the plant to the worker's hand and are thrown in an arc onto the floor.
   */
  private clearWork(
    x: number,
    length: number,
    bed: { width: number; depth: number },
  ): RidgeProgress {
    const spots = seedlingsAlong(bed.depth);
    const n = spots.length;
    const plantGeometry = deadPlantGeometry(this.assets, 0);
    const fruitGeometry = cucumberGeometry(this.assets);
    const plantMat = plantMaterial(this.assets);
    const fruitMat = this.material(COLORS.cucumberYellow, { roughness: 0.6 });
    const hanging = (i: number) => placed(hangingPlant(x, spots[i], i, UPROOT_LIFT));
    const onPlant = (i: number, k: number) => {
      const h = hangingPlant(x, spots[i], i, UPROOT_LIFT);
      const c = yellowCucumbers(i)[k];
      return placed({ x: h.x + c.dx, y: h.y + c.dy, z: h.z + c.dz, rz: c.rz });
    };
    const plantOut = (i: number) => placed(discardedPlant(bed.width, spots[i], i));
    const fruitOut = (i: number, k: number) => placed(discardedCucumber(bed.width, spots[i], i, k));

    // Ahead: listed from the front, so `count` keeps them; out: from the back.
    const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, count: number) => {
      const m = new THREE.InstancedMesh(geometry, material, count);
      m.castShadow = true;
      this.root.add(m);
      return m;
    };
    const plantsAhead = mesh(plantGeometry, plantMat, n);
    const plantsOut = mesh(plantGeometry, plantMat, n);
    const fruitAhead = mesh(fruitGeometry, fruitMat, n * 2);
    const fruitOutMesh = mesh(fruitGeometry, fruitMat, n * 2);
    for (let i = 0; i < n; i++) {
      plantsAhead.setMatrixAt(i, hanging(n - 1 - i));
      plantsOut.setMatrixAt(i, plantOut(i));
      for (let k = 0; k < 2; k++) {
        fruitAhead.setMatrixAt(i * 2 + k, onPlant(n - 1 - i, k));
        fruitOutMesh.setMatrixAt(i * 2 + k, fruitOut(i, k));
      }
    }
    // Every plant and fruit, before `count` drops (as for the seedlings).
    for (const m of [plantsAhead, plantsOut, fruitAhead, fruitOutMesh]) m.computeBoundingSphere();

    const loose = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
      const m = new THREE.Mesh(geometry, material);
      m.matrixAutoUpdate = false;
      m.castShadow = true;
      this.root.add(m);
      return m;
    };
    const plant = loose(plantGeometry, plantMat);
    const fruits = [loose(fruitGeometry, fruitMat), loose(fruitGeometry, fruitMat)];
    // Where each was last held: the start of its throw.
    const released = new Map<THREE.Mesh, THREE.Matrix4>();

    const a = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() };
    const b = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() };
    const set = (m: THREE.Mesh, matrix: THREE.Matrix4) => {
      m.matrix.copy(matrix);
      // Set by hand (matrixAutoUpdate off): three must be told.
      m.matrixWorldNeedsUpdate = true;
    };
    const blend = (m: THREE.Mesh, from: THREE.Matrix4, to: THREE.Matrix4, f: number, arc = 0) => {
      from.decompose(a.p, a.q, a.s);
      to.decompose(b.p, b.q, b.s);
      a.p.lerp(b.p, f);
      a.p.y += arc * Math.sin(Math.PI * f);
      m.matrix.compose(a.p, a.q.slerp(b.q, f), a.s.lerp(b.s, f));
      m.matrixWorldNeedsUpdate = true;
    };
    const hand = new THREE.Vector3();
    const held = (dz: number, rx: number) =>
      new THREE.Matrix4().compose(
        new THREE.Vector3(hand.x, hand.y, hand.z + dz),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0.3)),
        new THREE.Vector3(1, 1, 1),
      );
    /** In hand until the throw is under way, then in an arc to where it lands. */
    const thrown = (
      m: THREE.Mesh,
      inHand: THREE.Matrix4,
      p: number,
      at: number,
      land: number,
      to: THREE.Matrix4,
    ) => {
      if (p < at + CLEAR.release) {
        set(m, inHand);
        released.set(m, inHand);
      } else {
        const f = Math.min(1, (p - at - CLEAR.release) / (land - at - CLEAR.release));
        blend(m, released.get(m) ?? inHand, to, f, 0.5);
      }
    };

    let current = -1;
    let progress = 0;
    return {
      length,
      depth: bed.depth,
      update: (edge) => {
        const all = spots.map((z) => Math.min(1, Math.max(0, (edge - z) / 0.4 + 0.5)));
        const ahead = all.filter((p) => p === 0).length;
        const done = all.filter((p) => p === 1).length;
        plantsAhead.count = ahead;
        plantsOut.count = done;
        fruitAhead.count = ahead * 2;
        fruitOutMesh.count = done * 2;
        current = all.findIndex((p) => p > 0 && p < 1);
        progress = current < 0 ? 0 : all[current];
      },
      afterPose: () => {
        const i = current;
        for (const m of [plant, ...fruits]) m.visible = i >= 0;
        if (i < 0) return;
        const p = progress;
        this.arms[0].end.getWorldPosition(hand);
        this.root.worldToLocal(hand);
        CLEAR.fruits.forEach((f, k) => {
          if (p < f.grab) set(fruits[k], onPlant(i, k));
          else thrown(fruits[k], held(0, 0), p, f.throw, f.land, fruitOut(i, k));
        });
        const c = CLEAR.plant;
        if (p < c.grab) {
          set(plant, hanging(i));
        } else if (p < c.down) {
          // Pulled down off its string, ending held across the body.
          blend(
            plant,
            hanging(i),
            held(-0.6, Math.PI / 2),
            smooth((p - c.grab) / (c.down - c.grab)),
          );
        } else {
          thrown(plant, held(-0.6, Math.PI / 2), p, c.throw, c.land, plantOut(i));
        }
      },
    };
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

  /**
   * Turns the hanging prop back upright, whatever the arm holding it does: it
   * keeps only the worker's heading, so a basket never tips its load out.
   */
  private keepUpright(): void {
    const prop = this.hanging;
    if (!prop?.parent) return;
    this.root.updateMatrixWorld(true);
    const hand = prop.parent.getWorldQuaternion(UPRIGHT.hand);
    const heading = this.figure.getWorldQuaternion(UPRIGHT.heading);
    prop.quaternion.copy(hand.invert().multiply(heading));
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
      case 'mush-roll':
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
      case 'mush-spool':
        add(cyl, this.material(COLORS.mush), [0, 0, 0], [0.12, 0.7, 0.12], [0, 0, Math.PI / 2]);
        break;
      case 'sprayer': {
        // Tank with its lid, and the straps over the shoulders.
        const dark = this.material(COLORS.sprayerHose, { roughness: 0.6 });
        add(cyl, tint, [0, 0, -0.04], [0.15, 0.48, 0.12]);
        add(cyl, dark, [0, 0.26, -0.04], [0.07, 0.05, 0.07]);
        for (const side of [-1, 1]) {
          add(this.box(), dark, [side * 0.09, 0.24, 0.1], [0.04, 0.012, 0.3]);
          add(this.box(), dark, [side * 0.09, 0.02, 0.28], [0.04, 0.42, 0.012]);
        }
        break;
      }
      case 'jug':
        add(this.box(), tint, [0, 0.16, 0], [0.2, 0.32, 0.14]);
        add(cyl, this.material(COLORS.string), [0, 0.35, 0], [0.04, 0.06, 0.04]);
        break;
      case 'pencil':
        add(cyl, this.material(COLORS.flower), [0, -0.05, 0.02], [0.012, 0.13, 0.012], [0.6, 0, 0]);
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
        // Held by its plug.
        add(seedlingGeometry(this.assets), seedlingMaterial(this.assets), [0, -0.05, 0.02]);
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
      case 'seedling-box': {
        // An open white box: floor and four walls, seedlings peeking out.
        const white = this.material(COLORS.box);
        const [w, h, d, wall] = [0.46, 0.16, 0.32, 0.015];
        add(this.box(), white, [0, -h / 2 + wall / 2, 0], [w, wall, d]);
        add(this.box(), white, [0, 0, d / 2], [w, h, wall]);
        add(this.box(), white, [0, 0, -d / 2], [w, h, wall]);
        add(this.box(), white, [w / 2, 0, 0], [wall, h, d]);
        add(this.box(), white, [-w / 2, 0, 0], [wall, h, d]);
        for (let i = 0; i < 12; i++) {
          const x = ((i % 4) - 1.5) * 0.1;
          const z = (Math.floor(i / 4) - 1) * 0.095;
          add(
            seedlingGeometry(this.assets),
            seedlingMaterial(this.assets),
            [x, h / 2 - 0.06, z],
            [0.9, 0.9, 0.9],
            [0, i * 1.3, 0],
          );
        }
        break;
      }
      case 'string-spool':
        add(cyl, this.material(COLORS.string), [0, -0.06, 0.04], [0.06, 0.1, 0.06]);
        break;
      case 'scissors':
        add(this.box(), metal, [0, -0.1, 0.02], [0.03, 0.16, 0.02], [0, 0, 0.25]);
        add(this.box(), metal, [0, -0.1, 0.02], [0.03, 0.16, 0.02], [0, 0, -0.25]);
        break;
      case 'basket': {
        add(this.cylinder(0.2, 0.15, 0.2), this.material(COLORS.basket), [0, -0.12, 0.08]);
        // Cucumbers in it; picking fills it (see harvestWork).
        const fruit = new THREE.InstancedMesh(
          cucumberGeometry(this.assets),
          cucumberMaterial(this.assets),
          BASKET_FRUIT,
        );
        const dummy = new THREE.Object3D();
        for (let i = 0; i < BASKET_FRUIT; i++) {
          dummy.position.set(((i % 3) - 1) * 0.08, -0.01 + Math.floor(i / 3) * 0.04, 0.08);
          dummy.rotation.set(Math.PI / 2, 0, 0.3 * i);
          dummy.updateMatrix();
          fruit.setMatrixAt(i, dummy.matrix);
        }
        fruit.computeBoundingSphere();
        fruit.count = 3;
        this.basketFruit = fruit;
        g.add(fruit);
        break;
      }
      case 'magnifier':
        add(cyl, wood, [0, -0.05, 0], [0.018, 0.12, 0.018]);
        add(this.torus(), metal, [0, -0.17, 0], [0.06, 0.06, 0.06], [0, Math.PI / 2, 0]);
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

/** Reused every frame to place the drops. */
const DROP_DUMMY = new THREE.Object3D();
/** How far from the emitter a drop lands. */
const DROP_SIDE = 0.05;

interface Drops {
  drop: THREE.InstancedMesh;
  ripple: THREE.InstancedMesh;
  /** Where each drop forms. */
  spots: THREE.Vector3[];
  /** Ridge surface, where drops land. */
  ground: number;
}
interface Sprayer {
  /** The lance, held at its grip: where the hose ends. */
  grip: THREE.Object3D;
  /** Just past the nozzle, where the mist comes out. */
  end: THREE.Object3D;
  /** Where the hose leaves the tank. */
  outlet: THREE.Object3D;
  /** Hose pieces, placed every frame along its sag. */
  hose: THREE.Mesh[];
  mist: THREE.InstancedMesh;
  /** Each mist particle's sideways drift, up to 1. */
  spread: THREE.Vector3[];
}
/** Scratch vectors for updateSprayer. */
const SPRAY_SCRATCH = {
  a: new THREE.Vector3(),
  b: new THREE.Vector3(),
  c: new THREE.Vector3(),
  d: new THREE.Vector3(),
  from: new THREE.Vector3(),
  to: new THREE.Vector3(),
};
const UP = new THREE.Vector3(0, 1, 0);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};
