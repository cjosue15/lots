export interface PhaseRef {
  order: number;
  name: string;
}

/**
 * Rule B (PLAN §7): the most advanced phase with at least one log in the
 * cycle. General actions and "Otra acción" without a phase do not count, so a
 * late log of an earlier phase never moves the cycle back.
 */
export function currentPhase(
  logs: ReadonlyArray<{ phase: PhaseRef | null }>,
): PhaseRef | null {
  let current: PhaseRef | null = null;
  for (const { phase } of logs) {
    if (phase && (!current || phase.order > current.order)) {
      current = phase;
    }
  }
  return current;
}
