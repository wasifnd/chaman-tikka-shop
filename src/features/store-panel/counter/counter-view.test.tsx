// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { nextCall, useApiMock } from '@/features/admin/testing/harness';
import type { CounterMenu, ProductDetail } from '@/features/menu/types/menu.types';
import messages from '@/i18n/messages/en.json';
import { CounterView } from './CounterView';

const base: Omit<ProductDetail, 'id' | 'name' | 'price' | 'variantGroups' | 'addons'> = {
  slug: 'x',
  description: null,
  categorySlug: 'bbq',
  originalPrice: null,
  thumbnailUrl: null,
  preparationTime: 10,
  isFeatured: false,
  isPopular: false,
  orderable: true,
  stockStatus: 'IN_STOCK',
  categoryName: 'BBQ',
  images: [],
};

const TIKKA = '33333333-3333-4333-8333-333333333333';
const NAAN = '33333333-3333-4333-8333-444444444444';
const HALF = '44444444-4444-4444-8444-444444444444';

const menu: CounterMenu = {
  categories: [
    {
      id: 'c1',
      name: 'BBQ',
      products: [
        {
          ...base,
          id: TIKKA,
          name: 'Chicken Tikka',
          price: 350,
          variantGroups: [
            {
              id: 'g1',
              name: 'Portion',
              isRequired: true,
              variants: [
                { id: 'q', name: 'Quarter', priceModifier: 0 },
                { id: HALF, name: 'Half', priceModifier: 330 },
              ],
            },
          ],
          addons: [],
        },
        { ...base, id: NAAN, name: 'Naan', price: 30, variantGroups: [], addons: [] },
        {
          ...base,
          id: 'chops',
          name: 'Mutton Chops',
          price: 950,
          variantGroups: [
            {
              id: 'g2',
              name: 'Cooking',
              isRequired: true,
              variants: [
                { id: 'medium', name: 'Medium', priceModifier: 0 },
                { id: 'well', name: 'Well done', priceModifier: 0 },
              ],
            },
          ],
          addons: [],
        },
        {
          ...base,
          id: 'gone',
          name: 'Malai Boti',
          price: 380,
          orderable: false,
          variantGroups: [],
          addons: [],
        },
      ],
    },
  ],
  deals: [
    {
      id: '55555555-5555-4555-8555-555555555555',
      slug: 'platter',
      name: 'Family Platter',
      description: null,
      imageUrl: null,
      price: 1350,
      originalPrice: 1500,
      isFeatured: false,
      endsAt: null,
      items: [],
    },
  ],
};

const QUOTE = '/api/v1/cart/quote';
const quote = (grandTotal: number, issues: unknown[] = []) => ({
  quote: {
    lines: [],
    subtotal: grandTotal,
    couponDiscount: 0,
    deliveryCharge: 0,
    taxAmount: 0,
    grandTotal,
    coupon: null,
    freeDeliveryRemaining: null,
    issues,
    canCheckout: issues.length === 0,
  },
});

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <CounterView menu={menu} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const menuButton = (name: RegExp) => screen.getByRole('button', { name });
const ticket = () => screen.getByRole('region', { name: 'Order' });
const type = (label: string | RegExp, value: string) => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

