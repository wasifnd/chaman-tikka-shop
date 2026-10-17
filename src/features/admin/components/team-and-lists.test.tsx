// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminDeal, AdminProductRow, TeamMember } from '../types/admin.types';
import { click, nextCall, renderAdmin, typeInto, useApiMock } from '../testing/harness';
import { DealsTable, dealState } from './DealsTable';
import { ProductsTable } from './ProductsTable';
import { TeamManager } from './TeamManager';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
beforeEach(() => {
  router.push.mockReset();
  router.refresh.mockReset();
});

describe('TeamManager', () => {
  const api = useApiMock();
  const member = (overrides: Partial<TeamMember> & { id: string; email: string }): TeamMember => ({
    role: 'STORE_STAFF',
    isActive: true,
    lastLoginAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  });
  const me = member({ id: 'me', email: 'boss@shop.pk', role: 'ADMIN' });
  const cook = member({
    id: 'cook',
    email: 'cook@shop.pk',
    lastLoginAt: '2026-10-16T18:00:00.000Z',
  });
  const otherAdmin = member({ id: 'admin2', email: 'admin2@shop.pk', role: 'ADMIN' });

  const show = (role: 'ADMIN' | 'SUPER_ADMIN', members = [me, cook, otherAdmin]) =>
    renderAdmin(<TeamManager members={members} currentUserId="me" currentRole={role} />);

  it('shows everyone with their role, status and last sign-in', () => {
    show('ADMIN');
    expect(screen.getByText('boss@shop.pk')).toBeInTheDocument();
    expect(screen.getByText('(you)')).toBeInTheDocument();
    expect(screen.getByText(/Store staff · Active · last signed in/)).toBeInTheDocument();
    // Two of the three have never signed in.
    expect(screen.getAllByText(/has not signed in yet/)).toHaveLength(2);
  });

  it('offers actions only for people this admin may manage', () => {
    show('ADMIN');
    expect(screen.getByRole('button', { name: 'Switch off cook@shop.pk' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Reset password for cook@shop.pk' }),
    ).toBeInTheDocument();
    // Not themselves, and not another admin.
    expect(screen.queryByRole('button', { name: /boss@shop.pk/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /admin2@shop.pk/ })).toBeNull();
  });

  it('lets a super admin manage admins as well', () => {
    show('SUPER_ADMIN');
    expect(screen.getByRole('button', { name: 'Switch off admin2@shop.pk' })).toBeInTheDocument();
  });

  it('adds store staff', async () => {
    show('ADMIN');
    click('Add team member');
    // An ordinary admin is not offered the Admin role.
    expect(screen.queryByRole('option', { name: 'Admin' })).toBeNull();
    typeInto('Email', ' New.Cook@Shop.pk ');
    typeInto('Starting password', 'kitchen-pass-1');
    click('Save');
    const call = await nextCall(api, 'POST');
    expect(call?.url).toBe('/api/v1/admin/team');
    expect(call?.body).toEqual({
      email: 'new.cook@shop.pk',
      role: 'STORE_STAFF',
      password: 'kitchen-pass-1',
    });
    await waitFor(() => {
      expect(router.refresh).toHaveBeenCalled();
    });
  });

  it('offers the Admin role to a super admin', () => {
    show('SUPER_ADMIN');
    click('Add team member');
    expect(screen.getByRole('option', { name: 'Admin' })).toBeInTheDocument();
  });

  it('checks the email and password before sending', async () => {
    show('ADMIN');
    click('Add team member');
    typeInto('Email', 'nope');
    typeInto('Starting password', 'short');
    click('Save');
    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument();
    expect(screen.getByText('Use at least 8 characters')).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });

  it('shows a taken email under the field', async () => {
    api.fail(
      'POST',
      '/api/v1/admin/team',
      'EMAIL_TAKEN',
      'An account with this email already exists.',
      409,
      {
        email: 'An account with this email already exists',
      },
    );
    show('ADMIN');
    click('Add team member');
    typeInto('Email', 'cook@shop.pk');
    typeInto('Starting password', 'kitchen-pass-1');
    click('Save');
    expect(
      await screen.findByText('An account with this email already exists'),
    ).toBeInTheDocument();
  });

  it('switches someone off and back on', async () => {
    show('ADMIN', [me, cook, member({ id: 'old', email: 'old@shop.pk', isActive: false })]);
    click('Switch off cook@shop.pk');
    const off = await nextCall(api, 'PATCH');
    expect(off?.url).toBe('/api/v1/admin/team/cook');
    expect(off?.body).toEqual({ isActive: false });

    click('Switch on old@shop.pk');
    await waitFor(() => {
      expect(api.calls.filter((c) => c.method === 'PATCH')).toHaveLength(2);
    });
    expect(api.last()?.body).toEqual({ isActive: true });
  });

  it('shows why a change was refused', async () => {
    api.fail(
      'PATCH',
      '/api/v1/admin/team/cook',
      'FORBIDDEN',
      'You do not have permission to change this account.',
      403,
    );
    show('ADMIN');
    click('Switch off cook@shop.pk');
    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have permission');
  });

  it("resets a password, and shows the server's complaint about a weak one", async () => {
    api.fail(
      'PATCH',
      '/api/v1/admin/team/cook',
      'VALIDATION_ERROR',
      'Some fields are invalid.',
      422,
      {
        password: 'Use at least 8 characters',
      },
    );
    show('ADMIN');
    click('Reset password for cook@shop.pk');
    typeInto('New password for cook@shop.pk', 'short');
    click('Set password');
    expect(await screen.findByText('Use at least 8 characters')).toBeInTheDocument();

    api.succeed('PATCH', '/api/v1/admin/team/cook', {});
    typeInto('New password for cook@shop.pk', 'a-much-better-pass');
    click('Set password');
    await waitFor(() => {
      expect(screen.queryByLabelText('New password for cook@shop.pk')).toBeNull();
    });
    expect(api.last()?.body).toEqual({ password: 'a-much-better-pass' });
  });

  it('can back out of a password reset', () => {
    show('ADMIN');
    click('Reset password for cook@shop.pk');
    click('Cancel');
    expect(screen.queryByLabelText('New password for cook@shop.pk')).toBeNull();
    expect(api.calls).toHaveLength(0);
  });
});

describe('ProductsTable', () => {
  const api = useApiMock();
  const row = (
    overrides: Partial<AdminProductRow> & { id: string; nameEn: string },
  ): AdminProductRow => ({
    slug: overrides.nameEn.toLowerCase(),
    categoryId: 'c1',
    categoryName: 'Tikka',
    basePrice: 350,
    discountPrice: null,
    thumbnailUrl: null,
    isActive: true,
    isAvailable: true,
    stockStatus: 'IN_STOCK',
    ...overrides,
  });
  const products = [
    row({ id: 'p1', nameEn: 'Chicken Tikka' }),
    row({
      id: 'p2',
      nameEn: 'Seekh Kabab',
      categoryId: 'c2',
      categoryName: 'Kabab',
      discountPrice: 299,
      isAvailable: false,
    }),
    row({
      id: 'p3',
      nameEn: 'Mutton Karahi',
      categoryId: 'c2',
      categoryName: 'Kabab',
      isActive: false,
      stockStatus: 'OUT_OF_STOCK',
    }),
  ];
  const categories = [
    { id: 'c1', nameEn: 'Tikka' },
    { id: 'c2', nameEn: 'Kabab' },
  ];
  const show = () => renderAdmin(<ProductsTable products={products} categories={categories} />);

  it('shows price, sale price, and what is hidden or sold out', () => {
    show();
    expect(screen.getByText('Tikka · Rs. 350')).toBeInTheDocument();
    expect(screen.getByText(/Kabab · Rs. 299 \(was Rs. 350\) · Sold out/)).toBeInTheDocument();
    expect(screen.getByText(/Hidden from customers · Sold out/)).toBeInTheDocument();
  });

  it('searches by name, ignoring case and spaces at the ends', () => {
    show();
    typeInto('Search items', '  KABAB ');
    expect(screen.getByText('Seekh Kabab')).toBeInTheDocument();
    expect(screen.queryByText('Chicken Tikka')).toBeNull();
    typeInto('Search items', 'zzz');
    expect(screen.getByText('No items match.')).toBeInTheDocument();
  });

  it('filters by category', () => {
    show();
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'c2' } });
    expect(screen.queryByText('Chicken Tikka')).toBeNull();
    expect(screen.getByText('Seekh Kabab')).toBeInTheDocument();
    expect(screen.getByText('Mutton Karahi')).toBeInTheDocument();
  });

  it('links to adding and editing', () => {
    show();
    expect(screen.getByRole('link', { name: 'Add item' })).toHaveAttribute(
      'href',
      '/admin/menu/new',
    );
    expect(screen.getByRole('link', { name: 'Edit Chicken Tikka' })).toHaveAttribute(
      'href',
      '/admin/menu/p1',
    );
  });

  it('marks something sold out and puts it back', async () => {
    show();
    click('Mark Chicken Tikka sold out');
    const call = await nextCall(api, 'PUT');
    expect(call?.url).toBe('/api/v1/admin/products/p1/availability');
    expect(call?.body).toEqual({ isAvailable: false });

    click('Put Seekh Kabab back on the menu');
    await waitFor(() => {
      expect(api.calls.filter((c) => c.method === 'PUT')).toHaveLength(2);
    });
    expect(api.last()?.body).toEqual({ isAvailable: true });
  });

  it('shows an error when the switch fails', async () => {
    api.fail(
      'PUT',
      '/api/v1/admin/products/p1/availability',
      'INTERNAL_ERROR',
      'Something went wrong.',
      500,
    );
    show();
    click('Mark Chicken Tikka sold out');
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong.');
  });

  it('deletes after a second tap and says when an item was hidden instead', async () => {
    api.succeed('DELETE', '/api/v1/admin/products/p1', { outcome: 'archived' });
    show();
    click('Delete Chicken Tikka');
    click('Confirm: Delete Chicken Tikka');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Chicken Tikka has been ordered before, so it was hidden instead of deleted.',
    );
  });

  it('stays quiet after a clean delete, and explains a refusal', async () => {
    api.succeed('DELETE', '/api/v1/admin/products/p1', { outcome: 'deleted' });
    api.fail(
      'DELETE',
      '/api/v1/admin/products/p2',
      'PRODUCT_IN_DEAL',
      'This product is part of a deal.',
      409,
    );
    show();
    click('Delete Chicken Tikka');
    click('Confirm: Delete Chicken Tikka');
    await nextCall(api, 'DELETE');
    expect(screen.queryByRole('status')).toBeNull();

    click('Delete Seekh Kabab');
    click('Confirm: Delete Seekh Kabab');
    expect(await screen.findByRole('alert')).toHaveTextContent('This product is part of a deal.');
  });
});

