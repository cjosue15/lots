/**
 * What the 3D worker does for each action, keyed by the action's `code`
 * (Action.code in the API; set by the seed). Each action is a base motion
 * plus the objects the worker carries, so actions that move alike still look
 * different. An action without a code, or with one missing here, shows no
 * worker.
 *
 * To add an action: give it a code in the database and an entry here.
 */

export type Motion =
  /** Bent over, picking things up from the ground while walking. */
  | 'pick'
  /** Digging with a shovel; `style` says how. */
  | 'shovel'
  /** Sack on the shoulder, throwing handfuls along the line. */
  | 'sack'
  /** Walking backwards unrolling something along the bed. */
  | 'lay'
  /** Backpack sprayer, sweeping the lance over the plants. */
  | 'spray'
  /** Standing with a hose. */
  | 'water'
  /** Kneeling, setting seedlings in the ridge one by one. */
  | 'kneel'
  /** Walking with something held in front. */
  | 'carry'
  /** Standing, working with the arms up in the plants. */
  | 'reach'
  /** Picking at chest height into a basket. */
  | 'harvest'
  /** Walking slowly, stopping to look. */
  | 'inspect'
  /** Stopping at each plant to look it over, then writing on a clipboard. */
  | 'note'
  /** At the front end of the bed, bent over the main line opening a valve. */
  | 'valve'
  /** Facing the ridge, bending to each plant, lifting it and tying it up. */
  | 'lift'
  /** Facing the ridge, crouched at each plant, snipping off its lower leaves. */
  | 'prune'
  /** Facing the ridge, bending to each plant and pulling it up by the base. */
  | 'uproot'
  /** Facing the ridge, chopping each plant's root off and throwing it away. */
  | 'cut'
  /** Facing the ridge, plant by plant, crumbling a leaf to see if it has dried. */
  | 'feel'
  /** Facing the ridge, throwing each plant's yellow fruit out, then the plant itself. */
  | 'clear';

export type PropKind =
  | 'mush-roll'
  | 'tape-coil'
  | 'machete'
  | 'bucket'
  | 'shovel'
  | 'broza'
  | 'sack'
  | 'tape-spool'
  | 'mush-spool'
  | 'sprayer'
  | 'hose'
  | 'jug'
  | 'clipboard'
  | 'pencil'
  | 'seedling'
  | 'tray'
  | 'seedling-box'
  | 'string-spool'
  | 'scissors'
  | 'basket'
  | 'magnifier';

export interface WorkerAction {
  motion: Motion;
  props: PropKind[];
  /** Shovel work: turning soil over, digging holes, or pushing soil back. */
  style?: 'turn' | 'dig' | 'push';
  /** Colour of the product (sprayer tank, jug). */
  tint?: number;
  /** Bed drawn as this phase while the worker is on it (see `ridge` too). */
  phase?: number;
  /** Water drips from every emitter on the drip tape. */
  drip?: boolean;
  /** Producing plants drawn still without fruit (production just starting). */
  noFruit?: boolean;
  /**
   * Work done on the first ridge, which also sets how the whole bed looks
   * while the worker is on it, whatever the cycle's phase (see RidgeWork).
   */
  ridge?: RidgeWork;
}

/**
 * The other ridges show the work done; the first one changes as the worker
 * walks along it.
 * - pull-plastic: ridges covered with plastic, pulled off ahead of the hands.
 * - pull-tape: bare ridges with drip tape, taken up ahead of the hands.
 * - drop-guano: ridges with guano down their middle, left behind the worker.
 * - mix-guano: the same guano, turned into the soil behind the worker, which
 *   leaves the ridge darker.
 * - fill-broza: mixed ridges with a trench down the middle, filled with broza
 *   behind the worker.
 * - cover-broza: that broza, covered with a layer of soil behind the worker.
 * - lay-tape: bare ridges with drip tape, unrolled by a worker walking
 *   backwards.
 * - lay-plastic: ridges with tape covered with plastic, unrolled the same way
 *   over a first ridge that has nothing yet.
 * - plant-seedlings: covered ridges with seedlings, planted one by one behind
 *   a kneeling worker on a first ridge that has none yet.
 * - tie-plants: young plants standing on their strings; on the first ridge
 *   they still sprawl on the plastic until the worker lifts each one up.
 * - prune-leaves: growing plants with their lower leaves cut off, lying on the
 *   plastic; on the first ridge the worker snips them off plant by plant.
 * - harvest-fruit: producing plants with only young fruit left; on the first
 *   ridge the worker picks the ripe cucumbers into the basket.
 * - uproot: dead plants hanging from their strings, pulled up with their
 *   roots in the air; on the first ridge the worker pulls each one up and
 *   leaves it hanging there.
 * - cut-root: every plant pulled up; the worker cuts the roots of the first
 *   ridge's plants and throws them out of the bed, like the others' already.
 */
export type RidgeWork =
  | 'pull-plastic'
  | 'pull-tape'
  | 'drop-guano'
  | 'mix-guano'
  | 'fill-broza'
  | 'cover-broza'
  | 'lay-tape'
  | 'lay-plastic'
  | 'plant-seedlings'
  | 'tie-plants'
  | 'prune-leaves'
  | 'harvest-fruit'
  | 'uproot'
  | 'cut-root'
  /** Pulled plants, roots cut, drying on their strings: they brown and shed leaves. */
  | 'dry-plants'
  /** Dry plants taken off their strings and out of the bed, yellow fruit first. */
  | 'clear-plants';

