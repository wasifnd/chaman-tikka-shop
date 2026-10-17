// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildQuote } from '@/features/checkout/services/quote-engine';
import {
  CLOSED_NOW,
  OPEN_NOW,
  coupon,
  ids,
  product,
  quoteData,
  tikka,
  withProducts,
  zone,
} from '@/features/checkout/testing/fixtures';
import type { QuoteData, QuoteInput } from '@/features/checkout/types/quote.types';
import type { ZoneOption } from '@/features/checkout/types/zone.types';
import messages from '@/i18n/messages/en.json';
import { emptyCart, type CartItem, type CartState } from '../store/cart.logic';
import { CART_STORAGE_KEY, useCartStore } from '../store/useCartStore';
import { CartView } from './CartView';

const zones: ZoneOption[] = [
  { id: ids.zone, name: 'Johar Town', charge: 100, freeDeliveryAbove: 2000 },
];

const tikkaItem = (overrides: Partial<Extract<CartItem, { kind: 'product' }>> = {}): CartItem => ({
  kind: 'product',
  key: 'ignored',
  productId: ids.tikka,
  name: 'Chicken Tikka',
  unitPrice: 680,
  quantity: 2,
  variantIds: [ids.half],
  addonIds: [],
  optionLabels: ['Half'],
  ...overrides,
});

const naanItem = (quantity = 1): CartItem => ({
  kind: 'product',
  key: 'ignored',
  productId: ids.naan,
  name: 'Naan',
  unitPrice: 30,
  quantity,
  variantIds: [],
  addonIds: [],
  optionLabels: [],
});

function seedCart(items: CartItem[], extra: Partial<CartState> = {}) {
  window.localStorage.setItem(
    CART_STORAGE_KEY,
    JSON.stringify({ version: 1, state: { ...emptyCart, orderType: 'PICKUP', items, ...extra } }),
  );
}

type DataFor = Partial<QuoteData> | ((request: QuoteInput) => Partial<QuoteData>);
const requests: QuoteInput[] = [];

/** A fake quote API backed by the real pricing engine. */
function serveQuotes(dataFor: DataFor = {}, now: Date = OPEN_NOW) {
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: RequestInit) => {
      const body = init?.body;
      const request = JSON.parse(typeof body === 'string' ? body : '{}') as QuoteInput;
      requests.push(request);
      const overrides = typeof dataFor === 'function' ? dataFor(request) : dataFor;
      const base = quoteData({
        coupon: request.couponCode?.toUpperCase() === 'SAVE100' ? coupon() : null,
        ...overrides,
      });
      return Promise.resolve(
        Response.json({ success: true, data: { quote: buildQuote(request, base, now) } }),
      );
    }),
  );
}

function renderCart() {
  const client = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0, gcTime: 0 } },
  });
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={client}>
        <CartView zones={zones} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

const total = () => {
  const label = screen.getByText('Total', { selector: 'dt' });
  return (label.nextElementSibling as HTMLElement).textContent;
};

