import { WORKER_ACTIONS, lotWorkerAction, workerActionFor } from './worker-actions';

describe('workerActionFor', () => {
  it('finds actions by code and ignores missing or unknown codes', () => {
    expect(workerActionFor('hacer-huecos')).toEqual(WORKER_ACTIONS['hacer-huecos']);
    expect(workerActionFor(null)).toBeNull();
    expect(workerActionFor('no-existe')).toBeNull();
  });

  it('gives every shovel action a style and every lay action something it leaves behind', () => {
    for (const action of Object.values(WORKER_ACTIONS)) {
      if (action.motion === 'shovel') expect(action.style).toBeDefined();
      if (action.motion === 'lay') expect(action.ridge).toBeDefined();
    }
  });
});

describe('lotWorkerAction', () => {
  const today = '2026-11-23';
  const log = (code: string | null, date: string) => ({ name: code ?? 'Otra', date, code });
  const phaseLog = log('cosecha', '2026-11-20');

  it('shows a general action only on the day it was logged', () => {
    const watered = (date: string) => ({
      lastLog: log('riego-humedad', date),
      lastPhaseLog: phaseLog,
    });
    expect(lotWorkerAction(watered(today), today)).toBe(WORKER_ACTIONS['riego-humedad']);
    expect(lotWorkerAction(watered('2026-11-22'), today)).toBe(WORKER_ACTIONS['cosecha']);
  });

  it('keeps the last action with a phase however long ago it was', () => {
    expect(lotWorkerAction({ lastLog: phaseLog, lastPhaseLog: phaseLog }, today)).toBe(
      WORKER_ACTIONS['cosecha'],
    );
  });

  it("falls back to the last phase action when today's log has no animation", () => {
    expect(lotWorkerAction({ lastLog: log(null, today), lastPhaseLog: phaseLog }, today)).toBe(
      WORKER_ACTIONS['cosecha'],
    );
    expect(lotWorkerAction(null, today)).toBeNull();
  });
});
