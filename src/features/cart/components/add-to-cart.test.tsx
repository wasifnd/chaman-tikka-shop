// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AddDealToCart } from '@/features/deals/components/AddDealToCart';
import { ProductOptions } from '@/features/menu/components/ProductOptions';
import type { DealSummary, ProductDetail } from '@/features/menu/types/menu.types';
import messages from '@/i18n/messages/en.json';
import { QuantityStepper } from '@/shared/components/ui/QuantityStepper';
import { emptyCart } from '../store/cart.logic';
import { CART_STORAGE_KEY, useCartStore } from '../store/useCartStore';
import { CartLink } from './CartLink';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const tikka: ProductDetail = {
  id: uuid(1),
  slug: 'chicken-tikka',
  name: 'Chicken Tikka',
  description: null,
  categorySlug: 'chicken',
  categoryName: 'Chicken',
  price: 350,
  originalPrice: null,
  thumbnailUrl: null,
  preparationTime: 15,
  isFeatured: false,
  isPopular: false,
  orderable: true,
  stockStatus: 'IN_STOCK',
  images: [],
  variantGroups: [
    {
      id: uuid(10),
      name: 'Portion',
      isRequired: true,
      variants: [
        { id: uuid(11), name: 'Quarter', priceModifier: 0 },
        { id: uuid(12), name: 'Half', priceModifier: 330 },
      ],
    },
  ],
  addons: [{ id: uuid(20), name: 'Raita', price: 50 }],
};

const deal: DealSummary = {
  id: uuid(30),
  slug: 'family-platter',
  name: 'Family Platter',
  description: null,
  imageUrl: null,
  price: 1350,
  originalPrice: 1560,
  isFeatured: true,
  endsAt: null,
  items: [],
};

const ui = (element: ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {element}
    </NextIntlClientProvider>,
  );

const addButton = () => screen.getByRole('button', { name: 'Add to cart' });
// The quantity stepper's <output> is also a status region, so pick the confirmation message.
const confirmation = () => document.querySelector('p[role="status"]') as HTMLElement;

beforeEach(() => {
  window.localStorage.clear();
  useCartStore.setState({ ...emptyCart });
});
afterEach(cleanup);

describe('ProductOptions add to cart', () => {
  it('stays disabled until a required choice is made', async () => {
    ui(<ProductOptions product={tikka} />);
    expect(addButton()).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Half/));
    await waitFor(() => {
      expect(addButton()).toBeEnabled();
    });
  });

  it('adds the exact selection with options, add-ons, quantity and live price', async () => {
    ui(<ProductOptions product={tikka} />);
    fireEvent.click(screen.getByLabelText(/Half/));
    fireEvent.click(screen.getByLabelText(/Raita/));
    fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));
    await waitFor(() => {
      expect(addButton()).toBeEnabled();
    });
    fireEvent.click(addButton());

    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0]).toMatchObject({
      kind: 'product',
      productId: tikka.id,
      name: 'Chicken Tikka',
      unitPrice: 730, // 350 + 330 + 50
      quantity: 2,
      variantIds: [uuid(12)],
      addonIds: [uuid(20)],
      optionLabels: ['Half', 'Raita'],
    });
    expect(confirmation()).toHaveTextContent('Added Chicken Tikka to your cart.');
    expect(screen.getByRole('link', { name: 'View cart' })).toHaveAttribute('href', '/cart');
    // Quantity resets for the next add.
    expect(screen.getByRole('group', { name: 'Quantity' })).toHaveTextContent('1');
  });

  it('merges repeated adds of the same dish into one line', async () => {
    ui(<ProductOptions product={tikka} />);
    fireEvent.click(screen.getByLabelText(/Half/));
    await waitFor(() => {
      expect(addButton()).toBeEnabled();
    });
    fireEvent.click(addButton());
    fireEvent.click(addButton());
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0]?.quantity).toBe(2);
  });

  it('keeps different options as separate lines', async () => {
    ui(<ProductOptions product={tikka} />);
    fireEvent.click(screen.getByLabelText(/Half/));
    await waitFor(() => {
      expect(addButton()).toBeEnabled();
    });
    fireEvent.click(addButton());
    fireEvent.click(screen.getByLabelText(/Quarter/));
    fireEvent.click(addButton());
    expect(useCartStore.getState().items).toHaveLength(2);
  });

  it('clears the confirmation as soon as the selection changes', async () => {
    ui(<ProductOptions product={tikka} />);
    fireEvent.click(screen.getByLabelText(/Half/));
    await waitFor(() => {
      expect(addButton()).toBeEnabled();
    });
    fireEvent.click(addButton());
    expect(confirmation()).toHaveTextContent('Added');

    fireEvent.click(screen.getByLabelText(/Raita/));
    expect(confirmation()).not.toHaveTextContent('Added');
    fireEvent.click(addButton());
    fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));
    expect(confirmation()).not.toHaveTextContent('Added');
  });

  it('adds a product with no options straight away', async () => {
    ui(<ProductOptions product={{ ...tikka, variantGroups: [], addons: [] }} />);
    await waitFor(() => {
      expect(addButton()).toBeEnabled();
    });
    fireEvent.click(addButton());
    expect(useCartStore.getState().items[0]).toMatchObject({
      unitPrice: 350,
      variantIds: [],
      addonIds: [],
    });
  });

  it('offers no way to add an item that cannot be ordered', () => {
    ui(<ProductOptions product={{ ...tikka, orderable: false }} />);
    expect(screen.queryByRole('button', { name: 'Add to cart' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Quantity' })).toBeNull();
  });

  it('never overwrites a cart saved earlier', async () => {
    const saved = {
      kind: 'product',
      key: 'x',
      productId: uuid(2),
      name: 'Naan',
      unitPrice: 30,
      quantity: 3,
      variantIds: [],
      addonIds: [],
      optionLabels: [],
    };
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({ version: 1, state: { ...emptyCart, items: [saved] } }),
    );
    ui(<ProductOptions product={{ ...tikka, variantGroups: [], addons: [] }} />);
    await waitFor(() => {
      expect(addButton()).toBeEnabled();
    });
    fireEvent.click(addButton());

    const names = useCartStore
      .getState()
      .items.map((item) => item.name)
      .sort();
    expect(names).toEqual(['Chicken Tikka', 'Naan']);
    const persisted = JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? '{}') as {
      state: { items: unknown[] };
    };
    expect(persisted.state.items).toHaveLength(2);
  });
});

