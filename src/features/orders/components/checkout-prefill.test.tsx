// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedAddress } from '@/features/account/types/account.types';
import { emptyCart, type CartItem, type CartState } from '@/features/cart/store/cart.logic';
import { CART_STORAGE_KEY, useCartStore } from '@/features/cart/store/useCartStore';
import { buildQuote } from '@/features/checkout/services/quote-engine';
import { OPEN_NOW, ids, quoteData } from '@/features/checkout/testing/fixtures';
import type { QuoteInput } from '@/features/checkout/types/quote.types';
import type { ZoneOption } from '@/features/checkout/types/zone.types';
import messages from '@/i18n/messages/en.json';
import { CheckoutView } from './CheckoutView';

const router = { push: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const zones: ZoneOption[] = [
  { id: ids.zone, name: 'Johar Town', charge: 100, freeDeliveryAbove: 2000 },
];
const OTHER_ZONE = '99999999-9999-4999-8999-999999999999';

const naan: CartItem = {
  kind: 'product',
  key: 'k',
  productId: ids.naan,
  name: 'Naan',
  unitPrice: 30,
  quantity: 2,
  variantIds: [],
  addonIds: [],
  optionLabels: [],
};

const seedCart = (extra: Partial<CartState> = {}) => {
  window.localStorage.setItem(
    CART_STORAGE_KEY,
    JSON.stringify({ version: 1, state: { ...emptyCart, items: [naan], ...extra } }),
  );
};

const address = (overrides: Partial<SavedAddress> & { id: string }): SavedAddress => ({
  label: 'Home',
  addressLine1: 'House 12, Street 4',
  addressLine2: null,
  zoneId: ids.zone,
  zoneName: 'Johar Town',
  zoneActive: true,
  isDefault: false,
  ...overrides,
});

type Who = 'customer' | 'guest' | 'staff';

/** A pretend server: who is signed in, what their profile holds, and real pricing. */
function serve(who: Who, addresses: SavedAddress[] = []) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/auth/me') {
        return Promise.resolve(
          who === 'guest'
            ? Response.json(
                { success: false, error: { code: 'UNAUTHENTICATED', message: '' } },
                { status: 401 },
              )
            : Response.json({
                success: true,
                data: {
                  user: {
                    userId: 'u',
                    email: 'ali@example.com',
                    role: who === 'staff' ? 'STORE_STAFF' : 'CUSTOMER',
                    ...(who === 'customer' ? { customerId: 'c1' } : {}),
                  },
                },
              }),
        );
      }
      if (url === '/api/auth/refresh') {
        return Promise.resolve(Response.json({ success: false }, { status: 401 }));
      }
      if (url === '/api/v1/account/profile') {
        return Promise.resolve(
          who === 'customer'
            ? Response.json({
                success: true,
                data: {
                  profile: { name: 'Ali Khan', phone: '03001234567', email: 'ali@example.com' },
                  addresses,
                },
              })
            : Response.json(
                { success: false, error: { code: 'NO_CUSTOMER_PROFILE', message: '' } },
                { status: 403 },
              ),
        );
      }
      const raw = init?.body;
      const body = JSON.parse(typeof raw === 'string' ? raw : '{}') as unknown as QuoteInput;
      return Promise.resolve(
        Response.json({ success: true, data: { quote: buildQuote(body, quoteData(), OPEN_NOW) } }),
      );
    }),
  );
}

function renderCheckout() {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0, gcTime: 0 } } });
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={client}>
        <CheckoutView zones={zones} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  useCartStore.setState({ ...emptyCart });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('checkout for a signed-in customer', () => {
  it('fills in their name, phone and email', async () => {
    seedCart({ orderType: 'PICKUP' });
    serve('customer');
    renderCheckout();
    await waitFor(() => {
      expect(screen.getByLabelText('Full name')).toHaveValue('Ali Khan');
    });
    expect(screen.getByLabelText('Mobile number')).toHaveValue('03001234567');
    expect(screen.getByLabelText('Email (optional)')).toHaveValue('ali@example.com');
  });

  it('never overwrites what they have already typed', async () => {
    seedCart({ orderType: 'PICKUP' });
    serve('customer');
    renderCheckout();
    const name = await screen.findByLabelText('Full name');
    fireEvent.change(name, { target: { value: 'Someone Else' } });
    // let the profile arrive after the edit
    await waitFor(() => {
      expect(screen.getByLabelText('Mobile number')).toHaveValue('03001234567');
    });
    expect(name).toHaveValue('Someone Else');
  });

  it('fills in the default saved address and its delivery area for a delivery order', async () => {
    seedCart({ orderType: 'DELIVERY' });
    serve('customer', [
      address({ id: 'a1', label: 'Office', addressLine1: 'Plot 5, Main Blvd', isDefault: true }),
      address({ id: 'a2', label: 'Home' }),
    ]);
    renderCheckout();
    await waitFor(() => {
      expect(screen.getByLabelText('Street address')).toHaveValue('Plot 5, Main Blvd');
    });
    expect(useCartStore.getState().zoneId).toBe(ids.zone);
  });

  it('lets them switch to another saved address, which also switches the area', async () => {
    seedCart({ orderType: 'DELIVERY' });
    serve('customer', [
      address({ id: 'a1', label: 'Office', addressLine1: 'Plot 5, Main Blvd', isDefault: true }),
      address({
        id: 'a2',
        label: 'Home',
        addressLine1: 'House 9',
        addressLine2: 'Near park',
        zoneId: OTHER_ZONE,
        zoneName: 'Model Town',
      }),
    ]);
    renderCheckout();
    const picker = await screen.findByLabelText('Use a saved address');
    fireEvent.change(picker, { target: { value: 'a2' } });
    expect(screen.getByLabelText('Street address')).toHaveValue('House 9');
    expect(screen.getByLabelText('Apartment or landmark (optional)')).toHaveValue('Near park');
    expect(useCartStore.getState().zoneId).toBe(OTHER_ZONE);
  });

  it('shows an address in a closed area as unavailable instead of using it', async () => {
    seedCart({ orderType: 'DELIVERY' });
    serve('customer', [
      address({ id: 'a1', label: 'Old flat', zoneActive: false, isDefault: true }),
    ]);
    renderCheckout();
    const picker = await screen.findByLabelText('Use a saved address');
    const option = screen.getByRole('option', { name: /Old flat.*no longer delivered to/ });
    expect(option).toBeDisabled();
    // The default is not applied because its area is closed.
    expect(screen.getByLabelText('Street address')).toHaveValue('');
    expect(picker).toBeInTheDocument();
  });

  it('offers no address picker for pickup', async () => {
    seedCart({ orderType: 'PICKUP' });
    serve('customer', [address({ id: 'a1', isDefault: true })]);
    renderCheckout();
    await screen.findByLabelText('Full name');
    expect(screen.queryByLabelText('Use a saved address')).toBeNull();
  });
});

describe('checkout for everyone else', () => {
  it.each<Who>(['guest', 'staff'])('is unchanged for a %s', async (who) => {
    seedCart({ orderType: 'DELIVERY' });
    serve(who);
    renderCheckout();
    expect(await screen.findByLabelText('Full name')).toHaveValue('');
    expect(screen.getByLabelText('Mobile number')).toHaveValue('');
    expect(screen.queryByLabelText('Use a saved address')).toBeNull();
  });
});
