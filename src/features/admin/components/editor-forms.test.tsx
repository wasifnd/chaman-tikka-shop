// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AdminAddon,
  AdminDeal,
  AdminProductDetail,
  AdminSettings,
  ProductPickerOption,
} from '../types/admin.types';
import { click, nextCall, renderAdmin, typeInto, useApiMock } from '../testing/harness';
import { DealForm } from './DealForm';
import { ProductForm } from './ProductForm';
import { SettingsForm } from './SettingsForm';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
beforeEach(() => {
  router.push.mockReset();
  router.refresh.mockReset();
});

const CAT = '11111111-1111-4111-8111-111111111111';
const CAT2 = '11111111-1111-4111-8111-222222222222';
const RAITA = '22222222-2222-4222-8222-222222222222';
const DIP = '22222222-2222-4222-8222-333333333333';
const P1 = '33333333-3333-4333-8333-333333333333';
const P2 = '33333333-3333-4333-8333-444444444444';
const V1 = '44444444-4444-4444-8444-444444444444';

describe('ProductForm', () => {
  const api = useApiMock();
  const categories = [
    { id: CAT, nameEn: 'Tikka' },
    { id: CAT2, nameEn: 'Drinks' },
  ];
  const addons: AdminAddon[] = [
    { id: RAITA, nameEn: 'Raita', price: 50, isAvailable: true, productCount: 1 },
    { id: DIP, nameEn: 'Dip', price: 20, isAvailable: true, productCount: 0 },
  ];
  const show = (initial?: AdminProductDetail) =>
    renderAdmin(
      <ProductForm
        initial={initial}
        categories={categories}
        addons={addons}
        uploadsEnabled={false}
      />,
    );
  const sent = async () => (await nextCall(api, 'POST'))?.body as Record<string, unknown>;

  it('creates a simple dish with sensible defaults', async () => {
    api.succeed('POST', '/api/v1/admin/products', { id: 'new' }, 201);
    show();
    typeInto('Name', '  Malai Boti ');
    typeInto('Price (Rs.)', '380');
    click('Save');
    expect(await sent()).toEqual({
      nameEn: 'Malai Boti',
      descriptionEn: null,
      categoryId: CAT,
      basePrice: 380,
      discountPrice: null,
      thumbnailUrl: null,
      preparationTime: 15,
      sortOrder: 0,
      isAvailable: true,
      isFeatured: false,
      isPopular: false,
      isActive: true,
      stockStatus: 'IN_STOCK',
      variantGroups: [],
      addonIds: [],
    });
    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith('/admin/menu');
    });
  });

  it('shows a message for every field that is wrong, and sends nothing', async () => {
    show();
    click('Save');
    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('Enter an amount')).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });

  it('refuses a sale price that is not lower than the normal price', async () => {
    show();
    typeInto('Name', 'Dish');
    typeInto('Price (Rs.)', '100');
    typeInto('Sale price (Rs., optional)', '100');
    click('Save');
    expect(
      await screen.findByText('The sale price must be lower than the normal price'),
    ).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });

  it('accepts a sale price and a different category and stock status', async () => {
    api.succeed('POST', '/api/v1/admin/products', { id: 'new' }, 201);
    show();
    typeInto('Name', 'Lassi');
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: CAT2 } });
    typeInto('Price (Rs.)', '200');
    typeInto('Sale price (Rs., optional)', '150');
    fireEvent.change(screen.getByLabelText('Stock'), { target: { value: 'LIMITED' } });
    click('Save');
    expect(await sent()).toMatchObject({
      categoryId: CAT2,
      basePrice: 200,
      discountPrice: 150,
      stockStatus: 'LIMITED',
    });
  });

  it('builds option groups with their options', async () => {
    api.succeed('POST', '/api/v1/admin/products', { id: 'new' }, 201);
    show();
    typeInto('Name', 'Tikka');
    typeInto('Price (Rs.)', '400');
    click('Add option group');
    typeInto('Group 1 name', 'Portion');
    click('Add option');
    click('Add option');
    typeInto('Option 1 name', 'Quarter');
    typeInto('Option 2 name', 'Half');
    typeInto('Option 2 price change (Rs.)', '380');
    click('Save');

    const body = await sent();
    expect(body['variantGroups']).toEqual([
      {
        nameEn: 'Portion',
        isRequired: true,
        variants: [
          { nameEn: 'Quarter', priceModifier: 0, isAvailable: true },
          { nameEn: 'Half', priceModifier: 380, isAvailable: true },
        ],
      },
    ]);
  });

  it('will not save a required group with no options', async () => {
    show();
    typeInto('Name', 'Tikka');
    typeInto('Price (Rs.)', '400');
    click('Add option group');
    typeInto('Group 1 name', 'Portion');
    click('Save');
    expect(await screen.findByText('A required group needs options')).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });

  it('points at the option whose name repeats', async () => {
    show();
    typeInto('Name', 'Tikka');
    typeInto('Price (Rs.)', '400');
    click('Add option group');
    typeInto('Group 1 name', 'Portion');
    click('Add option');
    click('Add option');
    typeInto('Option 1 name', 'Half');
    typeInto('Option 2 name', 'half');
    click('Save');
    expect(await screen.findByText('Two options share this name')).toBeInTheDocument();
  });

  it('removes options and groups', async () => {
    api.succeed('POST', '/api/v1/admin/products', { id: 'new' }, 201);
    show();
    typeInto('Name', 'Tikka');
    typeInto('Price (Rs.)', '400');
    click('Add option group');
    typeInto('Group 1 name', 'Portion');
    click('Add option');
    click('Add option');
    typeInto('Option 1 name', 'Quarter');
    typeInto('Option 2 name', 'Half');
    click('Remove option 1');
    expect(screen.queryByDisplayValue('Quarter')).toBeNull();
    click('Remove option group 1');
    expect(screen.queryByLabelText('Group 1 name')).toBeNull();
    click('Save');
    expect((await sent())['variantGroups']).toEqual([]);
  });

  it('limits the number of option groups', () => {
    show();
    for (let i = 0; i < 5; i++) click('Add option group');
    expect(screen.getByRole('button', { name: 'Add option group' })).toBeDisabled();
  });

  it('attaches add-ons by ticking them', async () => {
    api.succeed('POST', '/api/v1/admin/products', { id: 'new' }, 201);
    show();
    typeInto('Name', 'Tikka');
    typeInto('Price (Rs.)', '400');
    fireEvent.click(screen.getByLabelText('Raita (Rs. 50)'));
    fireEvent.click(screen.getByLabelText('Dip (Rs. 20)'));
    fireEvent.click(screen.getByLabelText('Raita (Rs. 50)'));
    click('Save');
    expect((await sent())['addonIds']).toEqual([DIP]);
  });

  it('points at the form field the server complained about', async () => {
    api.fail(
      'POST',
      '/api/v1/admin/products',
      'CATEGORY_NOT_FOUND',
      'Choose a category that exists.',
      422,
      {
        categoryId: 'Choose a category that exists.',
      },
    );
    show();
    typeInto('Name', 'Tikka');
    typeInto('Price (Rs.)', '400');
    click('Save');
    const messages = await screen.findAllByText('Choose a category that exists.');
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('goes back to the list on Cancel without saving', () => {
    show();
    click('Cancel');
    expect(router.push).toHaveBeenCalledWith('/admin/menu');
    expect(api.calls).toHaveLength(0);
  });

  it('edits an existing dish, sending back the ids of the options it already has', async () => {
    const GROUP = '55555555-5555-4555-8555-555555555555';
    const initial: AdminProductDetail = {
      id: P1,
      slug: 'tikka',
      nameEn: 'Tikka',
      descriptionEn: 'Smoky',
      categoryId: CAT,
      basePrice: 400,
      discountPrice: 350,
      thumbnailUrl: null,
      preparationTime: 20,
      sortOrder: 2,
      isAvailable: true,
      isFeatured: true,
      isPopular: false,
      isActive: true,
      stockStatus: 'IN_STOCK',
      variantGroups: [
        {
          id: GROUP,
          nameEn: 'Portion',
          isRequired: true,
          variants: [{ id: V1, nameEn: 'Half', priceModifier: 380, isAvailable: true }],
        },
      ],
      addonIds: [RAITA],
    };
    show(initial);
    expect(screen.getByLabelText('Name')).toHaveValue('Tikka');
    expect(screen.getByLabelText('Sale price (Rs., optional)')).toHaveValue(350);
    expect(screen.getByLabelText('Raita (Rs. 50)')).toBeChecked();
    expect(screen.getByLabelText('Option 1 name')).toHaveValue('Half');

    typeInto('Price (Rs.)', '420');
    click('Save');
    const call = await nextCall(api, 'PATCH');
    expect(call?.url).toBe(`/api/v1/admin/products/${P1}`);
    expect(call?.body).toMatchObject({
      basePrice: 420,
      discountPrice: 350,
      addonIds: [RAITA],
      variantGroups: [
        {
          id: GROUP,
          nameEn: 'Portion',
          variants: [{ id: V1, nameEn: 'Half', priceModifier: 380, isAvailable: true }],
        },
      ],
    });
  });

  it('clears the sale price when the box is emptied', async () => {
    const base: AdminProductDetail = {
      id: P1,
      slug: 'tikka',
      nameEn: 'Tikka',
      descriptionEn: null,
      categoryId: CAT,
      basePrice: 400,
      discountPrice: 350,
      thumbnailUrl: null,
      preparationTime: 20,
      sortOrder: 0,
      isAvailable: true,
      isFeatured: false,
      isPopular: false,
      isActive: true,
      stockStatus: 'IN_STOCK',
      variantGroups: [],
      addonIds: [],
    };
    show(base);
    typeInto('Sale price (Rs., optional)', '');
    click('Save');
    expect((await nextCall(api, 'PATCH'))?.body).toMatchObject({ discountPrice: null });
  });

  it('explains how to add add-ons when none exist', () => {
    renderAdmin(<ProductForm categories={categories} addons={[]} uploadsEnabled={false} />);
    expect(screen.getByText(/No add-ons exist yet/)).toBeInTheDocument();
  });
});

