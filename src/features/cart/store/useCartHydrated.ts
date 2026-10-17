'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { CART_STORAGE_KEY, useCartStore } from './useCartStore';

function subscribe(onChange: () => void): () => void {
  return useCartStore.persist.onFinishHydration(onChange);
}

const isHydrated = () => useCartStore.persist.hasHydrated();

/** What the server renders (and what the browser must render first): not loaded yet. */
const serverSnapshot = () => false;

/**
 * Loads the saved cart after the page has mounted and keeps tabs in sync. Returns true once the
 * saved cart has been read. Do not change the cart before this is true: the first write would
 * overwrite what was saved.
 *
 * Built on useSyncExternalStore so the browser's first render uses the server snapshot (false)
 * even if the store was already loaded by another component such as the header. React does not
 * repair attributes that differ between server HTML and the first client render, so starting from
 * true would leave controls stuck in their server-rendered (disabled) state.
 */
export function useCartHydrated(): boolean {
  const hydrated = useSyncExternalStore(subscribe, isHydrated, serverSnapshot);

  useEffect(() => {
    void useCartStore.persist.rehydrate();

    const onStorage = (event: StorageEvent) => {
      // Another tab changed the cart.
      if (event.key === CART_STORAGE_KEY) void useCartStore.persist.rehydrate();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return hydrated;
}
