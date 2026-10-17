import { describe, expect, it } from 'vitest';
import { formatPrice, percentOff } from './format';

describe('formatPrice', () => {
  it('formats whole rupees with thousands separators', () => {
    expect(formatPrice(1080)).toBe('Rs. 1,080');
    expect(formatPrice(30)).toBe('Rs. 30');
    expect(formatPrice(0)).toBe('Rs. 0');
  });

  it('rounds fractions away', () => {
    expect(formatPrice(349.6)).toBe('Rs. 350');
  });
});

describe('percentOff', () => {
  it('rounds to a whole percentage', () => {
    expect(percentOff(1000, 750)).toBe(25);
    expect(percentOff(350, 300)).toBe(14);
  });

  it('is 0 when there is no saving or no original price', () => {
    expect(percentOff(100, 100)).toBe(0);
    expect(percentOff(100, 120)).toBe(0);
    expect(percentOff(0, 0)).toBe(0);
  });
});