beforeEach(() => {
  window.localStorage.clear();
  useCartStore.setState({ ...emptyCart });
  requests.length = 0;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('empty cart', () => {
  it('invites the customer to the menu and makes no price request', async () => {
    serveQuotes();
    renderCart();
    expect(await screen.findByText('Your cart is empty.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse the menu' })).toHaveAttribute('href', '/menu');
    expect(requests).toHaveLength(0);
  });
});

describe('priced cart', () => {
  it('shows lines with options and the server total', async () => {
    seedCart([tikkaItem()]);
    serveQuotes();
    renderCart();

    expect(await screen.findByRole('heading', { name: 'Chicken Tikka' })).toBeInTheDocument();
    expect(screen.getByText('Half')).toBeInTheDocument();
    await waitFor(() => {
      expect(total()).toBe('Rs. 1,360'); // (350 + 330) * 2
    });
  });

  it('sends only ids and quantities, never prices', async () => {
    seedCart([tikkaItem()]);
    serveQuotes();
    renderCart();
    await waitFor(() => {
      expect(requests).toHaveLength(1);
    });
    expect(requests[0]).toMatchObject({
      orderType: 'PICKUP',
      lines: [{ kind: 'product', productId: ids.tikka, quantity: 2, variantIds: [ids.half] }],
    });
    expect(JSON.stringify(requests[0])).not.toContain('unitPrice');
  });

  it('re-prices when the quantity changes', async () => {
    seedCart([tikkaItem({ quantity: 1, unitPrice: 680 })]);
    serveQuotes();
    renderCart();
    await waitFor(() => {
      expect(total()).toBe('Rs. 680');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));
    await waitFor(() => {
      expect(total()).toBe('Rs. 1,360');
    });
  });

  it('removes a line and falls back to the empty state', async () => {
    seedCart([naanItem()]);
    serveQuotes();
    renderCart();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Naan' }));
    expect(await screen.findByText('Your cart is empty.')).toBeInTheDocument();
  });

  it("prefers the server's price and flags when it differs from what was saved", async () => {
    // Saved at Rs. 25 but the server says Rs. 30.
    seedCart([{ ...naanItem(), unitPrice: 25 }]);
    serveQuotes();
    renderCart();
    expect(await screen.findByText('Price updated')).toBeInTheDocument();
    await waitFor(() => {
      expect(total()).toBe('Rs. 30');
    });
  });

  it('does not flag a price that matches', async () => {
    seedCart([naanItem()]);
    serveQuotes();
    renderCart();
    await waitFor(() => {
      expect(total()).toBe('Rs. 30');
    });
    expect(screen.queryByText('Price updated')).toBeNull();
  });
});

describe('order type and delivery area', () => {
  it('asks for an area when delivering, then adds the delivery fee', async () => {
    seedCart([tikkaItem()], { orderType: 'DELIVERY' });
    serveQuotes();
    renderCart();

    expect(await screen.findByText('Choose your delivery area.')).toBeInTheDocument();
    // The charge is unknown until an area is chosen, so no misleading "Free" row.
    expect(screen.queryByText('Delivery', { selector: 'dt' })).toBeNull();

    fireEvent.change(screen.getByLabelText('Delivery area'), { target: { value: ids.zone } });
    await waitFor(() => {
      expect(total()).toBe('Rs. 1,460'); // 1360 + 100
    });
    expect(screen.queryByText('Choose your delivery area.')).toBeNull();
    expect(screen.getByText('Delivery', { selector: 'dt' })).toBeInTheDocument();
  });

  it('shows how much more unlocks free delivery', async () => {
    seedCart([tikkaItem({ quantity: 1 })], { orderType: 'DELIVERY', zoneId: ids.zone });
    serveQuotes();
    renderCart();
    expect(await screen.findByText('Add Rs. 1,320 more for free delivery.')).toBeInTheDocument();
  });

  it('shows delivery as free once the threshold is reached', async () => {
    seedCart([tikkaItem({ quantity: 3 })], { orderType: 'DELIVERY', zoneId: ids.zone });
    serveQuotes();
    renderCart();
    await waitFor(() => {
      expect(total()).toBe('Rs. 2,040');
    });
    const deliveryRow = screen.getByText('Delivery', { selector: 'dt' })
      .parentElement as HTMLElement;
    expect(within(deliveryRow).getByText('Free')).toBeInTheDocument();
  });

  it('hides delivery details for pickup and does not send a zone', async () => {
    seedCart([tikkaItem()], { orderType: 'DELIVERY', zoneId: ids.zone });
    serveQuotes();
    renderCart();
    await screen.findByLabelText('Delivery area');

    fireEvent.click(screen.getByRole('radio', { name: 'Pickup' }));
    await waitFor(() => {
      expect(screen.queryByLabelText('Delivery area')).toBeNull();
    });
    await waitFor(() => {
      expect(requests.at(-1)).toMatchObject({ orderType: 'PICKUP', zoneId: null });
    });
    expect(screen.queryByText('Delivery', { selector: 'dt' })).toBeNull();
  });

  it('says so when no delivery areas are offered', async () => {
    seedCart([naanItem()], { orderType: 'DELIVERY' });
    serveQuotes();
    const client = new QueryClient();
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <QueryClientProvider client={client}>
          <CartView zones={[]} />
        </QueryClientProvider>
      </NextIntlClientProvider>,
    );
    expect(
      await screen.findByText('We are not taking delivery orders right now.'),
    ).toBeInTheDocument();
  });

  it('flags a saved area that is no longer served', async () => {
    seedCart([naanItem()], { orderType: 'DELIVERY', zoneId: ids.zone });
    serveQuotes({ zone: zone({ isActive: false }) });
    renderCart();
    expect(await screen.findByText('We do not deliver to that area.')).toBeInTheDocument();
    expect(screen.queryByText('Delivery', { selector: 'dt' })).toBeNull();
  });
});

