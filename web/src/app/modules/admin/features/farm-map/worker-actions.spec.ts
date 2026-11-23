import { WORKER_ACTIONS, workerActionFor } from './worker-actions';

describe('workerActionFor', () => {
  it('finds actions by code and ignores missing or unknown codes', () => {
    expect(workerActionFor('hacer-huecos')).toEqual(WORKER_ACTIONS['hacer-huecos']);
    expect(workerActionFor(null)).toBeNull();
    expect(workerActionFor('no-existe')).toBeNull();
  });

  it('gives every shovel action a style and every lay action a trail', () => {
    for (const action of Object.values(WORKER_ACTIONS)) {
      if (action.motion === 'shovel') expect(action.style).toBeDefined();
      if (action.motion === 'lay') expect(action.trail).toBeDefined();
    }
  });
});
