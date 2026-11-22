import { describe, expect, it } from 'vitest';
import { diffSnapshots, type LogSnapshot } from './log-changes.js';

const base: LogSnapshot = {
  name: 'Riego',
  phaseId: null,
  date: '2026-11-20',
  details: { humidity: '60%' },
  notes: null,
};
const label = (id: string) => (id === 'p3' ? '3. Trasplante' : 'Fase eliminada');

describe('diffSnapshots', () => {
  it('returns nothing when the snapshots are equal', () => {
    expect(diffSnapshots(base, { ...base }, label)).toEqual([]);
  });

  it('lists changed fields in form order with readable phases', () => {
    const after = { ...base, notes: 'Con bomba nueva', phaseId: 'p3', date: '2026-11-21' };
    expect(diffSnapshots(base, after, label)).toEqual([
      { field: 'phase', before: null, after: '3. Trasplante' },
      { field: 'date', before: '2026-11-20', after: '2026-11-21' },
      { field: 'notes', before: null, after: 'Con bomba nueva' },
    ]);
  });

  it('detects changes inside details', () => {
    const after = { ...base, details: { humidity: '70%' } };
    expect(diffSnapshots(base, after, label)).toEqual([
      { field: 'details', before: { humidity: '60%' }, after: { humidity: '70%' } },
    ]);
  });
});
