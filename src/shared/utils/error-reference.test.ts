import { describe, expect, it } from 'vitest';
import { errorReference } from './error-reference';

describe('errorReference', () => {
  it('returns the digest Next puts on server errors', () => {
    expect(errorReference(Object.assign(new Error('x'), { digest: '1234567890' }))).toBe(
      '1234567890',
    );
  });

  it('has nothing for browser errors, blank digests or things that are not errors', () => {
    expect(errorReference(new Error('x'))).toBeNull();
    expect(errorReference(Object.assign(new Error('x'), { digest: '' }))).toBeNull();
    expect(errorReference(Object.assign(new Error('x'), { digest: 42 }))).toBeNull();
    for (const value of ['boom', 42, null, undefined, { digest: 'abc' }]) {
      expect(errorReference(value)).toBeNull();
    }
  });
});
