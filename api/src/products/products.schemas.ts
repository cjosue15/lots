import { z } from 'zod';
import { daySchema, optionalText } from '../common/schemas.js';
import { STOCK_UNITS } from './units.js';

/** Cost report range (both days optional, inclusive). */
export const costQuerySchema = z.object({
  from: daySchema.optional(),
  to: daySchema.optional(),
});
export type CostQuery = z.infer<typeof costQuerySchema>;

const name = (max: number) =>
  z.string().trim().min(1, 'Escribe un nombre').max(max);
const amount = (message: string) =>
  z.number(message).min(0, message).max(1_000_000);
const unitCost = z
  .number('Escribe el precio por unidad')
  .positive('El precio debe ser mayor que 0')
  .max(1_000_000);

export const createCategorySchema = z.object({ name: name(60) });
export type CreateCategory = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z.object({
  name: name(60).optional(),
  active: z.boolean().optional(),
});
export type UpdateCategory = z.infer<typeof updateCategorySchema>;

/** A product starts with what was counted on `date` (its INITIAL movement). */
export const createProductSchema = z.object({
  name: name(120),
  categoryId: z.uuid('Elige una categoría'),
  unit: z.enum(STOCK_UNITS, 'Elige la unidad'),
  minStock: amount('El mínimo no puede ser negativo').default(0),
  initialStock: amount('El stock inicial no puede ser negativo'),
  unitCost,
  date: daySchema,
});
export type CreateProduct = z.infer<typeof createProductSchema>;

/** The unit is fixed once created: the ledger is written in it. */
export const updateProductSchema = z.object({
  name: name(120).optional(),
  categoryId: z.uuid().optional(),
  minStock: amount('El mínimo no puede ser negativo').optional(),
  active: z.boolean().optional(),
});
export type UpdateProduct = z.infer<typeof updateProductSchema>;

export const stockEntrySchema = z.object({
  quantity: z
    .number('Escribe la cantidad')
    .positive('La cantidad debe ser mayor que 0')
    .max(1_000_000),
  unitCost,
  date: daySchema,
});
export type StockEntry = z.infer<typeof stockEntrySchema>;

/** After a physical count: the counted stock, the difference is stored. */
export const stockAdjustmentSchema = z.object({
  counted: z.number('Escribe el stock contado').min(-1_000_000).max(1_000_000),
  date: daySchema,
  reason: optionalText(300).refine(
    (value) => value !== undefined,
    'Escribe el motivo',
  ),
});
export type StockAdjustment = z.infer<typeof stockAdjustmentSchema>;
