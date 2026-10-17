import { describe, expect, it } from 'vitest';
import { fromMinor, percentOf, toMinor } from './money';

describe('toMinor / fromMinor', () => {
  it('converts whole and fractional rupees', () => {
    expect(toMinor(350)).toBe(35000);
    expect(toMinor(12.5)).toBe(1250);
    expect(fromMinor(1250)).toBe(12.5);
  });

  it('absorbs floating-point representation error', () => {
    expect(19.99 * 100).not.toBe(1999); // the problem we are avoiding
    expect(toMinor(19.99)).toBe(1999);
    expect(toMinor(0.1) + toMinor(0.2)).toBe(toMinor(0.3));
    expect(toMinor(1.005)).toBe(101);
  });

  it('round-trips two-decimal amounts exactly', () => {
    for (const amount of [0, 0.01, 0.99, 1.1, 99.95, 1234.56, 99999999.99]) {
      expect(fromMinor(toMinor(amount))).toBe(amount);
    }
  });

  it('handles negatives (price modifiers can reduce a price) symmetrically', () => {
    expect(toMinor(-50)).toBe(-5000);
    expect(toMinor(-0.1)).toBe(-10);
    expect(toMinor(-1.005)).toBe(-101);
  });

  it('never returns negative zero', () => {
    expect(Object.is(toMinor(-0.001), 0)).toBe(true);
    expect(Object.is(percentOf(0, -5), 0)).toBe(true);
  });
});

describe('percentOf', () => {
  it('takes a percentage and rounds to the nearest paisa', () => {
    expect(percentOf(100000, 10)).toBe(10000);
    expect(percentOf(33333, 16)).toBe(5333); // 5333.28
    expect(percentOf(33335, 16)).toBe(5334); // 5333.6
  });

  it('is zero for 0% or zero amounts', () => {
    expect(percentOf(100000, 0)).toBe(0);
    expect(percentOf(0, 17)).toBe(0);
  });
});
