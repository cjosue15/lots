import { describe, expect, it } from 'vitest';
import { convert, sameKind } from './units.js';

describe('convert', () => {
  it('converts within volume and weight', () => {
    expect(convert(250, 'ML', 'L')).toBe(0.25);
    expect(convert(100, 'G', 'KG')).toBe(0.1);
    expect(convert(500, 'MG', 'G')).toBe(0.5);
    expect(convert(2, 'KG', 'G')).toBe(2000);
    expect(convert(1.5, 'L', 'L')).toBe(1.5);
  });

  it('keeps float noise out', () => {
    expect(convert(0.1 + 0.2, 'L', 'L')).toBe(0.3);
  });

  it('refuses to mix volume and weight', () => {
    expect(sameKind('ML', 'KG')).toBe(false);
    expect(() => convert(1, 'ML', 'KG')).toThrow();
  });
});