describe('the counter screen', () => {
  const api = useApiMock();

  it('a walk-in paying in full: tap, check the total, place', async () => {
    api.succeed('POST', QUOTE, quote(60));
    api.succeed(
      'POST',
      '/api/v1/store/counter-orders',
      {
        order: {
          id: 'o1',
          orderNumber: 'BBQ-2026-0042',
          grandTotal: 60,
          amountPaid: 60,
          remaining: 0,
          khata: null,
        },
      },
      201,
    );
    show();
    fireEvent.click(menuButton(/^Naan/));
    fireEvent.click(menuButton(/^Naan/));
    expect(within(ticket()).getByText('Naan')).toBeInTheDocument();
    const place = await screen.findByRole('button', { name: 'Place order · collect Rs. 60' });
    await waitFor(() => {
      expect(place).toBeEnabled();
    });
    fireEvent.click(place);

    const call = await nextCall(api, 'POST');
    await waitFor(() => {
      expect(api.calls.some((c) => c.url === '/api/v1/store/counter-orders')).toBe(true);
    });
    const sent = api.calls.find((c) => c.url === '/api/v1/store/counter-orders')?.body;
    expect(call).toBeDefined();
    expect(sent).toMatchObject({
      lines: [{ kind: 'product', productId: NAAN, quantity: 2 }],
      orderType: 'PICKUP',
      expectedTotal: 60,
      amountPaid: 60,
      customer: {},
    });

    expect(
      await screen.findByRole('heading', { name: 'Order BBQ-2026-0042 placed' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Print receipt' })).toHaveAttribute(
      'href',
      '/api/v1/store/orders/o1/receipt',
    );
    fireEvent.click(screen.getByRole('button', { name: 'New order' }));
    expect(screen.getByText('Tap items on the menu to add them.')).toBeInTheDocument();
  });

  it('options open a picker before the item goes on the ticket', () => {
    api.succeed('POST', QUOTE, quote(680));
    show();
    fireEvent.click(menuButton(/^Chicken Tikka/));
    fireEvent.click(screen.getByLabelText(/Half/));
    fireEvent.click(screen.getByRole('button', { name: 'Add · Rs. 680' }));
    expect(within(ticket()).getByText('Half')).toBeInTheDocument();
    // Items that can't be sold are shown but can't be tapped.
    expect(menuButton(/^Malai Boti/)).toBeDisabled();
    // Deals are on the menu too.
    fireEvent.click(screen.getByRole('button', { name: 'Deals' }));
    expect(menuButton(/^Family Platter/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Naan/ })).not.toBeInTheDocument();
  });

  it('unpaid needs the khata number and name, and shows the khata it goes on', async () => {
    api.succeed('POST', QUOTE, quote(60));
    api.on('GET', '/api/v1/store/khata/lookup?phone=03331234500', () =>
      Response.json({
        success: true,
        data: {
          khata: {
            id: 'k1',
            phone: '03331234500',
            name: 'Bilal',
            balance: 500,
            creditLimit: null,
            limit: 10_000,
            updatedAt: '',
          },
          defaultLimit: 10_000,
        },
      }),
    );
    api.succeed(
      'POST',
      '/api/v1/store/counter-orders',
      {
        order: {
          id: 'o1',
          orderNumber: 'BBQ-2026-0043',
          grandTotal: 60,
          amountPaid: 0,
          remaining: 60,
          khata: { id: 'k1', balance: 560 },
        },
      },
      201,
    );
    show();
    fireEvent.click(menuButton(/^Naan/));
    fireEvent.click(screen.getByLabelText('Unpaid'));
    const place = await screen.findByRole('button', { name: 'Place order · Rs. 60 on khata' });
    expect(place).toBeDisabled();

    type('Customer phone number', '0333 1234500');
    expect(
      await screen.findByText(/Bilal already owes Rs. 500 \(limit Rs. 10,000\)/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use this name' }));
    expect(screen.getByLabelText('Customer name')).toHaveValue('Bilal');
    expect(screen.getByText('Rs. 560')).toBeInTheDocument(); // khata after this order
    await waitFor(() => {
      expect(place).toBeEnabled();
    });
    fireEvent.click(place);

    await screen.findByRole('heading', { name: 'Order BBQ-2026-0043 placed' });
    const sent = api.calls.find((c) => c.url === '/api/v1/store/counter-orders')?.body;
    expect(sent).toMatchObject({
      amountPaid: 0,
      customer: { name: 'Bilal', phone: '0333 1234500' },
    });
    expect(screen.getByRole('link', { name: 'Open the khata' })).toHaveAttribute(
      'href',
      '/store/khata/k1',
    );
  });

  it('blocks going over the khata limit before anything is sent', async () => {
    api.succeed('POST', QUOTE, quote(60));
    api.on('GET', '/api/v1/store/khata/lookup?phone=03331234500', () =>
      Response.json({ success: true, data: { khata: null, defaultLimit: 50 } }),
    );
    show();
    fireEvent.click(menuButton(/^Naan/));
    fireEvent.click(screen.getByLabelText('Unpaid'));
    type('Customer phone number', '03331234500');
    type('Customer name', 'New Person');
    expect(
      await screen.findByText(
        /No khata for this number yet. A new one will be opened \(limit Rs. 50\)/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'This goes over the khata limit of Rs. 50. At most Rs. 50 more can go on it.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Place order · Rs. 60 on khata' })).toBeDisabled();
  });

  it('part paid: only the rest goes on the khata, and server errors are shown', async () => {
    api.succeed('POST', QUOTE, quote(60));
    api.on('GET', '/api/v1/store/khata/lookup?phone=03331234500', () =>
      Response.json({ success: true, data: { khata: null, defaultLimit: 10_000 } }),
    );
    api.fail(
      'POST',
      '/api/v1/store/counter-orders',
      'KHATA_LIMIT_REACHED',
      'This would take the khata over its limit.',
      409,
    );
    show();
    fireEvent.click(menuButton(/^Naan/));
    fireEvent.click(screen.getByLabelText('Part paid'));
    type('Amount paid now (Rs.)', '20');
    type('Customer phone number', '03331234500');
    type('Customer name', 'New Person');
    const place = await screen.findByRole('button', { name: 'Place order · Rs. 40 on khata' });
    await waitFor(() => {
      expect(place).toBeEnabled();
    });
    fireEvent.click(place);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This would take the khata over its limit.',
    );
    const sent = api.calls.find((c) => c.url === '/api/v1/store/counter-orders')?.body;
    expect(sent).toMatchObject({ amountPaid: 20 });
  });

  it('a leftover half-typed number does not block a paid order', async () => {
    api.succeed('POST', QUOTE, quote(60));
    api.succeed(
      'POST',
      '/api/v1/store/counter-orders',
      {
        order: {
          id: 'o1',
          orderNumber: 'BBQ-2026-0050',
          grandTotal: 60,
          amountPaid: 60,
          remaining: 0,
          khata: null,
        },
      },
      201,
    );
    show();
    fireEvent.click(menuButton(/^Naan/));
    fireEvent.click(screen.getByLabelText('Unpaid'));
    type('Customer phone number', '0300123');
    fireEvent.click(screen.getByLabelText('Paid in full'));
    const place = await screen.findByRole('button', { name: 'Place order · collect Rs. 60' });
    await waitFor(() => {
      expect(place).toBeEnabled();
    });
    fireEvent.click(place);
    await screen.findByRole('heading', { name: 'Order BBQ-2026-0050 placed' });
    expect(api.calls.find((c) => c.url === '/api/v1/store/counter-orders')?.body).toMatchObject({
      customer: {},
    });
  });

  it('warns that an earlier try may have gone through when the ticket changed after it', async () => {
    api.succeed('POST', QUOTE, quote(60));
    api.fail(
      'POST',
      '/api/v1/store/counter-orders',
      'IDEMPOTENCY_CONFLICT',
      'This request key was already used for a different order.',
      409,
    );
    show();
    fireEvent.click(menuButton(/^Naan/));
    const place = await screen.findByRole('button', { name: 'Place order · collect Rs. 60' });
    await waitFor(() => {
      expect(place).toBeEnabled();
    });
    fireEvent.click(place);
    expect(
      await screen.findByText(/An earlier try of this order may already have gone through/),
    ).toBeInTheDocument();
  });

  it('opening another item starts its picker fresh', () => {
    api.succeed('POST', QUOTE, quote(680));
    show();
    fireEvent.click(menuButton(/^Chicken Tikka/));
    fireEvent.click(screen.getByRole('button', { name: 'One more' }));
    expect(screen.getByRole('group', { name: 'Quantity of Chicken Tikka' })).toHaveTextContent('2');
    // Tapping another dish while the picker is open starts that dish from scratch.
    fireEvent.click(menuButton(/^Mutton Chops/));
    expect(screen.getByRole('group', { name: 'Quantity of Mutton Chops' })).toHaveTextContent('1');
    expect(screen.getByLabelText('Medium')).toBeChecked(); // its own first choice
    fireEvent.click(screen.getByRole('button', { name: 'Add · Rs. 950' }));
    expect(within(ticket()).getByText('Medium')).toBeInTheDocument();
  });

  it('a retry after a lost connection reuses the key; a refusal starts a new one', async () => {
    api.succeed('POST', QUOTE, quote(60));
    api.fail(
      'POST',
      '/api/v1/store/counter-orders',
      'NETWORK_ERROR',
      'Could not reach the server.',
      503,
    );
    show();
    fireEvent.click(menuButton(/^Naan/));
    const place = await screen.findByRole('button', { name: 'Place order · collect Rs. 60' });
    await waitFor(() => {
      expect(place).toBeEnabled();
    });
    const sentKeys = () =>
      api.calls
        .filter((c) => c.url === '/api/v1/store/counter-orders')
        .map((c) => (c.body as { idempotencyKey: string }).idempotencyKey);

    fireEvent.click(place);
    await screen.findByText('Could not reach the server.');
    fireEvent.click(place);
    await waitFor(() => {
      expect(sentKeys()).toHaveLength(2);
    });
    expect(sentKeys()[1]).toBe(sentKeys()[0]);

    api.fail('POST', '/api/v1/store/counter-orders', 'CART_INVALID', 'Naan is sold out.', 409);
    fireEvent.click(place);
    await waitFor(() => {
      expect(sentKeys()).toHaveLength(3);
    });
    await screen.findByText('Naan is sold out.');
    await waitFor(() => {
      expect(place).toBeEnabled();
    });
    fireEvent.click(place);
    await waitFor(() => {
      expect(sentKeys()).toHaveLength(4);
    });
    expect(sentKeys()[3]).not.toBe(sentKeys()[2]);
  });

  it('shows problems from the price check, but not "closed" (the cashier decides)', async () => {
    api.succeed(
      'POST',
      QUOTE,
      quote(60, [
        { code: 'RESTAURANT_CLOSED', message: 'We are closed right now.' },
        { code: 'PRODUCT_UNAVAILABLE', message: 'Naan is sold out.', lineIndex: 0 },
      ]),
    );
    show();
    fireEvent.click(menuButton(/^Naan/));
    expect(await screen.findByText('Naan is sold out.')).toBeInTheDocument();
    expect(screen.queryByText('We are closed right now.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Place order/ })).toBeDisabled();
  });

  it('can switch to dine in, change quantities and remove items', () => {
    api.succeed('POST', QUOTE, quote(30));
    show();
    fireEvent.click(menuButton(/^Naan/));
    fireEvent.click(screen.getByRole('button', { name: 'Dine in' }));
    expect(screen.getByRole('button', { name: 'Dine in' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'One more' }));
    expect(within(ticket()).getByText('Rs. 60')).toBeInTheDocument();
    type('Find an item', 'tikka');
    expect(screen.queryByRole('button', { name: /^Naan/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Naan' }));
    expect(screen.getByText('Tap items on the menu to add them.')).toBeInTheDocument();
  });
});
