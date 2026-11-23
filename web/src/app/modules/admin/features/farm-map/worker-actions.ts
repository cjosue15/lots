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
  | 'inspect';

export type PropKind =
  | 'mush-roll'
  | 'tape-coil'
  | 'dry-plant'
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
  | 'seedling'
  | 'tray'
  | 'string-spool'
  | 'scissors'
  | 'basket'
  | 'magnifier'
  | 'wrench';

export interface WorkerAction {
  motion: Motion;
  props: PropKind[];
  /** Shovel work: turning soil over, digging holes, or pushing soil back. */
  style?: 'turn' | 'dig' | 'push';
  /** Colour of the product (sprayer tank, jug). */
  tint?: number;
  /** Strip left behind on the bed while laying (colour and width). */
  trail?: { color: number; width: number };
  /**
   * How the bed looks while the worker is on it, when the cycle's phase says
   * otherwise: drawn as `phase`, with `peel` the colour of a covering the
   * worker takes off the first ridge as it walks.
   */
  bed?: { phase: number; peel?: number };
}

const PRODUCT = {
  nematicide: 0xb5452f,
  fungicide: 0x4f8a3a,
  fertilizer: 0x3c6fb0,
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
    bed: { phase: 3, peel: 0x23211f },
  },
  'recoger-cintas': { motion: 'pick', props: ['tape-coil'] },
  // 2. Preparación del suelo
  'poner-guano': { motion: 'sack', props: ['sack'] },
  'remover-tierra': { motion: 'shovel', style: 'turn', props: ['shovel'] },
  'hacer-huecos': { motion: 'shovel', style: 'dig', props: ['shovel', 'broza'] },
  'tapar-huecos': { motion: 'shovel', style: 'push', props: ['shovel'] },
  // 3. Instalación
  'instalar-cinta': {
    motion: 'lay',
    props: ['tape-spool'],
    trail: { color: 0x2b4f73, width: 0.06 },
  },
  'colocar-mush': {
    motion: 'lay',
    props: ['mush-spool'],
    trail: { color: 0x23211f, width: 0.7 },
  },
  'nematicida-instalacion': { motion: 'water', props: ['hose', 'jug'], tint: PRODUCT.nematicide },
  // 4. Descomposición
  'regar-interdiario': { motion: 'water', props: ['hose'] },
  // 5. Plantines
  'recibir-plantines': { motion: 'carry', props: ['tray'] },
  trasplantar: { motion: 'kneel', props: ['seedling', 'tray'] },
  'fungicida-enraizante': { motion: 'spray', props: ['sprayer'], tint: PRODUCT.fungicide },
  'segunda-fertilizacion': { motion: 'spray', props: ['sprayer'], tint: PRODUCT.fertilizer },
  // 6. Crecimiento
  'iniciar-tutorado': { motion: 'reach', props: ['string-spool'] },
  'limpiar-planta': { motion: 'reach', props: ['scissors'] },
  // 7. Producción
  'fertilizante-produccion': { motion: 'spray', props: ['sprayer'], tint: PRODUCT.production },
  'evaluar-fertilizantes': { motion: 'inspect', props: ['clipboard'] },
  cosecha: { motion: 'harvest', props: ['basket'] },
  'controlar-desperfectos': { motion: 'inspect', props: ['wrench'] },
  // 8. Cierre del ciclo
  'nematicida-cierre': { motion: 'water', props: ['hose', 'jug'], tint: PRODUCT.nematicide },
  'arrancar-planta': { motion: 'pick', props: ['dry-plant'] },
  'cortar-raiz': { motion: 'pick', props: ['machete'] },
  'secar-planta': { motion: 'inspect', props: [] },
  'bajar-planta': { motion: 'pick', props: ['bucket'] },
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
