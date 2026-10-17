import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('joins truthy classes and skips falsy ones', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
    expect(cn()).toBe('');
  });
});
