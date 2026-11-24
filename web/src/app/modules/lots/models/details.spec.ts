import { describeDetails } from './details';

describe('describeDetails', () => {
  it('lists only the filled fields, in Spanish', () => {
    expect(describeDetails(null)).toEqual([]);
    expect(
      describeDetails({ product: 'Nemacur', dose: 250, doseUnit: 'ML', method: 'SYSTEM' }),
    ).toEqual(['Producto: Nemacur', 'Dosis: 250 ml', 'Forma de aplicación: Por sistema']);
    expect(describeDetails({ method: 'SPRAY' })).toEqual(['Forma de aplicación: Fumigación']);
    expect(describeDetails({ dose: 1.5, doseUnit: 'MG' })).toEqual(['Dosis: 1.5 mg']);
    // Older logs kept the dose as free text.
    expect(describeDetails({ dose: '2 L' })).toEqual(['Dosis: 2 L']);
    expect(describeDetails({ result: 'Sin plagas', chemicalApplied: false })).toEqual([
      'Resultado: Sin plagas',
      'No se aplicó químico',
    ]);
    expect(describeDetails({ result: 'CHANGE' })).toEqual(['Resultado: Hay que cambiarlo']);
  });
});
