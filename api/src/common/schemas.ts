import { z } from 'zod';

// Validation messages in Spanish (the UI shows them as-is).
z.config(z.locales.es());

export const uuidParam = z.uuid();

/** Calendar day `YYYY-MM-DD` (Peru time is applied by the services). */
export const daySchema = z.iso.date({ message: 'Usa el formato AAAA-MM-DD' });

/** Trimmed free text; an empty string counts as "not filled". */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || undefined)
    .optional();
