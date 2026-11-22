import { z } from 'zod';
import { DetailType } from '../generated/prisma/client.js';

const name = (max: number) => z.string().trim().min(1, 'Escribe un nombre').max(max);

export const renamePhaseSchema = z.object({ name: name(80) });
export type RenamePhase = z.infer<typeof renamePhaseSchema>;

export const createActionSchema = z.object({
  name: name(120),
  /** `null` = general action (no phase). */
  phaseId: z.uuid().nullable(),
  detailType: z.enum(DetailType).default(DetailType.NONE),
});
export type CreateAction = z.infer<typeof createActionSchema>;

export const updateActionSchema = z.object({
  name: name(120).optional(),
  phaseId: z.uuid().nullable().optional(),
  detailType: z.enum(DetailType).optional(),
  active: z.boolean().optional(),
});
export type UpdateAction = z.infer<typeof updateActionSchema>;

export const moveActionSchema = z.object({ direction: z.enum(['up', 'down']) });
export type MoveAction = z.infer<typeof moveActionSchema>;

export const createLotSchema = z.object({
  greenhouseId: z.uuid(),
  number: z.int('Usa un número entero').min(1, 'El número debe ser mayor que 0').max(999),
});
export type CreateLot = z.infer<typeof createLotSchema>;

export const updateLotSchema = z.object({ active: z.boolean() });
export type UpdateLot = z.infer<typeof updateLotSchema>;
