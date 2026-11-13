import { describe, expect, it } from 'vitest';
import type { SessionUser } from './access-token';
import { decideAccess, isBackgroundFetch } from './access-control';

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

describe('isBackgroundFetch', () => {
  const headers = (entries: Record<string, string>) => new Headers(entries);

  it('spots the requests Next.js makes behind the scenes (link preloads and in-app page data)', () => {
    expect(isBackgroundFetch(headers({ rsc: '1' }))).toBe(true);
    expect(isBackgroundFetch(headers({ rsc: '1', 'next-router-prefetch': '1' }))).toBe(true);
    expect(isBackgroundFetch(headers({ 'next-router-prefetch': '1' }))).toBe(true);
  });

  it('treats an ordinary page load as a real visit', () => {
    expect(isBackgroundFetch(headers({}))).toBe(false);
    expect(isBackgroundFetch(headers({ accept: 'text/html' }))).toBe(false);
    expect(isBackgroundFetch(headers({ rsc: '0' }))).toBe(false);
  });
});
