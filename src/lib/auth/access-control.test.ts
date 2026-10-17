import { describe, expect, it } from 'vitest';
import type { SessionUser } from './access-token';
import { decideAccess } from './access-control';

const as = (role: SessionUser['role']): SessionUser => ({ userId: 'u', email: 'a@b.pk', role });

describe('decideAccess', () => {
  it('allows public paths for everyone', () => {
    expect(decideAccess('/menu', null)).toEqual({ action: 'allow' });
  });

  it('sends anonymous users on protected paths to the refresh flow', () => {
    expect(decideAccess('/admin/orders', null)).toEqual({ action: 'refresh' });
    expect(decideAccess('/account', null)).toEqual({ action: 'refresh' });
  });

  it('forbids customers from admin and store areas', () => {
    expect(decideAccess('/admin', as('CUSTOMER'))).toEqual({ action: 'forbidden' });
    expect(decideAccess('/store/kitchen', as('CUSTOMER'))).toEqual({ action: 'forbidden' });
  });

  it('lets each role into the areas it owns', () => {
    expect(decideAccess('/store/kitchen', as('STORE_STAFF'))).toEqual({ action: 'allow' });
    expect(decideAccess('/admin', as('STORE_STAFF'))).toEqual({ action: 'forbidden' });
    expect(decideAccess('/admin', as('ADMIN'))).toEqual({ action: 'allow' });
    expect(decideAccess('/account/orders', as('CUSTOMER'))).toEqual({ action: 'allow' });
  });
});
