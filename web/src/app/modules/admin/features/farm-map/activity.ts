import { todayInPeru } from '../../../../shared/peru-date';
import type { LotSummary } from '../../../lots/models/lot.model';

/** Days without logs after which a lot is shown faded (PLAN §10, "Vista 3D"). */
export const STALE_AFTER_DAYS = 3;

/**
 * - `today`: has a log dated today.
 * - `recent`: last log (or cycle start, if none) less than 3 days ago.
 * - `stale`: 3 days or more without logs.
 * - `idle`: no active cycle.
 */
export type Activity = 'today' | 'recent' | 'stale' | 'idle';

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/** Days since the last log (or the cycle start, if none); null without a cycle. */
export function daysWithoutLogs(lot: LotSummary, today = todayInPeru()): number | null {
  const cycle = lot.cycle;
  if (!cycle) return null;
  return daysBetween(cycle.lastLog?.date ?? cycle.startDate, today);
}

export function activityOf(lot: LotSummary, today = todayInPeru()): Activity {
  if (!lot.cycle) return 'idle';
  if (lot.cycle.lastLog?.date === today) return 'today';
  return (daysWithoutLogs(lot, today) ?? 0) >= STALE_AFTER_DAYS ? 'stale' : 'recent';
}