describe('coupons', () => {
  it('applies a valid code and shows the discount', async () => {
    seedCart([tikkaItem()]);
    serveQuotes();
    renderCart();
    await screen.findByRole('heading', { name: 'Chicken Tikka' });

    fireEvent.change(screen.getByLabelText('Coupon code'), { target: { value: 'save100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(await screen.findByText(/SAVE100 applied/)).toBeInTheDocument();
    await waitFor(() => {
      expect(total()).toBe('Rs. 1,260'); // 1360 - 100
    });
    expect(screen.getByText('Coupon discount', { selector: 'dt' })).toBeInTheDocument();
  });

  it('explains why a code was rejected and lets the customer remove it', async () => {
    seedCart([tikkaItem()]);
    serveQuotes();
    renderCart();
    await screen.findByRole('heading', { name: 'Chicken Tikka' });

    fireEvent.change(screen.getByLabelText('Coupon code'), { target: { value: 'NOPE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText('That coupon code is not valid.')).toBeInTheDocument();
    expect(total()).toBe('Rs. 1,360');

    fireEvent.click(screen.getByRole('button', { name: /Remove coupon/ }));
    expect(await screen.findByLabelText('Coupon code')).toBeInTheDocument();
    expect(screen.queryByText('That coupon code is not valid.')).toBeNull();
  });

  it('keeps Apply disabled for a blank code', async () => {
    seedCart([naanItem()]);
    serveQuotes();
    renderCart();
    await screen.findByRole('heading', { name: 'Naan' });
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Coupon code'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });
});

describe('problems the server finds', () => {
  it('shows an unavailable item on its own row', async () => {
    seedCart([tikkaItem(), naanItem()]);
    serveQuotes({ products: withProducts(tikka({ stockStatus: 'OUT_OF_STOCK' }), product()) });
    renderCart();
    expect(
      await screen.findByText('Chicken Tikka is not available right now.'),
    ).toBeInTheDocument();
    const tikkaRow = screen
      .getByRole('heading', { name: 'Chicken Tikka' })
      .closest('li') as HTMLElement;
    expect(within(tikkaRow).getByRole('alert')).toHaveTextContent('not available');
    // The sellable item is still priced.
    await waitFor(() => {
      expect(total()).toBe('Rs. 30');
    });
  });

  it('warns when the restaurant is closed, with the opening hours', async () => {
    seedCart([naanItem()]);
    serveQuotes({}, CLOSED_NOW);
    renderCart();
    expect(await screen.findByText(/We are closed right now\./)).toBeInTheDocument();
    expect(screen.getByText(/We are open daily, 6 PM to 2 AM\./)).toBeInTheDocument();
  });

  it('reports a paused shop', async () => {
    seedCart([naanItem()]);
    serveQuotes({ settings: { taxRatePercent: 0, orderingEnabled: false } });
    renderCart();
    expect(await screen.findByText('Online ordering is paused right now.')).toBeInTheDocument();
  });

  it('shows tax when there is any', async () => {
    seedCart([naanItem()]);
    serveQuotes({ settings: { taxRatePercent: 16, orderingEnabled: true } });
    renderCart();
    expect(await screen.findByText('Tax', { selector: 'dt' })).toBeInTheDocument();
    await waitFor(() => {
      expect(total()).toBe('Rs. 35'); // 30 + 16% = 34.80, shown in whole rupees
    });
  });
});

describe('when the price service fails', () => {
  it('tells the customer and recovers on retry', async () => {
    seedCart([naanItem()]);
    const failing = vi.fn(() =>
      Promise.resolve(
        Response.json(
          { success: false, error: { code: 'INTERNAL_ERROR', message: 'boom' } },
          { status: 500 },
        ),
      ),
    );
    vi.stubGlobal('fetch', failing);
    renderCart();

    expect(await screen.findByText('We could not update your prices.')).toBeInTheDocument();
    // The customer can still see and edit their items.
    expect(screen.getByRole('heading', { name: 'Naan' })).toBeInTheDocument();

    serveQuotes();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => {
      expect(total()).toBe('Rs. 30');
    });
    expect(screen.queryByText('We could not update your prices.')).toBeNull();
  });
});

describe('loading', () => {
  it('shows placeholders until the saved cart is read', () => {
    seedCart([naanItem()]);
    serveQuotes();
    const { container } = renderCart();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});
