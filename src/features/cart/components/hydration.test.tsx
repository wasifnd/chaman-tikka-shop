// @vitest-environment jsdom
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/i18n/messages/en.json';

/**
 * Regression tests for hydration: the page is rendered to HTML on the server, then React attaches
 * to it in the browser. These reproduce a bug where a control stayed disabled forever because the
 * client's first render disagreed with the server HTML.
 */

// React needs this flag to allow act() outside a test renderer.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const product = {
  id: uuid(1),
  slug: 'naan',
  name: 'Naan',
  description: null,
  categorySlug: 'bread',
  categoryName: 'Bread',
  price: 30,
  originalPrice: null,
  thumbnailUrl: null,
  preparationTime: 15,
  isFeatured: false,
  isPopular: false,
  orderable: true,
  stockStatus: 'IN_STOCK' as const,
  images: [],
  variantGroups: [],
  addons: [],
};

beforeEach(() => {
  window.localStorage.clear();
  vi.resetModules(); // a fresh, un-hydrated store for every test
  document.body.innerHTML = '';
});
afterEach(() => {
  document.body.innerHTML = '';
});

async function load() {
  const [{ ProductOptions }, { CartLink }, { useCartStore }] = await Promise.all([
    import('@/features/menu/components/ProductOptions'),
    import('./CartLink'),
    import('../store/useCartStore'),
  ]);
  const page = (
    <NextIntlClientProvider locale="en" messages={messages}>
      <CartLink />
      <main>
        <ProductOptions product={product} />
      </main>
    </NextIntlClientProvider>
  );
  return { page, useCartStore };
}

const addButton = () =>
  [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add to cart');

describe('hydration', () => {
  it('server HTML starts with the add button disabled', async () => {
    const { page } = await load();
    expect(renderToString(page)).toMatch(/<button[^>]*disabled=""[^>]*>Add to cart/);
  });

  it('enables the add button after hydrating, even when the store was loaded before this part of the page hydrated', async () => {
    const { page, useCartStore } = await load();
    const container = document.createElement('div');
    container.innerHTML = renderToString(page); // what the server sent
    document.body.append(container);
    expect(addButton()?.disabled).toBe(true);

    // The header hydrates first and loads the saved cart, before the page content hydrates.
    await useCartStore.persist.rehydrate();
    expect(useCartStore.persist.hasHydrated()).toBe(true);

    await act(async () => {
      hydrateRoot(container, page);
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(addButton()?.disabled).toBe(false);
    });
  });

  it('also works when nothing was loaded beforehand', async () => {
    const { page } = await load();
    const container = document.createElement('div');
    container.innerHTML = renderToString(page);
    document.body.append(container);

    await act(async () => {
      hydrateRoot(container, page);
      await Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(addButton()?.disabled).toBe(false);
    });
  });

  it('shows no cart badge flash while hydrating, then the saved count', async () => {
    window.localStorage.setItem(
      'bbq-cart',
      JSON.stringify({
        version: 1,
        state: {
          items: [
            {
              kind: 'product',
              key: 'k',
              productId: uuid(2),
              name: 'Item',
              unitPrice: 10,
              quantity: 3,
              variantIds: [],
              addonIds: [],
              optionLabels: [],
            },
          ],
          orderType: 'DELIVERY',
          zoneId: null,
          couponCode: null,
        },
      }),
    );
    const { page, useCartStore } = await load();
    const container = document.createElement('div');
    container.innerHTML = renderToString(page);
    document.body.append(container);
    // Even though a cart is saved, the server HTML (and first client render) shows no count.
    expect(container.querySelector('a[href="/cart"]')?.getAttribute('aria-label')).toBe('Cart');

    await useCartStore.persist.rehydrate();
    await act(async () => {
      hydrateRoot(container, page);
      await Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(container.querySelector('a[href="/cart"]')?.getAttribute('aria-label')).toBe(
        'Cart, 3 items',
      );
    });
  });
});
