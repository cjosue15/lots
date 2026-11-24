import { z } from 'zod';
import { ApplicationMethod, DetailType, DoseUnit } from '../generated/prisma/client.js';
import { daySchema, optionalText } from '../common/schemas.js';

/**
 * Extra fields per action detail type (PLAN §8). All optional: only the data
 * type is checked. Unknown keys are dropped. APPLICATION keeps its products in
 * `products` (ActionLogProduct), not here.
 */
export const detailSchemas = {
  [DetailType.NONE]: z.object({}),
  [DetailType.APPLICATION]: z.object({}),
  [DetailType.IRRIGATION]: z.object({
    humidity: optionalText(100),
  }),
  [DetailType.PEST_CHECK]: z.object({
    result: optionalText(500),
    chemicalApplied: z.boolean().optional(),
  }),
  [DetailType.FERTILIZER_EVAL]: z.object({
    result: z.enum(['WORKED', 'CHANGE']).optional(),
  }),
} satisfies Record<DetailType, z.ZodType>;

const detailsInput = z.record(z.string(), z.unknown()).nullable().optional();

/** One product of an APPLICATION log, picked from the catalog (PLAN §14). */
export const productSchema = z
  .object({
    productId: z.uuid('Elige el producto'),
    /** Total used in the lot, in `doseUnit`. */
    dose: z.number().positive('La cantidad debe ser mayor que 0').max(1_000_000).optional(),
    doseUnit: z.enum(DoseUnit).optional(),
    method: z.enum(ApplicationMethod).optional(),
  })
  .refine((p) => p.dose === undefined || p.doseUnit !== undefined, {
    message: 'Elige la unidad de la cantidad',
    path: ['doseUnit'],
  })
  // A unit without an amount means nothing.
  .transform((p) => ({
    productId: p.productId,
    dose: p.dose ?? null,
    doseUnit: p.dose === undefined ? null : (p.doseUnit ?? null),
    method: p.method ?? null,
  }));
export type ProductInput = z.output<typeof productSchema>;

/** Only for APPLICATION actions. On update, `[]` removes every product. */
const productsInput = z.array(productSchema).max(20, 'Hasta 20 productos por registro').optional();

export const createActionLogSchema = z
  .object({
    /** Template action. Leave it out for "Otra acción". */
    actionId: z.uuid().optional(),
    /** Only for "Otra acción". */
    name: optionalText(120),
    /** Only for "Otra acción" (optional). */
    phaseId: z.uuid().optional(),
    /** Defaults to today (Peru). */
    date: daySchema.optional(),
    details: detailsInput,
    products: productsInput,
    notes: optionalText(1000),
  })
  .refine((body) => body.actionId || body.name, {
    message: 'Elige una acción o escribe el nombre de la otra acción',
    path: ['name'],
  });
export type CreateActionLog = z.infer<typeof createActionLogSchema>;

/** `null` clears notes or the phase of an "Otra acción". */
export const updateActionLogSchema = z.object({
  name: optionalText(120),
  phaseId: z.uuid().nullable().optional(),
  date: daySchema.optional(),
  details: detailsInput,
  products: productsInput,
  notes: optionalText(1000).nullable(),
});
export type UpdateActionLog = z.infer<typeof updateActionLogSchema>;
