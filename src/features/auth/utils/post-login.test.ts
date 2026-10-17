import { describe, expect, it } from 'vitest';
import { postLoginPath, readRole } from './post-login';

describe('postLoginPath', () => {
  it('sends staff to the order board by default', () => {
    expect(postLoginPath('STORE_STAFF', '/')).toBe('/store/orders');
    expect(postLoginPath('ADMIN', '/')).toBe('/store/orders');
    expect(postLoginPath('SUPER_ADMIN', '/')).toBe('/store/orders');
  });

  it('sends customers home by default', () => {
    expect(postLoginPath('CUSTOMER', '/')).toBe('/');
  });

  it('respects where the visitor was heading, whoever they are', () => {
    expect(postLoginPath('STORE_STAFF', '/store/kitchen')).toBe('/store/kitchen');
    expect(postLoginPath('CUSTOMER', '/account/orders')).toBe('/account/orders');
    expect(postLoginPath('ADMIN', '/menu')).toBe('/menu');
  });

  it('treats an unknown or missing role as a customer', () => {
    expect(postLoginPath(undefined, '/')).toBe('/');
    expect(postLoginPath('ROOT', '/')).toBe('/');
    expect(postLoginPath(42, '/')).toBe('/');
  });
});

describe('readRole', () => {
  it('reads the role from a login response', () => {
    expect(readRole({ user: { role: 'STORE_STAFF' } })).toBe('STORE_STAFF');
  });

  it.each([null, undefined, {}, { user: null }, { user: {} }, { user: { role: 3 } }, 'x'])(
    'returns undefined for %j',
    (data) => {
      expect(readRole(data)).toBeUndefined();
    },
  );
});
