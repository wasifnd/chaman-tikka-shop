// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyCart, type CartItem, type CartState } from '@/features/cart/store/cart.logic';
import { CART_STORAGE_KEY, useCartStore } from '@/features/cart/store/useCartStore';
import { buildQuote } from '@/features/checkout/services/quote-engine';
import { CLOSED_NOW, OPEN_NOW, ids, quoteData } from '@/features/checkout/testing/fixtures';
import type { QuoteInput } from '@/features/checkout/types/quote.types';
import type { ZoneOption } from '@/features/checkout/types/zone.types';
import messages from '@/i18n/messages/en.json';
import { CheckoutView } from './CheckoutView';

const router = { push: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const zones: ZoneOption[] = [
  { id: ids.zone, name: 'Johar Town', charge: 100, freeDeliveryAbove: 2000 },
];

const naan = (quantity = 2): CartItem => ({
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

function seedCart(items: CartItem[] = [naan()], extra: Partial<CartState> = {}) {
  window.localStorage.setItem(
    CART_STORAGE_KEY,
    JSON.stringify({ version: 1, state: { ...emptyCart, orderType: 'PICKUP', items, ...extra } }),
  );
}

interface OrderCall {
  body: Record<string, unknown>;
}
const orderCalls: OrderCall[] = [];
type OrderHandler = () => Response | Promise<Response>;

const created = () =>
  Response.json(
    { success: true, data: { order: { orderNumber: 'BBQ-2026-0001', trackingToken: 'tok-123' } } },
    { status: 201 },
  );
/** An order that takes a moment to be accepted, like a real network call. */
const slowCreated: OrderHandler = () =>
  new Promise<Response>((resolve) => {
    setTimeout(() => {
      resolve(created());
    }, 50);
  });
const failure = (code: string, status: number, details?: Record<string, string>) =>
  Response.json(
    { success: false, error: { code, message: `msg ${code}`, ...(details ? { details } : {}) } },
    { status },
  );

/** A fake API: quotes come from the real pricing engine, orders from `onOrder`. */
function serve(onOrder: OrderHandler = created, now: Date = OPEN_NOW) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const raw = init?.body;
      const body = JSON.parse(typeof raw === 'string' ? raw : '{}') as Record<string, unknown>;
      if (url === '/api/v1/orders') {
        orderCalls.push({ body });
        return Promise.resolve(onOrder());
      }
      const quote = buildQuote(body as unknown as QuoteInput, quoteData(), now);
      return Promise.resolve(Response.json({ success: true, data: { quote } }));
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

const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const fillContact = () => {
  type('Full name', 'Ali Khan');
  type('Mobile number', '0300-123 4567');
};
const placeButton = () => screen.getByRole('button', { name: /Place order|Placing/ });
const ready = async () => {
  await waitFor(() => {
    expect(placeButton()).toBeEnabled();
  });
};
const submit = () => {
  fireEvent.click(placeButton());
};

beforeEach(() => {
  window.localStorage.clear();
  useCartStore.setState({ ...emptyCart });
  orderCalls.length = 0;
  router.push.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('what is shown', () => {
  it('tells the customer when the cart is empty', async () => {
    serve();
    renderCheckout();
    expect(await screen.findByText('Your cart is empty.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse the menu' })).toHaveAttribute('href', '/menu');
  });

  it('asks only for contact details for pickup and shows the cash-at-counter note', async () => {
    seedCart();
    serve();
    renderCheckout();
    expect(await screen.findByLabelText('Full name')).toBeInTheDocument();
    expect(screen.queryByLabelText('Street address')).toBeNull();
    expect(screen.getByText('You will pay in cash at the counter.')).toBeInTheDocument();
  });

  it('also asks for an address for delivery and names the area', async () => {
    seedCart([naan()], { orderType: 'DELIVERY', zoneId: ids.zone });
    serve();
    renderCheckout();
    expect(await screen.findByLabelText('Street address')).toBeInTheDocument();
    expect(screen.getByText('Delivering to Johar Town')).toBeInTheDocument();
    expect(screen.getByText('You will pay in cash when your order arrives.')).toBeInTheDocument();
  });

  it('summarises the items and the server-calculated total', async () => {
    seedCart();
    serve();
    renderCheckout();
    expect(await screen.findByText('2 × Naan')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Total', { selector: 'dt' }).nextElementSibling).toHaveTextContent(
        'Rs. 60',
      );
    });
  });
});

describe('checking the form', () => {
  it('shows what is missing and sends nothing', async () => {
    seedCart();
    serve();
    renderCheckout();
    await ready();
    submit();
    expect(await screen.findByText('Enter your name')).toBeInTheDocument();
    expect(screen.getByText(/valid mobile number/)).toBeInTheDocument();
    expect(orderCalls).toHaveLength(0);
  });

  it('requires a street address for delivery', async () => {
    seedCart([naan()], { orderType: 'DELIVERY', zoneId: ids.zone });
    serve();
    renderCheckout();
    await screen.findByLabelText('Street address');
    await ready();
    fillContact();
    submit();
    expect(await screen.findByText('Enter your street address')).toBeInTheDocument();
    expect(orderCalls).toHaveLength(0);
  });

  it('rejects a bad email', async () => {
    seedCart();
    serve();
    renderCheckout();
    await ready();
    fillContact();
    type('Email (optional)', 'not-an-email');
    submit();
    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument();
  });
});

describe('placing the order', () => {
  it('sends the cart and contact details, never a price, and goes to the tracking page', async () => {
    seedCart();
    serve();
    renderCheckout();
    await ready();
    fillContact();
    type('Email (optional)', 'Ali@Example.com');
    type('Notes for the kitchen (optional)', 'extra crispy');
    submit();

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith('/track/tok-123?placed=1');
    });
    expect(orderCalls).toHaveLength(1);
    const { body } = orderCalls[0] as OrderCall;
    expect(body).toMatchObject({
      orderType: 'PICKUP',
      expectedTotal: 60,
      contact: { name: 'Ali Khan', phone: '03001234567', email: 'ali@example.com' },
      instructions: 'extra crispy',
      lines: [{ kind: 'product', productId: ids.naan, quantity: 2 }],
    });
    expect(body['idempotencyKey']).toMatch(/^[0-9a-f-]{36}$/);
    expect(body).not.toHaveProperty('address');
    const json = JSON.stringify(body);
    expect(json).not.toContain('unitPrice');
    expect(json).not.toContain('"grandTotal"');
  });

  it('includes the address and area for delivery', async () => {
    seedCart([naan()], { orderType: 'DELIVERY', zoneId: ids.zone });
    serve();
    renderCheckout();
    await screen.findByLabelText('Street address');
    await waitFor(() => {
      expect(placeButton()).toBeEnabled();
    });
    fillContact();
    type('Street address', 'House 12, Street 4');
    type('Apartment or landmark (optional)', 'Near the park');
    submit();

    await waitFor(() => {
      expect(orderCalls).toHaveLength(1);
    });
    expect((orderCalls[0] as OrderCall).body).toMatchObject({
      orderType: 'DELIVERY',
      zoneId: ids.zone,
      expectedTotal: 160,
      address: { line1: 'House 12, Street 4', line2: 'Near the park' },
    });
  });

  it('empties the cart once the order is placed', async () => {
    seedCart();
    serve();
    renderCheckout();
    await ready();
    fillContact();
    submit();
    await waitFor(() => {
      expect(router.push).toHaveBeenCalled();
    });
    expect(useCartStore.getState().items).toEqual([]);
    // No flash of "your cart is empty" while navigating away.
    expect(screen.queryByText('Your cart is empty.')).toBeNull();
  });

  it('places the order only once on a double click', async () => {
    seedCart();
    serve(slowCreated);
    renderCheckout();
    await ready();
    fillContact();
    fireEvent.click(placeButton());
    fireEvent.click(placeButton());
    await waitFor(() => {
      expect(router.push).toHaveBeenCalled();
    });
    expect(orderCalls).toHaveLength(1);
  });

  it('shows a busy state while placing', async () => {
    seedCart();
    serve(slowCreated);
    renderCheckout();
    await ready();
    fillContact();
    submit();
    expect(await screen.findByRole('button', { name: 'Placing your order' })).toBeDisabled();
    // Let the order finish, so it cannot spill into the next test.
    await waitFor(() => {
      expect(router.push).toHaveBeenCalled();
    });
  });
});

