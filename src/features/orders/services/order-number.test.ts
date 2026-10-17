import { describe, expect, it } from 'vitest';
import { formatOrderNumber, orderYear } from './order-number';

describe('orderYear', () => {
  it('uses the restaurant timezone, not UTC', () => {
    // 31 Dec 2026, 20:00 UTC is already 1 Jan 2027, 01:00 in Lahore (UTC+5).
    expect(orderYear(new Date('2026-12-31T20:00:00Z'))).toBe(2027);
    expect(orderYear(new Date('2026-12-31T18:59:00Z'))).toBe(2026);
  });

  it('is stable mid-year', () => {
    expect(orderYear(new Date('2026-06-15T12:00:00Z'))).toBe(2026);
  });
});

describe('formatOrderNumber', () => {
  it('pads the sequence to four digits', () => {
    expect(formatOrderNumber(2026, 1)).toBe('BBQ-2026-0001');
    expect(formatOrderNumber(2026, 42)).toBe('BBQ-2026-0042');
    expect(formatOrderNumber(2026, 9999)).toBe('BBQ-2026-9999');
  });

  it('never truncates larger sequences', () => {
    expect(formatOrderNumber(2026, 12345)).toBe('BBQ-2026-12345');
  });
});
