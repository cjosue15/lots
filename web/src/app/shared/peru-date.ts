/** Peru is UTC-5 all year. Today's calendar day in Lima as `YYYY-MM-DD`. */
export function todayInPeru(now = new Date()): string {
  return new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];

/** `2026-11-22` → `22 nov 2026` (no timezone conversion: it is a calendar day). */
export function formatDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return `${date} ${MONTHS[month - 1]} ${year}`;
}

/** Relative label for recent days: Hoy, Ayer, or the formatted date. */
export function relativeDay(day: string, today = todayInPeru()): string {
  const diff = Math.round((Date.parse(today) - Date.parse(day)) / 86_400_000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  return formatDay(day);
}
