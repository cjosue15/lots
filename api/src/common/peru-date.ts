/**
 * Peru is UTC-5 all year (no DST). Day dates (`@db.Date`) are stored as UTC
 * midnight of the Peru calendar day and exchanged as `YYYY-MM-DD`.
 */
const PERU_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Today's calendar day in Peru, as `YYYY-MM-DD`. */
export function todayInPeru(now = new Date()): string {
  return new Date(now.getTime() - PERU_OFFSET_MS).toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` → Date for a `@db.Date` column. */
export function toDbDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** `@db.Date` value → `YYYY-MM-DD`. */
export function fromDbDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (both `YYYY-MM-DD`). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toDbDate(to).getTime() - toDbDate(from).getTime()) / DAY_MS);
}