describe('AddDealToCart', () => {
  it('adds the chosen number of deals', async () => {
    ui(<AddDealToCart deal={deal} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add deal to cart' })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add deal to cart' }));

    expect(useCartStore.getState().items[0]).toMatchObject({
      kind: 'deal',
      dealId: deal.id,
      name: 'Family Platter',
      quantity: 2,
      unitPrice: 1350,
    });
    expect(confirmation()).toHaveTextContent('Added Family Platter to your cart.');
  });

  it('hides the confirmation when the quantity changes afterwards', async () => {
    ui(<AddDealToCart deal={deal} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add deal to cart' })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add deal to cart' }));
    expect(confirmation()).toHaveTextContent('Added');
    fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));
    expect(confirmation()).not.toHaveTextContent('Added');
  });
});

describe('QuantityStepper', () => {
  function Harness({ start = 1, min, max }: { start?: number; min?: number; max?: number }) {
    return (
      <QuantityStepper
        value={start}
        onChange={(next) => {
          calls.push(next);
        }}
        label="Qty"
        decreaseLabel="less"
        increaseLabel="more"
        {...(min === undefined ? {} : { min })}
        {...(max === undefined ? {} : { max })}
      />
    );
  }
  const calls: number[] = [];
  beforeEach(() => {
    calls.length = 0;
  });

  it('steps up and down', () => {
    render(<Harness start={5} />);
    fireEvent.click(screen.getByRole('button', { name: 'more' }));
    fireEvent.click(screen.getByRole('button', { name: 'less' }));
    expect(calls).toEqual([6, 4]);
  });

  it('cannot go below the minimum or above the maximum', () => {
    const { rerender } = render(<Harness start={1} />);
    expect(screen.getByRole('button', { name: 'less' })).toBeDisabled();
    rerender(<Harness start={20} />);
    expect(screen.getByRole('button', { name: 'more' })).toBeDisabled();
    rerender(<Harness start={3} min={3} max={3} />);
    expect(screen.getByRole('button', { name: 'less' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'more' })).toBeDisabled();
  });
});

describe('CartLink', () => {
  it('has no badge for an empty cart', async () => {
    ui(<CartLink />);
    const link = await screen.findByRole('link', { name: 'Cart' });
    expect(link).toHaveAttribute('href', '/cart');
    expect(link).not.toHaveTextContent(/\d/);
  });

  it('shows the saved item count once loaded and follows changes', async () => {
    const item = (productId: string, quantity: number) => ({
      kind: 'product',
      key: productId,
      productId,
      name: 'Item',
      unitPrice: 10,
      quantity,
      variantIds: [],
      addonIds: [],
      optionLabels: [],
    });
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        state: { ...emptyCart, items: [item(uuid(1), 2), item(uuid(2), 3)] },
      }),
    );
    ui(<CartLink />);
    expect(await screen.findByRole('link', { name: 'Cart, 5 items' })).toHaveTextContent('5');

    act(() => {
      useCartStore.getState().remove(useCartStore.getState().items[0]?.key ?? '');
    });
    expect(await screen.findByRole('link', { name: 'Cart, 3 items' })).toBeInTheDocument();
  });

  it('uses the singular for one item', async () => {
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        state: {
          ...emptyCart,
          items: [
            {
              kind: 'product',
              key: 'k',
              productId: uuid(1),
              name: 'Item',
              unitPrice: 10,
              quantity: 1,
              variantIds: [],
              addonIds: [],
              optionLabels: [],
            },
          ],
        },
      }),
    );
    ui(<CartLink />);
    expect(await screen.findByRole('link', { name: 'Cart, 1 item' })).toBeInTheDocument();
  });
});
