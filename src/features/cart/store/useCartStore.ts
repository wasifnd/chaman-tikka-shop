'use client';

import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { OrderType } from '@/features/checkout/types/quote.types';
import {
  addItem,
  clearItems,
  emptyCart,
  parsePersistedCart,
  removeItem,
  setCoupon,
  setOrderType,
  setQuantity,
  setZone,
  type CartState,
  type NewCartItem,
} from './cart.logic';

export const CART_STORAGE_KEY = 'bbq-cart';

interface CartActions {
  add: (item: NewCartItem) => void;
  setQuantity: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  setOrderType: (orderType: OrderType) => void;
  setZone: (zoneId: string | null) => void;
  setCoupon: (code: string | null) => void;
}

export type CartStore = CartState & CartActions;

/** localStorage can throw (private mode, blocked storage, quota). The cart then lives in memory only. */
export const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, value);
    } catch {
      // Ignore: keep working without persistence.
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name);
    } catch {
      // Ignore.
    }
  },
};

export const useCartStore = create<CartStore>()(
  persist(
    (set) => ({
      ...emptyCart,
      add: (item) => {
        set((state) => addItem(state, item));
      },
      setQuantity: (key, quantity) => {
        set((state) => setQuantity(state, key, quantity));
      },
      remove: (key) => {
        set((state) => removeItem(state, key));
      },
      clear: () => {
        set((state) => clearItems(state));
      },
      setOrderType: (orderType) => {
        set((state) => setOrderType(state, orderType));
      },
      setZone: (zoneId) => {
        set((state) => setZone(state, zoneId));
      },
      setCoupon: (code) => {
        set((state) => setCoupon(state, code));
      },
    }),
    {
      name: CART_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      // Hydrate manually after mount: reading localStorage during render would make the
      // server HTML and the first client render disagree.
      skipHydration: true,
      partialize: ({ items, orderType, zoneId, couponCode }) => ({
        items,
        orderType,
        zoneId,
        couponCode,
      }),
      // Never trust stored data: validate every field, drop what is invalid.
      merge: (persisted, current) => ({ ...current, ...parsePersistedCart(persisted) }),
    },
  ),
);