describe('retrying safely', () => {
  it('reuses the idempotency key when the same order is sent again after a failure', async () => {
    seedCart();
    const answers: OrderHandler[] = [() => failure('INTERNAL_ERROR', 500), created];
    serve(() => (answers.shift() ?? created)());
    renderCheckout();
    await ready();
    fillContact();

    submit();
    expect(
      await screen.findByText('We could not place your order. Please try again.'),
    ).toBeInTheDocument();
    submit();
    await waitFor(() => {
      expect(router.push).toHaveBeenCalled();
    });

    expect(orderCalls).toHaveLength(2);
    expect(orderCalls[1]?.body['idempotencyKey']).toBe(orderCalls[0]?.body['idempotencyKey']);
  });

  it('uses a new key once the customer changes the order', async () => {
    seedCart();
    const answers: OrderHandler[] = [() => failure('INTERNAL_ERROR', 500), created];
    serve(() => (answers.shift() ?? created)());
    renderCheckout();
    await ready();
    fillContact();
    submit();
    await screen.findByText('We could not place your order. Please try again.');

    type('Full name', 'Someone Else');
    submit();
    await waitFor(() => {
      expect(router.push).toHaveBeenCalled();
    });
    expect(orderCalls[1]?.body['idempotencyKey']).not.toBe(orderCalls[0]?.body['idempotencyKey']);
  });

  it('keeps the cart after a failure so nothing is lost', async () => {
    seedCart();
    serve(() => failure('INTERNAL_ERROR', 500));
    renderCheckout();
    await ready();
    fillContact();
    submit();
    await screen.findByText('We could not place your order. Please try again.');
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe('when the order is refused', () => {
  const refuse = async (response: Response, expected: string | RegExp) => {
    seedCart();
    serve(() => response);
    renderCheckout();
    await ready();
    fillContact();
    submit();
    expect(await screen.findByText(expected)).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  };

  it('explains a price change with the new total', async () => {
    await refuse(failure('PRICE_CHANGED', 409, { total: '1560' }), /Your total is now Rs\. 1,560/);
  });

  it('asks the customer to review the cart', async () => {
    await refuse(
      failure('CART_INVALID', 409, { RESTAURANT_CLOSED: 'closed' }),
      'Some items need attention. Please review your cart.',
    );
  });

  it('explains a coupon that was just used up', async () => {
    await refuse(failure('COUPON_EXHAUSTED', 409), /fully used/);
  });

  it('asks the customer to wait when rate limited', async () => {
    await refuse(failure('RATE_LIMITED', 429), /Too many attempts/);
  });

  it('asks the customer to wait while a previous attempt is still running', async () => {
    await refuse(failure('ORDER_IN_PROGRESS', 409), /still being placed/);
  });

  it('shows server-side field errors next to the field', async () => {
    seedCart();
    serve(() =>
      failure('VALIDATION_ERROR', 422, { 'contact.phone': 'Server dislikes this number' }),
    );
    renderCheckout();
    await ready();
    fillContact();
    submit();
    expect(await screen.findByText('Server dislikes this number')).toBeInTheDocument();
  });

  it('refreshes the price after a price change so the customer sees the new total', async () => {
    seedCart();
    serve(() => failure('PRICE_CHANGED', 409, { total: '70' }));
    renderCheckout();
    await ready();
    fillContact();
    submit();
    await screen.findByText(/Your total is now/);
    // The quote was requested again.
    await waitFor(() => {
      const quoteCalls = vi
        .mocked(fetch)
        .mock.calls.filter(([url]) => url === '/api/v1/cart/quote');
      expect(quoteCalls.length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('when the cart cannot be ordered', () => {
  it('lists the problems and keeps Place order disabled', async () => {
    seedCart();
    serve(created, CLOSED_NOW);
    renderCheckout();
    expect(await screen.findByText('Fix the items in your cart to continue.')).toBeInTheDocument();
    expect(screen.getByText('We are closed right now.')).toBeInTheDocument();
    expect(placeButton()).toBeDisabled();
    fillContact();
    submit();
    expect(orderCalls).toHaveLength(0);
  });

  it('links back to the cart', async () => {
    seedCart();
    serve();
    renderCheckout();
    expect(await screen.findByRole('link', { name: 'Back to cart' })).toHaveAttribute(
      'href',
      '/cart',
    );
  });
});
