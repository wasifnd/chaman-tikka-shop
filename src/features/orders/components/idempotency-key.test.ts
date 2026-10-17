import { describe, expect, it } from 'vitest';
import { keyFor, readTrackingToken } from './idempotency-key';

describe('keyFor', () => {
  let counter = 0;
  const generate = () => `key-${String(++counter)}`;

  it('creates a key the first time', () => {
    expect(keyFor(null, 'order-a', generate)).toEqual({ fingerprint: 'order-a', key: 'key-1' });
  });

  it('reuses the key for the identical order, so a retry is recognised as a retry', () => {
    const first = keyFor(null, 'order-a', generate);
    const again = keyFor(first, 'order-a', generate);
    expect(again).toBe(first);
  });

  it('issues a new key as soon as the order changes', () => {
    const first = keyFor(null, 'order-a', generate);
    const changed = keyFor(first, 'order-b', generate);
    expect(changed.key).not.toBe(first.key);
    expect(changed.fingerprint).toBe('order-b');
  });

  it('does not call the generator when it can reuse the key', () => {
    let calls = 0;
    const first = keyFor(null, 'x', () => `k${String(++calls)}`);
    keyFor(first, 'x', () => `k${String(++calls)}`);
    expect(calls).toBe(1);
  });
});

describe('readTrackingToken', () => {
  it('returns the token from a good response', () => {
    expect(readTrackingToken({ order: { trackingToken: 'abc' } })).toBe('abc');
  });

  it.each([
    null,
    undefined,
    {},
    { order: {} },
    { order: { trackingToken: 5 } },
    { order: { trackingToken: '' } },
  ])('throws for %j', (data) => {
    expect(() => readTrackingToken(data)).toThrow('Unexpected order response');
  });
});
