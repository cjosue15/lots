import { describe, expect, it } from 'vitest';
import { currentPhase } from './current-phase.js';

const prep = { order: 2, name: 'Preparación del suelo' };
const install = { order: 3, name: 'Instalación' };

describe('currentPhase', () => {
  it('is null without phase logs', () => {
    expect(currentPhase([])).toBeNull();
    expect(currentPhase([{ phase: null }])).toBeNull();
  });

  it('takes the most advanced phase and ignores general actions', () => {
    expect(currentPhase([{ phase: install }, { phase: null }, { phase: prep }])).toEqual(install);
  });
});
