import { z } from 'zod';
import { DetailType } from '../generated/prisma/client.js';
import { daySchema, optionalText } from '../common/schemas.js';

/**
 * Extra fields per action detail type (PLAN §8). All optional: only the data
 * type is checked. Unknown keys are dropped.
 */
export const detailSchemas = {
  [DetailType.NONE]: z.object({}),
  [DetailType.APPLICATION]: z.object({
    product: optionalText(200),
    dose: optionalText(100),
  }),
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
  notes: optionalText(1000).nullable(),
});
export type UpdateActionLog = z.infer<typeof updateActionLogSchema>;
