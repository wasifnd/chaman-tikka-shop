// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AdminAddon, AdminCategory, AdminCoupon, AdminZone } from '../types/admin.types';
import { click, nextCall, renderAdmin, typeInto, useApiMock } from '../testing/harness';
import { AddonsManager } from './AddonsManager';
import { CategoriesManager } from './CategoriesManager';
import { CouponsManager } from './CouponsManager';
import { ZonesManager } from './ZonesManager';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

beforeEach(() => {
  router.push.mockReset();
  router.refresh.mockReset();
});

const ID = '11111111-1111-4111-8111-111111111111';

describe('CategoriesManager', () => {
  const api = useApiMock();
  const category = (overrides: Partial<AdminCategory> = {}): AdminCategory => ({
    id: ID,
    slug: 'tikka',
    nameEn: 'Tikka',
    descriptionEn: null,
    imageUrl: null,
    sortOrder: 1,
    isActive: true,
    isFeatured: false,
    productCount: 3,
    ...overrides,
  });
  const show = (categories: AdminCategory[]) =>
    renderAdmin(<CategoriesManager categories={categories} uploadsEnabled={false} />);

  it('lists categories with how many items each holds and whether they are hidden', () => {
    show([
      category(),
      category({ id: 'b', nameEn: 'Drinks', productCount: 1, isActive: false, isFeatured: true }),
    ]);
    expect(screen.getByText('Tikka')).toBeInTheDocument();
    expect(screen.getByText('3 items')).toBeInTheDocument();
    expect(screen.getByText(/1 item · Hidden from customers · Featured/)).toBeInTheDocument();
  });

  it('says so when there are none', () => {
    show([]);
    expect(screen.getByText('No categories yet.')).toBeInTheDocument();
  });

  it('will not send an empty form', async () => {
    show([]);
    click('Add category');
    click('Save');
    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });

  it('creates a category and refreshes the list', async () => {
    api.succeed('POST', '/api/v1/admin/categories', { id: 'new' }, 201);
    show([]);
    click('Add category');
    typeInto('Name', '  Drinks ');
    typeInto('Position (smaller shows first)', '4');
    click('Save');

    const call = await nextCall(api, 'POST');
    expect(call?.body).toEqual({
      nameEn: 'Drinks',
      descriptionEn: null,
      imageUrl: null,
      sortOrder: 4,
      isActive: true,
      isFeatured: false,
    });
    await waitFor(() => {
      expect(router.refresh).toHaveBeenCalled();
    });
    // The form closes, leaving the "Add category" button again.
    expect(await screen.findByRole('button', { name: 'Add category' })).toBeInTheDocument();
  });

  it('keeps the form open and explains what the server refused', async () => {
    api.fail(
      'POST',
      '/api/v1/admin/categories',
      'VALIDATION_ERROR',
      'Some fields are invalid.',
      422,
      {
        imageUrl: 'Use an image address from res.cloudinary.com',
      },
    );
    show([]);
    click('Add category');
    typeInto('Name', 'Drinks');
    click('Save');
    expect(await screen.findByText('Some fields are invalid.')).toBeInTheDocument();
    expect(screen.getByText('Use an image address from res.cloudinary.com')).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('edits an existing category with its details filled in', async () => {
    show([category({ descriptionEn: 'Grilled' })]);
    click('Edit Tikka');
    expect(screen.getByLabelText('Name')).toHaveValue('Tikka');
    expect(screen.getByLabelText('Description (optional)')).toHaveValue('Grilled');
    typeInto('Name', 'Chicken Tikka');
    click('Save');
    const call = await nextCall(api, 'PATCH');
    expect(call?.url).toBe(`/api/v1/admin/categories/${ID}`);
    expect(call?.body).toMatchObject({ nameEn: 'Chicken Tikka', descriptionEn: 'Grilled' });
  });

  it('cancelling an edit changes nothing', () => {
    show([category()]);
    click('Edit Tikka');
    click('Cancel');
    expect(api.calls).toHaveLength(0);
    expect(screen.getByText('Tikka')).toBeInTheDocument();
  });

  it('deletes after a second tap', async () => {
    show([category()]);
    click('Delete Tikka');
    expect(api.calls).toHaveLength(0);
    click('Confirm: Delete Tikka');
    const call = await nextCall(api, 'DELETE');
    expect(call?.url).toBe(`/api/v1/admin/categories/${ID}`);
    await waitFor(() => {
      expect(router.refresh).toHaveBeenCalled();
    });
  });

  it('shows why a delete was refused', async () => {
    api.fail(
      'DELETE',
      `/api/v1/admin/categories/${ID}`,
      'CATEGORY_NOT_EMPTY',
      'Move or delete its products first.',
      409,
    );
    show([category()]);
    click('Delete Tikka');
    click('Confirm: Delete Tikka');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Move or delete its products first.',
    );
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

describe('AddonsManager', () => {
  const api = useApiMock();
  const addon = (overrides: Partial<AdminAddon> = {}): AdminAddon => ({
    id: ID,
    nameEn: 'Raita',
    price: 50,
    isAvailable: true,
    productCount: 2,
    ...overrides,
  });

  it('lists add-ons with price and where they are used', () => {
    renderAdmin(
      <AddonsManager
        addons={[
          addon(),
          addon({ id: 'b', nameEn: 'Dip', price: 12.5, isAvailable: false, productCount: 1 }),
        ]}
      />,
    );
    expect(screen.getByText('Raita · Rs. 50')).toBeInTheDocument();
    expect(screen.getByText('Offered on 2 products')).toBeInTheDocument();
    expect(screen.getByText('Dip · Rs. 12.50')).toBeInTheDocument();
    expect(screen.getByText(/Offered on 1 product · Unavailable/)).toBeInTheDocument();
  });

  it('says so when there are none', () => {
    renderAdmin(<AddonsManager addons={[]} />);
    expect(screen.getByText('No add-ons yet.')).toBeInTheDocument();
  });

  it('creates an add-on', async () => {
    api.succeed('POST', '/api/v1/admin/addons', { id: 'n' }, 201);
    renderAdmin(<AddonsManager addons={[]} />);
    click('Add add-on');
    typeInto('Name', 'Chutney');
    typeInto('Price (Rs.)', '35.5');
    click('Save');
    const call = await nextCall(api, 'POST');
    expect(call?.body).toEqual({ nameEn: 'Chutney', price: 35.5, isAvailable: true });
  });

  it('refuses a name-less add-on and a price with fractions of a paisa', async () => {
    renderAdmin(<AddonsManager addons={[]} />);
    click('Add add-on');
    typeInto('Price (Rs.)', '1.234');
    click('Save');
    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('Use at most 2 decimals')).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });

  it('edits and deletes', async () => {
    renderAdmin(<AddonsManager addons={[addon()]} />);
    click('Edit Raita');
    typeInto('Price (Rs.)', '60');
    click('Save');
    expect((await nextCall(api, 'PATCH'))?.body).toEqual({
      nameEn: 'Raita',
      price: 60,
      isAvailable: true,
    });

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    });
    click('Delete Raita');
    click('Confirm: Delete Raita');
    expect((await nextCall(api, 'DELETE'))?.url).toBe(`/api/v1/admin/addons/${ID}`);
  });

  it('shows a refused delete', async () => {
    api.fail(
      'DELETE',
      `/api/v1/admin/addons/${ID}`,
      'ADDON_NOT_FOUND',
      'That add-on does not exist.',
      404,
    );
    renderAdmin(<AddonsManager addons={[addon()]} />);
    click('Delete Raita');
    click('Confirm: Delete Raita');
    expect(await screen.findByRole('alert')).toHaveTextContent('That add-on does not exist.');
  });
});

describe('ZonesManager', () => {
  const api = useApiMock();
  const zone = (overrides: Partial<AdminZone> = {}): AdminZone => ({
    id: ID,
    name: 'Johar Town',
    charge: 100,
    freeDeliveryAbove: 2000,
    minOrderAmount: 300,
    isActive: true,
    sortOrder: 1,
    ...overrides,
  });

  it('describes each area in plain words', () => {
    renderAdmin(
      <ZonesManager
        zones={[
          zone(),
          zone({
            id: 'b',
            name: 'Township',
            charge: 0,
            freeDeliveryAbove: null,
            minOrderAmount: 0,
            isActive: false,
          }),
        ]}
      />,
    );
    expect(
      screen.getByText('Charge Rs. 100 · free above Rs. 2,000 · minimum order Rs. 300'),
    ).toBeInTheDocument();
    expect(screen.getByText('Free delivery · Hidden from customers')).toBeInTheDocument();
  });

  it('says what happens with no areas', () => {
    renderAdmin(<ZonesManager zones={[]} />);
    expect(screen.getByText(/only order pickup or dine-in/)).toBeInTheDocument();
  });

  it('creates an area, treating a blank free-delivery limit as none', async () => {
    renderAdmin(<ZonesManager zones={[]} />);
    click('Add area');
    typeInto('Area name', 'Gulberg');
    typeInto('Delivery charge (Rs.)', '120');
    click('Save');
    const call = await nextCall(api, 'POST');
    expect(call?.body).toEqual({
      name: 'Gulberg',
      charge: 120,
      freeDeliveryAbove: null,
      minOrderAmount: 0,
      isActive: true,
      sortOrder: 0,
    });
  });

  it('checks the numbers before sending', async () => {
    renderAdmin(<ZonesManager zones={[]} />);
    click('Add area');
    typeInto('Delivery charge (Rs.)', '-5');
    click('Save');
    expect(await screen.findByText('Area name is required')).toBeInTheDocument();
    expect(screen.getByText('Cannot be negative')).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });

  it('edits with the current values filled in, then deletes', async () => {
    renderAdmin(<ZonesManager zones={[zone()]} />);
    click('Edit Johar Town');
    expect(screen.getByLabelText('Free delivery above (Rs., optional)')).toHaveValue(2000);
    typeInto('Delivery charge (Rs.)', '150');
    click('Save');
    const call = await nextCall(api, 'PATCH');
    expect(call?.url).toBe(`/api/v1/admin/zones/${ID}`);
    expect(call?.body).toMatchObject({ charge: 150, freeDeliveryAbove: 2000 });

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    });
    click('Delete Johar Town');
    click('Confirm: Delete Johar Town');
    expect((await nextCall(api, 'DELETE'))?.url).toBe(`/api/v1/admin/zones/${ID}`);
  });

  it('shows a server refusal', async () => {
    api.fail(
      'DELETE',
      `/api/v1/admin/zones/${ID}`,
      'ZONE_NOT_FOUND',
      'That delivery area does not exist.',
      404,
    );
    renderAdmin(<ZonesManager zones={[zone()]} />);
    click('Delete Johar Town');
    click('Confirm: Delete Johar Town');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That delivery area does not exist.',
    );
  });
});

