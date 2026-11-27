import {
  FUNGICIDE_ON_SEEDLINGS,
  PRUNE_IN_PRODUCTION,
  WORKER_ACTIONS,
  lotWorkerAction,
  workerActionFor,
} from './worker-actions';

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
  const phase = (order: number) => ({ name: 'Fase', order });

  it('shows a general action only on the day it was logged', () => {
    const watered = (date: string) => ({
      lastLog: log('riego-humedad', date),
      lastPhaseLog: phaseLog,
      phase: phase(7),
    });
    expect(lotWorkerAction(watered(today), today)).toBe(WORKER_ACTIONS['riego-humedad']);
    expect(lotWorkerAction(watered('2026-11-22'), today)).toBe(WORKER_ACTIONS['cosecha']);
  });

  it('keeps the last action with a phase however long ago it was', () => {
    expect(
      lotWorkerAction({ lastLog: phaseLog, lastPhaseLog: phaseLog, phase: phase(7) }, today),
    ).toBe(WORKER_ACTIONS['cosecha']);
  });

  it("falls back to the last phase action when today's log has no animation", () => {
    expect(
      lotWorkerAction(
        { lastLog: log(null, today), lastPhaseLog: phaseLog, phase: phase(7) },
        today,
      ),
    ).toBe(WORKER_ACTIONS['cosecha']);
    expect(lotWorkerAction(null, today)).toBeNull();
  });

  it('aims the general fungicide at the seedlings only in Plantines', () => {
    const fungicide = (order: number) => ({
      lastLog: log('fungicida-general', today),
      lastPhaseLog: log('trasplantar', '2026-11-20'),
      phase: phase(order),
    });
    expect(lotWorkerAction(fungicide(5), today)).toBe(FUNGICIDE_ON_SEEDLINGS);
    expect(lotWorkerAction(fungicide(7), today)).toBe(WORKER_ACTIONS['fungicida-general']);
  });

  it('cleans producing plants in Producción and growing ones otherwise', () => {
    const cleaning = (order: number) => ({
      lastLog: log('limpiar-planta', today),
      lastPhaseLog: log('iniciar-tutorado', '2026-11-20'),
      phase: phase(order),
    });
    expect(lotWorkerAction(cleaning(7), today)).toBe(PRUNE_IN_PRODUCTION);
    expect(PRUNE_IN_PRODUCTION).toMatchObject({ phase: 7, ridge: 'prune-leaves' });
    expect(lotWorkerAction(cleaning(6), today)).toBe(WORKER_ACTIONS['limpiar-planta']);
  });
});