const PRODUCT = {
  nematicide: 0xb5452f,
  fungicide: 0x4f8a3a,
  production: 0x6a4fa8,
  chemical: 0xd2862a,
  foliar: 0xd9c23a,
} as const;

export const WORKER_ACTIONS: Readonly<Record<string, WorkerAction>> = {
  // 1. Limpieza del campo
  // The ridges still have their plastic; the worker pulls it off one of them.
  'recoger-mush': {
    motion: 'pick',
    props: ['mush-roll'],
    ridge: 'pull-plastic',
  },
  // Plastic gone, the drip tape still on the ridges; the worker takes it up.
  'recoger-cintas': {
    motion: 'pick',
    props: ['tape-coil'],
    ridge: 'pull-tape',
  },
  // 2. Preparación del suelo
  // Guano along the middle of each ridge, a handful at a time.
  'poner-guano': { motion: 'sack', props: ['sack'], ridge: 'drop-guano' },
  'remover-tierra': { motion: 'shovel', style: 'turn', props: ['shovel'], ridge: 'mix-guano' },
  'hacer-huecos': {
    motion: 'shovel',
    style: 'dig',
    props: ['shovel', 'broza'],
    ridge: 'fill-broza',
  },
  'tapar-huecos': { motion: 'shovel', style: 'push', props: ['shovel'], ridge: 'cover-broza' },
  // 3. Instalación
  'instalar-cinta': { motion: 'lay', props: ['tape-spool'], ridge: 'lay-tape' },
  'colocar-mush': { motion: 'lay', props: ['mush-spool'], ridge: 'lay-plastic' },
  // Applied through the drip tape: the worker opens the valve at the end of
  // the lines and every emitter drips.
  'nematicida-instalacion': {
    motion: 'valve',
    props: ['jug'],
    tint: PRODUCT.nematicide,
    phase: 3,
    drip: true,
  },
  // 4. Descomposición
  // Plain water through the drip tape so the guano and broza rot: same valve
  // and dripping emitters as the nematicide, without the jug.
  'regar-interdiario': { motion: 'valve', props: [], phase: 4, drip: true },
  // 5. Plantines
  // Only the box arriving: the beds still look like phase 4, nothing planted.
  'recibir-plantines': { motion: 'carry', props: ['seedling-box'], phase: 4 },
  trasplantar: {
    motion: 'kneel',
    props: ['seedling', 'seedling-box'],
    phase: 5,
    ridge: 'plant-seedlings',
  },
  // Through the drip tape like the nematicide, over the new seedlings, until
  // it is confirmed how it is applied in the field.
  'fungicida-enraizante': {
    motion: 'valve',
    props: ['jug'],
    tint: PRODUCT.fungicide,
    phase: 5,
    drip: true,
  },
  // 6. Crecimiento
  'iniciar-tutorado': { motion: 'lift', props: [], phase: 6, ridge: 'tie-plants' },
  'limpiar-planta': { motion: 'prune', props: ['scissors'], phase: 6, ridge: 'prune-leaves' },
  // 7. Producción
  // Through the drip tape like the nematicide, among plants just starting to
  // produce: flowers, no fruit yet.
  'fertilizante-produccion': {
    motion: 'valve',
    props: ['jug'],
    tint: PRODUCT.production,
    phase: 7,
    drip: true,
    noFruit: true,
  },
  'evaluar-fertilizantes': { motion: 'note', props: ['clipboard', 'pencil'] },
  cosecha: { motion: 'harvest', props: ['basket'], phase: 7, ridge: 'harvest-fruit' },
  // 8. Cierre del ciclo
  'nematicida-cierre': {
    motion: 'valve',
    props: ['jug'],
    tint: PRODUCT.nematicide,
    drip: true,
  },
  'arrancar-planta': { motion: 'uproot', props: [], phase: 8, ridge: 'uproot' },
  'cortar-raiz': { motion: 'cut', props: ['machete'], phase: 8, ridge: 'cut-root' },
  'secar-planta': { motion: 'feel', props: [], phase: 8, ridge: 'dry-plants' },
  'bajar-planta': { motion: 'clear', props: [], phase: 8, ridge: 'clear-plants' },
  // Generales
  'revision-plagas': { motion: 'inspect', props: ['magnifier'] },
  'aplicar-quimico': { motion: 'spray', props: ['sprayer'], tint: PRODUCT.chemical },
  'fungicida-general': { motion: 'spray', props: ['sprayer'], tint: PRODUCT.fungicide },
  foliares: { motion: 'spray', props: ['sprayer'], tint: PRODUCT.foliar },
  'riego-humedad': { motion: 'water', props: ['hose', 'clipboard'] },
  'control-calidad': { motion: 'inspect', props: ['clipboard'] },
};

export function workerActionFor(code: string | null | undefined): WorkerAction | null {
  return (code && WORKER_ACTIONS[code]) || null;
}
