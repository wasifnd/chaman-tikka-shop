// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyCart, type NewCartItem } from './cart.logic';
import { CART_STORAGE_KEY, safeStorage, useCartStore } from './useCartStore';
import { useCartHydrated } from './useCartHydrated';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tikka: NewCartItem = {
  kind: 'product',
  productId: uuid(1),
  name: 'Chicken Tikka',
  unitPrice: 350,
  quantity: 2,
  variantIds: [uuid(2)],
  addonIds: [],
  optionLabels: ['Half'],
};

const stored = () =>
  JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? 'null') as {
    state: { items: { quantity: number }[] };
    version: number;
  } | null;

beforeEach(() => {
  window.localStorage.clear();
  useCartStore.setState({ ...emptyCart });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('cart store actions', () => {
  it('adds, merges, changes and removes lines', () => {
    const { add, setQuantity, remove } = useCartStore.getState();
    add(tikka);
    add(tikka);
    expect(useCartStore.getState().items[0]?.quantity).toBe(4);

    const key = useCartStore.getState().items[0]?.key ?? '';
    setQuantity(key, 7);
    expect(useCartStore.getState().items[0]?.quantity).toBe(7);

    remove(key);
    expect(useCartStore.getState().items).toEqual([]);
  });

  it('keeps order settings and clears the basket', () => {
    const state = useCartStore.getState();
    state.add(tikka);
    state.setOrderType('PICKUP');
    state.setZone(uuid(5));
    state.setCoupon('SAVE100');
    expect(useCartStore.getState()).toMatchObject({
      orderType: 'PICKUP',
      zoneId: uuid(5),
      couponCode: 'SAVE100',
    });

    state.clear();
    expect(useCartStore.getState()).toMatchObject({
      items: [],
      couponCode: null,
      orderType: 'PICKUP',
    });
  });
});

describe('persistence', () => {
  it('writes only cart data to storage, not functions', () => {
    useCartStore.getState().add(tikka);
    const saved = stored();
    expect(saved?.version).toBe(1);
    expect(saved?.state.items).toHaveLength(1);
    expect(Object.keys(saved?.state ?? {}).sort()).toEqual([
      'couponCode',
      'items',
      'orderType',
      'zoneId',
    ]);
  });

  it('restores a saved cart on rehydrate', async () => {
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        state: {
          items: [{ ...tikka, key: 'x', quantity: 3 }],
          orderType: 'PICKUP',
          zoneId: null,
          couponCode: null,
        },
      }),
    );
    await useCartStore.persist.rehydrate();
    expect(useCartStore.getState().items[0]?.quantity).toBe(3);
    expect(useCartStore.getState().orderType).toBe('PICKUP');
  });

  it('discards tampered storage instead of trusting it', async () => {
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        state: {
          items: [
            { kind: 'product', productId: 'nope', name: 'x', quantity: 1 },
            { ...tikka, key: 'x', quantity: 100000 },
            { ...tikka, key: 'y', quantity: 2 },
          ],
          orderType: 'ROBBERY',
          zoneId: 'x',
          couponCode: null,
        },
      }),
    );
    await useCartStore.persist.rehydrate();
    const { items, orderType, zoneId } = useCartStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0]?.quantity).toBe(2);
    expect(orderType).toBe('DELIVERY');
    expect(zoneId).toBeNull();
  });

  it('survives corrupted JSON in storage', async () => {
    window.localStorage.setItem(CART_STORAGE_KEY, '{not json');
    await expect(useCartStore.persist.rehydrate()).resolves.not.toThrow();
    expect(useCartStore.getState().items).toEqual([]);
  });
});

describe('safeStorage', () => {
  it('reads and writes through localStorage', () => {
    safeStorage.setItem('k', 'v');
    expect(safeStorage.getItem('k')).toBe('v');
    safeStorage.removeItem('k');
    expect(safeStorage.getItem('k')).toBeNull();
  });

  it('never throws when storage is blocked', () => {
    const blocked = () => {
      throw new Error('SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(blocked);
    expect(safeStorage.getItem('k')).toBeNull();
    expect(() => {
      safeStorage.setItem('k', 'v');
      safeStorage.removeItem('k');
    }).not.toThrow();
  });
});

describe('useCartHydrated', () => {
  it('becomes true after loading the saved cart', async () => {
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        state: {
          items: [{ ...tikka, key: 'x' }],
          orderType: 'DELIVERY',
          zoneId: null,
          couponCode: null,
        },
      }),
    );
    const { result } = renderHook(() => useCartHydrated());
    await waitFor(() => {
      expect(result.current).toBe(true);
    });
    expect(useCartStore.getState().items).toHaveLength(1);
  });

  it('follows changes made in another tab', async () => {
    const { result } = renderHook(() => useCartHydrated());
    await waitFor(() => {
      expect(result.current).toBe(true);
    });
    expect(useCartStore.getState().items).toHaveLength(0);

    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        state: {
          items: [{ ...tikka, key: 'x' }],
          orderType: 'DELIVERY',
          zoneId: null,
          couponCode: null,
        },
      }),
    );
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: CART_STORAGE_KEY }));
    });
    await waitFor(() => {
      expect(useCartStore.getState().items).toHaveLength(1);
    });
  });

  it('ignores storage events for other keys', async () => {
    const { result } = renderHook(() => useCartHydrated());
    await waitFor(() => {
      expect(result.current).toBe(true);
    });
    const spy = vi.spyOn(useCartStore.persist, 'rehydrate');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'something-else' }));
    });
    expect(spy).not.toHaveBeenCalled();
  });
});
