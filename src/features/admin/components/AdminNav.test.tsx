// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderAdmin } from '../testing/harness';
import { AdminNav, isCurrent } from './AdminNav';

const nav = vi.hoisted(() => ({ pathname: '/admin' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

afterEach(cleanup);

describe('isCurrent', () => {
  it('matches the dashboard only on its own page', () => {
    expect(isCurrent('/admin', '/admin')).toBe(true);
    expect(isCurrent('/admin/menu', '/admin')).toBe(false);
  });
  it('matches a section and everything inside it, but not a look-alike', () => {
    expect(isCurrent('/admin/menu', '/admin/menu')).toBe(true);
    expect(isCurrent('/admin/menu/new', '/admin/menu')).toBe(true);
    expect(isCurrent('/admin/menu/abc-123', '/admin/menu')).toBe(true);
    expect(isCurrent('/admin/menus', '/admin/menu')).toBe(false);
    expect(isCurrent('/admin/orders', '/admin/menu')).toBe(false);
  });
});

describe('AdminNav', () => {
  it('links to every admin section and the store panel', () => {
    nav.pathname = '/admin';
    renderAdmin(<AdminNav />);
    const names = [
      'Dashboard',
      'Orders',
      'Menu',
      'Categories',
      'Add-ons',
      'Deals',
      'Delivery areas',
      'Coupons',
      'Settings',
      'Team',
      'Open store panel',
    ];
    for (const name of names) expect(screen.getByRole('link', { name })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open store panel' })).toHaveAttribute(
      'href',
      '/store/orders',
    );
  });

  it('marks the page you are on', () => {
    nav.pathname = '/admin/menu/new';
    renderAdmin(<AdminNav />);
    expect(screen.getByRole('link', { name: 'Menu' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('navigation', { name: 'Admin navigation' })).toBeInTheDocument();
  });
});
