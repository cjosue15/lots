import { describeDetails, describeLogDetails, describeProduct, formatAmount } from './details';

describe('formatAmount', () => {
  it('writes negative stock with a real minus sign', () => {
    expect(formatAmount(-50, 'G')).toBe('−50 g');
    expect(formatAmount(2.5, 'L')).toBe('2.5 L');
  });
});

describe('describeProduct', () => {
  it('joins the dose and the method that were filled', () => {
    const p = {
      productId: null,
      product: 'Bayfolan',
      dose: null,
      doseUnit: null,
      method: null,
    } as const;
    expect(describeProduct(p)).toBe('Bayfolan');
    expect(describeProduct({ ...p, dose: 250, doseUnit: 'ML' })).toBe('Bayfolan: 250 ml');
    expect(describeProduct({ ...p, dose: 1.5, doseUnit: 'MG', method: 'SPRAY' })).toBe(
      'Bayfolan: 1.5 mg, fumigación',
    );
  });

  it('lists products before the other details', () => {
    expect(
      describeLogDetails({
        products: [
          { productId: null, product: 'Urea', dose: null, doseUnit: null, method: 'SYSTEM' },
        ],
        details: { humidity: '60%' },
      }),
    ).toEqual(['Urea: por sistema', 'Humedad: 60%']);
  });
});

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
