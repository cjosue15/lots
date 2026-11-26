import { type GreenhouseStock, stockAlert, usesProduct } from './product-admin.model';

const stock = (overrides: Partial<GreenhouseStock>): GreenhouseStock => ({
  greenhouse: { id: 'g', name: 'Bungalows' },
  stock: 0,
  minStock: 0,
  status: 'OUT',
  startDate: null,
  initialDate: null,
  ...overrides,
});

describe('stockAlert', () => {
  it('ignores greenhouses that never got the product and have no minimum', () => {
    expect(usesProduct(stock({}))).toBe(false);
    expect(stockAlert(stock({}))).toBeNull();
  });

  it('flags greenhouses that use it: out of stock or under the minimum', () => {
    expect(stockAlert(stock({ startDate: '2026-12-01' }))).toBe('OUT');
    expect(stockAlert(stock({ minStock: 2 }))).toBe('OUT');
    expect(
      stockAlert(stock({ stock: 1, minStock: 2, status: 'LOW', startDate: '2026-12-01' })),
    ).toBe('LOW');
    expect(stockAlert(stock({ stock: 5, status: 'OK', startDate: '2026-12-01' }))).toBeNull();
  });
});
