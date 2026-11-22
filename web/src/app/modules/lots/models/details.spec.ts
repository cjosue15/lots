import { describeDetails } from './details';

describe('describeDetails', () => {
  it('lists only the filled fields, in Spanish', () => {
    expect(describeDetails(null)).toEqual([]);
    expect(describeDetails({ product: 'Nemacur', dose: '2 L' })).toEqual([
      'Producto: Nemacur',
      'Dosis: 2 L',
    ]);
    expect(describeDetails({ result: 'Sin plagas', chemicalApplied: false })).toEqual([
      'Resultado: Sin plagas',
      'No se aplicó químico',
    ]);
    expect(describeDetails({ result: 'CHANGE' })).toEqual(['Resultado: Hay que cambiarlo']);
  });
});