describe('DealsTable', () => {
  const api = useApiMock();
  const NOW = new Date('2026-10-17T12:00:00Z');
  const deal = (overrides: Partial<AdminDeal> = {}): AdminDeal => ({
    id: 'd1',
    slug: 'platter',
    nameEn: 'Family Platter',
    descriptionEn: null,
    imageUrl: null,
    price: 1350,
    startDate: null,
    endDate: null,
    isAvailable: true,
    isActive: true,
    isFeatured: false,
    items: [{ productId: 'p', variantId: null, quantity: 2, productName: 'Tikka' }],
    ...overrides,
  });

  describe('dealState', () => {
    it.each([
      ['live with no dates', {}, 'live'],
      [
        'live inside its window',
        { startDate: '2026-10-16T00:00:00Z', endDate: '2026-10-18T00:00:00Z' },
        'live',
      ],
      ['scheduled before it starts', { startDate: '2026-10-18T00:00:00Z' }, 'scheduled'],
      ['ended after it finishes', { endDate: '2026-10-17T11:59:00Z' }, 'ended'],
      ['ended exactly at its end', { endDate: '2026-10-17T12:00:00Z' }, 'ended'],
      ['off when switched off', { isActive: false }, 'off'],
      ['off when unavailable', { isAvailable: false }, 'off'],
      ['off beats an active window', { isActive: false, startDate: '2026-10-16T00:00:00Z' }, 'off'],
    ] as const)('is %s', (_label, change, expected) => {
      expect(dealState(deal(change), NOW)).toBe(expected);
    });
  });

  it('lists deals with their price, size and state', () => {
    renderAdmin(
      <DealsTable
        deals={[deal(), deal({ id: 'd2', nameEn: 'Old Deal', endDate: '2026-01-01T00:00:00Z' })]}
        now={NOW.toISOString()}
      />,
    );
    expect(screen.getByText('Rs. 1,350 · 1 item · Live now')).toBeInTheDocument();
    expect(screen.getByText(/Ended/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add deal' })).toHaveAttribute(
      'href',
      '/admin/deals/new',
    );
    expect(screen.getByRole('link', { name: 'Edit Family Platter' })).toHaveAttribute(
      'href',
      '/admin/deals/d1',
    );
  });

  it('says when there are no deals', () => {
    renderAdmin(<DealsTable deals={[]} now={NOW.toISOString()} />);
    expect(screen.getByText('No deals yet.')).toBeInTheDocument();
  });

  it('deletes and reports when the deal was switched off instead', async () => {
    api.succeed('DELETE', '/api/v1/admin/deals/d1', { outcome: 'archived' });
    renderAdmin(<DealsTable deals={[deal()]} now={NOW.toISOString()} />);
    click('Delete Family Platter');
    click('Confirm: Delete Family Platter');
    expect(await screen.findByRole('status')).toHaveTextContent('switched off instead of deleted');
  });

  it('explains a refused delete', async () => {
    api.fail(
      'DELETE',
      '/api/v1/admin/deals/d1',
      'DEAL_NOT_FOUND',
      'That deal does not exist.',
      404,
    );
    renderAdmin(<DealsTable deals={[deal()]} now={NOW.toISOString()} />);
    click('Delete Family Platter');
    click('Confirm: Delete Family Platter');
    expect(await screen.findByRole('alert')).toHaveTextContent('That deal does not exist.');
  });
});
