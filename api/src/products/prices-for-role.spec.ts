import { describe, expect, it } from 'vitest';
import type { AuthUser } from '../auth/auth-user.js';
import { detailForRole, forRole } from './products.controller.js';
import type { AdminProducts, ProductDetail } from './products.service.js';

const admin = { id: 'a', role: 'admin' } as AuthUser;
const engineer = { id: 'e', role: 'employee' } as AuthUser;

const detail = {
  id: 'p1',
  averageCost: 12.5,
  movements: [{ id: 'm1', unitCost: 12.5 }],
} as unknown as ProductDetail;

const list = {
  greenhouses: [],
  categories: [],
  products: [{ id: 'p1', averageCost: 12.5 }],
} as unknown as AdminProducts;

describe('prices by role (PLAN §14)', () => {
  it('keeps prices for the admin', () => {
    expect(detailForRole(detail, admin)).toBe(detail);
    expect(forRole(list, admin)).toBe(list);
  });

  it('hides every price from engineers', () => {
    const shown = detailForRole(detail, engineer);
    expect(shown.averageCost).toBeNull();
    expect(shown.movements[0].unitCost).toBeNull();
    expect(forRole(list, engineer).products[0].averageCost).toBeNull();
  });
});