describe('DealForm', () => {
  const api = useApiMock();
  const products: ProductPickerOption[] = [
    { id: P1, nameEn: 'Chicken Tikka', variants: [{ id: V1, label: 'Portion: Half' }] },
    { id: P2, nameEn: 'Naan', variants: [] },
  ];
  const show = (initial?: AdminDeal) =>
    renderAdmin(<DealForm initial={initial} products={products} uploadsEnabled={false} />);

  it('needs at least one item', async () => {
    show();
    typeInto('Name', 'Family Platter');
    typeInto('Deal price (Rs.)', '900');
    click('Save');
    expect(await screen.findByText('Add at least one item')).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });

  it('builds a deal from items, offering options only for items that have them', async () => {
    api.succeed('POST', '/api/v1/admin/deals', { id: 'd' }, 201);
    show();
    typeInto('Name', 'Family Platter');
    typeInto('Deal price (Rs.)', '900');

    click('Add item to deal');
    fireEvent.change(screen.getByLabelText('Item 1'), { target: { value: P1 } });
    expect(screen.getByLabelText('Item 1 option')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Item 1 option'), { target: { value: V1 } });

    click('Add item to deal');
    fireEvent.change(screen.getByLabelText('Item 2'), { target: { value: P2 } });
    expect(screen.queryByLabelText('Item 2 option')).toBeNull();
    typeInto('Item 2 quantity', '4');

    click('Save');
    const call = await nextCall(api, 'POST');
    expect(call?.body).toEqual({
      nameEn: 'Family Platter',
      descriptionEn: null,
      imageUrl: null,
      price: 900,
      startDate: null,
      endDate: null,
      isAvailable: true,
      isActive: true,
      isFeatured: false,
      items: [
        { productId: P1, variantId: V1, quantity: 1 },
        { productId: P2, variantId: null, quantity: 4 },
      ],
    });
    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith('/admin/deals');
    });
  });

  it('forgets the chosen option when the item is changed to another product', async () => {
    api.succeed('POST', '/api/v1/admin/deals', { id: 'd' }, 201);
    show();
    typeInto('Name', 'Deal');
    typeInto('Deal price (Rs.)', '500');
    click('Add item to deal');
    fireEvent.change(screen.getByLabelText('Item 1'), { target: { value: P1 } });
    fireEvent.change(screen.getByLabelText('Item 1 option'), { target: { value: V1 } });
    fireEvent.change(screen.getByLabelText('Item 1'), { target: { value: P2 } });
    click('Save');
    const call = await nextCall(api, 'POST');
    expect((call?.body as { items: unknown[] }).items).toEqual([
      { productId: P2, variantId: null, quantity: 1 },
    ]);
  });

  it('refuses an item with no product chosen', async () => {
    show();
    typeInto('Name', 'Deal');
    typeInto('Deal price (Rs.)', '500');
    click('Add item to deal');
    click('Save');
    expect(await screen.findByText('Invalid id')).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });

  it('removes an item', () => {
    show();
    click('Add item to deal');
    click('Add item to deal');
    expect(screen.getByLabelText('Item 2')).toBeInTheDocument();
    click('Remove item 1');
    expect(screen.queryByLabelText('Item 2')).toBeNull();
    expect(screen.getByLabelText('Item 1')).toBeInTheDocument();
  });

  it('turns dates typed in Karachi time into exact moments, and checks their order', async () => {
    api.succeed('POST', '/api/v1/admin/deals', { id: 'd' }, 201);
    show();
    typeInto('Name', 'Weekend');
    typeInto('Deal price (Rs.)', '500');
    click('Add item to deal');
    fireEvent.change(screen.getByLabelText('Item 1'), { target: { value: P2 } });

    typeInto('Starts (optional) (Karachi time)', '2026-10-17T18:00');
    typeInto('Ends (optional) (Karachi time)', '2026-10-17T17:00');
    click('Save');
    expect(await screen.findByText('The end must be after the start')).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);

    typeInto('Ends (optional) (Karachi time)', '2026-10-19T02:00');
    click('Save');
    const call = await nextCall(api, 'POST');
    expect(call?.body).toMatchObject({
      startDate: '2026-10-17T13:00:00.000Z',
      endDate: '2026-10-18T21:00:00.000Z',
    });
  });

  it('edits an existing deal and sends it back to the same address', async () => {
    const initial: AdminDeal = {
      id: 'deal-1',
      slug: 'platter',
      nameEn: 'Platter',
      descriptionEn: null,
      imageUrl: null,
      price: 900,
      startDate: null,
      endDate: null,
      isAvailable: true,
      isActive: true,
      isFeatured: false,
      items: [{ productId: P2, variantId: null, quantity: 3, productName: 'Naan' }],
    };
    show(initial);
    expect(screen.getByLabelText('Item 1')).toHaveValue(P2);
    expect(screen.getByLabelText('Item 1 quantity')).toHaveValue(3);
    typeInto('Deal price (Rs.)', '850');
    click('Save');
    const call = await nextCall(api, 'PATCH');
    expect(call?.url).toBe('/api/v1/admin/deals/deal-1');
    expect(call?.body).toMatchObject({
      price: 850,
      items: [{ productId: P2, variantId: null, quantity: 3 }],
    });
  });

  it("shows the server's complaint and stays on the page", async () => {
    api.fail(
      'POST',
      '/api/v1/admin/deals',
      'INVALID_VARIANT',
      'That option does not belong to the product.',
      422,
    );
    show();
    typeInto('Name', 'Deal');
    typeInto('Deal price (Rs.)', '500');
    click('Add item to deal');
    fireEvent.change(screen.getByLabelText('Item 1'), { target: { value: P2 } });
    click('Save');
    expect(
      await screen.findByText('That option does not belong to the product.'),
    ).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe('SettingsForm', () => {
  const api = useApiMock();
  const initial: AdminSettings = {
    restaurant: {
      name: 'BBQ Store',
      address: '441 Township',
      taxRatePercent: 0,
      orderingEnabled: true,
    },
    hours: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      dayOfWeek,
      isClosed: false,
      openTime: '18:00',
      closeTime: '02:00',
    })),
  };
  const show = (settings = initial) => renderAdmin(<SettingsForm initial={settings} />);

  it('shows the current settings and every day of the week', () => {
    show();
    expect(screen.getByLabelText('Restaurant name')).toHaveValue('BBQ Store');
    expect(screen.getByLabelText('Address')).toHaveValue('441 Township');
    expect(screen.getByLabelText('Tax on orders (%)')).toHaveValue(0);
    expect(screen.getByLabelText('Accept online orders')).toBeChecked();
    for (const day of [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ]) {
      expect(screen.getByLabelText(`${day} opens`)).toHaveValue('18:00');
      expect(screen.getByLabelText(`${day} closes`)).toHaveValue('02:00');
    }
  });

  it('warns when online ordering is switched off', () => {
    show();
    expect(screen.queryByText(/Online ordering is switched off/)).toBeNull();
    fireEvent.click(screen.getByLabelText('Accept online orders'));
    expect(screen.getByText(/Online ordering is switched off/)).toBeInTheDocument();
  });

  it('greys out the times for a day that is closed', () => {
    show();
    const monday = screen.getByText('Monday').closest('div') as HTMLElement;
    fireEvent.click(within(monday).getByLabelText('Closed'));
    expect(screen.getByLabelText('Monday opens')).toBeDisabled();
    expect(screen.getByLabelText('Monday closes')).toBeDisabled();
    expect(screen.getByLabelText('Tuesday opens')).toBeEnabled();
  });

  it('saves everything in one go and confirms', async () => {
    api.succeed('PUT', '/api/v1/admin/settings', {});
    show();
    typeInto('Tax on orders (%)', '16');
    typeInto('Friday opens', '17:30');
    click('Save');

    const call = await nextCall(api, 'PUT');
    const body = call?.body as {
      restaurant: Record<string, unknown>;
      hours: Record<string, unknown>[];
    };
    expect(body.restaurant).toEqual({
      name: 'BBQ Store',
      address: '441 Township',
      taxRatePercent: 16,
      orderingEnabled: true,
    });
    expect(body.hours).toHaveLength(7);
    expect(body.hours[5]).toEqual({
      dayOfWeek: 5,
      isClosed: false,
      openTime: '17:30',
      closeTime: '02:00',
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Settings saved.');
  });

  it('sends a closed day as closed', async () => {
    show();
    const sunday = screen.getByText('Sunday').closest('div') as HTMLElement;
    fireEvent.click(within(sunday).getByLabelText('Closed'));
    click('Save');
    const call = await nextCall(api, 'PUT');
    const hours = (call?.body as { hours: { dayOfWeek: number; isClosed: boolean }[] }).hours;
    expect(hours[0]).toMatchObject({ dayOfWeek: 0, isClosed: true });
  });

  it('refuses a tax rate that is too high, or a nameless restaurant', async () => {
    show();
    typeInto('Tax on orders (%)', '31');
    typeInto('Restaurant name', '  ');
    click('Save');
    expect(await screen.findByText('At most 30%')).toBeInTheDocument();
    expect(screen.getByText('Name is required')).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });

  it('refuses opening and closing at the same time', async () => {
    show();
    typeInto('Monday closes', '18:00');
    click('Save');
    expect(
      await screen.findByText('Closing time must differ from opening time'),
    ).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
  });

  it("shows the server's complaint instead of claiming success", async () => {
    api.fail(
      'PUT',
      '/api/v1/admin/settings',
      'INTERNAL_ERROR',
      'Something went wrong. Please try again.',
      500,
    );
    show();
    click('Save');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
    expect(screen.queryByText('Settings saved.')).toBeNull();
  });
});
