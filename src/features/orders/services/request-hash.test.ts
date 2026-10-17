import { describe, expect, it } from 'vitest';
import { canonicalJson, hashRequest } from './request-hash';

describe('canonicalJson', () => {
  it('ignores key order at every depth', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
      canonicalJson({ a: { c: 3, d: 2 }, b: 1 }),
    );
  });

  it('keeps array order, because order is meaningful', () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it('drops undefined properties but keeps null', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }));
    expect(canonicalJson({ a: null })).not.toBe(canonicalJson({}));
  });

  it('handles primitives', () => {
    expect(canonicalJson('x')).toBe('"x"');
    expect(canonicalJson(3)).toBe('3');
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson(undefined)).toBe('null');
  });
});

describe('hashRequest', () => {
  it('is the same for the same request however it was built', () => {
    expect(hashRequest({ lines: [{ id: 1, qty: 2 }], type: 'PICKUP' })).toBe(
      hashRequest({ type: 'PICKUP', lines: [{ qty: 2, id: 1 }] }),
    );
  });

  it('changes when anything meaningful changes', () => {
    const base = { lines: [{ id: 1, qty: 2 }], type: 'PICKUP' };
    expect(hashRequest(base)).not.toBe(hashRequest({ ...base, type: 'DINE_IN' }));
    expect(hashRequest(base)).not.toBe(hashRequest({ ...base, lines: [{ id: 1, qty: 3 }] }));
  });

  it('is a 64-character hex digest', () => {
    expect(hashRequest({})).toMatch(/^[0-9a-f]{64}$/);
  });
});