describe('CouponsManager', () => {
  const api = useApiMock();
  const coupon = (overrides: Partial<AdminCoupon> = {}): AdminCoupon => ({
    id: ID,
    code: 'SAVE10',
    type: 'PERCENTAGE',
    amount: 10,
    minimumOrderAmount: 500,
    usageLimit: 100,
    usedCount: 7,
    expiresAt: null,
    isActive: true,
    ...overrides,
  });

  it('shows each coupon, its discount and how much it has been used', () => {
    renderAdmin(
      <CouponsManager
        coupons={[
          coupon(),
          coupon({
            id: 'b',
            code: 'FLAT50',
            type: 'FIXED',
            amount: 50,
            usageLimit: null,
            usedCount: 3,
            isActive: false,
          }),
        ]}
      />,
    );
    expect(screen.getByText('SAVE10')).toBeInTheDocument();
    expect(screen.getByText('10% off · used 7 of 100')).toBeInTheDocument();
    expect(screen.getByText('Rs. 50 off · used 3 times · Switched off')).toBeInTheDocument();
  });

  it('says so when there are none', () => {
    renderAdmin(<CouponsManager coupons={[]} />);
    expect(screen.getByText('No coupons yet.')).toBeInTheDocument();
  });

  it('creates a coupon with the code in capitals and no limit or expiry', async () => {
    renderAdmin(<CouponsManager coupons={[]} />);
    click('Add coupon');
    typeInto('Code', ' save15 ');
    typeInto('Amount (percent or Rs.)', '15');
    click('Save');
    const call = await nextCall(api, 'POST');
    expect(call?.body).toEqual({
      code: 'SAVE15',
      type: 'PERCENTAGE',
      amount: 15,
      minimumOrderAmount: 0,
      usageLimit: null,
      expiresAt: null,
      isActive: true,
    });
  });

  it('can make a fixed-amount coupon with a limit and an expiry in Karachi time', async () => {
    renderAdmin(<CouponsManager coupons={[]} />);
    click('Add coupon');
    typeInto('Code', 'FLAT100');
    fireEvent.change(screen.getByLabelText('Discount type'), { target: { value: 'FIXED' } });
    typeInto('Amount (percent or Rs.)', '100');
    typeInto('Total uses allowed (empty for unlimited)', '25');
    typeInto('Expires (optional) (Karachi time)', '2026-12-31T23:00');
    click('Save');
    const call = await nextCall(api, 'POST');
    expect(call?.body).toMatchObject({
      code: 'FLAT100',
      type: 'FIXED',
      amount: 100,
      usageLimit: 25,
      expiresAt: '2026-12-31T18:00:00.000Z',
    });
  });

  it('refuses a short code and a percentage above 100', async () => {
    renderAdmin(<CouponsManager coupons={[]} />);
    click('Add coupon');
    typeInto('Code', 'ab');
    typeInto('Amount (percent or Rs.)', '150');
    click('Save');
    expect(await screen.findByText('Use 3-24 letters, numbers, - or _')).toBeInTheDocument();
    expect(screen.getByText('A percentage cannot exceed 100')).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });

  it("shows the server's message for a duplicate code under the field", async () => {
    api.fail(
      'POST',
      '/api/v1/admin/coupons',
      'COUPON_CODE_TAKEN',
      'A coupon with this code already exists.',
      409,
      {
        code: 'A coupon with this code already exists',
      },
    );
    renderAdmin(<CouponsManager coupons={[]} />);
    click('Add coupon');
    typeInto('Code', 'SAVE10');
    typeInto('Amount (percent or Rs.)', '10');
    click('Save');
    expect(await screen.findByText('A coupon with this code already exists')).toBeInTheDocument();
  });

  it('edits, keeping the used count out of what is sent, then deletes', async () => {
    renderAdmin(<CouponsManager coupons={[coupon()]} />);
    click('Edit SAVE10');
    typeInto('Amount (percent or Rs.)', '20');
    click('Save');
    const call = await nextCall(api, 'PATCH');
    expect(call?.body).toMatchObject({ code: 'SAVE10', amount: 20, usageLimit: 100 });
    expect(call?.body).not.toHaveProperty('usedCount');

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    });
    click('Delete SAVE10');
    click('Confirm: Delete SAVE10');
    expect((await nextCall(api, 'DELETE'))?.url).toBe(`/api/v1/admin/coupons/${ID}`);
  });
});
