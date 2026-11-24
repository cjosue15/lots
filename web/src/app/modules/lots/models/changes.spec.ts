import { describeChange } from './changes';

describe('describeChange', () => {
  it('formats dates, details, phases and empty values', () => {
    expect(
      describeChange([
        { field: 'date', before: '2026-11-20', after: '2026-11-21' },
        { field: 'details', before: null, after: { product: 'Urea', dose: 2, doseUnit: 'MG' } },
        { field: 'phase', before: '2. Preparación del suelo', after: null },
        { field: 'notes', before: 'Algo', after: null },
      ]),
    ).toEqual([
      { label: 'Fecha', before: '20 nov 2026', after: '21 nov 2026', wasEmpty: false },
      { label: 'Producto', before: 'Vacío', after: 'Urea', wasEmpty: true },
      { label: 'Dosis', before: 'Vacío', after: '2 mg', wasEmpty: true },
      { label: 'Fase', before: '2. Preparación del suelo', after: 'Sin fase', wasEmpty: false },
      { label: 'Notas', before: 'Algo', after: 'Vacío', wasEmpty: false },
    ]);
  });

  it('shows the product lists before and after', () => {
    const urea = { product: 'Urea', dose: 2, doseUnit: 'MG', method: null };
    expect(
      describeChange([
        { field: 'products', before: [], after: [urea, { ...urea, product: 'Bayfolan' }] },
      ]),
    ).toEqual([
      { label: 'Productos', before: 'Vacío', after: 'Urea: 2 mg; Bayfolan: 2 mg', wasEmpty: true },
    ]);
  });

  it('shows a change of dose unit as a change of dose', () => {
    expect(
      describeChange([
        {
          field: 'details',
          before: { dose: 2, doseUnit: 'ML' },
          after: { dose: 2, doseUnit: 'MG' },
        },
      ]),
    ).toEqual([{ label: 'Dosis', before: '2 ml', after: '2 mg', wasEmpty: false }]);
  });

  it('shows only the detail fields that changed', () => {
    expect(
      describeChange([
        {
          field: 'details',
          before: { result: 'Sin plagas', chemicalApplied: true },
          after: { result: 'Sin plagas', chemicalApplied: false },
        },
      ]),
    ).toEqual([{ label: '¿Se aplicó químico?', before: 'Sí', after: 'No', wasEmpty: false }]);
  });
});
